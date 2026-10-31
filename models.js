/* Procedural 3D appearance. Physics collision envelopes remain in physics.js. */
(() => {
  'use strict';
  const T=THREE, cube=new T.BoxGeometry(1,1,1), sphere=new T.SphereGeometry(1,12,8);
  const palette=[0x344c62,0x735449,0x3d626c,0x695a65,0x8a7764,0x354452,0x5a6c77,0x52665e];
  const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.78,...extra});
  const css=getComputedStyle(document.documentElement);
  const color=(name,fallback)=>css.getPropertyValue('--'+name).trim()||fallback;
  const styled=(name,fallback,extra={})=>mat(color(name,fallback),extra);
  const materials={wall:palette.map(c=>mat(c)),dark:mat(0x182330),trim:mat(0x96a4aa),roof:mat(0x28343e),skin:styled('skin','#bf947e',{roughness:parseFloat(color('skin-roughness','.63'))}),cloth:styled('shirt','#596453'),pants:styled('jeans','#304059'),bat:mat(0x9b7650),spider:styled('spider-body','#1b1512',{roughness:parseFloat(color('spider-roughness','.6'))}),joint:styled('spider-band','#c8642a'),eye:mat(0x70f6e0,{emissive:0x2becc7,emissiveIntensity:1.2})};
  const detail={hair:styled('hair','#30261f'),brow:styled('brow','#24180f'),white:styled('sclera','#f2ede6'),iris:styled('iris','#4a6b3a'),mouth:styled('mouth-line','#704b43'),stubble:styled('stubble','#655950'),shoe:styled('shoe','#1d1d1f'),sole:styled('shoe-sole','#e8e4dc'),belt:styled('belt','#302821'),abdomen:styled('spider-abdomen','#241a14'),hairSpider:styled('spider-hair','#6b4a30'),fang:styled('spider-fang','#0a0807'),eyeSpider:styled('spider-eye','#050505'),bandLight:styled('spider-band-light','#e3a26a')};
  function box(parent,x,y,z,w,h,d,material){const m=new T.Mesh(cube,material);m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m;}
  function orb(parent,x,y,z,w,h,d,material){const m=new T.Mesh(sphere,material);m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m;}
  function segment(parent,a,b,r,material){const delta=new T.Vector3().subVectors(b,a),m=new T.Mesh(new T.CylinderGeometry(r*.7,r,delta.length(),7),material);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());parent.add(m);return m;}
  function city(scene,R){
    // Batch thousands of windows and repeated street details into a few draw calls.
    const batches=new Map(),tmp=new T.Object3D(),chunkSize=R.BLOCK*4;
    // Window/lamp light materials are cloned per chunk so a shorted panel can darken just its block.
    const DIM=new Set(['lit','blue','lamphead','lightpool','cyan','pink']),chunkMats=new Map();
    // Local bounds let Three.js reject offscreen chunks, unlike city-wide batches.
    const batch=(key,material,x,y,z,w,h,d,geometry=cube,rotation=0)=>{
      const base=key,chunk=Math.floor(x/chunkSize)+':'+Math.floor(z/chunkSize);
      key+=':'+chunk;
      if(!batches.has(key)){
        if(DIM.has(base)){
          material=material.clone();
          if(!chunkMats.has(chunk))chunkMats.set(chunk,[]);
          chunkMats.get(chunk).push({m:material,c:material.color.clone(),e:material.emissiveIntensity,o:material.opacity});
        }
        batches.set(key,{material,geometry,items:[]});
      }
      batches.get(key).items.push([x,y,z,w,h,d,rotation]);
    };
    const cone=new T.ConeGeometry(1,1,4),pole=new T.CylinderGeometry(.07,.1,1,7);
    const panelLamp=mat(0xff5a4a,{emissive:0xff2a1a,emissiveIntensity:2.2});
    const lit=mat(0xffd59a,{emissive:0xffb75d,emissiveIntensity:.65}),blue=mat(0x63acbd,{emissive:0x258ca0,emissiveIntensity:.5}),off=mat(0x1e3546,{metalness:.3}),white=mat(0xb3bbaf),road=mat(0x19232e),sidewalk=mat(0x43515a),green=mat(0x365e52);
    const half=R.WORLD/2;
    box(scene,0,-.28,0,R.WORLD+30,.5,R.WORLD+30,road);
    for(let n=0;n<=R.GRID;n++){
      const v=-half+2+n*R.BLOCK;
      for(let k=-half+4;k<half-2;k+=8){batch('roadmark',white,v,.012,k,.15,.025,3);batch('roadmark',white,k,.012,v,3,.025,.15);}
    }
    const names=['ATLAS','HOTEL','NOVA','АРХИВ','КИНО','МЕТРО','СЕВЕР','ДЕПО'];
    const signMats=names.map((name,i)=>{const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#172633';ctx.fillRect(0,0,256,64);ctx.fillStyle=i%2?'#ffb885':'#78e7df';ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.fillText(name,128,43);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return new T.MeshBasicMaterial({map:tex});});
    R.buildings.forEach(b=>{
      const {x,z,w,d,h,type,id}=b,cx=x+w/2,cz=z+d/2,wall=materials.wall[type];
      // Wall stops 2 cm short so the roof slab's top face (exactly at physical roof h) never z-fights.
      batch('wall'+type,wall,cx,(h-.02)/2,cz,w,h-.02,d);
      batch('pavement',sidewalk,cx,.04,cz,w+2,.08,d+2);
      batch('roof',materials.roof,cx,h-.13,cz,w+.12,.26,d+.12);
      // Facade rhythm, cornices and roofs differ across eight architectural styles.
      const floor=type===1?3:3.8;
      for(let y=2;y<h-1;y+=floor){
        if(type===1||type===4||type===6)batch('trim',materials.trim,cx,y+1.15,cz,w+.12,.16,d+.12);
        for(let a=1.5;a<w-1;a+=2.8){const key=(Math.floor(a+y)+id)%5===0?'off':id%3===0?'blue':'lit';const m=key==='lit'?lit:key==='blue'?blue:off;batch(key,m,x+a,y,z-.025,1.15,1.5,.06);batch(key,m,x+a,y,z+d+.025,1.15,1.5,.06);}
        for(let a=1.5;a<d-1;a+=2.8){const key=(Math.floor(a+y)+id)%4===0?'off':'lit';batch(key,key==='lit'?lit:off,x-.025,y,z+a,.06,1.5,1.15);batch(key,key==='lit'?lit:off,x+w+.025,y,z+a,.06,1.5,1.15);}
      }
      if(type===0||type===2){for(let a=0;a<=w;a+=3.5)batch('trim',materials.trim,x+a,h/2,z-.1,.13,h,.16);}
      if(type===1||type===7){for(let y=4;y<h;y+=3)batch('balcony',materials.dark,cx,y,z+d+.5,w*.85,.2,1.1);}
      // Rooftop shapes below mirror physics.js roofParts() box-for-box, so everything visible is solid.
      if(type===3){
        // The cap owns the visible top at h+4.4. End walls at its underside,
        // not at the same height: coplanar faces flicker (z-fighting).
        batch('wall'+type,wall,cx,h+2.05,cz,w*.65,4.1,d*.65);
        batch('trim',materials.trim,cx,h+4.25,cz,w*.65+.1,.3,d*.65+.1);
      }
      if(type===4)for(let i=0;i<3;i++){const k=.8-i*.25;batch('roof',materials.roof,cx,h+i*1.6+.8,cz,w*k,1.6,d*k);}
      if(type===5){batch('balcony',materials.dark,cx,h+2,cz,5,4,5);batch('antenna',materials.trim,cx,h+8,cz,1,8,1,pole);batch('beacon',materials.eye,cx,h+12,cz,.2,.2,.2,sphere);}
      if(type===6){for(let a=2;a<w;a+=4)batch('trim',materials.trim,x+a,1.6,z-.2,.5,3.2,.5);}
      batch('equipment',materials.trim,cx+2,h+.5,cz,2.5,1,2);
      // Electrical panel: same box as the 'panel' solid in physics.js, red lamp on its front face.
      if(id%4===1&&type!==4&&type!==3){batch('panel',materials.dark,cx-3.4,h+.9,cz+2.2,1.2,1.8,.8);batch('panellamp',panelLamp,cx-3.4,h+1.45,cz+1.78,.32,.32,.05);batch('panellamp',panelLamp,cx-3.4,h+1.45,cz+2.62,.32,.32,.05);}
      batch('door',materials.dark,cx,1.1,z-.06,1.5,2.2,.12);
      batch('sign'+type,signMats[type],cx,4.7,z-.12,Math.min(8,w-2),1.8,.12);
      const lx=x-2,lz=z-2;
      batch('lamp',materials.dark,lx,2.7,lz,.14,5.4,.14);batch('lamphead',lit,lx,5.4,lz,1.1,.2,.7);
      if(id%3===0){const carx=x+w+3;batch('wall'+((type+2)%8),materials.wall[(type+2)%8],carx,.9,cz,1.8,.8,3.6);batch('off',off,carx,1.55,cz,1.5,.6,1.9);for(const a of [-1,1])for(const c of [-1,1])batch('balcony',materials.dark,carx+a*.85,.55,cz+c*1.1,.3,.5,.65);}
      if(id%2===0){batch('trunk',materials.bat,x+w+2,1.1,z+d+2,.3,2.2,.3);batch('foliage',green,x+w+2,3,z+d+2,1.5,1.8,1.5,sphere);}
    });
    // Painted crossings, warm pools beneath lamps and rooftop neon stay batched.
    const pool=new T.MeshBasicMaterial({color:0xf5c17e,transparent:true,opacity:.12,depthWrite:false});
    const cyan=mat(0x70d9e7,{emissive:0x28b8de,emissiveIntensity:2});
    const pink=mat(0xff89b5,{emissive:0xf24c9a,emissiveIntensity:1.7});
    R.buildings.forEach(b=>{
      const cx=b.x+b.w/2,cz=b.z+b.d/2;
      batch('lightpool',pool,b.x-2,.018,b.z-2,4.5,.008,4.5);
      if(b.type===0||b.type===2){
        const neon=b.type===0?cyan:pink,key=b.type===0?'cyan':'pink';
        batch(key,neon,cx,b.h-.4,b.z-.14,b.w,.12,.16);
        batch(key,neon,b.x-.14,b.h/2,b.z-.14,.12,b.h,.16);
      }
      if(b.id%5===0){
        for(let i=0;i<4;i++)batch('crossing',white,b.x-4,.025,b.z+i*.85,3,.02,.38);
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
    for(const {material,geometry,items} of batches.values()){
      const mesh=new T.InstancedMesh(geometry,material,items.length);
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
    // Low boundary walls make the playable limits visible.
    for(const s of [-1,1]){box(scene,s*half,1,0,.4,2,R.WORLD,materials.dark);box(scene,0,1,s*half,R.WORLD,2,.4,materials.dark);}
  }
  function hunter(){
    const root=new T.Group(),body=new T.Group();root.add(body);
    orb(body,0,1.55,0,.44,.58,.24,materials.cloth);box(body,0,1.1,0,.62,.3,.35,materials.pants);
    orb(body,0,2.33,0,.27,.32,.25,materials.skin);orb(body,0,2.55,.025,.28,.13,.26,detail.hair);
    orb(body,0,2.15,-.07,.22,.13,.19,detail.stubble);
    orb(body,0,2.31,-.255,.055,.075,.065,materials.skin);
    // Brows slope down towards the nose; narrowed eyes and clenched teeth read as anger.
    for(const s of [-1,1]){
      orb(body,s*.105,2.37,-.235,.075,.034,.025,detail.white);
      orb(body,s*.095,2.37,-.258,.026,.03,.014,detail.iris);
      const brow=box(body,s*.105,2.425,-.26,.17,.045,.04,detail.brow);brow.rotation.z=s*.32;
      box(body,s*.15,2.19,-.222,.11,.028,.024,detail.mouth).rotation.z=-s*.22;
    }
    box(body,0,2.205,-.245,.19,.052,.03,detail.mouth);
    box(body,0,2.21,-.263,.14,.022,.013,detail.white);
    box(body,0,1.13,-.015,.65,.09,.37,detail.belt);
    const legs=[],arms=[];
    for(const s of [-1,1]){const leg=new T.Group();leg.position.set(s*.2,1.12,0);body.add(leg);box(leg,0,-.45,0,.23,.9,.25,materials.pants);box(leg,0,-.94,-.1,.28,.16,.45,detail.shoe);box(leg,0,-1.025,-.1,.29,.035,.46,detail.sole);legs.push(leg);
      const arm=new T.Group();arm.position.set(s*.46,1.95,0);body.add(arm);box(arm,0,-.26,0,.2,.52,.24,materials.cloth);orb(arm,0,-.6,0,.12,.25,.12,materials.skin);arms.push(arm);}
    const bat=new T.Group();bat.position.set(0,-.78,0);arms[1].add(bat);segment(bat,new T.Vector3(0,0,0),new T.Vector3(0,-1.15,0),.085,materials.bat);box(bat,0,-.12,0,.12,.25,.12,materials.dark);
    return {root,animate(t,moving,attack,climbing){legs.forEach((l,i)=>l.rotation.x=moving?Math.sin(t*11+i*Math.PI)*.6:0);arms.forEach((a,i)=>{a.rotation.x=climbing?-2.6:Math.sin(t*11+i*Math.PI)*.4;});if(attack>.65)arms[1].rotation.x=-2.6+(1.1-attack)*9;body.rotation.z=moving?Math.sin(t*11)*.035:0;}};
  }
  function spider(parent){
    const root=new T.Group(),legs=[];parent.add(root);
    orb(root,0,0,.33,.32,.23,.43,detail.abdomen);
    orb(root,0,.015,-.19,.25,.18,.28,materials.spider);
    for(const s of [-1,1])for(let i=0;i<4;i++){
      const leg=new T.Group();leg.position.set(s*.18,0,-.32+i*.15);root.add(leg);
      const a=new T.Vector3(),b=new T.Vector3(s*(.5+Math.sin(i)*.12),.18,(i-1.5)*.23),c=new T.Vector3(s*(.78+Math.sin(i)*.15),-.29,(i-1.5)*.4);
      segment(leg,a,b,.05,materials.spider);orb(leg,b.x,b.y,b.z,.085,.075,.085,materials.joint);segment(leg,b,c,.035,materials.spider);
      const band=b.clone().lerp(c,.15);orb(leg,band.x,band.y,band.z,.05,.05,.05,detail.bandLight);legs.push(leg);
      if(i===0){const fang=orb(root,s*.105,-.035,-.46,.065,.1,.12,detail.fang);fang.rotation.x=-.3;}
    }
    for(let i=0;i<8;i++)orb(root,(i%4-1.5)*.07,.10+Math.floor(i/4)*.055,-.415+Math.floor(i/4)*.025,.027,.027,.022,detail.eyeSpider);
    // Sparse deterministic bristles, no textures or external assets.
    for(let i=0;i<50;i++){
      const a=i*2.39996,y=(i/49)*2-1,r=Math.sqrt(1-y*y);
      const p=new T.Vector3(Math.cos(a)*r*.31,y*.22,.33+Math.sin(a)*r*.42);
      segment(root,p,p.clone().add(new T.Vector3(Math.cos(a)*r*.045,y*.045,Math.sin(a)*r*.045)),.003,detail.hairSpider);
    }
    return {root,animate(t,moving,web){legs.forEach((l,i)=>{l.rotation.x=moving?Math.sin(t*15+i*1.6)*.20:Math.sin(t*2+i)*.02;l.rotation.z=web?(i<4?-.15:.15):0;});}};
  }
  window.SpiderModels={city,hunter,spider};
})();
