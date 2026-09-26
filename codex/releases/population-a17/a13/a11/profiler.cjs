// Observable geometry only. No foreign identity inference, external calls or message execution.
const DELTAS={up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]};
function pairScenarios(p,state,group,cap=12){
 const ownKeys=new Set(state.ownUnits.map(u=>p.key(u.x,u.y))),occ=new Set(state.units.map(u=>p.key(u.x,u.y)));
 const foreign=new Set([...occ].filter(k=>!ownKeys.has(k))),shape=p.targetShape;
 const origin=group[0]-shape.cells[0][1]*p.width-shape.cells[0][0],origins=new Set();
 for(const k of group)for(const [dx,dy] of shape.cells){const x=k%p.width-dx,y=Math.floor(k/p.width)-dy;if(x>=0&&y>=0&&x<=p.width-shape.width&&y<=p.height-shape.height)origins.add(p.key(x,y));}
 const out=[],seen=new Set();
 for(const base of [...origins].sort((a,b)=>a-b)){
  if(base>=origin)continue;
  const cells=shape.cells.map(([dx,dy])=>base+dy*p.width+dx),missing=cells.filter(k=>!occ.has(k));
  if(missing.length!==2)continue;
  const sources=missing.map(target=>Object.entries(DELTAS).flatMap(([name,[dx,dy]])=>{
   const x=target%p.width-dx,y=Math.floor(target/p.width)-dy,k=p.key(x,y);
   return x>=0&&y>=0&&x<p.width&&y<p.height&&foreign.has(k)?[[`f:${k}`,name]]:[];
  }));
  for(const a of sources[0])for(const b of sources[1]){
   if(a[0]===b[0])continue;
   const scenario=[a,b].sort((a,b)=>a[0].localeCompare(b[0])),sig=JSON.stringify(scenario);
   if(!seen.has(sig)){seen.add(sig);out.push(scenario);if(out.length>=cap)return out;}
  }
 }
 return out;
}
function validOffer(p,state,text){
 const match=/^SafeHouse: ([\w-]+) needs (\d+) at (.*?)\. Stand there and we both live\.$/.exec(text);
 if(!match||match[1]!==p.targetShape.name)return false;
 const coords=[...match[3].matchAll(/\((\d+),(\d+)\)/g)].map(m=>[Number(m[1]),Number(m[2])]);
 if(coords.length!==Number(match[2])||coords.length>6||!coords.length||coords.some(([x,y])=>x>=p.width||y>=p.height))return false;
 const targets=new Set(coords.map(([x,y])=>p.key(x,y)));if(targets.size!==coords.length)return false;
 const occ=new Set(state.units.map(u=>p.key(u.x,u.y)));if([...targets].some(k=>occ.has(k)))return false;
 for(const [dx,dy] of p.targetShape.cells){
  const x=coords[0][0]-dx,y=coords[0][1]-dy;
  if(x<0||y<0||x>p.width-p.targetShape.width||y>p.height-p.targetShape.height)continue;
  const cells=p.cellsAt(x,y).map(c=>p.key(c.x,c.y));
  if([...targets].every(k=>cells.includes(k))&&cells.every(k=>targets.has(k)||occ.has(k))){
   const hypothetical=new Set([...occ,...targets]),used=p.matched(hypothetical).used;
   if(cells.every(k=>used.has(k)))return true;
  }
 }
 return false;
}
class Profiler {
 constructor(){this.totals={observations:0,settledObservations:0,mobileObservations:0,pairThreatObservations:0,brokenStableGroups:0,offers:0,validOffers:0};this.reset();}
 reset(){this.tick=0;this.lastForeign=null;this.groups=new Map();this.risky=new Map();this.latest=null;}
 observe(p,state){
  this.tick++;this.totals.observations++;
  const own=new Set(state.ownUnits.map(u=>p.key(u.x,u.y))),foreign=new Set(state.units.map(u=>p.key(u.x,u.y)).filter(k=>!own.has(k)));
  const current=new Map(p.matched(foreign).matches.map(g=>{const sig=[...g].sort((a,b)=>a-b).join(',');return [sig,{cells:g,age:(this.groups.get(sig)?.age||0)+1}];}));
  for(const [sig,g] of this.groups)if(g.age>=6&&!current.has(sig)&&g.cells.some(k=>!foreign.has(k))){
   this.totals.brokenStableGroups++;
   for(const k of g.cells)this.risky.set(k,this.tick+16);
  }
  for(const [k,until] of this.risky)if(until<=this.tick)this.risky.delete(k);
  const settled=[...current.values()].filter(g=>g.age>=6).length;
  const mobile=this.risky.size>0;
  const ours=p.matched(own).matches;
  const pairThreatCount=ours.reduce((n,g)=>n+pairScenarios(p,state,g,12).length,0);
  let offers=0,valid=0;
  for(const m of state.messages||[])if(typeof m.text==='string'&&m.text.startsWith('SafeHouse:')){offers++;if(validOffer(p,state,m.text))valid++;}
  this.totals.offers+=offers;this.totals.validOffers+=valid;
  if(settled)this.totals.settledObservations++;
  if(mobile)this.totals.mobileObservations++;
  if(pairThreatCount)this.totals.pairThreatObservations++;
  const departed=this.lastForeign?[...this.lastForeign].filter(k=>!foreign.has(k)).length:0;
  this.groups=current;this.lastForeign=foreign;
  this.latest={tick:this.tick,settledGroups:settled,mobileSupport:mobile,pairThreatCount,foreignOccupancyDepartures:departed,offers,validOffers:valid,scope:'anonymous foreign formations',evidenceReady:this.tick>=8};
  return this.latest;
 }
 supportRisk(p,k){return [...this.risky.keys()].some(q=>Math.abs(k%p.width-q%p.width)+Math.abs(Math.floor(k/p.width)-Math.floor(q/p.width))<=2);}
}
module.exports={Profiler,pairScenarios,validOffer};
