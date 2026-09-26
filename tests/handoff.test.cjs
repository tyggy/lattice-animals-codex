const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../codex/releases/handoff-a14/player.js'),{PackingValue}=require('../codex/releases/handoff-a14/value.cjs');
const Board=require('../codex/game/Board'),Player=require('../codex/game/Player');
const shape={name:'I3',width:1,height:3,cells:[[0,0],[0,1],[0,2]]};
const state={ownUnits:[{handle:'donor',x:5,y:5,energy:2},{handle:'a',x:5,y:6,energy:2},{handle:'b',x:5,y:7,energy:2},{handle:'spare',x:6,y:5,energy:1}],units:[{x:5,y:5},{x:5,y:6},{x:5,y:7},{x:6,y:5}],messages:[]};
function setup(sizes=[3,4]){const p=new P();p.configure({turnsPerRound:64,maxRounds:2,shapes:sizes.map(n=>({cells:Array(n).fill([0,0])}))});p.round(12,12,shape);p.tick=23;return p;}
test('packing value captures when preserving an extra cell costs next-round energy',()=>{
 const m=new PackingValue([3]);assert.equal(m.value(3,0,1),6);assert.equal(m.value(2,2,1),5);
 const mixed=new PackingValue([3,4]);assert.equal(mixed.value(3,0,1),4.5);assert.equal(mixed.value(2,2,1),5.5);
 assert.equal(m.value(2,2,0),m.value(3,0,0));
});
test('selected simultaneous chain saves spare in actual engine without reducing matches',async()=>{
 const p=setup(),commands=await p.turn(state,500),b=new Board([],12,12,Player.DELTAS,()=>.5);
 b.units=state.ownUnits.map(u=>({...u,id:u.handle,command:commands.find(c=>c.handle===u.handle)?.params[0]||null}));b.turn();
 const used=new Set(b.match(shape).flat());assert.equal(used.size,3);assert(used.has('spare'));assert.equal(p.handoffStats.started,1);
});
test('rejects negative future value, final round, unknown clock and low budget',async()=>{
 for(const mode of ['negative','final','unknown','budget']){const p=setup(mode==='negative'?[3]:[3,4]);
  if(mode==='final')p.roundNumber=2;if(mode==='unknown')p.resumed();
  await p.turn(state,mode==='budget'?30:500);assert.equal(p.handoffStats.started,0,mode);
 }
});
test('resumed round context uses absolute round index for remaining horizon',()=>{
 const p=setup();p.context({roundIndex:12});p.round(12,12,shape);assert.equal(p.roundNumber,13);
 p.round(12,12,shape);assert.equal(p.roundNumber,14);
});
test('donor relocation invalidates an approach instead of chasing stale positions',async()=>{
 const p=setup();p.handoff={critical:'spare',donor:'donor',anchor:{x:4,y:5},travel:1,gain:1};
 await p.turn(state,500);assert.equal(p.handoff,null);assert.equal(p.handoffStats.aborted,1);
});
