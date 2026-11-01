/* Fictional Arachnа pursuit: bounded deterministic rules and a pooled renderer.
   No wall-clock timers: pause, restart and end states share the game's clock. */
(function(root){
  'use strict';
  const MAX_UNITS=17,MAX_SHOTS=48,TICK=.1;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const config={trooper:{range:70,delay:.85,reload:2.8,speed:110},mg:{range:105,delay:1.0,reload:2.3,speed:140},rpg:{range:140,delay:1.7,reload:6.2,speed:36},heli:{range:150,delay:1.2,reload:3.1,speed:115},plane:{range:175,delay:2.2,reload:9,speed:44}};
  function muzzle(u){return {x:u.x,y:u.y+(u.type==='trooper'?.55:u.type==='heli'?-1:u.type==='plane'?-.4:2),z:u.z};}
  function declined(g){return !!(g.story&&g.story.decided&&!g.story.helped);}
  function eligible(g){return g.mode==='story'&&(declined(g)||!!(g.convoy&&g.convoy.hits>0&&['moving','stopped'].includes(g.convoy.status)));}
  function street(v,R){return clamp(Math.round((v+R.WORLD/2-2)/R.BLOCK),0,R.GRID-1)*R.BLOCK-R.WORLD/2+2;}
  function spawn(s,g,R,type,slot){
    if(s.units.length>=MAX_UNITS)return;
    const p=g.player,a=slot*2.39996,dist=type==='plane'?155:65+slot%3*18;
    let x=clamp(p.x+Math.cos(a)*dist,-R.WORLD/2+8,R.WORLD/2-8),z=clamp(p.z+Math.sin(a)*dist,-R.WORLD/2+8,R.WORLD/2-8);
    const air=type==='heli'||type==='plane';
    if(!air){x=street(x,R);z=street(z,R);}
    s.units.push({id:s.nextId++,type,x,z,y:air?(type==='plane'?112:88):type==='trooper'?.48:.43,r:type==='trooper'?.48:1.1,vx:0,vy:0,vz:0,grounded:true,climbing:false,
      yaw:0,cooldown:6+slot*.45,windup:0,aim:null,node:null,phase:a,pass:0});
  }
  function wave(s,g,R,n){
    if(n===0){spawn(s,g,R,'mg',0);spawn(s,g,R,'rpg',1);spawn(s,g,R,'heli',2);for(let i=0;i<4;i++)spawn(s,g,R,'trooper',i+3);}
    if(n===1){spawn(s,g,R,'mg',7);spawn(s,g,R,'rpg',8);for(let i=0;i<4;i++)spawn(s,g,R,'trooper',i+9);}
    if(n===2){spawn(s,g,R,'plane',13);spawn(s,g,R,'heli',14);}
    if(n===3){spawn(s,g,R,'rpg',15);spawn(s,g,R,'mg',16);}
  }
  function blocked(a,b,R){
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,n=Math.hypot(dx,dy,dz);
    if(n<.03)return false;
    const d={x:dx/n,y:dy/n,z:dz/n};
    return R.rayCandidates(a,d,n).some(v=>{const t=R.rayBox(a,d,v,n);return t!==null&&t<n-.04;});
  }
  function damage(g,R,cause='fire'){
    if(g.invulnerable>0||g.state!=='playing')return false;
    g.hp--;g.invulnerable=2.5;g.lastHit={cause,at:g.elapsed};g.player.vy=Math.max(g.player.vy,4);g.player.fly=true;
    if(g.web)R.cutWeb(g,'hit');R.cancelSling(g);
    if(g.hp<=0){g.state='lost';g.defeatCause='assault';g.web=null;g.sling=null;}
    return true;
  }
  function fire(s,u){
    const c=config[u.type],rocket=u.type==='rpg'||u.type==='plane';
    // Bursts have real travelling tracers, not an unavoidable hitscan penalty.
    for(let i=0;i<(rocket?1:3)&&s.shots.length<MAX_SHOTS;i++){
      const origin=muzzle(u);
      const target={x:u.aim.x+(i-1)*.65,y:u.aim.y,z:u.aim.z+(i-1)*.4};
      const dx=target.x-origin.x,dy=target.y-origin.y,dz=target.z-origin.z,n=Math.hypot(dx,dy,dz)||1;
      s.shots.push({...origin,oldX:origin.x,oldY:origin.y,oldZ:origin.z,vx:dx/n*c.speed,vy:dy/n*c.speed,vz:dz/n*c.speed,ttl:rocket?6:2.2,rocket});
    }
    u.windup=0;u.aim=null;u.cooldown=c.reload;s.fired++;
  }
  function friendlyLane(s,u,target){
    const a=muzzle(u),dx=target.x-a.x,dy=target.y-a.y,dz=target.z-a.z,length=dx*dx+dy*dy+dz*dz||1;
    return s.units.some(v=>{if(v===u)return false;const b=muzzle(v),t=((b.x-a.x)*dx+(b.y-a.y)*dy+(b.z-a.z)*dz)/length;
      return t>.02&&t<.98&&Math.hypot(b.x-a.x-dx*t,b.y-a.y-dy*t,b.z-a.z-dz*t)<(v.type==='trooper'?.9:2);});
  }
  function drive(u,target,dt,R){
    // Road-junction routing never cuts a diagonal through a building shell.
    if(!u.node||Math.hypot(u.node.x-u.x,u.node.z-u.z)<.15){
      const x=street(u.x,R),z=street(u.z,R),tx=street(target.x,R),tz=street(target.z,R);
      let nx=x,nz=z;
      if(Math.abs(tx-x)>=Math.abs(tz-z)&&Math.abs(tx-x)>.2)nx+=Math.sign(tx-x)*R.BLOCK;
      else if(Math.abs(tz-z)>.2)nz+=Math.sign(tz-z)*R.BLOCK;
      u.node={x:clamp(nx,-R.WORLD/2+2,R.WORLD/2-2),z:clamp(nz,-R.WORLD/2+2,R.WORLD/2-2)};
    }
    const dx=u.node.x-u.x,dz=u.node.z-u.z,n=Math.hypot(dx,dz),speed=u.type==='trooper'?5.2:Math.hypot(target.x-u.x,target.z-u.z)<30?17:14;
    u.speed=0;
    if(n>.01){
      if(u.type==='trooper'){
        const x=u.x,z=u.z;u.vx=dx/n*speed;u.vz=dz/n*speed;u.vy=(u.vy||0)-24*dt;R.move(u,dt);u.speed=Math.hypot(u.x-x,u.z-z)/dt;
        if(u.speed<.2)u.node=null;
      }else{const travel=Math.min(n,speed*dt);u.x+=dx/n*travel;u.z+=dz/n*travel;u.speed=travel/dt;}
      u.yaw=Math.atan2(-dx,-dz);
    }
  }
  function coverPoint(u,p,R){
    const shapes=R.query(u.x-12,u.z-12,u.x+12,u.z+12,u.y+.5,u.y+.5).filter(b=>b.w>1&&b.d>1).slice(0,4);
    let best=null,score=Infinity;
    for(const b of shapes)for(const x of [b.x-u.r-.65,b.x+b.w+u.r+.65])for(const z of [b.z-u.r-.65,b.z+b.d+u.r+.65]){
      const point={x,y:u.y+.55,z},distance=Math.hypot(x-u.x,z-u.z);
      if(distance>12||distance<.5||!blocked(point,p,R)||blocked(muzzle(u),point,R))continue;
      if(distance<score){best=point;score=distance;}
    }
    return best;
  }
  function flank(u,p,dt,R){
    const angle=u.phase+(u.id%2?1:-1)*.45;
    const radius=u.cooldown>1.3?18:u.id%3===0?22:10;
    u.coverTimer=(u.coverTimer||0)-dt;
    if(u.coverTimer<=0){u.coverTimer=.8;u.cover=u.cooldown>1.3?coverPoint(u,p,R):null;}
    if(u.cooldown<=1.3)u.cover=null;
    const x=u.cover?u.cover.x:p.x+Math.cos(angle)*radius,z=u.cover?u.cover.z:p.z+Math.sin(angle)*radius,dx=x-u.x,dz=z-u.z,n=Math.hypot(dx,dz)||1;
    const direction=R.navigate(u,{x,z},u.id%2?1:-1);
    const oldX=u.x,oldZ=u.z;u.vx=n>1?direction.x*5.2:0;u.vz=n>1?direction.z*5.2:0;u.vy=(u.vy||0)-24*dt;
    R.move(u,dt);u.speed=Math.hypot(u.x-oldX,u.z-oldZ)/dt;u.yaw=Math.atan2(-dx,-dz);u.tactic=u.cooldown>1.3?'reload-reposition':u.id%3===0?'support':'flank';
    if(u.cover)u.tactic='reload-cover';
  }
  function runOver(g,u,oldCar,oldPlayer,R){
    if(u.type!=='mg'&&u.type!=='rpg')return false;
    // Swept player-vs-oriented vehicle: catches crossing a bumper between
    // 10Hz AI ticks, but not a spider on a roof above the same road.
    const p=g.player,c=Math.cos(u.yaw),s=Math.sin(u.yaw);
    function local(a,b){const x=a.x-b.x,z=a.z-b.z;return {x:c*x-s*z,y:a.y,z:s*x+c*z};}
    const a=local(oldPlayer,oldCar),b=local(p,u),lo=[-1.55-p.r,u.y-.43-p.r,-2.65-p.r],hi=[1.55+p.r,u.y+1.95+p.r,2.65+p.r];
    let near=0,far=1;
    for(const [i,key] of ['x','y','z'].entries()){
      const d=b[key]-a[key];if(Math.abs(d)<1e-9){if(a[key]<lo[i]||a[key]>hi[i])return false;}
      else{const x=(lo[i]-a[key])/d,y=(hi[i]-a[key])/d;near=Math.max(near,Math.min(x,y));far=Math.min(far,Math.max(x,y));if(near>far)return false;}
    }
    if(!(u.speed>2)||g.elapsed<(u.ramUntil||0))return false;
    if(damage(g,R,'runover')){u.ramUntil=g.elapsed+3;p.vx+=-Math.sin(u.yaw)*9;p.vz+=-Math.cos(u.yaw)*9;return true;}
    return false;
  }
  function tick(g,s,dt,R){
    s.age+=dt;s.fx=s.fx.filter(f=>(f.ttl-=dt)>0);
    const stages=[0,18,36,72];
    if(s.campaign==='convoy'){
      if(!s.waves[0]){s.waves[0]=true;spawn(s,g,R,'mg',0);spawn(s,g,R,'rpg',1);for(let i=0;i<4;i++)spawn(s,g,R,'trooper',i+3);}
    }else for(let i=0;i<stages.length;i++)if(s.age>=stages[i]&&!s.waves[i]){s.waves[i]=true;wave(s,g,R,i);}
    const p=g.player,blind=R.blind(g);
    // Radio shares actual sightings, not the player's hidden coordinates.
    const spotted=!blind&&s.units.some(u=>Math.hypot(p.x-u.x,p.y-u.y,p.z-u.z)<config[u.type].range&&!blocked(muzzle(u),p,R));
    if(spotted){s.lastKnown={x:p.x,y:p.y,z:p.z};s.seenAt=s.age;}
    const goal=s.lastKnown,oldPlayer=s.previousPlayer||{x:p.x,y:p.y,z:p.z};
    let aiming=s.units.filter(u=>u.windup>0).length;
    for(const u of s.units){
      if(g.elapsed<(u.disabledUntil||0)){u.speed=0;u.windup=0;u.aim=null;u.tactic='stunned';continue;}
      const sees=!blind&&Math.hypot(p.x-u.x,p.y-u.y,p.z-u.z)<config[u.type].range&&!blocked(muzzle(u),p,R);
      const oldCar={x:u.x,y:u.y,z:u.z};
      if(u.type==='heli'){
        const angle=s.age*.17+u.phase,tx=clamp(goal.x+Math.cos(angle)*58,-R.WORLD/2+6,R.WORLD/2-6),tz=clamp(goal.z+Math.sin(angle)*58,-R.WORLD/2+6,R.WORLD/2-6);
        const dx=tx-u.x,dz=tz-u.z,n=Math.hypot(dx,dz)||1,k=Math.min(1,18*dt/n);
        u.x+=dx*k;u.z+=dz*k;u.y+=(Math.max(86,goal.y+24)-u.y)*Math.min(1,dt);u.yaw=Math.atan2(-dx,-dz);
      }else if(u.type==='plane'){
        // Wide passes above the city. At a world boundary it turns back, never teleports.
        if(!u.node||Math.hypot(u.node.x-u.x,u.node.z-u.z)<12){
          const a=Math.atan2(goal.z-u.z,goal.x-u.x);u.node={x:clamp(goal.x+Math.cos(a)*180,-R.WORLD/2+10,R.WORLD/2-10),z:clamp(goal.z+Math.sin(a)*180,-R.WORLD/2+10,R.WORLD/2-10)};
        }
        const dx=u.node.x-u.x,dz=u.node.z-u.z,n=Math.hypot(dx,dz)||1,k=Math.min(1,46*dt/n);u.x+=dx*k;u.z+=dz*k;u.y=Math.max(110,goal.y+38);u.yaw=Math.atan2(-dx,-dz);
      }else if(u.type==='trooper'&&Math.hypot(goal.x-u.x,goal.z-u.z)<30)flank(u,goal,dt,R);
      else{
        // Vehicles intercept the next junction rather than chase the player's
        // old footprint; soldiers use streets until a clear flanking route opens.
        const search=!spotted&&s.age-(s.seenAt||0)>6;
        const intercept=search?{x:goal.x+Math.cos(u.phase+s.age*.12)*R.BLOCK,y:goal.y,z:goal.z+Math.sin(u.phase+s.age*.12)*R.BLOCK}:u.type!=='trooper'&&sees?{x:goal.x+p.vx*1.1,y:goal.y,z:goal.z+p.vz*1.1}:goal;
        drive(u,intercept,dt,R);u.tactic=u.type==='trooper'?'advance':'intercept';
        if(search)u.tactic='sector-search';
      }
      runOver(g,u,oldCar,oldPlayer,R);
      u.cooldown=Math.max(0,u.cooldown-dt);
      if(blind){u.windup=0;u.aim=null;u.cooldown=Math.max(1.5,u.cooldown);continue;}
      const origin=muzzle(u),c=config[u.type];
      const distance=Math.hypot(p.x-origin.x,p.y-origin.y,p.z-origin.z);
      if(u.windup>0){
        u.windup-=dt;
        if(u.windup<=0){if(!blocked(origin,u.aim,R)&&!friendlyLane(s,u,u.aim))fire(s,u);else{u.aim=null;u.cooldown=1;u.tactic='hold-friendly-lane';}}
      }else if(u.cooldown<=0&&distance<c.range&&sees&&aiming<3){
        const lead=Math.min(.85,distance/c.speed+.15);
        u.aim={x:p.x+p.vx*lead,y:p.y+p.vy*Math.min(.3,lead),z:p.z+p.vz*lead};u.windup=c.delay;aiming++;
      }
    }
    const alive=[];
    for(const b of s.shots){
      b.oldX=b.x;b.oldY=b.y;b.oldZ=b.z;
      const speed=Math.hypot(b.vx,b.vy,b.vz),distance=speed*dt,d={x:b.vx/speed,y:b.vy/speed,z:b.vz/speed};
      let wall=distance+1;
      for(const shape of R.rayCandidates(b,d,distance)){const t=R.rayBox(b,d,shape,distance);if(t!==null)wall=Math.min(wall,t);}
      if(d.y<0){const ground=(R.groundHeight(b.x,b.z)-b.y)/d.y;if(ground>=0)wall=Math.min(wall,ground);}
      const toPlayer={x:p.x-b.x,y:p.y-b.y,z:p.z-b.z},near=clamp(toPlayer.x*d.x+toPlayer.y*d.y+toPlayer.z*d.z,0,distance);
      const hit=near<=wall&&Math.hypot(toPlayer.x-d.x*near,toPlayer.y-d.y*near,toPlayer.z-d.z*near)<p.r+(b.rocket?.3:.16);
      // Keep impact/explosion on the near side of a wall; starting a blast
      // exactly on an AABB face would skip its zero-distance intersection.
      const travel=hit?near:wall<=distance?Math.max(0,wall-.06):distance;b.x+=d.x*travel;b.y+=d.y*travel;b.z+=d.z*travel;b.ttl-=dt;
      if(hit||wall<=distance||b.ttl<=0){
        if(b.rocket){
          if(s.fx.length<12)s.fx.push({x:b.x,y:b.y,z:b.z,ttl:.5});
          if(Math.hypot(p.x-b.x,p.y-b.y,p.z-b.z)<4.5&&!blocked(b,p,R))damage(g,R);
        }else if(hit)damage(g,R);
      }else alive.push(b);
    }
    s.shots=alive;s.previousPlayer={x:p.x,y:p.y,z:p.z};
  }
  function update(g,dt,R){
    if(!eligible(g)||g.state!=='playing'||!(dt>0))return;
    const campaign=declined(g)?'hunt':'convoy';
    if(g.assault&&g.assault.campaign&&g.assault.campaign!==campaign)g.assault=null;
    const s=g.assault||(g.assault={startedAt:g.elapsed,age:0,accumulator:0,units:[],shots:[],fx:[],waves:[],nextId:1,fired:0,lastKnown:{x:g.player.x,y:g.player.y,z:g.player.z}});
    s.campaign=campaign;
    s.accumulator+=Math.min(dt,.25);
    while(s.accumulator>=TICK&&g.state==='playing'){s.accumulator-=TICK;tick(g,s,TICK,R);}
  }
  function warning(g){
    if(!eligible(g)||!g.assault||g.state!=='playing')return null;
    const s=g.assault,rocket=s.units.some(u=>(u.type==='rpg'||u.type==='plane')&&u.windup>0),fire=s.units.some(u=>u.windup>0);
    const hit=!!(g.lastHit&&g.lastHit.cause==='runover'&&g.elapsed-g.lastHit.at<1.4);
    const car=s.units.some(u=>(u.type==='mg'||u.type==='rpg')&&u.speed>2&&Math.hypot(u.x-g.player.x,u.z-g.player.z)<13&&g.player.y+g.player.r>0&&g.player.y-g.player.r<2.4);
    return {count:s.units.length,rocket,fire,hit,car,text:hit?'НАЕЗД — МИНУС СЕРДЦЕ':car?'МАШИНА РЯДОМ — УХОДИ С ДОРОГИ!':rocket?'РАКЕТНЫЙ ЗАХВАТ — СМЕНИ НАПРАВЛЕНИЕ!':fire?'АРАХНА ЦЕЛИТСЯ — УХОДИ ЗА УКРЫТИЕ':'ПОДКРЕПЛЕНИЯ «АРАХНЫ» В ГОРОДЕ'};
  }
  function createRenderer(T,scene){
    const root=new T.Group();root.name='arachna-assault';scene.add(root);
    const cube=new T.BoxGeometry(1,1,1),sphere=new T.SphereGeometry(1,8,6),dark=new T.MeshStandardMaterial({color:0x263338,roughness:.67,metalness:.35});
    const glass=new T.MeshStandardMaterial({color:0x274551,metalness:.5,roughness:.2}),rubber=new T.MeshStandardMaterial({color:0x101315}),red=new T.MeshBasicMaterial({color:0xff4030});
    const armor=new T.MeshStandardMaterial({color:0x4b594c,roughness:.8}),steel=new T.MeshStandardMaterial({color:0x657277,metalness:.75,roughness:.4});
    const blue=new T.MeshBasicMaterial({color:0x388fff}),warm=new T.MeshBasicMaterial({color:0xffe0a8});
    const actorSphere=new T.SphereGeometry(1,16,12),wheelGeometry=new T.CylinderGeometry(.43,.43,.34,12);
    const pools=new Map(),rotors=[],models=[],partMeshes=[];
    // Keep a fixed shader light layout; zero intensity when idle prevents a
    // full-city shader recompile when the first helicopter enters the fight.
    const searchlights=Array.from({length:2},()=>{const lamp=new T.SpotLight(0xc5e0ff,0,170,.23,.65,1.5);lamp.castShadow=false;scene.add(lamp,lamp.target);return lamp;});
    function box(g,x,y,z,w,h,d,m=dark){const mesh=new T.Mesh(cube,m);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);g.add(mesh);return mesh;}
    function orb(g,x,y,z,w,h,d,m=dark){const mesh=new T.Mesh(actorSphere,m);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);g.add(mesh);return mesh;}
    function batch(g,m,parts){const mesh=new T.InstancedMesh(cube,m,parts.length),t=new T.Object3D();parts.forEach((p,i)=>{t.position.set(p[0],p[1],p[2]);t.scale.set(p[3],p[4],p[5]);t.updateMatrix();mesh.setMatrixAt(i,t.matrix);});mesh.computeBoundingSphere();g.add(mesh);partMeshes.push(mesh);return mesh;}
    function make(type){
      const g=new T.Group();g.userData.type=type;root.add(g);models.push(g);
      if(type==='heli'){
        orb(g,0,0,0,1.55,1.2,3.1);orb(g,0,.15,-1.7,1.3,.95,1.1,glass);box(g,0,.3,4,.5,.6,5);
        box(g,0,1,6,.2,2,1.5);for(const s of [-1,1])box(g,s*1.6,-1.5,0,.14,.15,5,rubber);
        const rotor=new T.Group();rotor.position.y=1.5;g.add(rotor);box(rotor,0,0,0,12,.09,.23,rubber);box(rotor,0,0,0,.23,.09,12,rubber);rotors.push({g,rotor});
        box(g,0,-1,-1,.35,.35,2.5,rubber);box(g,0,-1.3,-.7,.65,.4,.65,steel);
        box(g,-1.55,0,.5,.18,.18,.4,red);box(g,1.55,0,.5,.18,.18,.4,blue);
      }else if(type==='plane'){
        box(g,0,0,0,1.5,1.5,11);box(g,0,.8,-1,1.1,.7,3,glass);box(g,0,0,.4,12,.22,2.8);box(g,0,1.2,4,.2,2.5,2);box(g,0,.3,4.3,5,.2,1.2);
        for(const s of [-1,1]){box(g,s*3,-.4,.6,.4,.45,2.5,rubber);box(g,s*.75,-.2,5.4,.55,.55,.15,warm);box(g,s*5.8,.1,.5,.18,.1,.3,s<0?red:blue);}
      }else if(type==='trooper'){
        const body=new T.Group();g.add(body);g.userData.body=body;
        orb(body,0,.55,0,.33,.43,.21,dark);orb(body,0,1.16,0,.25,.24,.23,armor);
        box(body,0,1.12,-.22,.37,.12,.06,glass);
        batch(body,armor,[[0,.58,-.2,.48,.59,.12],[0,.55,.22,.5,.6,.17],[-.38,.76,0,.18,.22,.32],[.38,.76,0,.18,.22,.32],[-.15,.32,-.3,.22,.2,.14],[.15,.32,-.3,.22,.2,.14]]);
        batch(body,rubber,[[0,.16,0,.57,.1,.38],[0,1.0,-.12,.3,.18,.24],[-.4,.5,-.22,.17,.18,.55],[.4,.5,-.22,.17,.18,.55],[.25,.55,-.73,.13,.14,.85],[.25,.67,-.8,.1,.06,.12]]);
        batch(body,red,[[-.07,.7,-.274,.035,.16,.012],[.07,.7,-.274,.035,.16,.012],[0,.7,-.28,.14,.03,.015]]);
        g.userData.legs=[];
        for(const s of [-1,1]){const leg=new T.Group();leg.position.set(s*.18,.13,0);g.add(leg);box(leg,0,-.28,0,.22,.56,.27);box(leg,0,-.54,-.07,.26,.14,.4,rubber);box(leg,0,-.29,-.16,.18,.2,.1,armor);g.userData.legs.push(leg);}
      }else{
        batch(g,dark,[[0,.45,0,2.6,1.1,5],[0,1.3,-.8,2.2,.8,2.2],[0,-.15,0,2,.25,3.8],[0,.15,-2.65,2.9,.28,.22],[0,.15,2.65,2.9,.28,.22]]);
        box(g,0,1.4,-1.94,1.9,.4,.03,glass).rotation.x=-.2;
        batch(g,armor,[[-1.32,.65,0,.08,.7,2.8],[1.32,.65,0,.08,.7,2.8],[0,1.05,1.3,2.25,.13,1.8]]);
        g.userData.wheels=[];
        for(const s of [-1,1])for(const z of [-1.5,1.5]){const wheel=new T.Mesh(wheelGeometry,rubber);wheel.position.set(s*1.3,0,z);wheel.rotation.z=Math.PI/2;g.add(wheel);g.userData.wheels.push(wheel);box(g,s*1.49,0,z,.03,.2,.2,steel);}
        const turret=new T.Group();turret.position.set(0,2,.6);g.add(turret);g.userData.turret=turret;
        box(turret,0,0,0,1.2,.55,1,armor);
        if(type==='rpg')for(const side of [-1,1]){box(turret,side*.3,0,-1,.34,.34,2.5,rubber);box(turret,side*.3,0,-2.26,.24,.24,.025,steel);}
        else{box(turret,0,0,-1.1,.14,.14,2.5,rubber);box(turret,.34,-.12,-.2,.4,.3,.55,steel);}
        for(const s of [-1,1]){box(g,s*.9,.65,-2.52,.3,.2,.04,warm);box(g,s*.9,.65,2.52,.25,.18,.04,red);}
        g.userData.beacons=[box(g,-.55,1.87,-.6,.4,.14,.25,red),box(g,.55,1.87,-.6,.4,.14,.25,blue)];
      }
      return g;
    }
    const warningData=new Float32Array(MAX_UNITS*6),traceData=new Float32Array(MAX_SHOTS*6);
    function lines(data,color,opacity){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(data,3));geo.setDrawRange(0,0);const line=new T.LineSegments(geo,new T.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));line.frustumCulled=false;root.add(line);return line;}
    const warnings=lines(warningData,0xff3838,.45),traces=lines(traceData,0xffd38a,.95);
    const effects=new T.InstancedMesh(sphere,new T.MeshBasicMaterial({color:0xff982c,transparent:true,opacity:.65,depthWrite:false}),12);effects.count=0;effects.frustumCulled=false;root.add(effects);
    const missiles=new T.InstancedMesh(sphere,red,MAX_SHOTS);missiles.count=0;missiles.frustumCulled=false;root.add(missiles);
    const transform=new T.Object3D();
    function reset(){for(const list of pools.values())for(const g of list)g.visible=false;for(const lamp of searchlights)lamp.intensity=0;effects.count=missiles.count=0;warnings.geometry.setDrawRange(0,0);traces.geometry.setDrawRange(0,0);root.visible=false;}
    function warmup(renderer,camera){
      if(typeof renderer.compile!=='function')return;
      for(const type of Object.keys(config))if(!pools.has(type))pools.set(type,[make(type)]);
      root.visible=true;renderer.compile(scene,camera);reset();
    }
    function update(g){
      reset();if(!eligible(g)||!g.assault||g.state!=='playing')return;root.visible=true;
      const s=g.assault,used={};let n=0,heliCount=0;
      for(const u of s.units){
        const index=used[u.type]||0;used[u.type]=index+1;if(!pools.has(u.type))pools.set(u.type,[]);const list=pools.get(u.type);
        const model=list[index]||(list[index]=make(u.type));model.visible=true;model.position.set(u.x,u.y,u.z);model.rotation.y=u.yaw;
        if(u.type==='trooper'&&u.aim)model.rotation.y=Math.atan2(u.x-u.aim.x,u.z-u.aim.z);
        if(model.userData.legs)model.userData.legs.forEach((leg,i)=>{const phase=s.age*10+i*Math.PI;leg.rotation.x=u.speed>.3?Math.sin(phase)*.4:0;leg.position.y=.13+(u.speed>.3?Math.max(0,Math.sin(phase))*.05:0);});
        if(model.userData.turret){const aim=u.aim||s.lastKnown;model.userData.turret.rotation.y=Math.atan2(u.x-aim.x,u.z-aim.z)-u.yaw;}
        if(model.userData.wheels)for(const wheel of model.userData.wheels)wheel.rotation.x=s.age*(u.speed||0)*2.2;
        if(model.userData.beacons)model.userData.beacons.forEach((b,i)=>b.visible=(Math.floor(s.age*6)+i)%2===0);
        if(u.type==='heli'&&heliCount<2){const lamp=searchlights[heliCount++],aim=u.aim||s.lastKnown;lamp.intensity=450;lamp.position.set(u.x,u.y-1.5,u.z);lamp.target.position.set(aim.x,aim.y,aim.z);}
        if(u.aim&&u.windup>0){const o=muzzle(u);warningData.set([o.x,o.y,o.z,u.aim.x,u.aim.y,u.aim.z],n*6);n++;}
      }
      for(const a of rotors)a.rotor.rotation.y=s.age*38;
      warnings.geometry.attributes.position.array.set(warningData);warnings.geometry.attributes.position.needsUpdate=true;warnings.geometry.setDrawRange(0,n*2);
      s.shots.forEach((b,i)=>traceData.set([b.oldX,b.oldY,b.oldZ,b.x,b.y,b.z],i*6));
      traces.geometry.attributes.position.array.set(traceData);traces.geometry.attributes.position.needsUpdate=true;traces.geometry.setDrawRange(0,s.shots.length*2);
      let rocketCount=0;for(const b of s.shots)if(b.rocket){transform.position.set(b.x,b.y,b.z);transform.scale.setScalar(.26);transform.updateMatrix();missiles.setMatrixAt(rocketCount++,transform.matrix);}missiles.count=rocketCount;missiles.instanceMatrix.needsUpdate=true;
      s.fx.forEach((f,i)=>{transform.position.set(f.x,f.y,f.z);transform.scale.setScalar((.5-f.ttl)*7+.25);transform.updateMatrix();effects.setMatrixAt(i,transform.matrix);});effects.count=s.fx.length;effects.instanceMatrix.needsUpdate=true;
    }
    function dispose(){root.removeFromParent();for(const lamp of searchlights){scene.remove(lamp,lamp.target);lamp.dispose();}for(const mesh of partMeshes)mesh.dispose();effects.dispose();missiles.dispose();cube.dispose();sphere.dispose();actorSphere.dispose();wheelGeometry.dispose();for(const m of [dark,glass,rubber,red,armor,steel,blue,warm,effects.material,warnings.material,traces.material])m.dispose();warnings.geometry.dispose();traces.geometry.dispose();}
    return {root,update,reset,dispose,warmup};
  }
  const api={update,warning,eligible,blocked,damage,runOver,friendlyLane,createRenderer,MAX_UNITS,MAX_SHOTS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SpiderAssault=api;
})(typeof window!=='undefined'?window:globalThis);
