const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { match } = require('./gym.cjs');
const fixture = source => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-gym-'));
    const file = path.join(dir, 'player.cjs'); fs.writeFileSync(file, source);
    return { name: 'test-fixture', module: file };
};
const base = { width: 12, height: 12, units: 6, rounds: 1, turns: 2, trace: true };
test('external contestant gets configured, public frozen state, and dependency provenance', async () => {
    const entry = fixture(`module.exports = class {
        configure(config) { this.width = config.width; }
        round() {}
        turn(state) {
            if(this.width !== 12 || !Object.isFrozen(state) || Object.keys(state).sort().join() !== 'messages,ownUnits,units') throw Error('interface');
            return [{handle: 'not-owned', commandName: 'move', params: ['up']}];
        }
    };`);
    const row = await match({ ...base, kinds: [entry, 'still'] });
    assert.equal(row.stats[0].invalid, 2);
    assert.deepEqual(row.stats[0].errors, []);
    assert.equal(row.targets.length, 1);
    assert.equal(row.engine.length, 3);
    assert.ok(row.provenance[0].initial.files.some(x => x.file === fs.realpathSync(entry.module) && x.sha256.length === 64));
    assert.deepEqual(row.provenance[0].initial, row.provenance[0].final);
    assert.ok(row.trace.every(t => Object.keys(t.accepted).length === 0));
});
test('slow synchronous contestant cannot block opponent or submit late commands', async () => {
    const slow = fixture(`module.exports = class {
        round() {}
        turn(s) { const end = Date.now()+100; while(Date.now()<end) {}
            return [{handle:s.ownUnits[0].handle,commandName:'move',params:['right']}]; }
    };`);
    const row = await match({ ...base, kinds: [slow, 'still'], turnMs: 15 });
    assert.equal(row.stats[0].timeouts, 2);
    assert.equal(row.stats[1].timeouts, 0);
    assert.ok(row.trace.every(t => Object.keys(t.accepted).length === 0));
});
test('unknown entrant fails visibly and closes initialized counterparts', async () => {
    await assert.rejects(match({ ...base, kinds: ['misspelled', 'still'] }), /Unknown contestant/);
});
test('viewer receives compatible frames and final results from worker host', async () => {
    const events = [];
    const row = await match({ ...base, kinds: ['still', 'still'], onEvent: async (type, data) => events.push({ type, data }) });
    assert.equal(events[0].type, 'meta');
    const frames = events.filter(e => e.type === 'frame');
    assert.equal(frames.length, base.turns + 1);
    assert.equal(frames[0].data.units.length, 12);
    assert.ok(frames[0].data.units.every(u => ['a', 'b'].includes(u.p)));
    assert.deepEqual(events.at(-1).data.res.a, row.results[0]);
    assert.equal(events.at(-1).data.totals.of, 12);
});
