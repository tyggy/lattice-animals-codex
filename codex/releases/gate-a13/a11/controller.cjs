const Base=require('./base.js'),{Profiler}=require('./profiler.cjs');
class Controller extends Base {
 constructor(options={}){super({rescueSearch:true,rescueDetour:true,...options});this.selector=options.selector||'adaptive';this.profiler=new Profiler();this.selected={opportunistic:0,cautious:0};this.activeCaution=false;}
 round(...args){super.round(...args);this.profiler.reset();this.activeCaution=false;}
 async turn(state,remainingMs=500){
  const started=performance.now(),features=this.profiler.observe(this,state);
  const recommended=features.evidenceReady&&(features.mobileSupport||features.pairThreatCount>0);
  this.activeCaution=this.selector==='cautious'?true:this.selector==='opportunistic'?false:this.selector==='inverted'?!recommended:recommended;
  this.selected[this.activeCaution?'cautious':'opportunistic']++;
  this.opts.lateFinish=this.activeCaution;this.opts.pairThreats=this.activeCaution;
  // Profile work consumes the same total decision envelope as planning, not extra time.
  return super.turn(state,Math.min(remainingMs,195)-(performance.now()-started));
 }
 supportCost(key,age){
  const risk=this.activeCaution&&(this.selector==='cautious'||this.selector==='inverted'||this.profiler.supportRisk(this,key));
  return super.supportCost(key,age)*(risk?6:1);
 }
 diagnostics(){return {...super.diagnostics(),profiler:{...this.profiler.totals,latest:this.profiler.latest,selected:this.selected,selector:this.selector}};}
}
module.exports=Controller;
