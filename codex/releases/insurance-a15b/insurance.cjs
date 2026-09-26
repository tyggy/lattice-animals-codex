const A14=require('./a14/player.js');
const {resolve,DELTAS}=require('./resolve.cjs');
const DIRS=Object.entries(DELTAS),move=(handle,name)=>({handle,commandName:'move',params:[name]});
class SupportInsurance extends A14 {
 constructor(){super();this.insuranceStats={staged:0,approachMoves:0,aborted:0,insuredTurns:0,evaluations:0,cuts:0};}
 round(...args){super.round(...args);this.insurance=null;}
 groupsAt(state){
  const at=new Map(state.ownUnits.map(u=>[this.key(u.x,u.y),u]));
  return this.matched(new Set(state.units.map(u=>this.key(u.x,u.y)))).matches.map(cells=>({cells,
   members:cells.filter(k=>at.has(k)).map(k=>({handle:at.get(k).handle,key:k})),supports:cells.filter(k=>!at.has(k))}))
   .filter(g=>g.members.length&&g.supports.length>0&&g.supports.length<=2)
   .sort((a,b)=>b.members.filter(m=>at.get(m.key).energy===1).length-a.members.filter(m=>at.get(m.key).energy===1).length||a.cells[0]-b.cells[0]);
 }
 score(state,commands,scenario){
  const own=state.ownUnits.map(u=>({...u,id:'o:'+u.handle})),keys=new Set(own.map(u=>this.key(u.x,u.y)));
  const foreign=state.units.filter(u=>!keys.has(this.key(u.x,u.y))).map(u=>({...u,id:'f:'+this.key(u.x,u.y)}));
  const moves=new Map(commands.filter(c=>c.commandName==='move').map(c=>['o:'+c.handle,c.params[0]]));for(const [k,d]of scenario)moves.set('f:'+k,d);
  const positions=resolve([...own,...foreign],moves,this.width,this.height),used=this.matched(new Set(positions)).used;
  const matched=new Set(own.filter((u,i)=>used.has(positions[i])).map(u=>u.handle));
  return {matched,positions,critical:own.filter(u=>u.energy===1&&matched.has(u.handle)).length};
 }
 scenarios(supports){let out=[[]];for(const k of supports)out=out.flatMap(s=>[s,...DIRS.map(([d])=>[...s,[k,d]])]);return out;}
 cover(state,baseline,deadline){
  let chosen=baseline;
  for(const g of this.groupsAt(state).slice(0,4)){
   const members=new Set(g.members.map(m=>m.handle)),options=g.supports.map(k=>state.ownUnits.filter(u=>!members.has(u.handle)&&Math.abs(u.x-k%this.width)+Math.abs(u.y-Math.floor(k/this.width))===1)
    .sort((a,b)=>b.energy-a.energy||a.handle.localeCompare(b.handle)).slice(0,4).map(u=>({handle:u.handle,k,dir:DIRS.find(([,d])=>u.x+d[0]===k%this.width&&u.y+d[1]===Math.floor(k/this.width))[0]})));
   if(options.some(a=>!a.length))continue;
   let combos=[[]];for(const a of options)combos=combos.flatMap(c=>a.filter(v=>!c.some(x=>x.handle===v.handle)).map(v=>[...c,v]));
   const scenarios=this.scenarios(g.supports),base=[];
   for(const scenario of scenarios){if(performance.now()>deadline){this.insuranceStats.cuts++;return chosen;}base.push(this.score(state,chosen,scenario));}
   let best=0,pick=null;
   for(const combo of combos){
    const overridden=new Set([...members,...combo.map(c=>c.handle)]),commands=[...chosen.filter(c=>!overridden.has(c.handle)),...combo.map(c=>move(c.handle,c.dir))];
    let gain=0,safe=true;
    for(let i=0;i<scenarios.length;i++){
     if(performance.now()>deadline){this.insuranceStats.cuts++;return chosen;}
     const after=this.score(state,commands,scenarios[i]);this.insuranceStats.evaluations++;
     if(after.matched.size<base[i].matched.size||state.ownUnits.some(u=>u.energy===1&&base[i].matched.has(u.handle)&&!after.matched.has(u.handle))){safe=false;break;}
     gain+=after.matched.size-base[i].matched.size;
    }
    if(safe&&gain>best){best=gain;pick=commands;}
   }
   if(pick){chosen=pick;this.insuranceStats.insuredTurns++;}
  }return chosen;
 }
 insuranceStaging(state,deadline){
  const current=this.see(state),occupied=new Set(state.units.map(u=>this.key(u.x,u.y))),spares=state.ownUnits.filter(u=>!current.all.has(u.handle)&&!current.pure.has(u.handle));
  for(const g of this.groupsAt(state)){
   if(performance.now()>deadline)return null;
   if(spares.length<g.supports.length)continue;
   const options=g.supports.map(k=>{
    const out=[];for(const u of spares){const paths=this.paths(u,occupied);
     for(const [,delta] of DIRS){const x=k%this.width+delta[0],y=Math.floor(k/this.width)+delta[1],p=this.key(x,y);
      if(x<0||y<0||x>=this.width||y>=this.height||g.cells.includes(p)||paths.dist[p]<0||paths.dist[p]>6||paths.dist[p]>this.turnLimit-this.tick-3)continue;
      out.push({handle:u.handle,x,y,k,d:paths.dist[p]});
     }
    }return out.sort((a,b)=>a.d-b.d||a.handle.localeCompare(b.handle)).slice(0,8);
   });
   let combos=[[]];for(const a of options)combos=combos.flatMap(c=>a.filter(v=>!c.some(x=>x.handle===v.handle||(x.x===v.x&&x.y===v.y))).map(v=>[...c,v]));
   combos.sort((a,b)=>a.reduce((n,x)=>n+x.d,0)-b.reduce((n,x)=>n+x.d,0));
   if(combos.length)return {group:g,slots:combos[0]};
  }return null;
 }
 async turn(state,remainingMs=500){
  const start=performance.now(),baseline=await super.turn(state,remainingMs),deadline=Math.min(start+230,start+remainingMs-75);
  if(!this.clockKnown||this.gatePlan||this.handoff||performance.now()>deadline)return baseline;
  if(this.tick===this.turnLimit){const commands=this.cover(state,baseline,deadline);this.rememberMoves(state,commands);return commands;}
  if(this.tick<24)return baseline;
  if(!this.insurance&&this.tick<=56){this.insurance=this.insuranceStaging(state,deadline);if(this.insurance)this.insuranceStats.staged++;}
  const plan=this.insurance;if(!plan)return baseline;
  const abort=()=>{this.insurance=null;this.insuranceStats.aborted++;return baseline;};
  const current=this.see(state),occupied=new Set(state.units.map(u=>this.key(u.x,u.y)));
  if(!this.groupsAt(state).some(g=>g.cells.join(',')===plan.group.cells.join(',')&&g.members.every((m,i)=>m.handle===plan.group.members[i]?.handle)))return abort();
  const commands=baseline.filter(c=>!plan.slots.some(s=>s.handle===c.handle));let count=0;
  for(const slot of plan.slots){
   const u=state.ownUnits.find(u=>u.handle===slot.handle);if(!u||current.all.has(u.handle)||current.pure.has(u.handle))return abort();
   if(u.x===slot.x&&u.y===slot.y)continue;
   const paths=this.paths(u,occupied),k=this.key(slot.x,slot.y),d=paths.dist[k];if(d<0||d>this.turnLimit-this.tick-2)return abort();
   commands.push(move(u.handle,['up','down','left','right'][paths.first[k]]));count++;
  }
  const after=this.see(state,commands),base=this.see(state,baseline);
  if(!this.preserves(current,after)||!this.preserves(base,after))return abort();
  this.insuranceStats.approachMoves+=count;this.rememberMoves(state,commands);return commands;
 }
 diagnostics(){return {...super.diagnostics(),supportInsurance:{...this.insuranceStats,active:!!this.insurance}};}
}
module.exports=SupportInsurance;
