/* Convoy No.0: optional timed rescue, all clocks are simulation clocks. */
(function(root){
  'use strict';
  const START=210,END=300,PRISONERS=6;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function update(g,input,dt,R){
    if(g.mode!=='story'||g.state!=='playing'||!(dt>0))return;
    if(!g.convoy&&g.elapsed>=START&&g.elapsed<END){
      const street=v=>clamp(Math.round((v+R.WORLD/2-2)/R.BLOCK),1,R.GRID-2)*R.BLOCK-R.WORLD/2+2;
      const direction=g.player.x>R.WORLD/2-180?-1:1;
      g.convoy={x:clamp(street(g.player.x)-direction*R.BLOCK*2,-R.WORLD/2+8,R.WORLD/2-8),z:street(g.player.z),y:0,direction,yaw:-direction*Math.PI/2,hits:0,hold:0,stoppedUntil:0,until:END,status:'moving',speed:7,announced:false};
    }
    const c=g.convoy;if(!c||c.status==='rescued'||c.status==='escaped')return;
    const oldX=c.x;
    if(g.elapsed>=c.until){c.status='escaped';c.hold=0;return;}
    if(c.hits>=3&&g.elapsed<c.stoppedUntil){
      c.status='stopped';c.speed=0;
      const rear={x:c.x-c.direction*3.8,y:1,z:c.z};
      const near=Math.hypot(g.player.x-rear.x,g.player.y-rear.y,g.player.z-rear.z)<3.2;
      c.hold=near&&input.interact?c.hold+dt:0;
      if(c.hold>=2){c.status='rescued';c.rescuedAt=g.elapsed;(g.story||(g.story={})).convoyRescued=PRISONERS;}
    }else{
      if(c.status==='stopped'){c.hits=0;c.hold=0;}
      c.status='moving';c.speed=7;c.x+=c.direction*c.speed*dt;
      const edge=R.WORLD/2-8;
      if(Math.abs(c.x)>edge){c.x=clamp(c.x,-edge,edge);c.direction*=-1;c.yaw=-c.direction*Math.PI/2;}
    }
    // Dynamic body: do not let the spider walk through a closed transport.
    const p=g.player,hw=3.55+p.r,hd=1.55+p.r;
    if(Math.abs(p.x-c.x)<hw&&Math.abs(p.z-c.z)<hd&&p.y+p.r>0&&p.y-p.r<3.1){
      const combat=typeof module!=='undefined'&&module.exports?require('./assault.js'):root.SpiderAssault;
      if(c.x!==oldX&&combat)combat.damage(g,R,'runover');
      if(p.y>2.9){p.y=3.1+p.r;p.vy=Math.max(0,p.vy);p.grounded=true;}
      else if(hw-Math.abs(p.x-c.x)<hd-Math.abs(p.z-c.z))p.x=c.x+(p.x<c.x?-hw:hw);
      else p.z=c.z+(p.z<c.z?-hd:hd);
    }
  }
  function objective(g){
    const c=g.convoy;if(!c||!['moving','stopped'].includes(c.status))return null;
    return {kind:'convoy',label:c.status==='stopped'?'КОНВОЙ №0 · ДЕРЖИ E У ЗАДНИХ ДВЕРЕЙ':`КОНВОЙ №0 · ПКМ ПО ТРАНСПОРТУ ${c.hits}/3`,x:c.x-(c.status==='stopped'?c.direction*3.8:0),y:1.6,z:c.z,left:Math.max(0,Math.ceil((c.status==='stopped'?Math.min(c.until,c.stoppedUntil):c.until)-g.elapsed)),progress:c.status==='stopped'?Math.min(1,c.hold/2):c.hits/3};
  }
  function createRenderer(T,scene,options={}){
    const root=new T.Group();root.name='convoy-zero';scene.add(root);
    const steel=new T.MeshStandardMaterial({color:0x697e7b,roughness:.55,metalness:.25}),rubber=new T.MeshStandardMaterial({color:0x10151a,roughness:.95}),glass=new T.MeshStandardMaterial({color:0x618c99,roughness:.16,metalness:.5}),glow=new T.MeshBasicMaterial({color:0xffcb78}),silk=new T.MeshStandardMaterial({color:0xd8e6e1,roughness:.45});
    if(options.medical){steel.color.setHex(0xa4b8b1);glow.color.setHex(0x72e5c3);root.name='medical-courier';}
    const geo=new T.BoxGeometry(1,1,1),wheelGeo=new T.CylinderGeometry(.55,.55,.38,16),wheels=[],doors=[];
    function box(parent,x,y,z,w,h,d,m){const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.scale.set(w,h,d);o.castShadow=o.receiveShadow=true;parent.add(o);return o;}
    box(root,0,.85,0,2.8,1,7,steel);box(root,0,2.05,1,2.7,2,4.7,steel);box(root,0,1.9,-2.2,2.6,1.65,2,steel);box(root,0,2.2,-3.22,2.25,.8,.03,glass);
    for(const side of [-1,1]){
      box(root,side*1.36,2.45,1, .03,.5,3.5,rubber);
      box(root,side*1.37,1.3,1,.035,.08,3.8,glow);
      for(const z of [.7,1.3])box(root,side*1.38,1.9,z,.035,.6,.09,glow);
      for(const y of [1.6,2.2])box(root,side*1.38,y,1,.035,.09,.65,glow);
      for(let i=0;i<7;i++)box(root,side*1.39,2.45,-.5+i*.5,.04,.56,.055,steel);
      for(const z of [-2.3,1.2,2.7]){const wheel=new T.Mesh(wheelGeo,rubber);wheel.position.set(side*1.45,.55,z);wheel.rotation.z=Math.PI/2;root.add(wheel);wheels.push(wheel);}
      box(root,side*1.02,1.25,-3.52,.42,.27,.05,glow);
      const hinge=new T.Group();hinge.position.set(side*1.35,0,3.4);root.add(hinge);box(hinge,-side*.66,2.05,0,1.3,1.95,.12,steel);box(hinge,-side*.14,2, -.09,.06,.4,.07,rubber);doors.push(hinge);
    }
    // An actual zero emblem, not a remote font or texture.
    for(const x of [-.32,.32])box(root,x,2.1,-3.25,.12,.65,.035,glow);
    for(const y of [1.8,2.4])box(root,0,y,-3.25,.65,.12,.035,glow);
    if(options.medical){box(root,0,2.1,-3.3,.12,.65,.04,glow);box(root,0,2.1,-3.3,.65,.12,.04,glow);}
    const bindings=[];for(let i=0;i<3;i++){const b=box(root,0,1.9,-.5+i*1.3,2.85,.09,.11,silk);bindings.push(b);}
    const crowd=!options.medical&&typeof window!=='undefined'&&window.PrisonerRelease?window.PrisonerRelease.create({THREE:T,scene}):null;
    let active=null,released=false,lastTime=0;
    function update(g){const c=g.convoy;
      if(active!==c){active=c;released=false;lastTime=g.elapsed;if(crowd)crowd.reset();}
      const delta=Math.max(0,g.elapsed-lastTime);lastTime=g.elapsed;
      root.visible=!!c&&g.mode==='story'&&g.state==='playing'&&c.status!=='escaped';
      if(!root.visible){if(released&&crowd){crowd.reset();released=false;}return;}
      root.position.set(c.x,0,c.z);root.rotation.y=c.yaw;
      wheels.forEach(w=>{w.rotation.x=g.elapsed*c.speed/ .55;w.updateMatrix();});
      doors.forEach((d,i)=>{d.rotation.y=c.status==='rescued'?(i?1:-1)*1.7:0;d.updateMatrix();});
      bindings.forEach((b,i)=>b.visible=i<c.hits);
      if(c.status==='rescued'&&crowd){if(!released){released=true;crowd.start({exit:{x:c.x-c.direction*4,y:0,z:c.z},waypoints:[{x:c.x-c.direction*8,y:0,z:c.z},{x:c.x-c.direction*20,y:0,z:c.z}],count:PRISONERS,seed:19});}crowd.update(delta);}
    }
    function dispose(){root.removeFromParent();if(crowd)crowd.dispose();geo.dispose();wheelGeo.dispose();for(const m of [steel,rubber,glass,glow,silk])m.dispose();}
    root.visible=false;return {root,update,dispose};
  }
  const api={START,END,PRISONERS,update,objective,createRenderer};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SpiderConvoy=api;
})(typeof window!=='undefined'?window:globalThis);
