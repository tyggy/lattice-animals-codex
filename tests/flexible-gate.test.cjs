const test=require('node:test'),assert=require('node:assert/strict');
const A14=require('../codex/releases/handoff-a14/player'),A16=require('../codex/releases/flexible-gate-a16/player');
const Board=require('../codex/game/Board'),Player=require('../codex/game/Player');
const shape={name:'P5',width:2,height:3,cells:[[0,0],[1,0],[0,1],[1,1],[0,2]]};
function setup(Type=A16){const p=new Type();p.configure({turnsPerRound:64,maxRounds:16});p.round(64,64,shape);p.tick=48;
const own=[{handle:'17',x:27,y:12,energy:2},{handle:'12',x:28,y:12,energy:1},{handle:'4',x:27,y:13,energy:1},{handle:'9',x:27,y:14,energy:2},{handle:'31',x:29,y:12,energy:2}];
const assignments=own.map(u=>({...u,...(u.handle==='31'?{x:28,y:13}:{})}));p.groups=[{cells:assignments.map(({x,y})=>({x,y})),assignments,support:[],stalled:3,bestDistance:2}];
const b=new Board([],64,64,Player.DELTAS,()=>.5);b.units=[...own.map(u=>({...u,id:u.handle})),{id:'foreign',x:29,y:13}];return {p,b,targets:new Map(assignments.map(a=>[a.handle,a]))};}
function route(p,b,targets){return p.route(b.units.filter(u=>u.handle),targets,new Set(b.units.map(u=>p.key(u.x,u.y))),performance.now()+1000);}
function apply(b,commands){const m=new Map(commands.map(c=>[c.handle,c.params[0]]));b.units.forEach(u=>u.command=m.get(u.id)||null);b.turn();}
test('P5 two-chain repair completes actual-engine formation without four own enclosing arms',()=>{const {p,b,targets}=setup();apply(b,route(p,b,targets));assert.equal(p.gateStats.started,1);p.tick++;apply(b,route(p,b,targets));assert.equal(b.match(shape).flat().filter(id=>id!=='foreign').length,5);p.tick++;route(p,b,targets);assert.equal(p.gateStats.completed,1);});
test('A14 does not start the same P5 repair',()=>{const {p,b,targets}=setup(A14);route(p,b,targets);assert.equal(p.gateStats.started,0);});
test('interference cancels the second step',()=>{const {p,b,targets}=setup();apply(b,route(p,b,targets));b.units.push({id:'blocker',x:28,y:13});p.tick++;route(p,b,targets);assert.equal(p.gateStats.aborted,1);assert.equal(p.gatePlan,null);});
test('unknown clock and too-late starts keep the repair inactive',()=>{for(const mode of ['unknown','late']){const {p,b,targets}=setup();if(mode==='unknown')p.resumed();else p.tick=63;route(p,b,targets);assert.equal(p.gateStats.started,0);}});
