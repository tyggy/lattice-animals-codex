const A13=require('./a13/player.js');
const {PackingValue}=require('./value.cjs');
const directions=[['up',0,-1],['down',0,1],['left',-1,0],['right',1,0]];
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const move=(handle,name)=>({handle,commandName:'move',params:[name]});

class SelectiveHandoff extends A13 {
 constructor(){super();this.roundNumber=0;this.maxRounds=16;this.valueModel=new PackingValue();this.handoffStats={offered:0,valueRejected:0,started:0,completed:0,aborted:0,approachMoves:0};}
 configure(config){super.configure(config);this.maxRounds=config.maxRounds??16;
  if(config.shapes?.length)this.valueModel=new PackingValue(config.shapes.map(s=>s.cells.length));
  this.compatible=(config.winEnergy??0)===0&&(config.lossEnergy??-1)===-1&&(config.startingEnergy??2)===2;
 }
 context(context){if(Number.isInteger(context.roundIndex))this.nextRoundNumber=context.roundIndex+1;}
 round(...args){super.round(...args);this.roundNumber=this.nextRoundNumber??this.roundNumber+1;this.nextRoundNumber=undefined;this.handoff=null;this.cooldown=0;}
 see(state,commands=[]){return this.snapshot(state.ownUnits,new Set(state.units.map(u=>this.key(u.x,u.y))),commands);}
 paths(unit,occupied){
  const dist=new Int16Array(this.width*this.height).fill(-1),first=new Int8Array(dist.length).fill(-1),queue=[this.key(unit.x,unit.y)];dist[queue[0]]=0;
  for(let i=0;i<queue.length;i++){const k=queue[i];if(dist[k]>=8)continue;
   for(let j=0;j<directions.length;j++){const [,dx,dy]=directions[j],x=k%this.width+dx,y=Math.floor(k/this.width)+dy,n=this.key(x,y);
    if(x<0||y<0||x>=this.width||y>=this.height||dist[n]>=0||occupied.has(n))continue;
    dist[n]=dist[k]+1;first[n]=i===0?j:first[k];queue.push(n);
   }
  }return {dist,first};
 }
 staging(c,d,occupied,paths){
  const out=[];for(const [,dx,dy]of directions){const x=d.x+dx,y=d.y+dy,k=this.key(x,y);
   if(x<0||y<0||x>=this.width||y>=this.height||paths.dist[k]<0)continue;
   if(!directions.some(([,ex,ey])=>{const xx=d.x+ex,yy=d.y+ey;return xx>=0&&yy>=0&&xx<this.width&&yy<this.height&&this.key(xx,yy)!==k&&!occupied.has(this.key(xx,yy));}))continue;
   out.push({d:paths.dist[k],first:paths.first[k]});
  }return out.sort((a,b)=>a.d-b.d)[0];
 }
 gain(state,pure,critical,donor){
  const remaining=Math.max(0,this.maxRounds-this.roundNumber),after=new Set(pure);after.add(critical);after.delete(donor);
  const keep=this.valueModel.projected(state.ownUnits,pure,remaining),exchange=this.valueModel.projected(state.ownUnits,after,remaining);
  return keep===null||exchange===null?-Infinity:exchange-keep;
 }
 choices(state,current,deadline){
  const size=this.targetShape.cells.length;
  if(current.pure.size!==Math.floor(state.ownUnits.length/size)*size)return [];
  const occupied=new Set(state.units.map(u=>this.key(u.x,u.y))),out=[];
  for(const c of state.ownUnits.filter(u=>u.energy===1&&!current.pure.has(u.handle))){
   if(performance.now()>deadline)break;
   const paths=this.paths(c,occupied);
   for(const d of state.ownUnits.filter(u=>u.energy===2&&current.pure.has(u.handle))){
    const stage=this.staging(c,d,occupied,paths);if(!stage||stage.d+1>8||stage.d+1>this.turnLimit-this.tick-4)continue;
    this.handoffStats.offered++;
    const gain=this.gain(state,current.pure,c.handle,d.handle);
    if(gain<=.25+.03*(stage.d+1)){this.handoffStats.valueRejected++;continue;}
    out.push({critical:c.handle,donor:d.handle,anchor:{x:d.x,y:d.y},travel:stage.d+1,gain});
   }
  }
  return out.sort((a,b)=>(b.gain-.03*b.travel)-(a.gain-.03*a.travel)||a.critical.localeCompare(b.critical)||a.donor.localeCompare(b.donor));
 }
 async turn(state,remainingMs=500){
  const start=performance.now(),baseline=await super.turn(state,remainingMs),deadline=Math.min(start+160,start+remainingMs-100);
  if(!this.compatible||!this.clockKnown||this.gatePlan||performance.now()>deadline||this.tick<24)return baseline;
  const current=this.see(state),base=this.see(state,baseline);
  const abort=()=>{this.handoffStats.aborted++;this.handoff=null;this.cooldown=this.tick+4;return baseline;};
  if(this.handoff?.completing){
   if(current.pure.has(this.handoff.critical))this.handoffStats.completed++;else this.handoffStats.aborted++;
   this.handoff=null;this.cooldown=this.tick+2;
  }
  if(!this.handoff&&this.tick<=48&&this.tick>=this.cooldown){
   const choices=this.choices(state,current,deadline);if(choices.length){this.handoff=choices[0];this.handoffStats.started++;}
  }
  const plan=this.handoff;if(!plan)return baseline;
  const c=state.ownUnits.find(u=>u.handle===plan.critical),d=state.ownUnits.find(u=>u.handle===plan.donor);
  if(!c||!d||d.energy!==2||current.pure.has(c.handle)||!current.pure.has(d.handle)||d.x!==plan.anchor.x||d.y!==plan.anchor.y||this.gain(state,current.pure,c.handle,d.handle)<=.25||this.tick>this.turnLimit-3)return abort();
  const occupied=new Set(state.units.map(u=>this.key(u.x,u.y))),paths=this.paths(c,occupied),stage=this.staging(c,d,occupied,paths);
  if(!stage||stage.d+1>this.turnLimit-this.tick-3)return abort();
  const other=baseline.filter(x=>x.handle!==c.handle&&x.handle!==d.handle);
  if(distance(c,d)===1){
   const enter=directions.find(([,dx,dy])=>c.x+dx===d.x&&c.y+dy===d.y)[0];
   for(const [name,dx,dy]of directions){
    const x=d.x+dx,y=d.y+dy;if(x<0||y<0||x>=this.width||y>=this.height||occupied.has(this.key(x,y)))continue;
    const commands=[...other,move(d.handle,name),move(c.handle,enter)],after=this.see(state,commands);
    const harms=state.ownUnits.some(u=>u.energy===1&&((base.pure.has(u.handle)&&!after.pure.has(u.handle))||(base.all.has(u.handle)&&!after.all.has(u.handle))));
    if(harms||after.positions.get(c.handle)!==this.key(d.x,d.y)||!after.pure.has(c.handle)||after.pure.size<base.pure.size||after.all.size<base.all.size)continue;
    this.handoff.completing=true;this.rememberMoves(state,commands);return commands;
   }return abort();
  }
  const [name,dx,dy]=directions[stage.first],commands=[...other,move(c.handle,name)],after=this.see(state,commands);
  // Approach must preserve every current/baseline scoring cell, including the
  // critical spare if it currently has a mixed match. No speculative sacrifice.
  if(after.positions.get(c.handle)!==this.key(c.x+dx,c.y+dy)||!this.preserves(current,after)||!this.preserves(base,after))return abort();
  this.handoffStats.approachMoves++;this.rememberMoves(state,commands);return commands;
 }
 diagnostics(){return {...super.diagnostics(),selectiveHandoff:{...this.handoffStats,round:this.roundNumber,active:!!this.handoff}};}
}
module.exports=SelectiveHandoff;
