/* Shared camera/aim math. Expanded building boxes keep the chase camera outside walls. */
(function(root){
  'use strict';
  // Chase camera stays just inside the playable square defined in physics.js.
  const rules=typeof module!=='undefined'&&module.exports ? require('./physics.js') : root.SpiderRules;
  const LIMIT=rules ? rules.WORLD/2-.3 : 129.7;
  function entry(o,d,b,max,pad=0){
    let near=0,far=max;
    for(const [axis,lo,hi] of [['x',b.x-pad,b.x+b.w+pad],['y',(b.y0||0)-pad,b.h+pad],['z',b.z-pad,b.z+b.d+pad]]){
      if(Math.abs(d[axis])<1e-8){if(o[axis]<lo||o[axis]>hi)return null;}
      else{const a=(lo-o[axis])/d[axis],c=(hi-o[axis])/d[axis];near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));}
      if(near>far)return null;
    }
    return near;
  }
  function direction(yaw,pitch){return {x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};}
  function pose(p,yaw,pitch,third,buildings){
    if(!third)return {x:p.x,y:p.y,z:p.z};
    const d=direction(yaw,pitch),back={x:-d.x,y:-d.y,z:-d.z},o={x:p.x,y:p.y+.65,z:p.z};
    let distance=5.5;
    const candidates=rules&&buildings===rules.solids ? rules.rayCandidates(o,back,distance,.22) : buildings;
    for(const b of candidates){const hit=entry(o,back,b,distance,.22);if(hit!==null)distance=Math.min(distance,Math.max(0,hit-.08));}
    if(back.y<0)distance=Math.min(distance,Math.max(0,(o.y-.22)/-back.y));
    for(const axis of ['x','z'])if(Math.abs(back[axis])>1e-8)distance=Math.min(distance,Math.max(0,((back[axis]>0?LIMIT:-LIMIT)-o[axis])/back[axis]));
    return {x:o.x+back.x*distance,y:o.y+back.y*distance,z:o.z+back.z*distance};
  }
  function aim(p,origin,d,buildings,range){
    let distance=range;
    const candidates=rules&&buildings===rules.solids ? rules.rayCandidates(origin,d,distance) : buildings;
    for(const b of candidates){const hit=entry(origin,d,b,distance);if(hit!==null)distance=Math.min(distance,hit);}
    return {x:origin.x+d.x*distance-p.x,y:origin.y+d.y*distance-p.y,z:origin.z+d.z*distance-p.z};
  }
  // Ignore pointer-lock warps instead of turning an OS cursor jump into a camera snap.
  function look(yaw,pitch,dx,dy){
    if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>120||Math.abs(dy)>120)return {yaw,pitch};
    return {yaw:yaw-dx*.0025,pitch:Math.max(-1.48,Math.min(1.48,pitch-dy*.0025))};
  }
  const api={direction,pose,aim,look};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SpiderCamera=api;
})(typeof window!=='undefined'?window:globalThis);
