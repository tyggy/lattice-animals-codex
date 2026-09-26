const DELTAS={up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]};
// Board.turn semantics, including forbidden two-cell swaps and propagated blocks.
function resolve(units,moves,width,height){
 const starts=units.map(u=>u.y*width+u.x),at=new Map(starts.map((k,i)=>[k,i]));
 const targets=units.map((u,i)=>{const d=DELTAS[moves.get(u.id)];if(!d)return starts[i];const x=u.x+d[0],y=u.y+d[1];return x>=0&&y>=0&&x<width&&y<height?y*width+x:starts[i];});
 let changed=true;while(changed){changed=false;const counts=new Map();for(const k of targets)counts.set(k,(counts.get(k)||0)+1);
  for(let i=0;i<units.length;i++){if(targets[i]===starts[i])continue;const j=at.get(targets[i]);
   if(counts.get(targets[i])>1||(j!==undefined&&targets[j]===starts[i])){targets[i]=starts[i];changed=true;}
  }
 }return targets;
}
module.exports={resolve,DELTAS};
