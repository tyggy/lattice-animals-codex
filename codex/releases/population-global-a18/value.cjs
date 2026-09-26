// Ideal own-only packing model. No positions, opponent behavior, or sampled
// future targets enter this estimate. It is a selector heuristic, not a forecast.
class PackingValue {
 constructor(sizes=[3,3,4,4,4,4,4,4,3,4,5,5,5,6,6,6,6]){
  this.weights=new Map();for(const k of sizes)this.weights.set(k,(this.weights.get(k)||0)+1);
  this.total=sizes.length;this.memo=new Map();
 }
 value(healthy,critical,rounds){
  if(rounds<=0||healthy+critical===0)return healthy*2+critical;
  const key=`${healthy},${critical},${rounds}`;if(this.memo.has(key))return this.memo.get(key);
  let sum=0;
  for(const [size,weight] of this.weights){
   const losses=(healthy+critical)%size;let best=-Infinity;
   for(let healthyLoss=Math.max(0,losses-critical);healthyLoss<=Math.min(healthy,losses);healthyLoss++){
    const criticalLoss=losses-healthyLoss;
    best=Math.max(best,this.value(healthy-healthyLoss,critical-criticalLoss+healthyLoss,rounds-1));
   }
   sum+=weight*best;
  }
  const value=sum/this.total;this.memo.set(key,value);return value;
 }
 projected(own,matched,rounds){
  let healthy=0,critical=0;
  for(const u of own){const energy=u.energy-(matched.has(u.handle)?0:1);if(energy===2)healthy++;else if(energy===1)critical++;else if(energy>2)return null;}
  return this.value(healthy,critical,rounds);
 }
}
module.exports={PackingValue};
