const A11=require('./a11/player.js');
const {resolve}=require('./a11/dodge.cjs');
const DIRS=[['up',0,-1],['right',1,0],['down',0,1],['left',-1,0]];
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const move=(handle,direction)=>({handle,commandName:'move',params:[direction]});
const direction=(a,b)=>DIRS.find(([,dx,dy])=>a.x+dx===b.x&&a.y+dy===b.y)?.[0];

// Two simultaneous chains fill a single enclosed vacancy. No long detours,
// incomplete multi-cell repairs, or movement of already scoring cells.
class GateRepair extends A11 {
 constructor(){super();this.gateStats={started:0,completed:0,aborted:0,rejected:0};}
 round(...args){super.round(...args);this.gatePlan=null;}
 snapshot(own,occupied,commands){
  const keys=new Set(own.map(u=>this.key(u.x,u.y)));
  const units=[...own.map(u=>({...u,id:'o:'+u.handle})),...[...occupied].filter(k=>!keys.has(k)).map(k=>({id:'f:'+k,x:k%this.width,y:Math.floor(k/this.width)}))];
  const positions=resolve(units,new Map(commands.filter(c=>c.commandName==='move').map(c=>['o:'+c.handle,c.params[0]])),this.width,this.height);
  const next=own.map((u,i)=>({...u,x:positions[i]%this.width,y:Math.floor(positions[i]/this.width)}));
  const pure=this.matched(new Set(positions.slice(0,own.length))).used,all=this.matched(new Set(positions)).used;
  return {own:next,occupied:new Set(positions),
   positions:new Map(next.map(u=>[u.handle,this.key(u.x,u.y)])),
   pure:new Set(next.filter(u=>pure.has(this.key(u.x,u.y))).map(u=>u.handle)),
   all:new Set(next.filter(u=>all.has(this.key(u.x,u.y))).map(u=>u.handle))};
 }
 preserves(before,after){return [...before.pure].every(h=>after.pure.has(h))&&[...before.all].every(h=>after.all.has(h));}
 expected(plan,snapshot,phase){return plan[phase].every(u=>snapshot.positions.get(u.handle)===this.key(u.x,u.y));}
 route(own,targets,occupied,deadline){
  const baseline=super.route(own,targets,occupied,deadline);
  if(!this.clockKnown||performance.now()>deadline-8)return baseline;
  const current=this.snapshot(own,occupied,[]),base=this.snapshot(own,occupied,baseline);
  if(this.gatePlan){
   const plan=this.gatePlan;this.gatePlan=null;
   if(plan.finishing){
    if(this.expected(plan,current,'final')&&plan.final.every(u=>current.pure.has(u.handle)))this.gateStats.completed++;
    else this.gateStats.aborted++;
   }else if(this.expected(plan,current,'stage')&&this.tick===plan.tick+1){
    const commands=[...baseline.filter(c=>!plan.handles.includes(c.handle)),...plan.second];
    const after=this.snapshot(own,occupied,commands);
    if(this.expected(plan,after,'final')&&this.preserves(current,after)&&after.pure.size>=base.pure.size&&after.all.size>=base.all.size&&plan.final.every(u=>after.pure.has(u.handle))){
     this.gatePlan={...plan,finishing:true};return commands;
    }
    this.gateStats.aborted++;return baseline;
   }else {this.gateStats.aborted++;return baseline;}
  }
  // Finish before deadline defense; unknown clocks and late starts are excluded.
  if(this.tick<8||this.tick>this.turnLimit-3)return baseline;
  const byHandle=new Map(own.map(u=>[u.handle,u])),at=new Map(own.map(u=>[this.key(u.x,u.y),u]));
  for(const group of this.groups){
   if(performance.now()>deadline-8)break;
   if(group.support.length||group.assignments.length!==this.targetShape.cells.length)continue;
   const missing=group.assignments.filter(a=>!occupied.has(this.key(a.x,a.y)));
   if(missing.length!==1)continue;
   const goal=missing[0],incoming=byHandle.get(goal.handle);
   if(!incoming||distance(incoming,goal)!==2)continue;
   if(!group.assignments.every(a=>a===goal||byHandle.get(a.handle)?.x===a.x&&byHandle.get(a.handle)?.y===a.y))continue;
   const handles=group.assignments.map(a=>a.handle),footprint=new Set(group.cells.map(c=>this.key(c.x,c.y)));
   if(handles.some(h=>current.pure.has(h)||current.all.has(h)))continue;
   const gates=DIRS.map(([,dx,dy])=>at.get(this.key(goal.x+dx,goal.y+dy)));
   if(gates.some(u=>!u||!handles.includes(u.handle)))continue;
   for(const gate of gates){
    if(distance(incoming,gate)!==1)continue;
    for(const [name,dx,dy] of DIRS){
     const parking={x:gate.x+dx,y:gate.y+dy},k=this.key(parking.x,parking.y);
     if(parking.x<0||parking.y<0||parking.x>=this.width||parking.y>=this.height||occupied.has(k)||footprint.has(k))continue;
     const first=[move(gate.handle,name),move(incoming.handle,direction(incoming,gate))];
     const second=[move(incoming.handle,direction(gate,goal)),move(gate.handle,direction(parking,gate))];
     const commands=[...baseline.filter(c=>!handles.includes(c.handle)),...first];
     const step=this.snapshot(own,occupied,commands),end=this.snapshot(step.own,step.occupied,second);
     const stage=group.assignments.map(a=>a.handle===incoming.handle?{...gate,handle:incoming.handle}:a.handle===gate.handle?{...parking,handle:gate.handle}:a);
     const plan={handles,stage,final:group.assignments.map(a=>({...a})),second,tick:this.tick};
     if(!this.expected(plan,step,'stage')||!this.expected(plan,end,'final')||!this.preserves(current,step)||!this.preserves(current,end)||end.pure.size<=base.pure.size||end.all.size<base.all.size||!handles.every(h=>end.pure.has(h))){this.gateStats.rejected++;continue;}
     this.gatePlan=plan;this.gateStats.started++;return commands;
    }
   }
  }
  return baseline;
 }
 diagnostics(){return {...super.diagnostics(),gateRepair:{...this.gateStats,active:!!this.gatePlan}};}
}
module.exports=GateRepair;
