const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../codex/releases/insurance-a15b/player.js'),{resolve}=require('../codex/releases/insurance-a15b/resolve.cjs');
const Board=require('../codex/game/Board'),Player=require('../codex/game/Player');
const shape={name:'O4',width:2,height:2,cells:[[0,0],[1,0],[0,1],[1,1]]};
function setup(){const p=new P();p.configure({turnsPerRound:64,maxRounds:16});p.round(12,12,shape);p.tick=64;
 const ownUnits=[{handle:'a',x:4,y:4,energy:1},{handle:'b',x:5,y:4,energy:1},{handle:'c',x:4,y:6,energy:2},{handle:'d',x:5,y:6,energy:2}];
 return {p,state:{ownUnits,units:[...ownUnits.map(({x,y})=>({x,y})),{x:4,y:5},{x:5,y:5}],messages:[]}};
}
function actual(p,state,commands,scenario){
 const keys=new Set(state.ownUnits.map(u=>p.key(u.x,u.y))),own=state.ownUnits.map(u=>({...u,id:'o:'+u.handle}));
 const foreign=state.units.filter(u=>!keys.has(p.key(u.x,u.y))).map(u=>({...u,id:'f:'+p.key(u.x,u.y)}));
 const moves=new Map(commands.map(c=>['o:'+c.handle,c.params[0]]));for(const [k,d]of scenario)moves.set('f:'+k,d);
 const b=new Board([],12,12,Player.DELTAS,()=>.5);b.units=[...own,...foreign].map(u=>({...u,command:moves.get(u.id)||null}));b.turn();
 return {positions:b.units.map(u=>p.key(u.x,u.y)),own:new Set(b.match(shape).flat().filter(x=>x.startsWith('o:')).map(x=>x.slice(2)))};
}
test('two backups improve departure cases without worsening any of 25 support actions',()=>{
 const {p,state}=setup(),commands=p.cover(state,[],performance.now()+1000);assert.equal(commands.length,2);assert.equal(p.insuranceStats.insuredTurns,1);
 let improved=0;for(const scenario of p.scenarios([64,65])){const a=actual(p,state,[],scenario),b=actual(p,state,commands,scenario);
  assert(b.own.size>=a.own.size);for(const h of ['a','b'])if(a.own.has(h))assert(b.own.has(h));if(b.own.size>a.own.size)improved++;
  assert.deepEqual(b.positions,p.score(state,commands,scenario).positions);
 }assert(improved>0);
});
test('resolver agrees with engine on forbidden swaps, blocking chains and contested cells',()=>{
 const units=[{id:'a',x:2,y:2},{id:'b',x:3,y:2},{id:'c',x:4,y:2}];
 for(const directions of [['right','left',null],['right','right',null],['right',null,'left'],['right','right','right']]){
  const moves=new Map(units.map((u,i)=>[u.id,directions[i]])),b=new Board([],12,12,Player.DELTAS,()=>.5);b.units=units.map(u=>({...u,command:moves.get(u.id)}));b.turn();
  assert.deepEqual(resolve(units,moves,12,12),b.units.map(u=>u.y*12+u.x));
 }
});
test('no eligible nearby cells means no imaginary insurance; expired budget leaves baseline',()=>{
 const {p,state}=setup();state.ownUnits=state.ownUnits.slice(0,2);state.units=state.units.filter(u=>u.y!==6);
 assert.deepEqual(p.cover(state,[],performance.now()+1000),[]);assert.equal(p.insuranceStaging(state,performance.now()+1000),null);
 const s=setup();assert.deepEqual(s.p.cover(s.state,[],performance.now()-1),[]);
});
test('staging finds two distinct reachable spares and respects unknown clocks',async()=>{
 const {p,state}=setup();p.tick=24;for(const u of state.ownUnits.filter(u=>['c','d'].includes(u.handle)))u.y=8;
 state.units=[...state.ownUnits.map(({x,y})=>({x,y})),{x:4,y:5},{x:5,y:5}];
 const plan=p.insuranceStaging(state,performance.now()+1000);assert(plan);assert.equal(new Set(plan.slots.map(s=>s.handle)).size,2);
 p.resumed();await p.turn(state,500);assert.equal(p.insuranceStats.staged,0);
});
test('insurance retains the inherited A14 handoff staging contract',async()=>{
 const p=new P(),shape={name:'I3',width:1,height:3,cells:[[0,0],[0,1],[0,2]]};
 p.configure({turnsPerRound:64,maxRounds:2,shapes:[{cells:Array(3).fill([0,0])},{cells:Array(4).fill([0,0])}]});p.round(12,12,shape);p.tick=23;
 const ownUnits=[{handle:'d',x:5,y:5,energy:2},{handle:'a',x:5,y:6,energy:2},{handle:'b',x:5,y:7,energy:2},{handle:'s',x:6,y:5,energy:1}];
 await p.turn({ownUnits,units:ownUnits.map(({x,y})=>({x,y})),messages:[]},500);
 assert.equal(p.handoffStats.started,1);assert(p.handoff.completing);
});
