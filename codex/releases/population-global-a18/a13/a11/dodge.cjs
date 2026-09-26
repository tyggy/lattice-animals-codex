const {pairScenarios}=require('./profiler.cjs');
const {performance} = require('node:perf_hooks');
const DELTAS = {up:[0,-1], right:[1,0], down:[0,1], left:[-1,0]};

// Same simultaneous collision/chain/swap rules as Board.turn, without its RNG.
function resolve(units, commands, width, height) {
    const starts = units.map(u=>u.y*width+u.x);
    const occupants = new Map(starts.map((k,i)=>[k,i]));
    const targets = units.map((u,i)=>{
        const d=DELTAS[commands.get(u.id)];
        if(!d)return starts[i];
        const x=u.x+d[0], y=u.y+d[1];
        return x>=0&&y>=0&&x<width&&y<height ? y*width+x : starts[i];
    });
    let changed=true;
    while(changed) {
        changed=false;
        const claims=new Map();
        for(const k of targets)claims.set(k,(claims.get(k)||0)+1);
        for(let i=0;i<units.length;i++) {
            if(targets[i]===starts[i])continue;
            const j=occupants.get(targets[i]);
            if(claims.get(targets[i])>1 || (j!==undefined && targets[j]===starts[i])) {
                targets[i]=starts[i];changed=true;
            }
        }
    }
    return targets;
}

function dodge(p, state, original, groups, deadline) {
    const ownAt=new Map(state.ownUnits.map(u=>[p.key(u.x,u.y),u]));
    const own=state.ownUnits.map(u=>({...u,id:`o:${u.handle}`}));
    const foreign=state.units.filter(u=>!ownAt.has(p.key(u.x,u.y))).map(u=>({...u,id:`f:${p.key(u.x,u.y)}`})).sort((a,b)=>a.y-b.y||a.x-b.x);
    const units=[...own,...foreign];
    let commands=new Map(original.filter(c=>c.commandName==='move').map(c=>[`o:${c.handle}`,c.params[0]]));
    const dist=(u,k)=>Math.abs(u.x-k%p.width)+Math.abs(u.y-Math.floor(k/p.width));
    const enemyGroups=p.matched(new Set(foreign.map(u=>p.key(u.x,u.y)))).matches;
    const enemyAt=new Map(foreign.map(u=>[p.key(u.x,u.y),u]));
    const score=(cmds, scenario)=>{
        const all=new Map([...cmds,...scenario]);
        const positions=resolve(units,all,p.width,p.height);
        const used=p.matched(new Set(positions)).used;
        let ours=0, survivors=0, theirs=0;
        positions.forEach((k,i)=>{
            if(!used.has(k))return;
            if(i<own.length){ours++;if(own[i].energy===1)survivors++;}else theirs++;
        });
        p.metrics.dodgeEvaluations++;
        return {ours,survivors,theirs,positions};
    };
    for(const group of groups) {
        if(performance.now()>=deadline){p.metrics.dodgeCuts++;break;}
        const nearby=foreign.filter(u=>group.some(k=>dist(u,k)<=2));
        const baseline=score(commands,[]);
        const indices=group.map(k=>own.findIndex(u=>u.handle===ownAt.get(k).handle));
        const used=p.matched(new Set(baseline.positions)).used;
        if(!nearby.length && indices.every(i=>used.has(baseline.positions[i])))continue;
        // Fixed bounded adversary set: nearby single-cell moves and translations
        // of nearby complete foreign groups. This is not a full minimax solver.
        const scenarios=[[]];
        for(const u of nearby.slice(0,6))for(const name of Object.keys(DELTAS))scenarios.push([[u.id,name]]);
        for(const g of enemyGroups.filter(g=>g.some(k=>group.some(q=>Math.abs(k%p.width-q%p.width)+Math.abs(Math.floor(k/p.width)-Math.floor(q/p.width))<=2))).slice(0,2)) {
            for(const name of Object.keys(DELTAS))scenarios.push(g.map(k=>[enemyAt.get(k).id,name]));
        }
        if(p.opts.pairThreats) {
            const pairs=pairScenarios(p,state,group,12);
            scenarios.push(...pairs);
            p.metrics.pairScenarios=(p.metrics.pairScenarios||0)+pairs.length;
        }
        const assess=cmds=>{
            const values=[];
            for(const scenario of scenarios) {
                if(performance.now()>=deadline)return null;
                values.push(score(cmds,scenario));
            }
            const minOwn=Math.min(...values.map(x=>x.ours));
            const minSurvivors=Math.min(...values.map(x=>x.survivors));
            const avg=values.reduce((s,x)=>s+x.ours*10-x.theirs,0)/values.length;
            // Own survival first; opponent denial resolves otherwise similar moves.
            return {rank:[minOwn,minSurvivors,values[0].ours,avg],static:values[0]};
        };
        const base=assess(commands);
        if(!base){p.metrics.dodgeCuts++;break;}
        let best=base, picked=null;
        const better=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;};
        for(const name of Object.keys(DELTAS)) {
            const trial=new Map(commands);
            for(const i of indices)trial.set(own[i].id,name);
            const value=assess(trial);
            if(!value){p.metrics.dodgeCuts++;break;}
            const [dx,dy]=DELTAS[name];
            // Reject partially blocked translations and collateral own score loss
            // in the static-foreign world. Adversarial worlds still include blocks.
            if(!indices.every(i=>value.static.positions[i]===p.key(own[i].x+dx,own[i].y+dy)))continue;
            const counted=p.matched(new Set(value.static.positions)).used;
            if(!indices.every(i=>counted.has(value.static.positions[i])))continue;
            if(value.static.ours<baseline.ours)continue;
            if(better(value.rank,best.rank)){best=value;picked=trial;}
        }
        if(picked){commands=picked;p.metrics.dodgeGroups++;p.metrics.dodgeMoves+=indices.length;}
    }
    return own.filter(u=>commands.has(u.id)).map(u=>({handle:u.handle,commandName:'move',params:[commands.get(u.id)]}));
}
module.exports={resolve,dodge};
