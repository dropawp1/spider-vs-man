/* Procedural 3D appearance. Physics collision envelopes remain in physics.js. */
(() => {
  'use strict';
  const T=THREE, cube=new T.BoxGeometry(1,1,1), sphere=new T.SphereGeometry(1,12,8),actorSphere=new T.SphereGeometry(1,24,16);
  const palette=[0x344c62,0x735449,0x3d626c,0x695a65,0x8a7764,0x354452,0x5a6c77,0x52665e];
  const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.78,...extra});
  const css=getComputedStyle(document.documentElement);
  const color=(name,fallback)=>css.getPropertyValue('--'+name).trim()||fallback;
  const styled=(name,fallback,extra={})=>mat(color(name,fallback),extra);
  const materials={wall:palette.map(c=>mat(c)),dark:mat(0x182330),trim:mat(0x96a4aa),roof:mat(0x28343e),skin:styled('skin','#bf947e',{roughness:parseFloat(color('skin-roughness','.63'))}),cloth:styled('shirt','#596453'),pants:styled('jeans','#304059'),bat:mat(0x9b7650),spider:styled('spider-body','#1b1512',{roughness:parseFloat(color('spider-roughness','.6'))}),joint:styled('spider-band','#c8642a'),eye:mat(0x70f6e0,{emissive:0x2becc7,emissiveIntensity:1.2})};
  const detail={hair:styled('hair','#30261f'),brow:styled('brow','#24180f'),white:styled('sclera','#f2ede6'),iris:styled('iris','#4a6b3a'),mouth:styled('mouth-line','#704b43'),stubble:styled('stubble','#655950'),shoe:styled('shoe','#1d1d1f'),sole:styled('shoe-sole','#e8e4dc'),belt:styled('belt','#302821'),abdomen:styled('spider-abdomen','#241a14'),hairSpider:styled('spider-hair','#6b4a30'),fang:styled('spider-fang','#0a0807'),eyeSpider:styled('spider-eye','#050505'),bandLight:styled('spider-band-light','#e3a26a')};
  function box(parent,x,y,z,w,h,d,material){const m=new T.Mesh(cube,material);m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m;}
  function orb(parent,x,y,z,w,h,d,material){const m=new T.Mesh(actorSphere,material);m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m;}
  function segment(parent,a,b,r,material){const delta=new T.Vector3().subVectors(b,a),m=new T.Mesh(new T.CylinderGeometry(r*.7,r,delta.length(),7),material);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());parent.add(m);return m;}
  function city(scene,R){
    // Batch thousands of windows and repeated street details into a few draw calls.
    const batches=new Map(),tmp=new T.Object3D(),chunkSize=R.BLOCK*4;
    // Window/lamp light materials are cloned per chunk so a shorted panel can darken just its block.
    const DIM=new Set(['lit','warmSoft','warmBright','lamphead','lightpool']),chunkMats=new Map();
    // Local bounds let Three.js reject offscreen chunks, unlike city-wide batches.
    const batch=(key,material,x,y,z,w,h,d,geometry=cube,rotation=0,powerPosition=null)=>{
      const base=key;
      // Street props reuse existing material/geometry buckets. Their semantic
      // tags remain inspectable, but do not cost another draw per city chunk.
      if(base==='streetmetal')key='lamp';
      if(base==='streetfront'&&material===materials.trim){key='windowFrame';material=windowFrame;}
      if(base==='streetfront'&&material===white)key='roadmark';
      const chunk=Math.floor((powerPosition||{x,z}).x/chunkSize)+':'+Math.floor((powerPosition||{x,z}).z/chunkSize);
      // A semantic label alone is not a geometry/material identity: a plane
      // must never inherit a car's box geometry or another material in this chunk.
      key+=':'+geometry.uuid+':'+material.uuid+':'+chunk;
      if(!batches.has(key)){
        if(DIM.has(base)){
          const compile=material.onBeforeCompile,programKey=material.customProgramCacheKey;
          material=material.clone();material.onBeforeCompile=compile;material.customProgramCacheKey=programKey;
          if(!chunkMats.has(chunk))chunkMats.set(chunk,[]);
          chunkMats.get(chunk).push({m:material,c:material.color.clone(),e:material.emissiveIntensity,o:material.opacity});
        }
        batches.set(key,{material,geometry,items:[],label:base,tags:new Set()});
      }
      batches.get(key).items.push([x,y,z,w,h,d,rotation]);
      batches.get(key).tags.add(base);
    };
    const cone=new T.ConeGeometry(1,1,4),pole=new T.CylinderGeometry(.07,.1,1,7);
    const panelLamp=mat(0xff5a4a,{emissive:0xff2a1a,emissiveIntensity:2.2});
    const lit=mat(0xd9bd84,{emissive:0xffd28c,emissiveIntensity:.38,roughness:.36}),warmSoft=mat(0xb6a17a,{emissive:0xf5cc90,emissiveIntensity:.22,roughness:.42}),warmBright=mat(0xe7cd96,{emissive:0xffda99,emissiveIntensity:.52,roughness:.32});
    const off=mat(0x242b31,{roughness:.24,metalness:.25}),windowFrame=mat(0x625c51,{roughness:.52,metalness:.42}),white=mat(0xb3bbaf),road=mat(0x373e41,{roughness:.82,metalness:0}),sidewalk=mat(0x66635c),green=mat(0x365e52);
    road.userData.surfaceWet=1;sidewalk.userData.surfaceStyle=3;
    const windowPane=new T.PlaneGeometry(1,1);
    const wheelShape=new T.SphereGeometry(1,6,4);
    // Room depth cues, curtains and antialiased blinds live in the existing
    // window shader: no extra room meshes, lamps or draw calls per window.
    for(const material of [lit,warmSoft,warmBright,off]){
      material.roughness=.29;material.metalness=.16;
      material.onBeforeCompile=shader=>{
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vRoomUv;').replace('#include <uv_vertex>','#include <uv_vertex>\nvRoomUv=uv;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vRoomUv;')
          .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
            vec2 ruv=vRoomUv;
            float frame=smoothstep(0.0,.07,min(min(ruv.x,1.0-ruv.x),min(ruv.y,1.0-ruv.y)));
            float curtain=mix(.32,1.0,smoothstep(.07,.19,min(ruv.x,1.0-ruv.x)));
            float blind=.86+.14*sin(ruv.y*88.0)*(1.0-smoothstep(.02,.13,fwidth(ruv.y)));
            float depth=.4+.6*smoothstep(.02,.8,ruv.y);
            float room=frame*curtain*blind*depth;
            totalEmissiveRadiance*=room;
            diffuseColor.rgb*=.42+.58*room;`);
      };
      material.customProgramCacheKey=()=> 'window-rooms-v1';
    }
    const half=R.WORLD/2;
    // Tile the ground around metro footprints: no invisible street through the stairs.
    for(let iz=0;iz<R.GRID;iz++)for(let ix=0;ix<R.GRID;ix++){
      const b=R.buildings[iz*R.GRID+ix],x=-half+ix*R.BLOCK,z=-half+iz*R.BLOCK;
      const rect=(a,c,w,d)=>{if(w>0&&d>0)batch('ground',road,a+w/2,-.25,c+d/2,w,.5,d);};
      if(b.type!==5)rect(x,z,R.BLOCK,R.BLOCK);
      else{rect(x,z,R.BLOCK,b.z-z);rect(x,b.z+b.d,R.BLOCK,z+R.BLOCK-b.z-b.d);rect(x,b.z,b.x-x,b.d);rect(b.x+b.w,b.z,x+R.BLOCK-b.x-b.w,b.d);}
    }
    // GRID*BLOCK is WORLD-4: the last four metres previously had paint but
    // no road. Complete that rim and add a decorative skirt beyond the fence.
    const groundRect=(x,z,w,d)=>batch('ground',road,x+w/2,-.25,z+d/2,w,.5,d);
    groundRect(half-4,-half,4,R.WORLD);groundRect(-half,half-4,R.WORLD-4,4);
    const skirt=80;
    groundRect(-half-skirt,-half-skirt,R.WORLD+skirt*2,skirt);groundRect(-half-skirt,half,R.WORLD+skirt*2,skirt);
    groundRect(-half-skirt,-half,skirt,R.WORLD);groundRect(half,-half,skirt,R.WORLD);
    for(const b of R.solids.filter(v=>v.kind==='worldBoundary'))batch('cityBoundary',materials.trim,b.x+b.w/2,b.h/2,b.z+b.d/2,b.w,b.h,b.d);
    for(let n=0;n<=R.GRID;n++){
      const v=-half+2+n*R.BLOCK;
      for(let k=-half+4;k<half-2;k+=8){batch('roadmark',white,v,.004,k,.15,.006,3);batch('roadmark',white,k,.004,v,3,.006,.15);}
    }
    R.buildings.forEach(b=>{
      const {x,z,w,d,h,type,id}=b,cx=x+w/2,cz=z+d/2;
      // A pavement and inset joints ground each block in a readable street
      // scale. Their upper face remains below the physical walking plane.
      batch('pavement',sidewalk,cx,-.065,z-1.05,w+2.4,.12,2.1);
      batch('pavement',sidewalk,cx,-.065,z+d+1.05,w+2.4,.12,2.1);
      for(const side of [-1,1])batch('pavement',sidewalk,cx+side*(w/2+1.05),-.065,cz,2.1,.12,d);
      // Shells and openings belong to GameLocations. Work in the same local frame;
      // a facade plane sits OUTSIDE the wall, not inside its .28m thickness.
      const angle=Number.isFinite(b.rotationY)?b.rotationY:0,c=Math.cos(angle),s=Math.sin(angle);
      const local=(key,m,lx,y,lz,bw,bh,bd,geometry=cube,yaw=0)=>batch(key,m,cx+c*lx+s*lz,y,cz-s*lx+c*lz,bw,bh,bd,geometry,angle+yaw,{x:cx,z:cz});
      // Human-scale street fronts: details stay on the side bays, keeping
      // every existing entrance and the front stair/roof access clear.
      if(type!==5){
        const shopX=-w/2+2.4;
        local('streetfront',materials.trim,shopX,3.35,-d/2-.4,3.8,.16,.85);
        local('streetfront',materials.trim,shopX,1.65,-d/2-.045,3.5,2.5,.06);
        local('windowOff',off,shopX,1.65,-d/2-.085,3.15,2.15,1,windowPane,Math.PI);
        for(const side of [-1,1])local('streetfront',materials.trim,shopX+side*.78,1.65,-d/2-.11,.055,2.2,.06);
      }
      // Drainpipes/ventilation add relief without new per-building materials.
      local('streetmetal',materials.dark,w/2-.35,h*.5,d/2+.08,.1,h,.12);
      if(id%2===0){local('streetmetal',materials.dark,-w/2-.09,3.4,d/2-2,.16,.9,1.1);for(let i=0;i<4;i++)local('streetfront',materials.trim,-w/2-.19,3.1+i*.16,d/2-2,.04,.045,.9);}
      const tones=[['lit',lit],['warmSoft',warmSoft],['warmBright',warmBright]];
      const facade=(side,length)=>{
        const yaw=[Math.PI,0,-Math.PI/2,Math.PI/2][side];
        let column=0,row=0;
        for(let y=Math.min(6,h-1.6);y<h-1.25;y+=3.6,row++){
          column=0;
          for(let a=1.5;a<length-1;a+=2.8,column++){
            const u=a-length/2;
            // Keep the full entrance/canopy/sign band clear on short buildings.
            if(side===0&&y<5.6&&Math.abs(u)<3.8)continue;
            const hash=(Math.imul(id+1,73856093)^Math.imul(column+1,19349663)^Math.imul(row+1,83492791)^Math.imul(side+1,2654435761))>>>0;
            const [key,m]=column!==0&&hash%7===0?['windowOff',off]:tones[hash%tones.length];
            const px=side<2?u:(side===2?-w/2:w/2),pz=side<2?(side===0?-d/2:d/2):u;
            // Positive scales and explicit outward rotation preserve plane normals.
            // Frame bars meet edge-to-edge; no full backing box or duplicate pane.
            const nx=Math.sin(yaw),nz=Math.cos(yaw),tx=Math.cos(yaw),tz=-Math.sin(yaw);
            local(key,m,px+nx*.055,y,pz+nz*.055,1.15,1.5,1,windowPane,yaw);
            for(const sign of [-1,1]){
              local('windowFrame',windowFrame,px+nx*.025+tx*sign*.61,y,pz+nz*.025+tz*sign*.61,.07,1.64,.04,cube,yaw);
              local('windowFrame',windowFrame,px+nx*.025,y+sign*.785,pz+nz*.025,1.15,.07,.04,cube,yaw);
            }
          }
        }
      };
      for(let side=0;side<4;side++)facade(side,side<2?w:d);
      // Story panels stay on the rear roof, clear of the front stairwell.
      if(id%4===1&&type!==4&&type!==3){local('panel',materials.dark,-3.4,h+.9,2.2,1.2,1.8,.8);local('panellamp',panelLamp,-3.4,h+1.45,1.78,.32,.32,.05);local('panellamp',panelLamp,-3.4,h+1.45,2.62,.32,.32,.05);}
      const lx=x-2,lz=z-2;
      batch('lamp',materials.dark,lx,2.7,lz,.14,5.4,.14);batch('lamphead',lit,lx,5.4,lz,1.1,.2,.7);
      if(id%3===0){const carx=x+w+3;batch('wall'+((type+2)%8),materials.wall[(type+2)%8],carx,.9,cz,1.8,.8,3.6);batch('off',off,carx,1.55,cz,1.5,.6,1.9);
        for(const a of [-1,1])for(const c of [-1,1])batch('carwheel',materials.dark,carx+a*.85,.37,cz+c*1.1,.2,.37,.37,wheelShape);
        batch('streetfront',materials.trim,carx,.64,cz-1.84,1.8,.15,.07);batch('streetfront',materials.trim,carx,.64,cz+1.84,1.8,.15,.07);
        for(const a of [-1,1])batch('streetfront',white,carx+a*.58,.98,cz-1.83,.34,.18,.04);
      }
      if(id%2===0){const tx=x+w+2,tz=z+d+2;batch('trunk',materials.bat,tx,1.1,tz,.3,2.2,.3);batch('foliage',green,tx,3,tz,1.3,1.55,1.3,sphere);for(const a of [-1,1])batch('foliage',green,tx+a*.65,2.65,tz+a*.3,.95,1.15,1.1,sphere);}
    });
    // Painted crossings and warm lamp pools stay batched. No full-height
    // emissive rails: they read as bright facade stripes rather than signage.
    const pool=new T.MeshBasicMaterial({color:0xf5c17e,transparent:true,opacity:.12,depthWrite:false});
    R.buildings.forEach(b=>{
      const cx=b.x+b.w/2,cz=b.z+b.d/2;
      batch('lightpool',pool,b.x-2,.018,b.z-2,4.5,.008,4.5);
      // Kerbs, gratings, pavement bollards and bins; sparse repeated props
      // share chunk batches rather than creating individual draw calls.
      batch('pavement',sidewalk,b.x-2.05,.025,cz,.14,.1,b.d);
      for(let i=0;i<5;i++)batch('streetmetal',materials.dark,b.x-2.65+i*.12,.009,b.z+2,.055,.012,.75);
      if(b.id%4===0){
        for(const a of [-1,1]){batch('streetmetal',materials.dark,cx+a*3.7,.4,b.z-1.5,.14,.8,.14);batch('streetfront',white,cx+a*3.7,.65,b.z-1.5,.16,.09,.16);}
        batch('streetmetal',materials.dark,b.x+1,.45,b.z-1.5,.5,.9,.5);
      }
      if(b.id%5===0){
        for(let i=0;i<4;i++)batch('crossing',white,b.x-4,.004,b.z+i*.85,3,.006,.38);
        batch('bench',materials.bat,b.x+3,.6,b.z-2,2,.15,.65);
        batch('benchleg',materials.dark,b.x+2.3,.3,b.z-2,.12,.6,.5);
        batch('benchleg',materials.dark,b.x+3.7,.3,b.z-2,.12,.6,.5);
      }
      if(b.type===7){
        batch('planter',materials.roof,cx,b.h+.3,cz,4,.6,4);
        batch('foliage',green,cx,b.h+1.4,cz,1.3,.8,1.3,sphere);
      }
    });
    // A distant moon and fixed stars need no downloaded textures or costly light sources.
    const stars=[];
    for(let i=0;i<420;i++){const a=i*2.399963,r=Math.sqrt(1-Math.pow((i+.5)/420,2));stars.push(Math.cos(a)*r*480,((i+.5)/420)*480,Math.sin(a)*r*480);}
    const starGeometry=new T.BufferGeometry();starGeometry.setAttribute('position',new T.Float32BufferAttribute(stars,3));
    const sky=new T.Points(starGeometry,new T.PointsMaterial({color:0xcbdfff,size:.65,fog:false}));scene.add(sky);
    const moon=orb(scene,-210,280,-300,8,8,8,new T.MeshBasicMaterial({color:0xd7e7ff,fog:false}));
    for(const {material,geometry,items,label,tags} of batches.values()){
      const mesh=new T.InstancedMesh(geometry,material,items.length);
      mesh.name='city-'+label;
      mesh.userData.cityDetails=[...tags];
      items.forEach((a,i)=>{tmp.position.set(a[0],a[1],a[2]);tmp.scale.set(a[3],a[4],a[5]);tmp.rotation.set(0,a[6],0);tmp.updateMatrix();mesh.setMatrixAt(i,tmp.matrix);});
      mesh.computeBoundingSphere();mesh.matrixAutoUpdate=false;scene.add(mesh);
    }
    // No city detail is visible beyond the existing opaque fog (350m).
    const chunks=[...scene.children].filter(o=>o.isInstancedMesh);
    // blackout(pos, k): darken the chunk containing pos by k (0..1); null restores the previous chunk.
    let darkChunk=null;
    const shade=(chunk,k)=>{for(const a of chunkMats.get(chunk)||[]){a.m.color.copy(a.c).multiplyScalar(1-.8*k);if(a.e!==undefined)a.m.emissiveIntensity=a.e*(1-.95*k);if(a.m.transparent)a.m.opacity=a.o*(1-k);}};
    function blackout(pos,k=1){
      const chunk=pos?Math.floor(pos.x/chunkSize)+':'+Math.floor(pos.z/chunkSize):null;
      if(darkChunk&&darkChunk!==chunk)shade(darkChunk,0);
      darkChunk=chunk;if(chunk)shade(chunk,k);
    }
    return {blackout,update(camera){for(const mesh of chunks){const b=mesh.boundingSphere;mesh.visible=Math.hypot(camera.position.x-b.center.x,camera.position.y-b.center.y,camera.position.z-b.center.z)<=350+b.radius;}}};
  }
  function hunter(){
    const root=new T.Group(),body=new T.Group();root.name='object-six-detailed';root.add(body);
    const skin=mat(0xb79580,{roughness:.64}),coat=new T.MeshPhysicalMaterial({color:0x47554d,roughness:.91,sheen:.32,sheenColor:0x788778,sheenRoughness:.8}),leather=mat(0x202725,{roughness:.73}),stitch=mat(0x84917d),scar=mat(0x9b7468),pupil=mat(0x111a18,{roughness:.18}),steel=mat(0x9bada5,{metalness:.8,roughness:.32});
    skin.userData.surfaceFinish=true;skin.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vSkinUv;').replace('#include <uv_vertex>','#include <uv_vertex>\nvSkinUv=uv;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vSkinUv;').replace('#include <color_fragment>','#include <color_fragment>\nfloat pores=sin(vSkinUv.x*780.)*sin(vSkinUv.y*680.);diffuseColor.rgb*=.98+.018*pores;');};skin.customProgramCacheKey=()=> 'six-skin-v1';
    orb(body,0,1.65,0,.39,.4,.235,coat);orb(body,0,1.3,0,.31,.26,.21,coat);orb(body,0,1.12,0,.32,.2,.22,materials.pants);
    orb(body,0,2.08,.015,.13,.19,.125,skin);
    const head=new T.Group();head.position.set(0,2.34,0);head.name='six-head';head.scale.set(.84,.98,.9);body.add(head);
    orb(head,0,.025,0,.235,.29,.225,skin);orb(head,0,-.15,-.035,.195,.14,.185,skin);
    orb(head,0,.22,.035,.237,.105,.215,detail.hair);for(let i=0;i<7;i++)orb(head,(i-3)*.052,.245+(i%2)*.015,.005,.06,.045,.13,detail.hair);
    orb(head,0,-.005,-.222,.037,.075,.04,skin);orb(head,0,-.065,-.239,.035,.025,.035,skin);
    for(const sign of [-1,1]){orb(head,sign*.036,-.08,-.257,.019,.009,.015,detail.mouth);orb(head,sign*.235,-.015,.005,.035,.075,.045,skin);orb(head,sign*.105,-.065,-.18,.07,.04,.028,skin);}
    const eyes=[];
    for(const sign of [-1,1]){
      const eye=new T.Group();eye.position.set(sign*.089,.04,-.204);head.add(eye);eyes.push(eye);
      orb(eye,0,0,0,.034,.019,.021,detail.white);orb(eye,sign*.004,0,-.018,.014,.017,.008,detail.iris);orb(eye,sign*.004,0,-.025,.0065,.011,.004,pupil);
      orb(head,sign*.089,.068,-.208,.054,.016,.027,skin);const brow=box(head,sign*.09,.092,-.222,.11,.018,.022,detail.brow);brow.rotation.z=sign*.12;
    }
    box(head,0,-.134,-.222,.105,.012,.014,detail.mouth);orb(head,0,-.147,-.21,.065,.012,.02,skin);
    const mark=box(head,-.145,.005,-.203,.009,.1,.008,scar);mark.rotation.z=-.25;
    box(body,0,1.67,-.24,.022,.63,.025,leather);for(const sign of [-1,1]){
      box(body,sign*.2,1.73,-.215,.16,.18,.045,coat);box(body,sign*.2,1.83,-.245,.18,.025,.018,stitch);
      const strap=box(body,sign*.29,1.74,.03,.045,.57,.47,leather);strap.rotation.z=-sign*.07;
    }
    box(body,0,1.13,-.015,.66,.075,.4,leather);box(body,0,1.13,-.235,.11,.09,.025,steel);
    for(const sign of [-1,1])box(body,sign*.27,1.17,.03,.16,.22,.24,leather);
    // Metal identification tag and a six-shaped raised mark.
    box(body,.1,1.94,-.23,.12,.16,.025,steel);
    for(const [x,y,w,h] of [[.075,1.94,.016,.09],[.1,1.98,.05,.012],[.1,1.94,.05,.012],[.1,1.9,.05,.012],[.125,1.92,.012,.04]])box(body,x,y,-.247,w,h,.008,leather);
    const legs=[],knees=[],arms=[],elbows=[];
    for(const sign of [-1,1]){
      const leg=new T.Group();leg.position.set(sign*.185,1.12,0);leg.name='six-hip';body.add(leg);legs.push(leg);
      orb(leg,0,-.24,0,.14,.3,.145,materials.pants);
      const knee=new T.Group();knee.position.y=-.53;leg.add(knee);knees.push(knee);orb(knee,0,0,-.035,.12,.12,.13,leather);orb(knee,0,-.23,.015,.105,.255,.12,materials.pants);
      orb(knee,0,-.49,-.065,.14,.1,.23,detail.shoe);box(knee,0,-.57,-.065,.27,.04,.44,leather);
      for(let i=0;i<3;i++)box(knee,0,-.435-i*.025,-.15,.14,.012,.02,stitch);
      const arm=new T.Group();arm.position.set(sign*.4,1.93,0);arm.name='six-shoulder';body.add(arm);arms.push(arm);
      orb(arm,0,-.18,0,.145,.255,.15,coat);const elbow=new T.Group();elbow.position.y=-.43;arm.add(elbow);elbows.push(elbow);
      orb(elbow,0,-.17,0,.105,.22,.115,coat);box(elbow,0,-.33,0,.22,.07,.23,leather);orb(elbow,0,-.43,-.015,.095,.12,.07,skin);
      for(let f=0;f<4;f++)orb(elbow,(f-1.5)*.035,-.52,-.03,.016,.065,.024,skin);orb(elbow,-sign*.095,-.43,-.05,.025,.07,.03,skin);
    }
    const bat=new T.Group();bat.name='six-electric-baton';bat.position.set(0,-.49,-.015);elbows[1].add(bat);
    segment(bat,new T.Vector3(0,0,0),new T.Vector3(0,-1.15,0),.055,steel);for(let i=0;i<6;i++)box(bat,0,-.06-i*.035,0,.12,.018,.12,leather);
    for(const sign of [-1,1])box(bat,sign*.055,-.77,0,.018,.48,.02,materials.eye);box(bat,0,-1.16,0,.13,.08,.13,leather);
    // Merge direct static parts; articulation stays on the parent bones.
    function pack(parent){for(const child of [...parent.children])if(child.isGroup)pack(child);const bins=new Map();for(const child of [...parent.children])if(child.isMesh&&!child.isInstancedMesh){const key=child.geometry.uuid+child.material.uuid;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(child);}for(const list of bins.values())if(list.length>1){const mesh=new T.InstancedMesh(list[0].geometry,list[0].material,list.length);list.forEach((o,i)=>{o.updateMatrix();mesh.setMatrixAt(i,o.matrix);parent.remove(o);});mesh.computeBoundingSphere();parent.add(mesh);}}
    pack(body);
    return {root,body,animate(t,moving,attack,climbing){
      const cycle=t*9,breath=Math.sin(t*1.8)*.004;
      legs.forEach((l,i)=>{const step=Math.sin(cycle+i*Math.PI);l.rotation.x=moving?step*.45:0;knees[i].rotation.x=moving?Math.max(0,-step)*.55:0;});
      arms.forEach((a,i)=>{a.rotation.x=climbing?-2.4:moving?-Math.sin(cycle+i*Math.PI)*.32:Math.sin(t*1.8+i)*.025;elbows[i].rotation.x=climbing?-.35:-.12;});
      if(attack>.65){arms[1].rotation.x=-2.5+(1.1-attack)*8;elbows[1].rotation.x=-.38;}
      body.rotation.z=moving?Math.sin(cycle)*.018:0;body.position.y=.012+breath+(moving?Math.abs(Math.sin(cycle))*.025:0);head.rotation.y=Math.sin(t*.7)*.025;
      const blink=t%4.7;eyes.forEach(e=>e.scale.y=blink<.12?.12:1);
    }};
  }
  function spider(parent){
    const root=new T.Group(),body=new T.Group(),legs=[];parent.add(root);root.add(body);
    // Feet are solved independently: rotating a whole leg used to sweep its
    // toe through the floor on half of every walking cycle.
    const limbGeometry=new T.CylinderGeometry(.7,1,1,12);
    const limbs=new T.InstancedMesh(limbGeometry,materials.spider,16);
    const joints=new T.InstancedMesh(actorSphere,materials.joint,8);
    const bands=new T.InstancedMesh(actorSphere,detail.bandLight,8);
    for(const mesh of [limbs,joints,bands]){mesh.frustumCulled=false;root.add(mesh);}
    const transform=new T.Object3D(),up=new T.Vector3(0,1,0),delta=new T.Vector3();
    function limb(index,a,b,r){delta.subVectors(b,a);transform.position.copy(a).add(b).multiplyScalar(.5);transform.scale.set(r,delta.length(),r);transform.quaternion.setFromUnitVectors(up,delta.normalize());transform.updateMatrix();limbs.setMatrixAt(index,transform.matrix);}
    function bead(mesh,index,p,r){transform.position.copy(p);transform.quaternion.identity();transform.scale.setScalar(r);transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);}
    orb(body,0,0,.33,.32,.23,.43,detail.abdomen);
    orb(body,0,.015,-.19,.25,.18,.28,materials.spider);
    for(const s of [-1,1])for(let i=0;i<4;i++){
      const a=new T.Vector3(s*.18,0,-.32+i*.15);
      const b=new T.Vector3(a.x+s*(.5+Math.sin(i)*.12),.18,a.z+(i-1.5)*.23);
      const c=new T.Vector3(a.x+s*(.78+Math.sin(i)*.15),-.29,a.z+(i-1.5)*.4);
      legs.push({a,b,c,rest:c.clone(),knee:b.clone(),band:new T.Vector3(),phase:(i+(s>0?1:0))%2*Math.PI});
      if(i===0){const fang=orb(body,s*.105,-.035,-.46,.065,.1,.12,detail.fang);fang.rotation.x=-.3;}
    }
    for(let i=0;i<8;i++)orb(body,(i%4-1.5)*.07,.10+Math.floor(i/4)*.055,-.415+Math.floor(i/4)*.025,.027,.027,.022,detail.eyeSpider);
    // Sparse deterministic bristles, no textures or external assets.
    const bristles=new T.InstancedMesh(limbGeometry,detail.hairSpider,50);body.add(bristles);
    for(let i=0;i<50;i++){
      const a=i*2.39996,y=(i/49)*2-1,r=Math.sqrt(1-y*y);
      const p=new T.Vector3(Math.cos(a)*r*.31,y*.22,.33+Math.sin(a)*r*.42);
      delta.set(Math.cos(a)*r*.045,y*.045,Math.sin(a)*r*.045);
      transform.position.copy(p).addScaledVector(delta,.5);transform.scale.set(.003,delta.length(),.003);transform.quaternion.setFromUnitVectors(up,delta.normalize());transform.updateMatrix();bristles.setMatrixAt(i,transform.matrix);
    }
    bristles.computeBoundingSphere();
    const api={root,body,feet:legs.map(l=>l.c),animate(t,moving,web,contactHeight){
      legs.forEach((l,i)=>{
        const phase=t*12+l.phase,swing=Math.max(0,Math.sin(phase));
        l.c.copy(l.rest);l.b.copy(l.knee);
        l.c.z+=moving?Math.cos(phase)*.12:0;
        const ground=contactHeight?contactHeight(l.c.x,l.c.z):-.29;
        l.c.y=ground+(moving?swing*.14:0);
        if(web){l.c.y+=.18;l.c.z+=.12;}
        l.b.y=Math.max(l.b.y,l.c.y+.22);
        limb(i*2,l.a,l.b,.05);limb(i*2+1,l.b,l.c,.035);
        bead(joints,i,l.b,.08);l.band.copy(l.b).lerp(l.c,.15);bead(bands,i,l.band,.05);
      });
      limbs.instanceMatrix.needsUpdate=joints.instanceMatrix.needsUpdate=bands.instanceMatrix.needsUpdate=true;
    }};
    api.animate(0,false,false);return api;
  }
  window.SpiderModels={city,hunter,spider};
})();
