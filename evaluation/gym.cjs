const { Worker } = require('node:worker_threads');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const Game = require('../codex/game/Game');
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296); }
async function contestant(kind, seed, config) {
    const worker = new Worker(path.join(__dirname, 'worker.cjs'), { workerData: { kind, seed, config } });
    let sequence = 0;
    const pending = new Map();
    const provenance = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { worker.terminate(); reject(Error('Worker startup timed out')); }, 5000);
        worker.once('error', error => { clearTimeout(timer); reject(error); });
        worker.once('exit', code => { clearTimeout(timer); reject(Error(`Worker exited during startup: ${code}`)); });
        worker.once('message', message => { clearTimeout(timer); message.ready ? resolve(message.provenance) : reject(Error('Worker did not initialize')); });
    });
    worker.on('message', message => {
        const entry = pending.get(message.id);
        if (!entry) return; // Late result belongs to a closed turn.
        clearTimeout(entry.timer); pending.delete(message.id);
        entry.resolve(performance.now() > entry.deadline ? { timeout: true } : message);
    });
    worker.on('error', error => {
        for (const entry of pending.values()) { clearTimeout(entry.timer); entry.resolve({ error: error.message }); }
        pending.clear();
    });
    return {
        provenance,
        request(type, data, deadline = performance.now() + 1000) {
            return new Promise(resolve => {
                const id = ++sequence;
                const timer = setTimeout(() => { pending.delete(id); resolve({ timeout: true }); }, Math.max(0, deadline - performance.now()));
                pending.set(id, { resolve, timer, deadline });
                worker.postMessage({ id, type, data });
            });
        },
        close: () => worker.terminate(),
    };
}
function publicState(state) {
    // Public array order carries no identity; canonicalization removes shuffle RNG.
    return {
        ownUnits: [...state.ownUnits].sort((a, b) => a.handle.localeCompare(b.handle)),
        units: [...state.units].sort((a, b) => a.y - b.y || a.x - b.x),
        messages: [...state.messages].sort((a, b) => a.text.localeCompare(b.text)),
    };
}
async function match({ seed = 1, kinds = ['codex', 'random'], width = 64, height = 64, units = 32, rounds = 16, turns = 64, turnMs = 500, shapeName, trace = false, adviceSimulation = false, paceMs = 0, onEvent, alive = () => true } = {}) {
    if (paceMs && adviceSimulation) throw Error('Choose real pacing or simulated advice timing');
    const config = { width, height, turnsPerRound: turns, turnTimeMs: turnMs, maxRounds: rounds };
    const records = kinds.flatMap((kind, seat) => Array.from({ length: units }, (_, i) => ({
        unitId: `${seat}:${i}`, playerId: `p${seat}`, playerName: `p${seat}`, handle: String(i), energy: 2,
    })));
    const game = new Game(records, config, rng(seed));
    const shapeRng = rng(seed ^ 0x5f3759df);
    const initialized = await Promise.allSettled(kinds.map(kind => contestant(kind, seed ^ 0x1234567, config)));
    if (initialized.some(x => x.status === 'rejected')) {
        await Promise.all(initialized.filter(x => x.status === 'fulfilled').map(x => x.value.close()));
        throw initialized.find(x => x.status === 'rejected').reason;
    }
    const players = initialized.map(x => x.value);
    const stats = kinds.map(() => ({ timeouts: 0, errors: [], invalid: 0, calls: 0, durations: [], matched: 0, available: 0 }));
    const rows = [], lifecycleTrace = [];
    const targets = [];
    const labels = kinds.map((_, i) => String.fromCharCode(97 + i));
    const owners = new Map(records.map(r => [r.unitId, labels[Number(r.playerId.slice(1))]]));
    const totals = () => ({ ...Object.fromEntries(labels.map((key, i) => [key, stats[i].matched])), of: stats.reduce((s, v) => s + v.available, 0) });
    async function frame(target, round, turn, note = '') {
        if (!onEvent) return;
        const energy = Object.fromEntries(labels.map(key => [key, 0]));
        for (const u of game.units) energy[owners.get(u.unitId)] += Math.max(0, u.energy);
        await onEvent('frame', { round, rounds, turn, turns, shape: target.name, cells: target.cells,
            note, matched: totals(), energy, width, height,
            units: game.state.units.map(u => ({ x: u.x, y: u.y, p: owners.get(u.id) })),
            speech: game.observe('p0').messages.map(m => m.text).slice(0, 6) });
    }
    try {
        await onEvent?.('meta', { a: kinds[0], b: kinds[1], seed, units, W: width, H: height, rounds, turns, turnMs });
        roundLoop: for (let r = 0; r < rounds && game.viableShapes.length && alive(); r++) {
            const shapes = game.viableShapes;
            const shape = shapeName ? shapes.find(s => s.name === shapeName) : shapes[Math.floor(shapeRng() * shapes.length)];
            if (!shape) break;
            targets.push(shape);
            game.round(shape);
            const setup = await Promise.all(players.map(p => p.request('round', shape)));
            setup.forEach((reply, i) => { if (reply.error || reply.timeout) throw Error(`round setup ${i}: ${JSON.stringify(reply)}`); });
            for (let t = 0; t < turns; t++) {
                if (!alive()) break roundLoop;
                const states = kinds.map((_, i) => publicState(game.observe(`p${i}`)));
                const turnStarted = performance.now();
                const deadline = performance.now() + turnMs;
                // Each request is independently time-bounded. Unresolved workers cannot stall the match.
                const answers = await Promise.all(players.map((p, i) => p.request('turn', { state: states[i], remainingMs: Math.max(0, deadline - performance.now()) }, deadline)));
                const commands = {};
                answers.forEach((answer, i) => {
                    const stat = stats[i]; stat.calls++;
                    if (answer.timeout) { stat.timeouts++; return; }
                    if (answer.error) { stat.errors.push(answer.error); return; }
                    stat.durations.push(answer.durationMs);
                    if (answer.result === undefined) return;
                    if (!Array.isArray(answer.result)) { stat.invalid++; return; }
                    for (const command of answer.result) {
                        const id = command && game.unitIdFor(`p${i}`, command.handle);
                        if (!id || !Game.validCommand(command.commandName, command.params)) { stat.invalid++; continue; }
                        if (Object.hasOwn(commands, id)) continue;
                        commands[id] = { commandName: command.commandName, params: [...command.params] };
                    }
                });
                game.turn(commands);
                if (trace) rows.push({ round: r, turn: t, observations: states, answers, accepted: commands,
                    after: kinds.map((_,i)=>publicState(game.observe(`p${i}`))) });
                if (adviceSimulation) {
                    // The asynchronous candidate returns moves before networking finishes.
                    // Resolve bounded advice between simulated turns; its own two-turn
                    // eligibility rule supplies the explicit virtual latency for every arm.
                    const settled = await Promise.all(players.map(p=>p.request('settleAdvice', null, performance.now()+1500)));
                    if (settled.some(x=>x.timeout || x.error)) throw Error('Advice clock bridge failed');
                }
                await frame(shape, r + 1, t + 1);
                if (paceMs) await new Promise(resolve=>setTimeout(resolve,Math.max(0,paceMs-(performance.now()-turnStarted))));
            }
            const outcomes = game.match();
            if (trace) lifecycleTrace.push({ round:r, turn:turns, outcomes,
                after:kinds.map((_,i)=>publicState(game.observe(`p${i}`))) });
            await Promise.all(players.map((p, i) => {
                const own = game.outcomesFor(`p${i}`, outcomes);
                stats[i].matched += own.filter(x => x.won).length; stats[i].available += own.length;
                return p.request('roundEnd', own);
            }));
            await frame(shape, r + 1, turns, `round ${r + 1} complete`);
        }
        game.finish(game.viableShapes.length ? 'round-limit' : 'no-viable-shape');
        const finished = await Promise.all(players.map((p,i)=>p.request('finish',game.resultFor(`p${i}`))));
        if (trace) lifecycleTrace.push({ event:'finish', answers:finished });
        const manifests = await Promise.all(players.map(p => p.request('provenance')));
        const result = {
            seed, kinds, config, shapeName, targets, adviceSimulation, paceMs,
            provenance: players.map((p, i) => manifests[i].result || { initial: p.provenance, finalUnavailable: true }),
            diagnostics: players.map((_,i) => manifests[i].result?.diagnostics || null),
            engine: ['Game.js', 'Board.js', 'Player.js'].map(name => ({ name, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../codex/game', name))).digest('hex') })),
            results: kinds.map((_, i) => game.resultFor(`p${i}`)),
            stats: stats.map(({ durations, ...rest }) => {
                durations.sort((a, b) => a - b);
                return { ...rest, maxMs: durations.at(-1) ?? 0, p95Ms: durations[Math.floor(durations.length * 0.95)] ?? 0 };
            }),
            ...(trace ? { trace: rows, lifecycleTrace, engineLog: game.log } : {}),
        };
        await onEvent?.('done', { res: Object.fromEntries(labels.map((key, i) => [key, result.results[i]])), totals: totals(), stats: result.stats });
        return result;
    } finally { await Promise.all(players.map(p => p.close())); }
}
module.exports = { match, publicState };
if (require.main === module) {
    (async () => {
        const [output, optionsJSON = '{}'] = process.argv.slice(2);
        if (!output) throw Error('Usage: node gym.cjs OUTPUT.jsonl OPTIONS_JSON');
        const options = JSON.parse(optionsJSON), { seeds = [1], swap = false, ...settings } = options;
        const strategyHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../codex/player.js'))).digest('hex');
        fs.mkdirSync(path.dirname(output), { recursive: true });
        // Refuse accidental overwrite of previous experimental results.
        const fd = fs.openSync(output, 'wx');
        try {
            for (const seed of seeds) for (const reversed of (swap ? [false, true] : [false])) {
                const kinds = reversed ? [...(settings.kinds || ['codex', 'random'])].reverse() : settings.kinds;
                const row = await match({ ...settings, kinds, seed });
                row.strategyHash = strategyHash; row.reversed = reversed;
                fs.writeSync(fd, JSON.stringify(row) + '\n');
                console.log(JSON.stringify({ seed, kinds: row.kinds, results: row.results, stats: row.stats }));
            }
        } finally { fs.closeSync(fd); }
    })().catch(error => { console.error(error); process.exitCode = 1; });
}
