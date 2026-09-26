const Handoff = require('./handoff.cjs');
const distance = (a,b) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);

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

class Population extends Handoff {
 constructor(){super();this.populationStats={considered:0,batches:0,swaps:0,unreachable:0};}
 balancePopulation(own,groups,locked,deadline){
  if(!this.compatible||!this.clockKnown||this.tick>12||performance.now()>deadline-12)return;
  const size=this.targetShape.cells.length,spares=own.length%size;
  if(!spares||own.some(u=>u.energy!==1&&u.energy!==2))return;
  // Change membership only after a complete own-only packing plan exists.
  // Locked formations and mixed raids retain their members.
  const assignments=groups.filter(g=>!g.support.length).flatMap(g=>g.assignments);
  const assigned=new Set([...locked,...assignments.map(a=>a.handle)]);
  const anyTarget=new Set(groups.flatMap(g=>g.assignments.map(a=>a.handle)));
  const free=own.filter(u=>!assigned.has(u.handle));
  if(assigned.size!==own.length-spares||free.some(u=>anyTarget.has(u.handle)))return;
  const healthy=own.filter(u=>u.energy===2).length,weak=own.length-healthy;
  const current=free.filter(u=>u.energy===1).length;
  const remaining=Math.max(0,this.maxRounds-this.roundNumber);
  const value=d=>this.valueModel.value(healthy-(spares-d),weak-d+(spares-d),remaining);
  let desired=current,best=value(current);
  for(let d=Math.max(0,spares-healthy);d<=Math.min(spares,weak);d++){
   const v=value(d);if(v>best+.1){best=v;desired=d;}
  }
  if(desired===current)return;
  this.populationStats.considered++;
  const byHandle=new Map(own.map(u=>[u.handle,u]));
  const mobile=own.filter(u=>!locked.has(u.handle));
  const dummy=Array.from({length:spares},(_,i)=>({energy:i<desired?1:2}));
  const slots=[...assignments,...dummy];
  if(slots.length!==mobile.length)return;
  const forbidden=1e8;
  const cost=slots.map((a,i)=>mobile.map(u=>{
   if(i>=assignments.length)return u.energy===a.energy?0:forbidden;
   const d=distance(u,a);
   return d>Math.min(24,this.turnLimit-this.tick-8)?forbidden:d+d*d*.035;
  }));
  const cols=assign(cost);
  if(!cols||cols.some((c,i)=>cost[i][c]>=forbidden)||performance.now()>deadline-8){this.populationStats.unreachable++;return;}
  let changes=0;
  for(let i=0;i<assignments.length;i++){
   const handle=mobile[cols[i]].handle;if(handle!==assignments[i].handle)changes++;
   assignments[i].handle=handle;
  }
  this.populationStats.batches++;this.populationStats.swaps+=changes;
 }
 diagnostics(){return {...super.diagnostics(),population:{...this.populationStats}};}
}
module.exports=Population;
