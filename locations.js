/* Enterable public locations. Classic script; no downloads or external assets. */
(function (global) {
  'use strict';
  function create(options) {
    const {THREE: T, scene, locations = [], blackoutChunkSize = 131, batchCity = false} = options || {};
    if (!T || !scene || typeof scene.add !== 'function') throw new TypeError('GameLocations requires THREE and scene');
    const root = new T.Group(); root.name = 'public-locations';
    const cube = new T.BoxGeometry(1, 1, 1), signPlane = new T.PlaneGeometry(1, 1), materials = new Map(), meshes = [];
    const colliders = [], screens = [], groups = [], fixtures = [], lamps = [], powered = [];
    const cityBatches=new Map(),powerMaterials=new Map(),fixtureCells=new Map();
    let disposed = false, clock = 0, refresh = Infinity, lastPowerKey='';
    for(let i=0;i<4;i++){const lamp=new T.PointLight(0xffdba4,0,15,2);scene.add(lamp);lamps.push(lamp);}
    function material(key, color, extra) {
      if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial(Object.assign({color, roughness: .8}, extra)));
      return materials.get(key);
    }
    // Neutral masonry, glazed ceramic, brushed steel and matte acoustic fabric.
    const concrete = material('concrete', 0x858078, {roughness: .94}), tile = material('tile', 0xb9b3a3, {roughness: .34});
    const floorMat = material('floor', 0x625f57, {roughness: .78}), dark = material('dark', 0x242522, {roughness: .88});
    const metal = material('metal', 0x96938a, {metalness: .82, roughness: .42});
    const red = material('red', 0x642f32, {roughness: .97}), wood = material('wood', 0x876247, {roughness: .67});
    const warm = material('warm', 0xf2d8a0, {emissive: 0xffcc78, emissiveIntensity: .42});
    // Safety signage stays green; it is not a window or an area-light source.
    const mint = material('mint', 0x93bc9b, {emissive: 0x69ad80, emissiveIntensity: .24});
    const screenMat = material('screen', 0xd8ccad, {roughness: .96, emissive: 0xe8d4a5, emissiveIntensity: .18});
    const safetyPaint = material('safety-paint', 0xb99b50, {roughness: .83});
    concrete.userData.surfaceStyle=1;tile.userData.surfaceStyle=2;floorMat.userData.surfaceStyle=3;
    const glyphs = {
      'М':['10001','11011','10101','10101','10001','10001','10001'],
      'Е':['11111','10000','10000','11110','10000','10000','11111'],
      'Т':['11111','00100','00100','00100','00100','00100','00100'],
      'Р':['11110','10001','10001','11110','10000','10000','10000'],
      'О':['01110','10001','10001','10001','10001','10001','01110'],
      'К':['10001','10010','10100','11000','10100','10010','10001'],
      'И':['10001','10001','10011','10101','11001','10001','10001'],
      'Н':['10001','10001','10001','11111','10001','10001','10001'],
      'А':['01110','10001','10001','11111','10001','10001','10001'],
      'С':['01111','10000','10000','10000','10000','10000','01111'],
      'В':['11110','10001','10001','11110','10001','10001','11110'],
      'Ы':['10001','10001','10001','11101','10011','10011','11101'],
      'Х':['10001','10001','01010','00100','01010','10001','10001'],
      'Д':['01110','01010','01010','01010','01010','11111','10001'],
      'П':['11111','10001','10001','10001','10001','10001','10001'],
      'Л':['00111','01001','01001','01001','10001','10001','10001'],
      'A':['01110','10001','10001','11111','10001','10001','10001'],
      'T':['11111','00100','00100','00100','00100','00100','00100'],
      'L':['10000','10000','10000','10000','10000','10000','11111'],
      'S':['01111','10000','10000','01110','00001','00001','11110'],
      'H':['10001','10001','10001','11111','10001','10001','10001'],
      'O':['01110','10001','10001','10001','10001','10001','01110'],
      'E':['11111','10000','10000','11110','10000','10000','11111'],
      'N':['10001','11001','11001','10101','10011','10011','10001'],
      'V':['10001','10001','10001','10001','10001','01010','00100']
    };
    for (const location of Array.isArray(locations) ? locations : []) {
      if (!location) continue;
      // Numeric city types and descriptive aliases share the existing schema.
      const types = ['atlas','hotel','nova','archive','cinema','metro','residential','depot'];
      const type = Number.isInteger(location.type) ? types[location.type] : location.type;
      if (!types.includes(type) && !['house','apartment','office'].includes(type)) continue;
      const {width: w, depth: d, height: h, position: p} = location;
      const angle = location.rotationY === undefined ? 0 : location.rotationY;
      // Too-small or malformed footprints are skipped rather than silently resized.
      if (!p || ![p.x,p.y,p.z,w,d,h,angle].every(Number.isFinite) || w < 12 || d < 16 || h < 5.5) continue;
      const group = new T.Group(); group.name = 'location-' + String(location.id);
      group.position.set(p.x,p.y,p.z); group.rotation.y = angle;
      if(!batchCity){root.add(group);groups.push(group);}
      const batches = new Map(), c = Math.cos(angle), s = Math.sin(angle), front = -d/2, back = d/2;
      const powerKey=Math.floor(p.x/blackoutChunkSize)+':'+Math.floor(p.z/blackoutChunkSize);
      let region='shell';
      function cityInstance(geometry,mat,a,yaw=0,part=region){
        const grid=part==='inside'?blackoutChunkSize/2:blackoutChunkSize;
        const chunk=part+':'+Math.floor(p.x/grid)+':'+Math.floor(p.z/grid);
        const key=chunk+':'+geometry.uuid+':'+mat.uuid;
        if(!cityBatches.has(key))cityBatches.set(key,{geometry,mat,items:[],chunk,grid,part});
        cityBatches.get(key).items.push([p.x+c*a[0]+s*a[2],p.y+a[1],p.z-s*a[0]+c*a[2],a[3],a[4],a[5],angle+yaw]);
      }
      // Per-location emissive copies let the existing panel blackout affect fixtures
      // and projection, without adding lights or changing the update contract.
      function poweredMaterial(key) {
        const cacheKey=powerKey+':'+key;
        if(batchCity&&powerMaterials.has(cacheKey))return powerMaterials.get(cacheKey);
        const mat = materials.get(key).clone();
        powered.push({mat, position: group.position, intensity: mat.emissiveIntensity, screen: key === 'screen'});
        if(batchCity)powerMaterials.set(cacheKey,mat);
        return mat;
      }
      const warm = poweredMaterial('warm'), mint = poweredMaterial('mint'), screenMat = poweredMaterial('screen');
      function box(x,y,z,bw,bh,bd,mat,solid = true,visual = null,flags = null) {
        if (bw <= 0 || bh <= 0 || bd <= 0) return;
        if (!batches.has(mat)) batches.set(mat, []);
        // Visual-only corner trimming must not change the established collider AABBs.
        batches.get(mat).push([...(visual || [x,y,z,bw,bh,bd]),region]);
        if (solid) {
          // A rotated long wall's single enclosing AABB would seal its doorway.
          // Tile collision volumes for non-cardinal placement; each tile encloses
          // only its own visible portion (at most .57m corner overreach).
          const tilted = Math.abs(c*s) > 1e-7;
          const nx = tilted ? Math.ceil(bw/.8) : 1, nz = tilted ? Math.ceil(bd/.8) : 1;
          const tw = bw/nx, td = bd/nz;
          const ex = (Math.abs(c)*tw + Math.abs(s)*td)/2, ez = (Math.abs(s)*tw + Math.abs(c)*td)/2;
          for (let ix=0;ix<nx;ix++) for (let iz=0;iz<nz;iz++) {
            const lx = x-bw/2+(ix+.5)*tw, lz = z-bd/2+(iz+.5)*td;
            const wx = p.x+c*lx+s*lz, wz = p.z-s*lx+c*lz;
            colliders.push({parent:location.id,...flags,min:{x:wx-ex,y:p.y+y-bh/2,z:wz-ez},max:{x:wx+ex,y:p.y+y+bh/2,z:wz+ez}});
          }
        }
      }
      function slab(x,z,bw,bd,top,mat = floorMat) {
        // Basement slabs must not expose coplanar edges through the shell.
        // Keep the street threshold and roof outline, and all collision volumes.
        const inset = top < 0 || metro && top === 0 ? .28 : 0;
        const left = Math.max(x-bw/2,-w/2+inset), right = Math.min(x+bw/2,w/2-inset);
        const rear = Math.min(z+bd/2,back-inset), near = top < 0 ? Math.max(z-bd/2,front+inset) : z-bd/2;
        box(x,top-.12,z,bw,.24,bd,mat,true,[(left+right)/2,top-.12,(near+rear)/2,right-left,.24,rear-near]);
      }
      function label(text,x,y,z,bw,mat = mint,facing = 1) {
        // facing=1 looks out toward -Z: screen-right is local -X.
        // FrontSide planes have no mirrored reverse; the opaque board hides them behind.
        const unit = Math.min(bw/(text.length*6), .11), total = (text.length*6-1)*unit;
        box(x,y,z+facing*.065,total+.32,7*unit+.25,.1,dark,false);
        const pixels = [];
        Array.from(text).forEach((ch,i) => (glyphs[ch] || []).forEach((row,r) => {
          for (let col=0;col<5;col++) if (row[col]==='1') pixels.push([
            x-facing*(-total/2+(i*6+col+.5)*unit),y+(3-r)*unit]);
        }));
        if (!pixels.length) return;
        if(batchCity){for(const v of pixels)cityInstance(signPlane,mat,[v[0],v[1],z,unit*.87,unit*.87,1],facing===1?Math.PI:0);return;}
        const mesh = new T.InstancedMesh(signPlane,mat,pixels.length), t = new T.Object3D();
        pixels.forEach((v,i) => {
          t.position.set(v[0],v[1],z); t.rotation.y = facing===1 ? Math.PI : 0;
          t.scale.set(unit*.87,unit*.87,1); t.updateMatrix(); mesh.setMatrixAt(i,t.matrix);
        });
        mesh.computeBoundingSphere(); mesh.matrixAutoUpdate=false; group.add(mesh); meshes.push(mesh);
      }
      function fixture(x,y,z,bw = 1.8) {
        box(x,y,z,bw,.12,.32,metal,false); box(x,y-.075,z,bw-.12,.045,.23,warm,false);
      }
      function light(x,y,z,color,intensity,range) {
        // Hard global budget: fixtures beyond four lights remain emissive only.
        const f={position:new T.Vector3(p.x+c*x+s*z,p.y+y,p.z-s*x+c*z),powerPosition:group.position,color,intensity,range};
        fixtures.push(f);
        const key=Math.floor(f.position.x/25)+':'+Math.floor(f.position.z/25);
        if(!fixtureCells.has(key))fixtureCells.set(key,[]);fixtureCells.get(key).push(f);
      }
      function bench(x,y,z,bw = 2.3) {
        box(x,y+.48,z,bw,.18,.65,wood); box(x,y+.94,z+.27,bw,.74,.12,wood);
        for (const side of [-1,1]) box(x+side*(bw/2-.2),y+.2,z,.12,.4,.5,metal);
      }
      const metro = type === 'metro', cinema = type === 'cinema', depot = type === 'depot';
      const multiStorey = !metro && !cinema && !depot;
      const base = metro ? -3.2 : 0, thickness = .28;
      // Floor/roof owns the top surface; walls terminate at its underside.
      const wallHeight = multiStorey ? h-.24 : h;
      box(-w/2+thickness/2,(wallHeight+base)/2,0,thickness,wallHeight-base,d,concrete);
      box(w/2-thickness/2,(wallHeight+base)/2,0,thickness,wallHeight-base,d,concrete);
      box(0,(wallHeight+base)/2,back-thickness/2,w,wallHeight-base,thickness,concrete,true,
        [0,(wallHeight+base)/2,back-thickness/2,w-2*thickness,wallHeight-base,thickness]);
      const entrance = 4, doorHeight = 3.6;
      for (const side of [-1,1]) box(side*(w/4+entrance/4),wallHeight/2,front+thickness/2,(w-entrance)/2,wallHeight,thickness,tile,true,
        [side*(w/4+entrance/4-thickness/2),wallHeight/2,front+thickness/2,(w-entrance)/2-thickness,wallHeight,thickness]);
      box(0,(wallHeight+doorHeight)/2,front+thickness/2,entrance,wallHeight-doorHeight,thickness,concrete);
      if (!multiStorey) box(0,h+.12,0,w,.24,d,concrete);
      // External canopy is overhead; no threshold across the four-metre opening.
      box(0,3.85,front-.6,6,.18,1.5,metal);
      const names = {atlas:'ATLAS',hotel:'HOTEL',nova:'NOVA',archive:'АРХИВ',cinema:'КИНО',metro:'МЕТРО',residential:'СЕВЕР',depot:'ДЕПО',house:'ДОМ',apartment:'ДОМ',office:'АРХИВ'};
      label(names[type],0,4.65,front-.08,6,metro?mint:warm);
      fixture(0,3.7,front-.4,3);
      light(-w/2-2,5.2,front-2,0xffd6a5,70,18);
      region='inside';
      if (metro) {
        // Retaining wall below the street doorway closes the basement shell,
        // while its top stays below the entrance landing's underside.
        box(0,-1.72,front+thickness/2,w,2.96,thickness,concrete,true,
          [0,-1.72,front+thickness/2,w-2*thickness,2.96,thickness]);
        const stairStart = front+1, stairEnd = stairStart+6.4, stairWidth = 4;
        // The full landing reaches the street; the centre floor stops at the first riser.
        slab(0,front+.5,w,1,0,tile);
        for (const side of [-1,1]) slab(side*(w/4+1), (stairStart+stairEnd)/2,(w-stairWidth)/2,6.4,0,tile);
        // Split the lower floor around the treads: every riser has one surface,
        // including the final tread, with no coplanar floor hidden underneath.
        for (const side of [-1,1]) slab(side*(w/4+1),(stairStart+stairEnd)/2,(w-4)/2,6.4,-3.2,tile);
        slab(0,(stairEnd+back)/2,w,back-stairEnd,-3.2,tile);
        for (let i=0;i<16;i++) {
          const top = -(i+1)*.2, z = stairStart+(i+.5)*.4;
          box(0,(-3.44+top)/2,z,stairWidth,top+3.44,.4,concrete);
          box(0,top+.006,z-.165,stairWidth,.012,.055,safetyPaint,false);
          // Discrete handrail sections mirror the treads and their AABBs.
          for (const side of [-1,1]) {
            box(side*2.08,top+.56,z,.09,1.12,.09,metal,true,null,{noClimb:true,kind:'stairGuard'});
            box(side*2.08,top+1.1,z,.12,.1,.4,metal,true,null,{noClimb:true,kind:'stairGuard'});
          }
        }
        // Low guards keep the upper side galleries away from the open basement edge.
        for (const side of [-1,1]) box(side*(w/4+1),.55,stairEnd,(w-4)/2,1.1,.14,metal,true,
          [side*(w/4+1-thickness/2),.55,stairEnd,(w-4)/2-thickness,1.1,.14]);
        // Basement wall dado, broad concourse and ticket machines outside the stair axis.
        box(-w/2+.31,-2.45,0,.06,1.5,d-.6,tile,false);
        box(w/2-.31,-2.45,0,.06,1.5,d-.6,tile,false);
        for (const side of [-1,1]) {
          const x = side*(w/2-1.1), z = Math.min(back-2,stairEnd+1.4);
          box(x,-2.22,z,1.05,1.96,.65,metal);
          box(x,-1.9,z-.35,.62,.5,.06,mint,false);
          box(x,-2.47,z-.35,.48,.08,.05,dark,false);
          bench(side*(w/2-1.7),-3.2,back-1.25,2.2);
        }
        label('КАССА',-w/2+2.2,-.75,back-.32,3.3);
        label('ВЫХОД',0,2.75,front+.45,3.4,mint,-1);
        for (let z=front+2;z<back-1;z+=4) {fixture(0,Math.min(h-.3,3.5),z);}
        // Static tile seams are batched with their material, not separate draw calls.
        for (let z=stairEnd+.6;z<back-.4;z+=1.2) box(0,-3.195,z,w-.6,.008,.018,dark,false);
        light(0,2,stairStart+2,0xffdba4,30,13);
        light(0,.3,(stairEnd+back)/2,0xffd39a,35,15);
      } else if (depot) {
        slab(0,0,w,d,0);
        // A central service aisle, work bays and a rear staff room; no fictitious rails.
        const partition = back-4, passage = 3.4;
        for (const side of [-1,1]) {
          box(side*(w/4+passage/4),1.65,partition,(w-passage)/2,3.3,.24,concrete,true,
            [side*(w/4+passage/4-thickness/2),1.65,partition,(w-passage)/2-thickness,3.3,.24]);
          for (let z=front+3;z<partition-1;z+=3.4) {
            const x = side*(w/2-1.3);
            box(x,.48,z,1.8,.96,1.8,metal);
            box(x,1,z,1.9,.08,1.9,wood);
            box(side*(w/2-.48),1.95,z,.4,1.7,1.6,dark);
            box(side*3.1,.008,z,.08,.016,2.5,safetyPaint,false);
          }
          bench(side*(w/2-2),0,back-1.1,2.4);
          fixture(side*(w/4),Math.min(h-.4,4),0,2.5);
        }
        box(0,3.45,partition,w,.3,.24,concrete,true,[0,3.45,partition,w-2*thickness,.3,.24]);
        label('ВЫХОД',0,2.85,front+.4,3.4,mint,-1);
        light(0,3,0,0xffdba4,32,16);
      } else if (multiStorey) {
        // Shared residential/office core. Coordinates are documented here for shell integration:
        // floor/roof hole: x [-2.6,2.6], z [a,end]; front landing z <= a.
        // U-turn landing joins two 2.3m flights; no floor bridges the stairwell.
        const levels = Math.max(1,Math.floor(h/3.6)), rise = h/levels;
        const steps = Math.ceil(rise/2/.22), tread = .32, run = steps*tread;
        const a = front+4, b = a+run, end = b+1.5, well = 5.2;
        slab(0,0,w,d,0);
        function landingGuard(x,z,bw,bd,top) {
          // A full-height solid skirt, not sparse bars a small spider can slip
          // through. Keep the two stair mouths and the U-turn route open.
          box(x,top+.66,z,bw,1.32,bd,concrete,true,[x,top+.61,z,bw,1.22,bd],{noClimb:true,kind:'landingGuard'});
          box(x,top+1.27,z,bw+.02,.1,bd,metal,false);
        }
        function guardEdges(top,start,finish) {
          for(const side of [-1,1])landingGuard(side*(well/2+.09),(start+finish)/2,.18,finish-start+.18,top);
          landingGuard(0,finish+.09,well+.36,.18,top);
        }
        function openFloor(top) {
          // Intermediate slabs stop at the shell's inner face; their side faces
          // must not coincide with the exterior walls. The roof fills the outline.
          const inset = Math.abs(top-h)<1e-6 ? 0 : thickness;
          const half = w/2-inset, zf = front+inset, zb = back-inset;
          for (const side of [-1,1]) slab(side*(half+well/2)/2,(zf+zb)/2,half-well/2,zb-zf,top);
          slab(0,(zf+a)/2,well,a-zf,top);
          slab(0,(end+zb)/2,well,zb-end,top);
          // Galleries on every intermediate floor overlook the entire hole.
          // The roof already has a closed access enclosure on these 3 edges.
          if(top<h-.001)guardEdges(top,a,end);
        }
        for (let level=0;level<levels;level++) {
          const y = level*rise;
          region=level===levels-1?'shell':'inside';openFloor(y+rise);region='inside';
          for (let i=0;i<steps;i++) {
            const top1 = y+(i+1)*rise/(2*steps);
            const top2 = y+rise/2+(i+1)*rise/(2*steps);
            box(-1.35,top1-.13,a+(i+.5)*tread,2.3,.26,tread,concrete);
            box(1.35,top2-.13,b-(i+.5)*tread,2.3,.26,tread,concrete);
            // Painted nosings sit above the concrete; they are not luminous fixtures.
            box(-1.35,top1+.006,a+i*tread+.025,2.3,.012,.04,safetyPaint,false);
            box(1.35,top2+.006,b-i*tread-.025,2.3,.012,.04,safetyPaint,false);
            for (const lane of [-1,1]) {
              const top = lane<0 ? top1 : top2, z = lane<0 ? a+(i+.5)*tread : b-(i+.5)*tread;
              // Solid stair skirts have a visible continuous cap. They block
              // sideways walking but never trigger the spider's wall-grab.
              box(lane*2.55,top+.47,z,.18,.94,tread,concrete,true,[lane*2.55,top+.43,z,.14,.86,tread],{noClimb:true,kind:'stairGuard'});
              box(lane*2.55,top+.90,z,.18,.08,tread,metal,false);
            }
          }
          slab(0,(b+end)/2,well,1.5,y+rise/2,concrete);
          guardEdges(y+rise/2,b,end);
          // Central divider prevents a fall between flights without sealing either landing.
          box(0,y+rise/2,(a+b)/2,.22,rise,run,concrete,true,null,{noClimb:true,kind:'stairGuard'});
          fixture(0,y+Math.min(rise-.35,2.9),front+2,1.8);
          light(0,y+2,front+2,0xffdba4,16,7);
          if (level>0) {
            for (const side of [-1,1]) {
              const x = side*(w/2-1.8);
              box(x,y+.65,front+.6,1.5,1.3,.55,wood);
            }
          }
        }
        // Roof access enclosure owns only the hole, not a solid roof over the stairs.
        region='shell';
        const cap = h+3.1, wallTop = cap-.2;
        for (const side of [-1,1]) box(side*(well/2+.14),(h+wallTop)/2,(a+end)/2,.28,wallTop-h,end-a+.56,concrete);
        box(0,(h+wallTop)/2,end+.14,well,wallTop-h,.28,concrete);
        // Wide open exit aligns with BOTH lanes and the roof landing.
        box(0,h+2.75,a-.14,well,.3,.28,concrete);
        box(0,cap-.1,(a+end)/2,well+.56,.2,end-a+.56,concrete);
        // Mount outside the lintel, with the complete lettering below it.
        // The old sign was behind the beam and its top rows were occluded.
        label('ВЫХОД',0,h+2.13,a-.31,3.2,mint);
        label('ВЫХОД',0,2.8,front+.4,3.2,mint,-1);
      } else {
        slab(0,0,w,d,0);
        const partition = front+5.3, passage = 3.4;
        // Acoustic vestibule wall: a genuine unobstructed door into the auditorium.
        for (const side of [-1,1]) box(side*(w/4+passage/4),h/2,partition,(w-passage)/2,h,.26,red,true,
          [side*(w/4+passage/4-thickness/2),h/2,partition,(w-passage)/2-thickness,h,.26]);
        box(0,(h+3.4)/2,partition,passage,h-3.4,.26,red);
        label('КИНО',0,3.9,partition-.16,3.1,warm);
        // Ticket counter and refreshments sit to the left; right side is a waiting area.
        const counterX = -w/2+2.1, counterZ = front+2.8;
        box(counterX,.57,counterZ,2.8,1.14,.85,wood);
        box(counterX,1.18,counterZ,3,.1,1,metal);
        for (const offset of [-.7,.7]) {
          box(counterX+offset,1.42,counterZ,.42,.4,.28,dark);
          box(counterX+offset,1.45,counterZ-.15,.32,.21,.025,mint,false);
        }
        label('КАССА',counterX,2.8,front+.32,3.2,warm,-1);
        bench(w/2-2,0,front+2.5,2.3);
        // Flat auditorium keeps aisles accessible; rows never bridge the centre aisle.
        const aisle = 2.4, rows = Math.min(7,Math.floor((back-partition-4)/1.35));
        const seatColumns = Math.min(6,Math.floor((w/2-aisle/2-1)/.82));
        for (let row=0;row<rows;row++) for (const side of [-1,1]) for (let col=0;col<seatColumns;col++) {
          const x = side*(aisle/2+.48+col*.82), z = partition+2+row*1.35;
          box(x,.45,z,.65,.2,.7,red); box(x,.88,z-.31,.68,.85,.17,red);
          box(x,.2,z,.16,.4,.4,metal);
          for (const arm of [-1,1]) box(x+arm*.35,.69,z,.08,.12,.65,wood);
        }
        // Screen and stage are real physical surfaces at the back, clear of the aisles.
        box(0,.18,back-1.1,w-1,.36,1.5,dark);
        const screenWidth = Math.min(w-2.5,10), screenHeight = Math.min(h-1.8,4.5);
        box(0,1.15+screenHeight/2,back-.48,screenWidth+.3,screenHeight+.3,.22,dark);
        box(0,1.15+screenHeight/2,back-.62,screenWidth,screenHeight,.045,screenMat,false);
        screens.push(screenMat);
        // Curtains flank rather than cover the projection surface.
        for (const side of [-1,1]) box(side*(w/2-.65),h/2,back-.65,.6,h-.4,.5,red);
        box(0,h-.6,partition+.5,.85,.65,.8,dark);
        box(0,h-.6,partition+1,.32,.24,.2,metal,false);
        label('ВЫХОД',0,2.9,front+.4,3.2,mint,-1);
        for (const side of [-1,1]) {
          fixture(side*(w/2-.55),2.3,(partition+back)/2,.55);
          box(side*(aisle/2-.08),.012,(partition+back-2)/2,.05,.022,back-partition-2,mint,false);
        }
        fixture(0,Math.min(h-.3,3.7),front+2.5,2.4);
        light(0,3,front+2.6,0xffd2a0,32,10);
        light(0,2.8,back-2,0xffd9a6,18,12);
      }
      const transform = new T.Object3D();
      for (const [mat, items] of batches) {
        if(batchCity){for(const a of items)cityInstance(cube,mat,a,0,a[6]);continue;}
        const mesh = new T.InstancedMesh(cube,mat,items.length); mesh.name = group.name+'-batch';
        items.forEach((a,i) => {transform.position.set(a[0],a[1],a[2]);transform.scale.set(a[3],a[4],a[5]);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);});
        mesh.computeBoundingSphere(); mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
        group.add(mesh); meshes.push(mesh);
      }
      group.userData.cullRadius = Math.hypot(w,d)/2;
      group.updateMatrix(); group.matrixAutoUpdate = false;
    }
    if(batchCity){
      const chunks=new Map(),transform=new T.Object3D();
      for(const {geometry,mat,items,chunk,grid,part} of cityBatches.values()){
        if(!chunks.has(chunk)){
          const g=new T.Group(),coords=chunk.split(':').slice(1).map(Number);g.name='interior-chunk-'+chunk;
          g.userData.cullCentre={x:(coords[0]+.5)*grid,z:(coords[1]+.5)*grid};g.userData.cullRadius=grid*.72+20;
          g.userData.drawDistance=part==='inside'?80:350;root.add(g);groups.push(g);chunks.set(chunk,g);
        }
        const mesh=new T.InstancedMesh(geometry,mat,items.length);
        for(let i=0;i<items.length;i++){
          const a=items[i];transform.position.set(a[0],a[1],a[2]);transform.scale.set(a[3],a[4],a[5]);transform.rotation.set(0,a[6],0);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
        }
        mesh.computeBoundingSphere();mesh.matrixAutoUpdate=false;chunks.get(chunk).add(mesh);meshes.push(mesh);
      }
      // Structural shells/roofs retain full fog distance. Enclosed furnishings
      // and flights use a separate local budget, not all 2304 interiors at once.
      cityBatches.clear();
    }
    root.updateMatrix(); scene.add(root); root.updateMatrixWorld(true);
    return {
      colliders,
      update(deltaSeconds,elapsedSeconds,camera,blackout,dark = 1) {
        if (disposed) return;
        // A building has one electrical feed: its luminous surfaces and real lights
        // must agree at the blackout boundary, regardless of the fixture's offset.
        const powerOff = position => !!blackout && Math.floor(position.x/blackoutChunkSize)===Math.floor(blackout.x/blackoutChunkSize) && Math.floor(position.z/blackoutChunkSize)===Math.floor(blackout.z/blackoutChunkSize);
        lamps.forEach(lamp => {lamp.intensity=0;});
        if(camera){
          for(const g of groups){const c=g.userData.cullCentre||g.position;g.visible=Math.hypot(c.x-camera.position.x,c.z-camera.position.z)<(g.userData.drawDistance||350)+g.userData.cullRadius;}
          // Unpowered fixtures must not consume the four-light budget near a live building.
          const closest=[],cx=Math.floor(camera.position.x/25),cz=Math.floor(camera.position.z/25);
          for(let z=cz-1;z<=cz+1;z++)for(let x=cx-1;x<=cx+1;x++)for(const f of fixtureCells.get(x+':'+z)||[]){
            if(powerOff(f.powerPosition)&&dark>=1)continue;
            const d=f.position.distanceToSquared(camera.position);if(d>=625)continue;
            let i=0;while(i<closest.length&&closest[i].d<=d)i++;closest.splice(i,0,{f,d});if(closest.length>4)closest.pop();
          }
          lamps.forEach((lamp,i)=>{const a=closest[i];if(a){const f=a.f;lamp.position.copy(f.position);lamp.color.setHex(f.color);lamp.distance=f.range;lamp.intensity=f.intensity*(powerOff(f.powerPosition)?1-dark:1);}});
        }
        if (Number.isFinite(elapsedSeconds)) clock = elapsedSeconds;
        else if (Number.isFinite(deltaSeconds)) clock += Math.max(0,deltaSeconds);
        // Emission and fixtures share the facade's chunk and fade.
        // Ordinary painted surfaces remain visible in ambient light when power is off.
        refresh+=Math.max(0,deltaSeconds||0);
        const powerKey=blackout?Math.floor(blackout.x/blackoutChunkSize)+':'+Math.floor(blackout.z/blackoutChunkSize)+':'+dark.toFixed(2):'';
        if(refresh<.1&&powerKey===lastPowerKey)return;
        refresh=0;lastPowerKey=powerKey;
        for (const entry of powered) {
          const off = powerOff(entry.position);
          const variation = entry.screen ? 1+.035*Math.sin(clock*.6) : 1;
          entry.mat.emissiveIntensity = entry.intensity*variation*(off ? 1-.95*dark : 1);
        }
      },
      dispose() {
        if (disposed) return; disposed = true;
        if (root.parent) root.parent.remove(root);
        meshes.forEach(mesh => {if (typeof mesh.dispose === 'function') mesh.dispose();});
        cube.dispose(); signPlane.dispose(); materials.forEach(mat => mat.dispose());
        powered.forEach(entry => entry.mat.dispose()); powered.length = 0;
        meshes.length = 0; screens.length = 0; colliders.length = 0;
        lamps.forEach(l=>scene.remove(l));root.clear();
      }
    };
  }
  global.GameLocations = {create};
})(window);
