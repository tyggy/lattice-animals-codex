const { parentPort, workerData } = require('node:worker_threads');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const Player = require('../codex/game/Player');
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296); }
class Random extends Player {
    constructor(seed) { super(); this.random = rng(seed); }
    async turn(state) {
        return state.ownUnits.flatMap(u => {
            const i = Math.floor(this.random() * 5);
            return i < 4 ? [Player.commands.move(u.handle, Object.keys(Player.DELTAS)[i])] : [];
        });
    }
}
class Still extends Player { async turn() { return []; } }
// Simple task-directed counterpart: gather into fixed target tiles near board center.
class Tiles extends Player {
    round(w, h, shape) { super.round(w, h, shape); this.destinations = null; }
    async turn(state) {
        const own = [...state.ownUnits].sort((a, b) => a.handle.localeCompare(b.handle));
        if (!this.destinations) {
            this.destinations = new Map();
            const n = this.targetShape.cells.length, groups = Math.ceil(own.length / n);
            const cols = Math.ceil(Math.sqrt(groups));
            own.forEach((u, i) => {
                const group = Math.floor(i / n), [dx, dy] = this.targetShape.cells[i % n];
                const x = Math.max(0, Math.floor(this.width / 2) - cols * (this.targetShape.width + 1) / 2 | 0)
                    + group % cols * (this.targetShape.width + 1) + dx;
                const y = Math.max(0, Math.floor(this.height / 2) - cols * (this.targetShape.height + 1) / 2 | 0)
                    + Math.floor(group / cols) * (this.targetShape.height + 1) + dy;
                this.destinations.set(u.handle, { x: Math.min(this.width - 1, x), y: Math.min(this.height - 1, y) });
            });
        }
        const occupied = new Set(state.units.map(u => `${u.x},${u.y}`)), commands = [];
        for (const u of own) {
            const dest = this.destinations.get(u.handle);
            const choices = Object.entries(Player.DELTAS).filter(([, [dx, dy]]) => {
                const x = u.x + dx, y = u.y + dy;
                return x >= 0 && y >= 0 && x < this.width && y < this.height && !occupied.has(`${x},${y}`)
                    && Math.abs(x - dest.x) + Math.abs(y - dest.y) < Math.abs(u.x - dest.x) + Math.abs(u.y - dest.y);
            });
            if (choices.length) {
                const [name, [dx, dy]] = choices[0];
                commands.push(Player.commands.move(u.handle, name));
                occupied.delete(`${u.x},${u.y}`); occupied.add(`${u.x + dx},${u.y + dy}`);
            }
        }
        return commands;
    }
}
const { kind, seed, config } = workerData;
// This worker belongs to one contestant; seed before importing its module.
Math.random = rng(seed);
const external = kind && typeof kind === 'object';
const known = ['codex', 'random', 'still', 'tiles', 'rigid', 'replan', 'own-only'];
if (!external && !known.includes(kind)) throw Error(`Unknown contestant: ${kind}`);
if (external && (typeof kind.module !== 'string' || !path.isAbsolute(kind.module)))
    throw Error('External contestant requires an absolute module path');
const Codex = external ? require(kind.module) : require('../codex/player');
const player = kind === 'random' ? new Random(seed) : kind === 'still' ? new Still()
    : kind === 'tiles' ? new Tiles() : new Codex(external ? kind.options : { mode: ['rigid', 'replan'].includes(kind) ? kind : 'adaptive', useForeign: kind !== 'own-only' });
player.configure?.(config);
function provenance() {
    return { name: external ? kind.name || path.basename(kind.module) : kind, seed,
        files: Object.keys(require.cache).sort().map(file => ({ file,
            sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') })) };
}
const initialProvenance = provenance();
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
parentPort.on('message', async ({ id, type, data }) => {
    const start = performance.now();
    try {
        let result;
        if (type === 'round') await player.round(config.width, config.height, freeze(data));
        if (type === 'turn') result = await player.turn(freeze(data.state), data.remainingMs);
        if (type === 'roundEnd') await player.roundEnd?.(freeze(data));
        if (type === 'settleAdvice') await player.settleAdvice?.();
        if (type === 'finish') await player.finish?.(freeze(data));
        if (type === 'provenance') result = { initial: initialProvenance, final: provenance(), diagnostics: player.diagnostics?.() };
        parentPort.postMessage({ id, result, durationMs: performance.now() - start, stats: player.stats,
            advice: type === 'turn' || type === 'finish' ? player.takeTrace?.() : undefined });
    } catch (error) { parentPort.postMessage({ id, error: error.message, durationMs: performance.now() - start }); }
});
parentPort.postMessage({ ready: true, provenance: initialProvenance });
