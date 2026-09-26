const Handoff = require('./handoff.cjs');
const distance = (a,b) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);

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
  // A 32 -> 30 transition needs two coordinated exchanges: the intervening
  // 31-cell population can be worse. Preflight the entire batch before mutation.
  const saveEnergy=desired>current?2:1,freeEnergy=3-saveEnergy;
  const incoming=free.filter(u=>u.energy===saveEnergy);
  const slots=assignments.filter(a=>byHandle.get(a.handle).energy===freeEnergy);
  const chosen=[],usedIn=new Set(),usedOut=new Set();
  for(let i=0;i<Math.abs(desired-current);i++){
   let pair=null;
   for(const u of incoming)if(!usedIn.has(u.handle))for(const a of slots)if(!usedOut.has(a.handle)){
    const travel=distance(u,a),extra=travel-distance(byHandle.get(a.handle),a);
    if(travel>Math.min(24,this.turnLimit-this.tick-8)||extra>16)continue;
    const cost=travel+Math.max(0,extra);
    if(!pair||cost<pair.cost)pair={u,a,cost};
   }
   if(!pair){this.populationStats.unreachable++;return;}
   chosen.push(pair);usedIn.add(pair.u.handle);usedOut.add(pair.a.handle);
  }
  if(performance.now()>deadline-8)return;
  for(const {u,a}of chosen)a.handle=u.handle;
  this.populationStats.batches++;this.populationStats.swaps+=chosen.length;
 }
 diagnostics(){return {...super.diagnostics(),population:{...this.populationStats}};}
}
module.exports=Population;
