/* Deterministic 3D rules shared by the browser and Node tests. Y points up. */
(function(root) {
  'use strict';
  // Double the previous area; even grid preserves the central spawn street.
  const GRID=48, WORLD=644*Math.sqrt(6), BLOCK=(WORLD-4)/GRID, DURATION=600, RANGE=115, RADIUS=.55;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const buildings=[];
  for(let z=0;z<GRID;z++) for(let x=0;x<GRID;x++) {
    const i=z*GRID+x, type=(x+z*3)%8, bx=-WORLD/2+7+x*BLOCK+(i%3), bz=-WORLD/2+7+z*BLOCK;
    // Central downtown hub has towering skyscrapers up to ~75m.
    const ring=Math.max(Math.abs(x-(GRID-1)/2),Math.abs(z-(GRID-1)/2));
    const downtown=Math.max(0,Math.round((4.2-ring)*9));
    const height=10+(i*13%35)+downtown;
    buildings.push({x:bx,z:bz,w:16+(i*7%8),d:16+(i*3%8),h:height,type,id:i});
  }
  // Rooftop structures are real colliders. models.js draws exactly these boxes (y0..h, absolute heights).
  const solids=[...buildings];
  function part(b,cx,cz,w,d,y0,h,kind){const s={x:cx-w/2,z:cz-d/2,w,d,y0,h,type:b.type,id:solids.length,part:true,parent:b.id};if(kind)s.kind=kind;solids.push(s);}
  function roofParts(b){
    const cx=b.x+b.w/2,cz=b.z+b.d/2,h=b.h,out=[];
    if(b.type===3)out.push([cx,cz,b.w*.65,b.d*.65,h,h+4.4]);
    if(b.type===4)for(let i=0;i<3;i++){const k=.8-i*.25;out.push([cx,cz,b.w*k,b.d*k,h+i*1.6,h+(i+1)*1.6]);}
    if(b.type===5){out.push([cx,cz,5,5,h,h+4]);out.push([cx,cz,.3,.3,h+4,h+12.2]);}
    if(b.type===7){out.push([cx,cz,4,4,h,h+.6]);out.push([cx,cz,2.6,2.6,h+.6,h+2.2]);}
    out.push([cx+2,cz,2.5,2,h,h+1]); // rooftop equipment unit
    // «Ночь Охоты»: electrical panel boxes; a web strand that hits one shorts the block (blackout).
    if(b.id%4===1&&b.type!==4&&b.type!==3)out.push([cx-3.4,cz+2.2,1.2,.8,h,h+1.8,'panel']);
    return out;
  }
  for(const b of buildings){b.y0=0;for(const p of roofParts(b))part(b,...p);}
  // Index actual AABBs of buildings and rooftop parts, including cell edges.
  // Small cells keep individual stair flights local instead of returning an
  // entire furnished high-rise for each of the 120 physics ticks per second.
  const cells=new Map(),CELL=4;
  function rebuildIndex(){cells.clear();for(const b of solids){
    if(b.disabled)continue;
    for(let z=Math.floor(b.z/CELL);z<=Math.floor((b.z+b.d)/CELL);z++)
      for(let x=Math.floor(b.x/CELL);x<=Math.floor((b.x+b.w)/CELL);x++){
        const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(b);
      }
  }}
  rebuildIndex();
  const publicBuildings=buildings.filter(b=>b.type===4||b.type===5);
  let interiorsReady=false;
  function groundHeight(x,z){
    if(!interiorsReady)return 0;
    const ix=Math.floor((x+WORLD/2-7)/BLOCK),iz=Math.floor((z+WORLD/2-7)/BLOCK);
    // Footprints are offset by up to two metres from the regular grid.
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const col=ix+dx,row=iz+dz;if(col<0||row<0||col>=GRID||row>=GRID)continue;
      const b=buildings[row*GRID+col];
      if(b.type===5&&x>b.x&&x<b.x+b.w&&z>b.z&&z<b.z+b.d)return -3.2;
    }
    return 0;
  }
  function installLocations(colliders){
    if(interiorsReady)return;
    interiorsReady=true;
    const replaced=new Set(colliders.map(c=>c.parent));
    for(let i=0;i<solids.length;i++){
      const s=solids[i],b=buildings[s.part?s.parent:s.id];
      if(b&&replaced.has(b.id)&&s.kind!=='panel')solids[i]={...s,y0:b.h,h:b.h,disabled:true};
    }
    for(const c of colliders){
      const b=buildings[c.parent],id=solids.length;
      // Parent is optional in the world-AABB contract. Give independent shapes
      // distinct anchor identities when it is absent (not a shared sentinel).
      solids.push({x:c.min.x,z:c.min.z,w:c.max.x-c.min.x,d:c.max.z-c.min.z,y0:c.min.y,h:c.max.y,id,part:true,parent:b?b.id:id,interior:true,noClimb:!!c.noClimb,kind:c.kind});
    }
    rebuildIndex();
  }
  function query(minX,minZ,maxX,maxZ,minY=-Infinity,maxY=Infinity){
    const found=new Set();
    for(let z=Math.floor(minZ/CELL);z<=Math.floor(maxZ/CELL);z++)
      for(let x=Math.floor(minX/CELL);x<=Math.floor(maxX/CELL);x++){
        const cell=cells.get(x+','+z);if(cell)for(const b of cell)if(b.h>=minY&&b.y0<=maxY)found.add(b);
      }
    // Stable order preserves collision resolution and ray tie-breaking.
    return [...found].sort((a,b)=>a.id-b.id);
  }
  function nearby(p,pad=p.r+.3){return query(p.x-pad,p.z-pad,p.x+pad,p.z+pad,p.y-p.r-STEP_HEIGHT,p.y+p.r+STEP_HEIGHT);}
  function rayCandidates(o,d,max,pad=0){
    // Query a corridor, not the giant rectangle of a diagonal web shot.
    const count=Math.max(1,Math.ceil(Math.max(Math.abs(d.x),Math.abs(d.z))*max/CELL)),found=new Set();
    for(let i=0;i<count;i++){
      const a=max*i/count,b=max*(i+1)/count;
      const x=o.x+d.x*a,z=o.z+d.z*a,tx=o.x+d.x*b,tz=o.z+d.z*b;
      const low=Math.min(o.y+d.y*a,o.y+d.y*b)-pad,high=Math.max(o.y+d.y*a,o.y+d.y*b)+pad;
      for(const s of query(Math.min(x,tx)-pad,Math.min(z,tz)-pad,Math.max(x,tx)+pad,Math.max(z,tz)+pad,low,high))
        if(s.h>=low&&s.y0<=high)found.add(s);
    }
    return [...found].sort((a,b)=>a.id-b.id);
  }
  function body(x,y,z,r=RADIUS){return {x,y,z,r,vx:0,vy:0,vz:0,grounded:false,climbing:false,fly:false};}
  function createGame(mode='story'){return {mode:mode==='free'?'free':'story',player:body(0,1,0),hunter:body(0,1,27,.65),elapsed:0,hp:3,invulnerable:0,attack:0,state:'playing',web:null};}
  function wall(p){
    for(const b of nearby(p)){
      if(b.disabled||b.noClimb||(b.interior&&b.h<=p.y-p.r+STEP_HEIGHT+CONTACT)||p.y-p.r>=b.h+.12||p.y+p.r<=b.y0)continue;
      if(p.z>b.z-p.r && p.z<b.z+b.d+p.r){
        if(Math.abs(p.x-(b.x-p.r))<.25)return {b,nx:-1,nz:0};
        if(Math.abs(p.x-(b.x+b.w+p.r))<.25)return {b,nx:1,nz:0};
      }
      if(p.x>b.x-p.r && p.x<b.x+b.w+p.r){
        if(Math.abs(p.z-(b.z-p.r))<.25)return {b,nx:0,nz:-1};
        if(Math.abs(p.z-(b.z+b.d+p.r))<.25)return {b,nx:0,nz:1};
      }
    }return null;
  }
  const STEP_HEIGHT=.3,CONTACT=1e-6;
  function footprint(p,b,x=p.x,z=p.z){
    return x+p.r>b.x+CONTACT&&x-p.r<b.x+b.w-CONTACT&&z+p.r>b.z+CONTACT&&z-p.r<b.z+b.d-CONTACT;
  }
  function clearBody(p,x,y,z){
    return !query(x-p.r,z-p.r,x+p.r,z+p.r,y-p.r,y+p.r).some(b=>!b.disabled&&footprint(p,b,x,z)&&y+p.r>b.y0+CONTACT&&y-p.r<b.h-CONTACT);
  }
  // Sweep rather than test only the endpoint: thin doors/ceilings remain solid at sling speed.
  function verticalMove(p,amount){
    let y=p.y+amount,landed=false;
    for(const b of nearby(p)){
      if(b.disabled||!footprint(p,b))continue;
      if(amount>0&&p.y+p.r<=b.y0+CONTACT&&y+p.r>=b.y0)y=Math.min(y,b.y0-p.r);
      if(amount<=0&&p.y-p.r>=b.h-CONTACT&&y-p.r<=b.h){y=Math.max(y,b.h+p.r);landed=true;}
    }
    const ground=groundHeight(p.x,p.z)+p.r;
    // The implicit street is one-sided; never lift an underground body through a ceiling.
    if(amount<=0&&p.y>=ground-CONTACT&&y<=ground){y=Math.max(y,ground);landed=true;}
    const stopped=Math.abs(y-(p.y+amount))>CONTACT;
    p.y=y;if(stopped||landed)p.vy=0;
    p.grounded=landed;
    return stopped;
  }
  function move(p,dt){
    if(!(dt>0))return;
    // A bounded travel distance also keeps diagonal corner and staircase contacts local.
    const count=Math.max(1,Math.ceil(Math.max(Math.abs(p.vx),Math.abs(p.vy),Math.abs(p.vz))*dt/Math.min(.1,p.r*.25)));
    const slice=dt/count;
    for(let i=0;i<count;i++){
      const walking=p.grounded&&!p.climbing&&p.vy<=0,feet=p.y-p.r;
      for(const axis of ['x','z']){
        const delta=p['v'+axis]*slice;if(!delta)continue;
        const start=p[axis],target=clamp(start+delta,-WORLD/2+p.r,WORLD/2-p.r);
        const x=axis==='x'?target:p.x,z=axis==='z'?target:p.z;
        const candidates=query(Math.min(p.x,x)-p.r,Math.min(p.z,z)-p.r,Math.max(p.x,x)+p.r,Math.max(p.z,z)+p.r,p.y-p.r-STEP_HEIGHT,p.y+p.r+STEP_HEIGHT);
        const hits=candidates.filter(b=>!b.disabled&&footprint(p,b,x,z)&&p.y+p.r>b.y0+CONTACT&&p.y-p.r<b.h-CONTACT);
        let stepped=false;
        if(hits.length&&walking){
          const top=Math.max(...hits.map(b=>b.h)),rise=top-(p.y-p.r);
          // Every blocking shape must be a low riser. A tall door or wall cannot be stepped through.
          if(rise>CONTACT&&top-feet<=STEP_HEIGHT+CONTACT&&clearBody(p,p.x,top+p.r,p.z)&&clearBody(p,x,top+p.r,z)){
            // Check the entire vertical lift at the old footprint, not only the raised head.
            const head=p.y+p.r,raisedHead=top+2*p.r;
            const ceiling=candidates.some(b=>!b.disabled&&footprint(p,b)&&b.y0>=head-CONTACT&&b.y0<raisedHead-CONTACT&&b.h>head+CONTACT);
            if(!ceiling){p.y=top+p.r;p.vy=0;stepped=true;}
          }
        }
        let end=target;
        if(hits.length&&!stepped){
          for(const b of hits){
            const edge=delta>0?b[axis]-p.r:b[axis]+(axis==='x'?b.w:b.d)+p.r;
            // Do not eject an already overlapping body to the opposite face.
            end=delta>0?Math.min(end,Math.max(start,edge)):Math.max(end,Math.min(start,edge));
          }
        }
        p[axis]=end;if(Math.abs(end-(start+delta))>CONTACT)p['v'+axis]=0;
      }
      const down=p.vy*slice;
      verticalMove(p,down);
      // Follow only a nearby lower tread, never snap a falling/jumping body onto a distant roof.
      if(walking&&!p.grounded&&p.vy<=0){
        let support=-Infinity;
        for(const b of nearby(p))if(!b.disabled&&footprint(p,b)&&b.h<=p.y-p.r+CONTACT&&b.h>=feet-STEP_HEIGHT-CONTACT)support=Math.max(support,b.h);
        const ground=groundHeight(p.x,p.z);
        if(ground<=p.y-p.r+CONTACT&&ground>=feet-STEP_HEIGHT-CONTACT)support=Math.max(support,ground);
        if(Number.isFinite(support)&&clearBody(p,p.x,support+p.r,p.z))verticalMove(p,support+p.r-p.y);
      }
      if(p.y>180){p.y=180;p.vy=Math.min(0,p.vy);}
    }
  }
  function rayBox(o,d,b,max=RANGE){
    if(b.disabled)return null;
    let near=0,far=max;
    for(const [axis,lo,hi] of [['x',b.x,b.x+b.w],['y',b.y0||0,b.h],['z',b.z,b.z+b.d]]){
      if(Math.abs(d[axis])<1e-8){if(o[axis]<lo||o[axis]>hi)return null;}
      else{const a=(lo-o[axis])/d[axis],c=(hi-o[axis])/d[axis];near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));}
      if(near>far)return null;
    }return near>.02 ? near:null;
  }
  function aim(g,d){
    const len=Math.hypot(d.x,d.y,d.z);if(!len)return null;
    d={x:d.x/len,y:d.y/len,z:d.z/len};
    let best=RANGE,hit=null;
    for(const b of rayCandidates(g.player,d,RANGE)){const t=rayBox(g.player,d,b);if(t!==null&&t<=best){best=t;hit={x:g.player.x+d.x*t,y:g.player.y+d.y*t,z:g.player.z+d.z*t,b};}}
    if(!hit)return null;
    const b=hit.b,e=1e-4;let sx=0,sy=0,sz=0;
    if(Math.abs(hit.y-b.h)<e)sy=1;else if(Math.abs(hit.x-b.x)<e)sx=-1;else if(Math.abs(hit.x-b.x-b.w)<e)sx=1;else if(Math.abs(hit.z-b.z)<e)sz=-1;else sz=1;
    const out={x:hit.x,y:hit.y,z:hit.z,sx,sy,sz,building:b.part?b.parent:b.id};
    if(b.kind==='panel')out.panel=b.id;
    return out;
  }
  // Compatibility alias: shots are exact; a miss must never snap to another surface.
  function assistAim(g,d){return aim(g,d);}
  function hunterAim(g,d){
    if(g.mode==='free')return null;
    const n=Math.hypot(d.x,d.y,d.z);if(!n)return null;
    const f={x:d.x/n,y:d.y/n,z:d.z/n},h=g.hunter;
    const t=rayBox(g.player,f,{x:h.x-.65,z:h.z-.65,w:1.3,d:1.3,y0:h.y-h.r,h:h.y-h.r+3.2});
    if(t===null)return null;
    const wallHit=aim(g,f);
    if(wallHit&&Math.hypot(wallHit.x-g.player.x,wallHit.y-g.player.y,wallHit.z-g.player.z)<=t)return null;
    return {x:g.player.x+f.x*t,y:g.player.y+f.y*t,z:g.player.z+f.z*t,sx:-f.x,sy:-f.y,sz:-f.z};
  }
  function webBlocked(p,w){
    const dx=w.x-p.x,dy=w.y-p.y,dz=w.z-p.z,dist=Math.hypot(dx,dy,dz);
    if(dist<1e-8)return false;
    const d={x:dx/dist,y:dy/dist,z:dz/dist};
    // Intersect the open interior: touching a facade/roof is valid, penetrating it is not.
    for(const b of rayCandidates(p,d,dist)){
      if(b.disabled)continue;
      let near=0,far=dist;
      for(const [axis,lo,hi] of [['x',b.x,b.x+b.w],['y',b.y0||0,b.h],['z',b.z,b.z+b.d]]){
        const min=lo+1e-6,max=hi-1e-6;
        if(Math.abs(d[axis])<1e-10){if(p[axis]<=min||p[axis]>=max){far=-1;break;}}
        else{const a=(min-p[axis])/d[axis],c=(max-p[axis])/d[axis];near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));}
      }
      if(far>near+1e-7)return true;
    }
    return false;
  }
  function cutWeb(g,reason){
    const p=g.player;g.webBreak={reason,at:g.elapsed,x:g.web.x,y:g.web.y,z:g.web.z,px:p.x,py:p.y,pz:p.z};g.web=null;
  }
  // Letting go mid-swing adds a small upward pop and keeps the forward momentum (chainable swings).
  function releaseWeb(g){
    if(!g.web)return false;
    const p=g.player,sp=Math.hypot(p.vx,p.vy,p.vz);
    if(sp>6){p.vy=Math.max(p.vy,0)+5.5;p.vx*=1.06;p.vz*=1.06;}
    const n=Math.hypot(p.vx,p.vy,p.vz);if(n>MAX_SPEED){const k=MAX_SPEED/n;p.vx*=k;p.vy*=k;p.vz*=k;}
    cutWeb(g,'release');return true;
  }
  // Shorting a rooftop panel blinds the hunter for 15 s around that block (once per panel).
  const BLACKOUT=15;
  function cutPanel(g,id){
    g.cut=g.cut||{};if(g.cut[id])return false;g.cut[id]=true;
    const s=solids[id];g.blackout={x:s.x+s.w/2,y:s.h,z:s.z+s.d/2,until:g.elapsed+BLACKOUT,id};
    (g.events=g.events||[]).push({type:'blackout',at:g.elapsed});
    return true;
  }
  function shootWeb(g,d){
    if(g.state!=='playing')return false;
    const caught=hunterAim(g,d),hit=aim(g,d),p=g.player;
    cancelSling(g);
    // Exact aimed hit on the optional transport; facades and Sixth occlude it.
    const n=Math.hypot(d.x,d.y,d.z);
    for(const c of [g.convoy,g.courier]){
    if(c&&['moving','stopped'].includes(c.status)&&n>0){
      const f={x:d.x/n,y:d.y/n,z:d.z/n};
      const t=rayBox(p,f,{x:c.x-3.55,z:c.z-1.55,w:7.1,d:3.1,y0:0,h:3.1},RANGE);
      const distance=q=>q?Math.hypot(q.x-p.x,q.y-p.y,q.z-p.z):Infinity;
      if(t!==null&&t<=RANGE&&t<distance(hit)&&t<distance(caught)){
        if(g.web)cutWeb(g,'release');
        if(g.elapsed>=(c.nextWeb||0)){c.hits=Math.min(3,c.hits+1);c.nextWeb=g.elapsed+.3;if(c.hits>=3)c.stoppedUntil=g.elapsed+14;}
        g.webHit={x:p.x+f.x*t,y:p.y+f.y*t,z:p.z+f.z*t,sx:-f.x,sy:-f.y,sz:-f.z,at:g.elapsed,shot:(g.shots=(g.shots||0)+1)};
        return true;
      }
    }
    }
    if(caught){
      if(g.web)cutWeb(g,'release');
      const h=g.hunter;h.webUntil=g.elapsed+5;h.lunge=0;h.windup=0;h.windupStarted=false;
      h.vx*=.3;h.vz*=.3;
      g.webHit={...caught,at:g.elapsed,shot:(g.shots=(g.shots||0)+1)};
      return true;
    }
    if(!hit){g.web=null;return false;}
    if(hit.panel!==undefined)cutPanel(g,hit.panel);
    const dx=hit.x-p.x,dy=hit.y-p.y,dz=hit.z-p.z,dist=Math.hypot(dx,dy,dz);
    const nx=dx/dist,ny=dy/dist,nz=dz/dist;
    let tx=-nx*ny,ty=1-ny*ny,tz=-nz*ny;
    let tangent=Math.hypot(tx,ty,tz);
    if(tangent<.1){tx=1;ty=0;tz=0;tangent=1;}
    tx/=tangent;ty/=tangent;tz/=tangent;
    g.web={...hit,len:Math.max(3,dist*.74),minLen:3,maxLen:dist+Math.max(8,dist*.25),tx,ty,tz,shot:(g.shots=(g.shots||0)+1)};
    p.slingFlight=false;
    p.vx+=nx*20+tx*12;p.vy+=ny*20+ty*12;p.vz+=nz*20+tz*12;p.fly=true;
    const lift=groundHeight(p.x,p.z)+p.r+2-p.y;
    if(lift>0)verticalMove(p,lift);
    p.vy=Math.max(p.vy,8.5);p.grounded=false;p.climbing=false;
    return true;
  }
  // Each click selects one exact surface. A third click (or Space) fires the ready sling.
  const SLING_CHARGE=.45,SLING_MIN=38,SLING_MAX=64,SLING_COOLDOWN=.8;
  function startSling(g,d){
    const p=g.player;
    if(g.state!=='playing'||(g.slingCd||0)>0)return false;
    if(g.sling&&g.sling.b)return releaseSling(g,d);
    const hit=aim(g,d);if(!hit)return false;
    const shot=(g.shots||0)+1;
    if(!g.sling){
      if(g.web)cutWeb(g,'release');
      g.shots=shot;g.sling={a:hit,b:null,charge:0,shot};return true;
    }
    const a=g.sling.a;
    if(webBlocked(p,a)){cancelSling(g);return false;}
    if(a.building===hit.building||Math.hypot(a.x-hit.x,a.y-hit.y,a.z-hit.z)<2.5)return false;
    const mx=(a.x+hit.x)/2-p.x,my=(a.y+hit.y)/2-p.y,mz=(a.z+hit.z)/2-p.z,n=Math.hypot(mx,my,mz)||1;
    Object.assign(g.sling,{b:hit,dx:mx/n,dy:my/n,dz:mz/n,ox:p.x,oy:p.y,oz:p.z});
    p.climbing=false;p.grounded=false;p.fly=true;return true;
  }
  // Horizontal sector follows the midpoint of the two anchors, not the last mouse position.
  // At the exact midpoint there is no horizontal bearing; keep the original pull direction.
  function slingYaw(g,yaw){
    const s=g.sling;if(!s||!s.b)return yaw;
    let x=(s.a.x+s.b.x)/2-g.player.x,z=(s.a.z+s.b.z)/2-g.player.z;
    if(Math.hypot(x,z)<1e-6){x=s.dx;z=s.dz;}
    if(Math.hypot(x,z)<1e-6)return yaw;
    const center=Math.atan2(-x,-z),delta=Math.atan2(Math.sin(yaw-center),Math.cos(yaw-center));
    return yaw+clamp(delta,-Math.PI/4,Math.PI/4)-delta;
  }
  function releaseSling(g,d){
    const s=g.sling;if(!s||!s.b)return false;
    const n=d&&Math.hypot(d.x,d.y,d.z);
    if(n){
      const horizontal=Math.hypot(d.x,d.z)/n,yaw=slingYaw(g,Math.atan2(-d.x,-d.z));
      s.dx=-Math.sin(yaw)*horizontal;s.dy=d.y/n;s.dz=-Math.cos(yaw)*horizontal;
    }
    const p=g.player,k=Math.min(1,s.charge/SLING_CHARGE),speed=SLING_MIN+(SLING_MAX-SLING_MIN)*k;
    p.vx=s.dx*speed;p.vy=s.dy*speed+4;p.vz=s.dz*speed;p.fly=true;p.grounded=false;
    p.slingFlight=true;
    const total=Math.hypot(p.vx,p.vy,p.vz);if(total>SLING_MAX){const c=SLING_MAX/total;p.vx*=c;p.vy*=c;p.vz*=c;}
    g.slingBreak={at:g.elapsed,a:s.a,b:s.b};g.sling=null;g.slingCd=SLING_COOLDOWN;
    return true;
  }
  function cancelSling(g){if(!g.sling)return false;g.slingBreak={at:g.elapsed,a:g.sling.a,b:g.sling.b};g.sling=null;return true;}
  function slingPull(g,dt){
    const s=g.sling,p=g.player;if(!s)return;
    if(webBlocked(p,s.a)||(s.b&&webBlocked(p,s.b))||Math.hypot(s.a.x-p.x,s.a.y-p.y,s.a.z-p.z)>RANGE){cancelSling(g);return;}
    if(!s.b)return;
    s.charge=Math.min(SLING_CHARGE,s.charge+dt);
    const back=3.5*s.charge/SLING_CHARGE,tx=s.ox-s.dx*back,ty=Math.max(groundHeight(p.x,p.z)+p.r+.05,s.oy-s.dy*back),tz=s.oz-s.dz*back;
    p.vx=(tx-p.x)*8;p.vy=(ty-p.y)*8;p.vz=(tz-p.z)*8;
    p.fly=true;p.climbing=false;
  }
  function climb(p,touch,up,down,dt,speed=7.5){
    p.climbing=!!touch;
    if(!touch)return;
    p.vy=up?speed:down?-6:0;
    if(up&&p.y>=touch.b.h+p.r-.18){
      const y=touch.b.h+p.r+.03,x=p.x-touch.nx*.85,z=p.z-touch.nz*.85;
      // Mount a nearby ledge only with headroom along both parts of the move.
      if(clearBody(p,p.x,y,p.z)&&clearBody(p,x,y,z)){
        const before=p.y;verticalMove(p,y-p.y);
        if(Math.abs(p.y-y)<CONTACT){
          // Sweep the horizontal mount in short segments; a neighbouring wall can block it.
          let clear=true;
          for(let i=1;i<=9;i++)if(!clearBody(p,p.x+(x-p.x)*i/9,y,p.z+(z-p.z)*i/9)){clear=false;break;}
          if(clear){p.x=x;p.z=z;p.climbing=false;}else p.y=before;
        }
      }
    }
  }
  function rope(g,dt){
    const p=g.player,w=g.web;if(!w)return;
    const dx=w.x-p.x,dy=w.y-p.y,dz=w.z-p.z,d=Math.hypot(dx,dy,dz)||1e-6;
    if(d>=(w.maxLen||Infinity)){cutWeb(g,'stretch');return;}
    w.len=Math.max(w.minLen||3,w.len-22*dt);
    const nx=dx/d,ny=dy/d,nz=dz/d;
    const radial=p.vx*nx+p.vy*ny+p.vz*nz;
    let tx=p.vx-radial*nx,ty=p.vy-radial*ny,tz=p.vz-radial*nz;
    let speed=Math.hypot(tx,ty,tz);
    if(speed<.001){tx=w.tx||1;ty=w.ty||0;tz=w.tz||0;const dot=tx*nx+ty*ny+tz*nz;tx-=dot*nx;ty-=dot*ny;tz-=dot*nz;speed=Math.hypot(tx,ty,tz)||1;}
    const boost=Math.max(0,1-speed/28)*20*dt;
    p.vx+=tx/speed*boost;p.vy+=ty/speed*boost;p.vz+=tz/speed*boost;
    if(d<=w.len)return;
    const vr=p.vx*nx+p.vy*ny+p.vz*nz,want=Math.min(32,(d-w.len)*13);
    // Limit tension acceleration: keep the launch assist without an instantaneous velocity snap.
    if(vr<want){const add=Math.min(want-vr,120*dt);p.vx+=nx*add;p.vy+=ny*add;p.vz+=nz*add;}
  }
  const MAX_SPEED=42;
  function step(g,input={},dt=1/120){
    if(g.state!=='playing')return;
    dt=clamp(dt,0,1/30);
    if(dt>1/120+1e-9){const n=Math.ceil(dt*120);for(let i=0;i<n;i++)step(g,{...input,jump:input.jump&&i===0},dt/n);return;}
    if(dt===0)return;
    g.elapsed=g.mode==='free'?g.elapsed+dt:Math.min(DURATION,g.elapsed+dt);
    g.invulnerable=Math.max(0,g.invulnerable-dt);g.attack=Math.max(0,g.attack-dt);
    const p=g.player,h=g.hunter,yaw=input.yaw||0;
    let f=(input.forward?1:0)-(input.back?1:0),s=(input.right?1:0)-(input.left?1:0);
    const norm=Math.max(1,Math.hypot(f,s));f/=norm;s/=norm;
    const wx=-Math.sin(yaw)*f+Math.cos(yaw)*s,wz=-Math.cos(yaw)*f-Math.sin(yaw)*s;
    const nearby=wall(p);
    const touch=nearby && (wx*nearby.nx+wz*nearby.nz<-.1 || (p.climbing&&input.back)) ? nearby : null;
    if(!g.web&&(p.grounded||touch))p.fly=false;
    if(g.web)p.fly=true;
    if(p.fly){
      // Stronger air control while swinging so WASD reliably bends the arc.
      const control=g.web?28:18;
      p.vx+=wx*control*dt;p.vz+=wz*control*dt;const drag=1-.22*dt;p.vx*=drag;p.vz*=drag;
    }else{
      const dx=wx*11-p.vx,dz=wz*11-p.vz,d=Math.hypot(dx,dz);
      const amount=Math.min(1,((f||s)?90:110)*dt/(d||1));
      p.vx+=dx*amount;p.vz+=dz*amount;
    }
    p.vy-=24*dt;
    g.slingCd=Math.max(0,(g.slingCd||0)-dt);
    if(!g.web&&!g.sling)climb(p,touch,!!input.forward,!!input.back,dt);else p.climbing=false;
    p.coyote=p.grounded?.1:Math.max(0,(p.coyote||0)-dt);
    p.jumpBuffer=input.jump?.12:Math.max(0,(p.jumpBuffer||0)-dt);
    // Space while hanging: let go with the same pop as releasing the right mouse button.
    if(input.jump&&g.web){releaseWeb(g);p.jumpBuffer=0;}
    if(input.jump&&g.sling){releaseSling(g);p.jumpBuffer=0;}
    if(p.jumpBuffer>0&&!g.web&&!g.sling&&(p.coyote>0||nearby)){
      p.jumpBuffer=0;p.coyote=0;p.grounded=false;p.fly=true;
      p.vy=10.5;
      if(nearby){
        p.vx=nearby.nx*13;p.vz=nearby.nz*13;
        // Apply the separation only if the whole short path has room; another
        // wall may be directly behind the player in a narrow doorway.
        const x=p.x,z=p.z;
        let clear=true;
        for(let i=1;i<=3;i++)if(!clearBody(p,x+nearby.nx*.1*i,p.y,z+nearby.nz*.1*i)){clear=false;break;}
        if(clear){p.x=x+nearby.nx*.3;p.z=z+nearby.nz*.3;}
        p.fly=true;
      }
    }
    // Sever before applying any rope force, not after it has already braked the player.
    if(g.web&&webBlocked(p,g.web))cutWeb(g,'wall');
    rope(g,dt);
    slingPull(g,dt);
    if(p.grounded||p.climbing)p.slingFlight=false;
    const limit=p.slingFlight?SLING_MAX:MAX_SPEED;
    const sp=Math.hypot(p.vx,p.vy,p.vz);if(sp>limit){const k=limit/sp;p.vx*=k;p.vy*=k;p.vz*=k;}
    move(p,dt);
    if(g.sling&&g.sling.b)p.grounded=false;
    if(g.web){
      const floor=groundHeight(p.x,p.z)+p.r+2;
      if(p.y<floor){verticalMove(p,floor-p.y);p.vy=Math.max(0,p.vy);}
      else if(p.y<floor+2)p.vy=Math.max(p.vy,(floor+2-p.y)*4.5);
      p.grounded=false;
      if(webBlocked(p,g.web))cutWeb(g,'wall');
      else if(Math.hypot(p.x-g.web.x,p.y-g.web.y,p.z-g.web.z)>=(g.web.maxLen||Infinity))cutWeb(g,'stretch');
    }
    if(!p.grounded&&!p.climbing)p.fly=true;
    // Free play shares all movement/web rules but has no pursuit or ending.
    if(g.mode==='free')return;
    hunterStep(g,dt);
    const reach=Math.hypot(p.x-h.x,p.z-h.z);
    if(hostile(g)&&reach<(h.lunge>0?2.5:2.1) && Math.abs(p.y-h.y)<2.3 && g.attack<=0){
      g.attack=1.6;
      if(!g.invulnerable){g.hp--;g.invulnerable=2.5;p.vy=6;p.fly=true;if(g.web)cutWeb(g,'hit');cancelSling(g);}
    }
    if(g.hp<=0){g.state='lost';g.web=null;g.sling=null;}else if(g.elapsed>=DURATION){g.state='won';g.web=null;g.sling=null;}
  }
  // Hunter modes (set by story.js): 'chase' (default), 'withdrawal' (dose ran out, harmless),
  // 'ally' (helped Object No. 6, follows at a distance). An active blackout makes a chasing hunter lose the trail.
  function blind(g){return !!(g.blackout&&g.elapsed<g.blackout.until);}
  function hostile(g){const m=g.hunter.mode||'chase';return m==='chase';}
  // Small collision-aware steering fan. Bounded ray count, reused at 4 Hz by
  // Sixth and 10 Hz by infantry; no city-wide path search in the physics loop.
  function navigate(actor,goal,side=1){
    const dx=goal.x-actor.x,dz=goal.z-actor.z,n=Math.hypot(dx,dz)||1,angle=Math.atan2(dz,dx),range=Math.min(6,n);
    let best=-Infinity,out={x:dx/n,z:dz/n};
    const origin={x:actor.x,y:actor.y+.2,z:actor.z};
    const shapes=query(actor.x-range-2,actor.z-range-2,actor.x+range+2,actor.z+range+2,origin.y,origin.y);
    for(const turn of [0,side*.5,-side*.5,side*1,-side*1,side*1.55,-side*1.55,Math.PI]){
      const direction={x:Math.cos(angle+turn),y:0,z:Math.sin(angle+turn)};let clear=range;
      for(const b of shapes){const expanded={x:b.x-actor.r,z:b.z-actor.r,w:b.w+actor.r*2,d:b.d+actor.r*2,y0:b.y0,h:b.h};const t=rayBox(origin,direction,expanded,range);if(t!==null)clear=Math.min(clear,t);}
      const score=Math.min(1,clear/Math.max(1,range))*2+Math.cos(turn)*.8+(turn===0?.1:0);
      if(score>best){best=score;out={x:direction.x*(clear>.3?1:0),z:direction.z*(clear>.3?1:0)};}
    }
    return out;
  }
  function hunterStep(g,dt){
    const p=g.player,h=g.hunter,k=g.elapsed/DURATION,mode=h.mode||'chase';
    h.cd=Math.max(0,(h.cd||0)-dt);h.windup=Math.max(0,(h.windup||0)-dt);
    h.vy-=24*dt;
    if(mode==='withdrawal'){
      h.vx=h.vz=0;h.lunge=0;h.windup=0;h.windupStarted=false;
      climb(h,null,false,false,dt);move(h,dt);return;
    }
    const lost=mode==='chase'&&blind(g);h.lost=lost;
    h.senseIn=(h.senseIn||0)-dt;
    if(h.senseIn<=0){
      h.senseIn=.25;const d={x:p.x-h.x,y:p.y-h.y,z:p.z-h.z},n=Math.hypot(d.x,d.y,d.z)||1;
      const f={x:d.x/n,y:d.y/n,z:d.z/n};
      h.sees=!lost&&!rayCandidates(h,f,n).some(b=>{const t=rayBox(h,f,b,n);return t!==null&&t<n-.1;});
      if(h.sees||Math.hypot(d.x,d.z)<10)h.memory={x:p.x,y:p.y,z:p.z,at:g.elapsed};
    }
    // While blind the hunter walks to the shorted panel instead of tracking the spider.
    let goal=lost?g.blackout:mode==='ally'?p:h.sees?p:(h.memory||{x:h.x,y:h.y,z:h.z});
    if(!lost&&mode!=='ally'&&!h.sees&&h.memory&&g.elapsed-h.memory.at>6){const a=g.elapsed*.4;goal={x:h.memory.x+Math.cos(a)*7,y:h.memory.y,z:h.memory.z+Math.sin(a)*7};}
    const lead=lost||!h.sees?0:Math.min(.65,Math.hypot(p.x-h.x,p.z-h.z)/35),tx=goal.x+p.vx*lead,tz=goal.z+p.vz*lead;
    const dx=tx-h.x,dz=tz-h.z,dist=Math.hypot(dx,dz),real=Math.hypot(p.x-h.x,p.z-h.z);
    const speed=mode==='ally'?(real>9?7.5:0):lost?3.2:5.8+1.4*k+(h.dosed?1.2:0);
    if(mode==='ally'){h.lunge=0;h.windup=0;h.windupStarted=false;h.vx=dist>.5?dx/dist*speed:0;h.vz=dist>.5?dz/dist*speed:0;}
    else if(h.lunge>0){
      h.lunge-=dt;const burst=h.supplyCut&&g.elapsed<420?3:7;h.vx=h.dx*(speed+burst);h.vz=h.dz*(speed+burst);
    }else if(h.windupStarted&&h.windup<=0){
      h.windupStarted=false;h.lunge=.4;const a=h.attackAim||{x:tx,z:tz},ax=a.x-h.x,az=a.z-h.z,n=Math.hypot(ax,az)||1;h.dx=ax/n;h.dz=az/n;
    }else if(h.windup>0){h.vx=h.vz=0;}
    else{
      h.vx=dist>.5?dx/dist*speed:0;h.vz=dist>.5?dz/dist*speed:0;
      if(!lost&&h.sees&&h.grounded&&!h.cd&&real<10&&real>3&&Math.abs(p.y-h.y)<3){h.attackAim={x:tx,z:tz};h.windup=.65;h.windupStarted=true;h.cd=5.5-k+(h.supplyCut&&g.elapsed<420?3:0);}
      else if(!lost&&h.grounded&&p.y>h.y+3&&real<12&&!wall(h)){h.vy=13;}
    }
    if(!h.lunge&&!h.windup&&Math.abs(goal.y-h.y)<3){
      h.steerIn=(h.steerIn||0)-dt;if(h.steerIn<=0){h.steerIn=.25;h.steer=navigate(h,{x:tx,z:tz},h.dosed?-1:1);}
      if(dist>.5&&h.steer){h.vx=h.steer.x*speed;h.vz=h.steer.z*speed;}
    }
    h.tactic=mode==='ally'?(real>9?'escort':'guard'):lost?'search-panel':h.windup?'ambush':h.sees?'intercept':'search-last-seen';
    const slowed=g.elapsed<(h.webUntil||0);
    if(slowed){h.lunge=0;h.windup=0;h.windupStarted=false;h.vx*=.3;h.vz*=.3;}
    const obstacle=wall(h);
    climb(h,obstacle,!!obstacle&&(lost?true:(p.y>h.y+1||real>2)),false,dt,slowed?1.8:6);
    if(slowed&&!h.climbing&&h.vy>0)h.vy=Math.min(h.vy,4);
    move(h,dt);
  }
  const api={cutWeb,navigate,installLocations,groundHeight,publicBuildings,GRID,BLOCK,WORLD,DURATION,RANGE,MAX_SPEED,BLACKOUT,SLING_CHARGE,SLING_MIN,SLING_MAX,solids,assistAim,hunterAim,releaseWeb,startSling,slingYaw,releaseSling,cancelSling,cutPanel,blind,hostile,query,rayCandidates,webBlocked,buildings,createGame,wall,move,aim,shootWeb,rayBox,step};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SpiderRules=api;
})(typeof window!=='undefined'?window:globalThis);
