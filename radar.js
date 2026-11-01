/* Local, rotating tactical radar. City raster is cached once, HUD runs at 10 Hz. */
(function(root){
  'use strict';
  const SIZE=208,RADIUS=91,RANGE=115;
  function project(player,target,yaw,radius=RADIUS,range=RANGE){
    const dx=target.x-player.x,dz=target.z-player.z,c=Math.cos(yaw),s=Math.sin(yaw);
    const right=c*dx-s*dz,down=s*dx+c*dz,n=Math.hypot(right,down),scale=Math.min(radius/range,n?radius/n:Infinity);
    return {x:right*scale,y:down*scale,edge:n>range,distance:Math.hypot(dx,(target.y||0)-(player.y||0),dz),angle:Math.atan2(right,-down),height:(target.y||0)-(player.y||0)};
  }
  function create(R,canvas,panel,tracker){
    const ctx=canvas.getContext('2d'),atlas=document.createElement('canvas');atlas.width=atlas.height=2048;
    const map=atlas.getContext('2d'),scale=atlas.width/R.WORLD,half=R.WORLD/2;
    map.fillStyle='#1c2c32';map.fillRect(0,0,2048,2048);
    for(const b of R.buildings){const shade=Math.round(56+b.h*.55);map.fillStyle=`rgb(${shade},${shade+13},${shade+15})`;map.fillRect((b.x+half)*scale,(b.z+half)*scale,b.w*scale,b.d*scale);map.strokeStyle='#a3b5ae40';map.lineWidth=.65;map.strokeRect((b.x+half)*scale,(b.z+half)*scale,b.w*scale,b.d*scale);}
    const dpr=Math.min(2,root.devicePixelRatio||1);canvas.width=canvas.height=SIZE*dpr;
    let last=-Infinity,previous=null;
    function dot(point,color,label){
      ctx.fillStyle=color;ctx.strokeStyle='#071319';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(SIZE/2+point.x,SIZE/2+point.y,point.edge?6:4,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(label){ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.fillText(label,SIZE/2+point.x,SIZE/2+point.y-9);}
    }
    function update(g,yaw,now,visible,goal){
      panel.hidden=!visible;
      if(!visible){tracker.hidden=true;return;}
      tracker.hidden=g.mode!=='story'||g.state!=='playing';
      if(now-last<100&&previous===g)return;last=now;previous=g;
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,SIZE,SIZE);
      ctx.save();ctx.beginPath();ctx.arc(SIZE/2,SIZE/2,RADIUS+5,0,Math.PI*2);ctx.clip();
      ctx.fillStyle='#122027';ctx.fillRect(0,0,SIZE,SIZE);
      ctx.save();ctx.translate(SIZE/2,SIZE/2);ctx.rotate(yaw);
      const zoom=RADIUS/RANGE;
      ctx.drawImage(atlas,-(g.player.x+half)*zoom,-(g.player.z+half)*zoom,R.WORLD*zoom,R.WORLD*zoom);ctx.restore();
      ctx.strokeStyle='#dcf4e41e';ctx.lineWidth=1;
      for(const r of [RADIUS/2,RADIUS]){ctx.beginPath();ctx.arc(SIZE/2,SIZE/2,r,0,Math.PI*2);ctx.stroke();}
      ctx.fillStyle='#a7e6d41d';ctx.beginPath();ctx.moveTo(SIZE/2,SIZE/2);ctx.arc(SIZE/2,SIZE/2,32,-Math.PI/2-.65,-Math.PI/2+.65);ctx.closePath();ctx.fill();
      if(goal)dot(project(g.player,goal,yaw),'#ffda7d','Ц');
      if(!tracker.hidden){
        const h=g.hunter,p=project(g.player,h,yaw),friendly=h.mode==='ally',color=friendly?'#79f2cc':'#ff9b74';dot(p,color,'6');
        tracker.style.setProperty('--six-color',color);
        tracker.querySelector('.six-arrow').style.transform=`rotate(${p.angle}rad)`;
        tracker.querySelector('.six-distance').textContent=Math.round(p.distance)+' м';
        tracker.querySelector('.six-state').textContent=(friendly?'СОЮЗНИК':h.mode==='withdrawal'?'НУЖНА ПОМОЩЬ':'ОХОТНИК')+(Math.abs(p.height)>3?' · '+(p.height>0?'ВЫШЕ ':'НИЖЕ ')+Math.round(Math.abs(p.height))+' м':'');
        tracker.setAttribute('aria-label',`Шестой: ${Math.round(p.distance)} метров, ${Math.round(p.angle*180/Math.PI)} градусов от направления взгляда`);
      }
      ctx.fillStyle='#e4fff8';ctx.strokeStyle='#102d32';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(SIZE/2,SIZE/2-8);ctx.lineTo(SIZE/2-6,SIZE/2+6);ctx.lineTo(SIZE/2,SIZE/2+3);ctx.lineTo(SIZE/2+6,SIZE/2+6);ctx.closePath();ctx.fill();ctx.stroke();
      const north=project({x:0,z:0},{x:0,z:-1000},yaw,83,115);ctx.fillStyle='#d0e5de';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText('N',SIZE/2+north.x,SIZE/2+north.y+3);
      ctx.restore();
    }
    return {update,atlas};
  }
  const api={project,create,SIZE,RADIUS,RANGE};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SpiderRadar=api;
})(typeof window!=='undefined'?window:globalThis);
