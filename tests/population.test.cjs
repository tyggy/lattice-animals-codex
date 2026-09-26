const test=require('node:test'),assert=require('node:assert/strict');
const modulePath=process.env.POPULATION_MODULE||'../codex/releases/population-global-a18/player.js';
const Population=require(modulePath);
function fixture(){
 const p=new Population();p.configure({maxRounds:16,turnsPerRound:64});
 p.round(64,64,{width:3,height:2,cells:[[0,0],[2,0],[0,1],[1,1],[2,1]]});
 p.roundNumber=2;p.tick=1;
 const own=Array.from({length:32},(_,i)=>({handle:String(i),x:10+i%8,y:10+Math.floor(i/8),energy:i<2?1:2}));
 const groups=Array.from({length:6},(_,j)=>({support:[],assignments:own.slice(j*5,j*5+5).map(u=>({handle:u.handle,x:u.x,y:u.y}))}));
 return {p,own,groups};
}
test('coordinated assignment selects 30 healthy survivors when intermediate 31 is worse',()=>{
 const {p,own,groups}=fixture();p.balancePopulation(own,groups,new Set(),Infinity);
 const handles=groups.flatMap(g=>g.assignments.map(a=>a.handle));
 assert.equal(new Set(handles).size,30);assert(!handles.includes('0'));assert(!handles.includes('1'));
 assert(p.populationStats.swaps>=2);
 const v=p.valueModel;assert(v.value(30,0,14)>v.value(28,4,14));assert(v.value(29,2,14)<v.value(28,4,14));
});
test('batch cannot partially commit when second exchange is too far away',()=>{
 const {p,own,groups}=fixture();own[31].x=63;own[31].y=63;
 const before=JSON.stringify(groups);p.balancePopulation(own,groups,new Set(),Infinity);
 assert.equal(JSON.stringify(groups),before);assert.equal(p.populationStats.swaps,0);
});
test('no forced population reduction on final round where energy is tied',()=>{
 const {p,own,groups}=fixture();p.roundNumber=16;
 const before=JSON.stringify(groups);p.balancePopulation(own,groups,new Set(),Infinity);
 assert.equal(JSON.stringify(groups),before);
});
test('late turns and expired budgets leave assignments untouched',()=>{
 for(const mode of ['late','budget']){const {p,own,groups}=fixture();const before=JSON.stringify(groups);
 if(mode==='late')p.tick=13;
 p.balancePopulation(own,groups,new Set(),mode==='budget'?0:Infinity);assert.equal(JSON.stringify(groups),before);}
});
test('locked cells keep membership and all assignments remain unique',()=>{
 const {p,own,groups}=fixture();
 const locked=new Set(groups.pop().assignments.map(a=>a.handle));
 p.balancePopulation(own,groups,locked,Infinity);
 const handles=groups.flatMap(g=>g.assignments.map(a=>a.handle));
 assert.equal(new Set([...handles,...locked]).size,30);
 assert(!handles.some(h=>locked.has(h)));
});
test('global version can relay assignments when a direct exchange exceeds reach',{skip:!modulePath.includes('a18')},()=>{
 const {p,own,groups}=fixture();own[30].x=40;own[30].y=10;own[31].x=40;own[31].y=11;
 p.balancePopulation(own,groups,new Set(),Infinity);
 assert.equal(p.populationStats.batches,1);
 const assignments=groups.flatMap(g=>g.assignments),handles=new Set(assignments.map(a=>a.handle));
 assert.equal(handles.size,30);assert(!handles.has('0'));assert(!handles.has('1'));
 for(const a of assignments){const u=own.find(u=>u.handle===a.handle);assert(Math.abs(a.x-u.x)+Math.abs(a.y-u.y)<=24);}
});
