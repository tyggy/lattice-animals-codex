const path=require('node:path'),fs=require('node:fs');
const {match}=require('./gym.cjs');
const args=process.argv.slice(2);
function option(name,fallback){const i=args.indexOf(name);return i<0?fallback:args[i+1];}
const seeds=Number(option('--seeds',2)),start=Number(option('--start',5801));
const candidate=option('--candidate','handoff-a14'),opponent=option('--opponent','gate-a13');
const out=path.resolve(option('--output','runs/comparison.jsonl'));
if(!Number.isInteger(seeds)||seeds<1||!Number.isInteger(start))throw Error('seeds and start must be integers');
const kind=release=>({name:release,module:path.resolve(__dirname,'../codex/releases',release,'player.js')});
(async()=>{
 fs.mkdirSync(path.dirname(out),{recursive:true});const fd=fs.openSync(out,'wx');
 let wins=0,losses=0,draws=0,margin=0,faults=0;
 try{
  for(let seed=start;seed<start+seeds;seed++)for(const reversed of [false,true]){
   const kinds=[kind(candidate),kind(opponent)];if(reversed)kinds.reverse();
   const row=await match({seed,kinds,units:32,rounds:16,turns:64,turnMs:500});
   row.reversed=reversed;fs.writeSync(fd,JSON.stringify(row)+'\n');
   const ci=reversed?1:0,me=row.results.find(r=>r.name===`p${ci}`),other=row.results.find(r=>r.name===`p${1-ci}`);
   if(!me||!other)throw Error('Unexpected result schema');
   if(me.winner)wins++;else if(other.winner)losses++;else draws++;
   margin+=me.totalEnergy-other.totalEnergy;faults+=row.stats.reduce((s,x)=>s+x.timeouts+x.invalid+x.errors.length,0);
   console.log(JSON.stringify({seed,reversed,energy:[me.totalEnergy,other.totalEnergy]}));
  }
 }finally{fs.closeSync(fd);}
 console.log(JSON.stringify({games:seeds*2,wins,losses,draws,meanEnergyMargin:margin/(seeds*2),faults,output:out}));
 if(faults)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
