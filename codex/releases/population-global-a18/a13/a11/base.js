// Rescue experiments: A8 plus bounded feasibility fallback and failed-move detours.
// Codex A: preserve accepted formations, assign nearby slots, release stalled plans.
// Fixed nominal search work; wall-clock checks are emergency guards, counted below.
const Player = require('./game/Player');
const { dodge } = require('./dodge.cjs');
const { performance } = require('node:perf_hooks');
const DIRS = Object.entries(Player.DELTAS);
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function assign(cost) {
    const n = cost.length, m = cost[0]?.length ?? 0;
    if (!n) return [];
    if (n > m) return null;
    const u = new Float64Array(n + 1), v = new Float64Array(m + 1);
    const p = new Int32Array(m + 1), way = new Int32Array(m + 1);
    for (let i = 1; i <= n; i++) {
        p[0] = i;
        let j0 = 0;
        const min = new Float64Array(m + 1).fill(Infinity), used = new Uint8Array(m + 1);
        do {
            used[j0] = 1;
            const i0 = p[j0];
            let delta = Infinity, j1 = 0;
            for (let j = 1; j <= m; j++) if (!used[j]) {
                const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
                if (cur < min[j]) { min[j] = cur; way[j] = j0; }
                if (min[j] < delta) { delta = min[j]; j1 = j; }
            }
            for (let j = 0; j <= m; j++) {
                if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
                else min[j] -= delta;
            }
            j0 = j1;
        } while (p[j0]);
        do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const result = Array(n);
    for (let j = 1; j <= m; j++) if (p[j]) result[p[j] - 1] = j - 1;
    return result;
}

class Codex extends Player {
    constructor(options = {}) {
        options={ownFirst:true,...options};
        super();
        this.mode = options.mode ?? 'adaptive';
        this.opts = { projected: true, raid: true, margin: false, stable: true, reassign: true, balance: true, ...options };
        this.metrics = { infeasibleReleases:0, fallbackSearches:0,fallbackExamined:0,fallbackPlans:0,failedMoves:0,detourBans:0,distressTurns:0, lateHolds:0,dodgeGroups:0, dodgeMoves:0, dodgeEvaluations:0, dodgeCuts:0, preservedGroups:0, turns:0, emergencyStops:0, raids:0, rejected:0, maxMs:0 };
        this.useForeign = options.useForeign ?? true;
        this.turnLimit = 64;
    }
    configure(config) { this.turnLimit = config.turnsPerRound ?? 64; }
    round(width, height, shape) {
        super.round(width, height, shape);
        this.previousMoves = new Map(); this.failedEdges = new Map(); this.bannedEdges = new Map(); this.distress = [];
        this.tick = 0; this.clockKnown = true; this.groups = []; this.lastForeign = new Map();
        this.stats = { plans: 0, released: 0, maxMs: 0, turns: 0, moves: 0, emergencyStops: 0 };
    }
    key(x, y) { return y * this.width + x; }
    resumed() { this.clockKnown = false; }
    cellsAt(x, y) { return this.targetShape.cells.map(([dx, dy]) => ({ x: x + dx, y: y + dy })); }
    matched(occupied) {
        const used = new Set(), matches = [], origins = new Set();
        // Sparse origins; exactly the engine's row-major ordering, including boundaries.
        for (const k of occupied) for (const [dx,dy] of this.targetShape.cells) {
            const x=k%this.width-dx, y=Math.floor(k/this.width)-dy;
            if(x>=0 && y>=0 && x<=this.width-this.targetShape.width && y<=this.height-this.targetShape.height) origins.add(this.key(x,y));
        }
        for (const origin of [...origins].sort((a,b)=>a-b)) {
            const keys=this.targetShape.cells.map(([dx,dy])=>origin+dy*this.width+dx);
            if(keys.every(k=>occupied.has(k)&&!used.has(k))) { keys.forEach(k=>used.add(k));matches.push(keys); }
        }
        return { used, matches };
    }
    async turn(state, remainingMs = 500) {
        const started = performance.now();
        const cutsBefore=this.stats.emergencyStops;
        const budget = Math.max(0, Math.min(120, remainingMs - 75));
        this.tick++;
        this.observeProgress(state);
        if (budget < 2 || !state.ownUnits.length) return [];
        const deadline = started + budget;
        const own = [...state.ownUnits].sort((a, b) => a.handle.localeCompare(b.handle));
        const ownByKey = new Map(own.map(u => [this.key(u.x, u.y), u]));
        const byHandle = new Map(own.map(u => [u.handle, u]));
        const occupied = new Set(state.units.map(u => this.key(u.x, u.y)));
        const foreign = new Map();
        for (const k of occupied) if (!ownByKey.has(k)) foreign.set(k, (this.lastForeign.get(k) ?? 0) + 1);
        this.lastForeign = foreign;
        if(this.opts.sparseWeight){
            this.density=new Uint16Array(this.width*this.height);
            for(const k of foreign.keys())for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
                if(Math.abs(dx)+Math.abs(dy)>3)continue;
                const x=k%this.width+dx,y=Math.floor(k/this.width)+dy;
                if(x>=0&&y>=0&&x<this.width&&y<this.height)this.density[this.key(x,y)]++;
            }
        }
        let { used } = this.matched(occupied);
        if(this.opts.ownFirst && own.length>=this.targetShape.cells.length) used=this.matched(new Set(ownByKey.keys())).used;
        // Preserve complete own shapes even when an earlier mixed match excludes them.
        const pureGroups = this.matched(new Set(ownByKey.keys())).matches;
        for (const group of this.opts.preserve===false ? [] : pureGroups) {
            if (group.some(k => !used.has(k))) this.metrics.preservedGroups++;
            for (const k of group) used.add(k);
        }
        this.lockedPositions=new Set(own.filter(u=>used.has(this.key(u.x,u.y))).map(u=>this.key(u.x,u.y)));
        const locked = new Set(own.filter(u => used.has(this.key(u.x, u.y))).map(u => u.handle));
        const reserved = new Set(used), taken = new Set(locked), groups = [];
        for (const g of this.groups) {
            const footprint = g.cells.map(c => this.key(c.x, c.y));
            const reachable = !this.clockKnown || g.assignments.every(a => {
                const unit=byHandle.get(a.handle);
                return !unit || distance(unit,a)<=Math.max(1,this.turnLimit-this.tick+1);
            });
            const valid = g.assignments.every(a => byHandle.has(a.handle) && !taken.has(a.handle))
                && reachable
                && footprint.every(k => !reserved.has(k) || (this.opts.stable && foreign.has(k)))
                && g.support.every(k => foreign.has(k) || (this.opts.recycle && this.lockedPositions.has(k)))
                && g.assignments.every(a => !foreign.has(this.key(a.x, a.y)));
            const total = valid ? g.assignments.reduce((s, a) => s + distance(byHandle.get(a.handle), a), 0) : Infinity;
            g.stalled = total < g.bestDistance ? 0 : g.stalled + 1;
            g.bestDistance = Math.min(g.bestDistance, total);
            if(this.opts.lateFinish && g.raid && g.assignments.length<=2 && this.tick<this.turnLimit && valid && g.assignments.every(a=>distance(byHandle.get(a.handle),a)<=1))g.stalled=0;
            if (!valid || this.mode === 'replan' || (this.mode === 'adaptive' && g.stalled >= 6)) {
                if(!reachable)this.metrics.infeasibleReleases++;
                this.stats.released++; continue;
            }
            groups.push(g); footprint.forEach(k => reserved.add(k));
            g.assignments.forEach(a => taken.add(a.handle));
        }
        this.projectedOwn = new Map(own.map(u=>[u.handle,{x:u.x,y:u.y,energy:u.energy}]));
        for(const g of groups) for(const a of g.assignments) this.projectedOwn.set(a.handle,{...byHandle.get(a.handle),x:a.x,y:a.y});
        let free = own.filter(u => !taken.has(u.handle));
        let generated = 0;
        while (free.length && generated++ < 8 && performance.now() < deadline - 8) {
            const g = this.chooseGroup(free, reserved, foreign, deadline - 8);
            if (!g) break;
            groups.push(g); this.stats.plans++;
            for(const a of g.assignments) this.projectedOwn.set(a.handle,{...byHandle.get(a.handle),x:a.x,y:a.y});
            if(g.raid) this.metrics.raids++;
            g.cells.forEach(c => reserved.add(this.key(c.x, c.y)));
            g.assignments.forEach(a => taken.add(a.handle));
            free = free.filter(u => !taken.has(u.handle));
        }
        if(this.opts.reassign)for(const g of groups){
            const members=g.assignments.map(a=>byHandle.get(a.handle));
            const cols=assign(g.assignments.map(slot=>members.map(u=>distance(u,slot))));
            g.assignments=g.assignments.map((a,i)=>({...a,handle:members[cols[i]].handle}));
        }
        if (this.balancePopulation) this.balancePopulation(own, groups, locked, deadline);
        this.groups = groups;
        this.classifyDistress(own, groups, locked);
        const targets = new Map(groups.flatMap(g => g.assignments.map(a => [a.handle, a])));
        if(this.opts.lateFinish && this.clockKnown && this.tick<this.turnLimit){
            for(const g of groups)if(g.raid && g.support.length && g.assignments.length<=2)
                for(const a of g.assignments)if(distance(byHandle.get(a.handle),a)===1){targets.delete(a.handle);this.metrics.lateHolds++;}
        }
        let commands = this.route(own, targets, occupied, deadline);
        if (this.opts.dodge!==false && this.clockKnown && this.tick === this.turnLimit) {
            commands = dodge(this, state, commands, pureGroups, Math.min(deadline, performance.now() + 35));
        }
        if (performance.now() >= deadline - 8) this.stats.emergencyStops++;
        this.stats.turns++; this.stats.moves += commands.length;
        this.stats.maxMs = Math.max(this.stats.maxMs, performance.now() - started);
        this.metrics.turns++; this.metrics.emergencyStops += this.stats.emergencyStops-cutsBefore;
        this.metrics.maxMs=Math.max(this.metrics.maxMs,performance.now()-started);
        this.rememberMoves(state, commands);
        return commands;
    }
    diagnostics() { return { ...this.metrics, distress:this.distress, options:this.opts }; }
    evaluate(assignments, foreign) {
        const own=new Map(this.projectedOwn);
        for(const a of assignments) own.set(a.handle,{...own.get(a.handle),x:a.x,y:a.y});
        const ownKeys=new Set([...own.values()].map(u=>this.key(u.x,u.y)));
        const occupied=new Set([...foreign.keys(),...ownKeys]);
        const used=this.matched(occupied).used;
        let ownCount=0, foreignCount=0;
        for(const k of used) { if(ownKeys.has(k))ownCount++;else foreignCount++; }
        return {own:ownCount,foreign:foreignCount,used,ownKeys,occupied};
    }
    threatLoss(after, cells, foreign) {
        const origins=new Set(), candidates=new Set(), shape=this.targetShape;
        for(const c of cells)for(const [dx,dy] of shape.cells){
            const x=c.x-dx,y=c.y-dy;
            if(x>=0&&y>=0&&x<=this.width-shape.width&&y<=this.height-shape.height)origins.add(this.key(x,y));
        }
        for(const origin of origins){
            const missing=shape.cells.map(([dx,dy])=>origin+dy*this.width+dx).filter(k=>!after.occupied.has(k));
            if(missing.length===1)candidates.add(missing[0]);
        }
        let worst=0;
        for(const k of candidates){
            const x=k%this.width,y=Math.floor(k/this.width);
            const attackers=[...foreign.keys()].map(f=>({f,d:Math.abs(f%this.width-x)+Math.abs(Math.floor(f/this.width)-y)}))
                .filter(a=>a.d<=Math.min(6,this.turnLimit-this.tick+1)).sort((a,b)=>a.d-b.d||a.f-b.f).slice(0,2);
            for(const {f} of attackers){
                const occ=new Set(after.occupied);occ.delete(f);occ.add(k);
                const used=this.matched(occ).used;let count=0;
                for(const u of after.ownKeys)if(used.has(u))count++;
                worst=Math.max(worst,after.own-count);
            }
        }
        return worst;
    }
    leftoverCost(free, assignments) {
        const taken=new Set(assignments.map(a=>a.handle)),rest=free.filter(u=>!taken.has(u.handle));
        if(rest.length<2)return 0;
        const n=Math.min(this.targetShape.cells.length-1,rest.length-1);
        return rest.reduce((s,u)=>s+rest.filter(v=>v!==u).map(v=>distance(u,v)).sort((a,b)=>a-b).slice(0,n).reduce((a,b)=>a+b,0)/n,0)/rest.length;
    }
    observeProgress(state) {
        for(const [edge,until] of this.bannedEdges)if(until<=this.tick)this.bannedEdges.delete(edge);
        const byHandle=new Map(state.ownUnits.map(u=>[u.handle,u]));
        for(const [handle,previous] of this.previousMoves) {
            const u=byHandle.get(handle);if(!u)continue;
            const current=this.key(u.x,u.y);
            if(current===previous.start) {
                this.metrics.failedMoves++;
                const old=this.failedEdges.get(handle);
                const count=old?.edge===previous.edge ? old.count+1 : 1;
                this.failedEdges.set(handle,{edge:previous.edge,count});
                if(this.opts.rescueDetour && count>=3) {
                    this.bannedEdges.set(previous.edge,this.tick+8);
                    this.failedEdges.delete(handle);this.metrics.detourBans++;
                }
            } else this.failedEdges.delete(handle);
        }
        this.previousMoves.clear();
    }
    rememberMoves(state, commands) {
        const units=new Map(state.ownUnits.map(u=>[u.handle,u]));
        this.previousMoves.clear();
        for(const c of commands)if(c.commandName==='move') {
            const u=units.get(c.handle),d=Player.DELTAS[c.params[0]];if(!u||!d)continue;
            const start=this.key(u.x,u.y),target=this.key(u.x+d[0],u.y+d[1]);
            this.previousMoves.set(c.handle,{start,edge:`${c.handle}:${start}:${target}`});
        }
    }
    classifyDistress(own, groups, locked) {
        const assigned=new Map(groups.flatMap(g=>g.assignments.map(a=>[a.handle,{a,g}])));
        const left=this.clockKnown ? Math.max(1,this.turnLimit-this.tick+1) : null;
        this.distress=own.flatMap(u=>{
            const plan=assigned.get(u.handle),flags=[];
            if(u.energy===1)flags.push('critical');
            if(!locked.has(u.handle)&&!plan)flags.push('stranded');
            if(this.failedEdges.get(u.handle)?.count>=2 || [...this.bannedEdges.keys()].some(k=>k.startsWith(u.handle+':')))flags.push('blocked');
            if(plan?.g.support.length)flags.push('exposed');
            if(plan && left!==null && distance(u,plan.a)>left)flags.push('out-of-reach');
            return flags.length ? [{handle:u.handle,flags}] : [];
        });
        if(this.distress.length)this.metrics.distressTurns++;
    }
    supportCost(key, age) { return age >= 3 ? 3 : 9; }
    candidateBonus(cells) { return this.opts.sparseWeight ? -this.opts.sparseWeight*cells.reduce((n,c)=>n+this.density[this.key(c.x,c.y)],0)/cells.length : 0; }
    chooseGroup(free, reserved, foreign, deadline) {
        const candidates = [];
        const size=this.targetShape.cells.length;
        const anchor=this.opts.anchor && free.length>=size ? free.map(u=>({u,c:free.filter(v=>v!==u).map(v=>distance(u,v)).sort((a,b)=>a-b).slice(0,size-1).reduce((a,b)=>a+b,0)})).sort((a,b)=>b.c-a.c||a.u.handle.localeCompare(b.u.handle))[0].u : null;
        const before=this.opts.projected ? this.evaluate([],foreign) : null;
        const left = Math.max(1, this.turnLimit - this.tick + 1);
        for (let y = 0; y <= this.height - this.targetShape.height; y++) {
            if (performance.now() > deadline) return null;
            for (let x = 0; x <= this.width - this.targetShape.width; x++) {
                const cells = this.cellsAt(x, y), slots = [], support = [];
                let bad = false, cost = 0;
                for (const c of cells) {
                    const k = this.key(c.x, c.y);
                    if (reserved.has(k) && !((this.opts.raid && foreign.has(k)) || (this.opts.recycle && this.lockedPositions.has(k)))) { bad = true; break; }
                    if(this.opts.recycle && this.lockedPositions.has(k)) { support.push(k);continue; }
                    if (foreign.has(k)) {
                        if (!this.useForeign || (this.opts.ownFirst && free.length>=size) || foreign.get(k) < 3) { bad = true; break; }
                        support.push(k); continue;
                    }
                    slots.push(c);
                    let nearest = Infinity;
                    for (const u of free) nearest = Math.min(nearest, distance(u, c));
                    if (nearest > left) { bad = true; break; }
                    cost += nearest;
                }
                if (bad || !slots.length || slots.length > free.length) continue;
                if (this.opts.margin && !support.length && cells.some(c=>[[0,-1],[0,1],[-1,0],[1,0]].some(([dx,dy])=>{
                    const x=c.x+dx,y=c.y+dy;if(x<0||y<0||x>=this.width||y>=this.height)return false;
                    const k=this.key(x,y);return (reserved.has(k)||foreign.has(k)) && !cells.some(v=>v.x===x&&v.y===y);
                })))continue;
                const risk = support.reduce((s, k) => s + (this.lockedPositions?.has(k) ? 0 : this.supportCost(k, foreign.get(k))), 0)*(this.opts.supportWeight ?? 1);
                const bonus = this.candidateBonus(cells);
                candidates.push({ x, y, cells, slots, support, risk, bonus, rough: (cost + risk + (anchor && !support.length ? size*Math.min(...slots.map(c=>distance(anchor,c))) : 0)) / slots.length - bonus });
            }
        }
        candidates.sort((a, b) => a.rough - b.rough || a.y - b.y || a.x - b.x);
        let best = null, bestScore = Infinity;
        let fallback=false, fallbackValid=0;
        for (let ci=0; ci<Math.min(candidates.length,this.opts.rescueSearch ? 1024 : 24); ci++) {
            if(ci===24) {
                if(best || !this.opts.rescueSearch)break;
                fallback=true;this.metrics.fallbackSearches++;
            }
            if(fallback)this.metrics.fallbackExamined++;
            const c=candidates[ci];
            if (performance.now() > deadline) break;
            const costs = c.slots.map(slot => free.map(u => {
                const d = distance(u, slot);
                return d + d * d * 0.035 + (u.energy > 1 ? 0.05 : 0) - (anchor && !c.support.length && u.handle===anchor.handle ? 10000 : 0);
            }));
            const cols = assign(costs);
            const assignments = c.slots.map((slot, i) => ({ ...slot, handle: free[cols[i]].handle }));
            const distances = assignments.map(a => distance(free.find(u => u.handle === a.handle), a));
            const max = Math.max(...distances), sum = distances.reduce((a, b) => a + b, 0);
            if (max > left) continue;
            let score = (sum + 1.8 * max + c.risk) / assignments.length - c.bonus;
            let raid=false;
            if(this.opts.projected) {
                const after=this.evaluate(assignments,foreign);
                // All supplied own slots must actually score in the projected board.
                if(assignments.some(a=>!after.used.has(this.key(a.x,a.y)))) {this.metrics.rejected++;continue;}
                const gain=after.own-before.own, denial=before.foreign-after.foreign;
                if(gain<0 || (c.support.some(k=>this.lockedPositions?.has(k)) && gain<=0)) {this.metrics.rejected++;continue;}
                score-= 4*gain/assignments.length;
                if(this.opts.raid)score-=(this.opts.denialWeight ?? 8)*denial/assignments.length;
                if(this.opts.threat)score+=6*this.threatLoss(after,c.cells,foreign)/assignments.length;
                raid=denial>0;
            }
            if(this.opts.balance)score+=0.7*this.leftoverCost(free,assignments);
            if (score < bestScore) {
                bestScore = score;
                best = { cells: c.cells, assignments, support: c.support, stalled: 0, bestDistance: sum, raid };
            }
            if(fallback && ++fallbackValid>=16)break;
        }
        if(fallback && best)this.metrics.fallbackPlans++;
        return best;
    }
    route(own, targets, occupied, deadline) {
        const blocked = new Set(occupied), commands = [];
        const moving = own.filter(u => targets.has(u.handle) && distance(u, targets.get(u.handle)) > 0)
            .sort((a, b) => distance(b, targets.get(b.handle)) - distance(a, targets.get(a.handle)) || a.handle.localeCompare(b.handle));
        for (const u of moving) {
            if (performance.now() > deadline) break;
            const start = this.key(u.x, u.y), goal = targets.get(u.handle), end = this.key(goal.x, goal.y);
            if (blocked.has(end)) continue;
            const size = this.width * this.height, seen = new Uint8Array(size);
            const queue = new Int32Array(size), first = new Int8Array(size).fill(-1);
            let head = 0, tail = 1, direction = -1;
            queue[0] = start; seen[start] = 1;
            const order = this.tick % 2 ? [0, 2, 1, 3] : [2, 0, 3, 1];
            while (head < tail && head < size) {
                const k = queue[head++], x = k % this.width, y = Math.floor(k / this.width);
                if ((head & 255) === 0 && performance.now() > deadline) break;
                for (const i of order) {
                    const [dx, dy] = DIRS[i][1], nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
                    const nk = this.key(nx, ny);
                    if (seen[nk] || blocked.has(nk) || (this.opts.rescueDetour && this.bannedEdges.has(`${u.handle}:${k}:${nk}`))) continue;
                    seen[nk] = 1; first[nk] = k === start ? i : first[k]; queue[tail++] = nk;
                    if (nk === end) { direction = first[nk]; break; }
                }
                if (direction >= 0) break;
            }
            if (direction < 0) continue;
            const [name, [dx, dy]] = DIRS[direction], next = this.key(u.x + dx, u.y + dy);
            commands.push(Player.commands.move(u.handle, name));
            blocked.delete(start); blocked.add(next);
        }
        return commands;
    }
}
module.exports = Codex;
