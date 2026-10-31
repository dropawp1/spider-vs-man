const assert = require('node:assert/strict');
const R = require('./physics.js');
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
function advance(g,input,seconds){for(let i=0;i<Math.ceil(seconds*120);i++)R.step(g,input,1/120);}
function safe(){const g=R.createGame();g.hunter.x=120;g.hunter.z=120;return g;}
function nearWall(){const g=safe(),b=R.buildings[0];Object.assign(g.player,{x:b.x-g.player.r,y:g.player.r,z:b.z+b.d/2});return {g,b};}
test('2304 buildings with eight types and different heights',()=>{assert.equal(R.buildings.length,2304);assert.equal(new Set(R.buildings.map(b=>b.type)).size,8);assert.ok(new Set(R.buildings.map(b=>b.h)).size>20);});
test('new game has three hearts and ten minute target',()=>{const g=R.createGame();assert.equal(g.hp,3);assert.equal(g.elapsed,0);assert.equal(R.DURATION,600);});
test('spawn outside buildings and stable on ground',()=>{const g=safe();advance(g,{},1);assert.equal(g.player.y,g.player.r);for(const b of R.buildings)assert.ok(!(g.player.x>b.x&&g.player.x<b.x+b.w&&g.player.z>b.z&&g.player.z<b.z+b.d));});
test('movement follows camera yaw',()=>{const a=safe(),b=safe();advance(a,{},.5);advance(b,{},.5);advance(a,{forward:true},.2);advance(b,{forward:true,yaw:Math.PI/2},.2);assert.ok(a.player.z<-.35);assert.ok(b.player.x<-.35);});
test('diagonal movement not faster',()=>{const a=safe(),b=safe();advance(a,{forward:true},.1);advance(b,{forward:true,right:true},.1);assert.ok(Math.abs(Math.hypot(a.player.x,a.player.z)-Math.hypot(b.player.x,b.player.z))<1e-6);});
test('solid walls block motion',()=>{const {g,b}=nearWall();advance(g,{right:true},.3);assert.equal(g.player.x,b.x-g.player.r);});
test('spider climbs without web and mounts roof',()=>{const {g,b}=nearWall();advance(g,{forward:true,yaw:-Math.PI/2},b.h/7+1);assert.equal(g.web,null);assert.ok(g.player.y>=b.h+g.player.r-.05);assert.ok(g.player.x>b.x);});
test('wall jump pushes away',()=>{const {g,b}=nearWall();advance(g,{jump:true},1/120);assert.ok(g.player.vy>0);assert.ok(g.player.x<b.x-g.player.r);});
test('fall lands on solid roof',()=>{const g=safe(),b=R.buildings[0];Object.assign(g.player,{x:b.x+b.w/2,z:b.z+b.d/2,y:b.h+4});advance(g,{},1);assert.equal(g.player.y,b.h+g.player.r);assert.equal(g.player.grounded,true);});
test('web finds nearest surface and rope is shorter than the distance',()=>{const {g,b}=nearWall();g.player.x-=7;const hit=R.shootWeb(g,{x:1,y:.4,z:0});assert.equal(hit,true);assert.equal(g.web.x,b.x);assert.ok(g.web.len>=4&&g.web.len<Math.hypot(g.web.x-g.player.x,g.web.y-g.player.y,g.web.z-g.player.z));const before=Math.hypot(g.web.x-g.player.x,g.web.y-g.player.y);advance(g,{},.1);assert.ok(Math.hypot(g.web.x-g.player.x,g.web.y-g.player.y)<before);g.web=null;advance(g,{},.1);assert.equal(g.web,null);});
function swinger(){const g=safe();Object.assign(g.player,{x:24,y:110,z:0});g.web={x:0,y:128,z:0,len:30};return g;}
test('strong auto reeling crosses under anchor on a shrinking swing',()=>{const g=swinger();let minX=99,maxD=0;for(let i=0;i<420;i++){R.step(g,{},1/120);minX=Math.min(minX,g.player.x);maxD=Math.max(maxD,Math.hypot(g.player.x-g.web.x,g.player.y-g.web.y,g.player.z-g.web.z));}assert.ok(minX<-5,'swing crosses anchor despite shorter rope: '+minX);assert.equal(g.web.len,3);assert.ok(maxD<30.8,'no explosive stretch: '+maxD);});
test('release at the bottom of the swing keeps momentum',()=>{const g=swinger();advance(g,{},1.75);assert.ok(Math.abs(g.player.vx)>10);g.web=null;advance(g,{},.3);assert.ok(Math.abs(g.player.vx)>8,'momentum after release: '+g.player.vx);});
test('reel shortens rope and air steering changes direction',()=>{const g=swinger();advance(g,{reel:true},1);assert.ok(g.web.len<15);const a=swinger(),b=swinger();advance(a,{},.5);advance(b,{right:true},.5);assert.ok(b.player.x>a.player.x);});
test('on the ground momentum stops without web',()=>{const g=safe();g.player.y=g.player.r;g.player.grounded=true;g.player.vx=15;advance(g,{},.2);assert.equal(g.player.vx,0);});
test('hunter winds up then lunges much faster than walking',()=>{const g=safe();Object.assign(g.player,{x:0,z:0});Object.assign(g.hunter,{x:0,z:6});let wound=false,top=0;for(let i=0;i<150;i++){g.invulnerable=9;R.step(g,{},1/120);if(g.hunter.windup>0)wound=true;top=Math.max(top,Math.hypot(g.hunter.vx,g.hunter.vz));}assert.ok(wound,'telegraph');assert.ok(top>12&&top<15,'reduced lunge speed '+top);});
test('bat hit cuts the web and shortens attack cooldown',()=>{const g=swinger();g.web={x:24,y:88,z:0,len:30};Object.assign(g.hunter,{x:g.player.x,y:g.player.y,z:g.player.z});advance(g,{},1/120);assert.equal(g.web,null);assert.equal(g.hp,2);});
test('sky and zero vector miss; ray respects range',()=>{const g=safe();assert.equal(R.shootWeb(g,{x:0,y:1,z:0}),false);assert.equal(R.aim(g,{x:0,y:0,z:0}),null);assert.equal(R.rayBox({x:-200,y:2,z:-110},{x:1,y:0,z:0},R.buildings[0],20),null);});
test('hunter pursues in 3D and climbs obstruction',()=>{const {g,b}=nearWall();Object.assign(g.hunter,{x:b.x-g.hunter.r,y:g.hunter.r,z:b.z+b.d/2});Object.assign(g.player,{x:b.x+b.w+3,y:b.h+g.player.r,z:b.z+b.d/2});let climbed=false;for(let i=0;i<120;i++){R.step(g,{},1/120);climbed=climbed||g.hunter.climbing;}assert.ok(g.hunter.y>4);assert.equal(climbed,true);});
test('bat cooldown then defeat; terminal state freezes',()=>{const g=R.createGame();Object.assign(g.hunter,{x:0,z:0});advance(g,{},.1);assert.equal(g.hp,2);advance(g,{},.2);assert.equal(g.hp,2);for(let i=0;i<1000&&g.state==='playing';i++){Object.assign(g.hunter,{x:g.player.x,y:g.player.y,z:g.player.z});R.step(g,{},1/120);}assert.equal(g.state,'lost');assert.equal(g.hp,0);const elapsed=g.elapsed;advance(g,{forward:true},1);assert.equal(g.elapsed,elapsed);});
test('world boundaries constrain both horizontal axes',()=>{const g=safe();Object.assign(g.player,{x:R.WORLD/2-1,y:100,z:R.WORLD/2-1});advance(g,{back:true,right:true},1);assert.ok(g.player.x<=R.WORLD/2-g.player.r);assert.ok(g.player.z<=R.WORLD/2-g.player.r);});
test('ten minute simulation with evasive relocation reaches victory',()=>{const g=safe();for(let i=0;i<72002&&g.state==='playing';i++){if(Math.hypot(g.player.x-g.hunter.x,g.player.z-g.hunter.z)<30){g.player.x=g.hunter.x>0?-125:125;g.player.z=0;g.player.y=60;g.player.vy=0;}R.step(g,{},1/120);}assert.equal(g.state,'won');assert.equal(g.elapsed,600);assert.equal(g.hp,3);const x=g.player.x;advance(g,{right:true},1);assert.equal(g.player.x,x);});
test('real attachment from rest launches and swings without input',()=>{
  const g=safe(),b=R.buildings.find(b=>b.h>55);
  assert.ok(b);Object.assign(g.player,{x:b.x-7,y:b.h-20,z:b.z+b.d/2});
  assert.ok(R.shootWeb(g,{x:7,y:19,z:0}));
  const start={...g.player},len=g.web.len;
  assert.ok(Math.hypot(start.vx,start.vy,start.vz)>20,'strong initial launch');
  advance(g,{},.5);
  assert.ok(g.web.len<len,'automatic reeling without Shift');
  assert.ok(Math.hypot(g.player.x-start.x,g.player.y-start.y,g.player.z-start.z)>3,'moves without WASD');
  assert.ok(Math.hypot(g.player.vx,g.player.vy,g.player.vz)<=42.001,'bounded speed');
});
test('vertical rope automatically starts lateral swing from rest',()=>{
  const g=safe();Object.assign(g.player,{x:0,y:60,z:0});
  g.web={x:0,y:85,z:0,len:25,minLen:20,tx:1,ty:0,tz:0};advance(g,{},1);
  assert.ok(Math.abs(g.player.x)>2,'no dead vertical hanging');
  for(const key of ['x','y','z','vx','vy','vz'])assert.ok(Number.isFinite(g.player[key]));
});
const S=require('./story.js');
test('radio follows all story milestones and expires between them',()=>{
  for(const at of [0,120,300,480,600]){assert.equal(S.radioAt(at).at,at);assert.ok(S.radioAt(at+1).text.length>20);}
  for(const at of [20,119.9,140,320,500,621])assert.equal(S.radioAt(at),null);
  assert.equal(S.radioAt(R.createGame().elapsed).at,0,'restart restores introduction');
});
const C=require('./camera.js');
test('first-person camera stays at player and chase camera is behind',()=>{
  const p={x:0,y:3,z:0};assert.deepEqual(C.pose(p,0,0,false,[]),p);
  const c=C.pose(p,0,0,true,[]);assert.equal(c.z,5.5);assert.equal(c.y,3.65);
  const side=C.pose(p,Math.PI/2,0,true,[]);assert.ok(side.x>5);
});
test('chase camera stops before buildings and never goes below ground',()=>{
  const p={x:0,y:1,z:0},b={x:-2,z:2,w:4,d:3,h:8};
  const c=C.pose(p,0,0,true,[b]);assert.ok(c.z<1.8&&c.z>1);
  const ground=C.pose(p,0,1.4,true,[]);assert.ok(ground.y>=.2199);
  const near=C.pose({x:0,y:1,z:1.9},0,0,true,[b]);assert.equal(near.z,1.9);
});
test('third-person aim converges on crosshair surface, web still obeys player obstruction',()=>{
  const p={x:0,y:5,z:0},b={x:-2,z:-12,w:4,d:2,h:20};
  const o=C.pose(p,0,0,true,[b]),d=C.aim(p,o,C.direction(0,0),[b],95);
  const n=Math.hypot(d.x,d.y,d.z),hit=R.rayBox(p,{x:d.x/n,y:d.y/n,z:d.z/n},b);
  assert.ok(hit>0);assert.ok(Math.abs(p.y+d.y/n*hit-o.y)<1e-8);
  assert.ok(Math.abs(p.z+d.z/n*hit+10)<1e-8);
});
test('active web never touches ground with low and high anchors or downward velocity',()=>{
  for(const height of [.1,1,8,35]){
    const g=safe();Object.assign(g.player,{x:0,y:.55,z:0,vy:-38});
    g.web={x:0,y:height,z:10,len:25,minLen:4,tx:1,ty:0,tz:0};
    for(let i=0;i<1200;i++){g.invulnerable=10;R.step(g,{reel:i>600},1/120);assert.ok(g.player.y-g.player.r>=2-1e-8);assert.equal(g.player.grounded,false);}
  }
});
test('shooting low web lifts immediately and release permits landing',()=>{
  const {g}=nearWall();g.player.x-=7;assert.ok(R.shootWeb(g,{x:1,y:0,z:0}));
  assert.ok(g.player.y-g.player.r>=2-1e-8);advance(g,{},.3);g.web=null;advance(g,{},4);assert.equal(g.player.grounded,true);
});
test('walking off roof does not reattach or teleport sideways',()=>{
  const {g,b}=nearWall(),p=g.player;Object.assign(p,{x:b.x+.2,y:b.h+p.r,z:b.z+b.d/2,grounded:true});
  let previous=p.x,left=false;
  for(let i=0;i<90;i++){R.step(g,{left:true},1/120);assert.ok(Math.abs(p.x-previous)<=38/120+.001,'no edge snap');previous=p.x;if(p.y<b.h+p.r-.06){left=true;assert.equal(p.climbing,false);assert.ok(p.vy<0);}}
  assert.ok(left);assert.ok(p.x<b.x-3);
});
test('standing beside wall does not arrest a fall or capture outward momentum',()=>{
  const {g}=nearWall();Object.assign(g.player,{y:5,vy:-4,vx:-10,fly:true});R.step(g,{},1/120);
  assert.equal(g.player.climbing,false);assert.ok(g.player.vy<-4);assert.ok(g.player.vx<-9);
});
test('pointer warps are ignored but ordinary mouse movement remains responsive',()=>{
  assert.deepEqual(C.look(1,.2,900,-400),{yaw:1,pitch:.2});assert.deepEqual(C.look(1,.2,NaN,0),{yaw:1,pitch:.2});
  const a=C.look(1,.2,20,-10);assert.equal(a.yaw,.95);assert.equal(a.pitch,.225);
});
test('hunter walking speed and warning are gentler',()=>{
  const g=safe();Object.assign(g.hunter,{x:0,z:20});R.step(g,{},1/120);assert.ok(Math.hypot(g.hunter.vx,g.hunter.vz)<7.3);
  Object.assign(g.hunter,{x:0,z:6,grounded:true,cd:0});R.step(g,{},1/120);assert.ok(g.hunter.windup>=.6);
  Object.assign(g.hunter,{x:0,z:0});g.hunter.lunge=0;R.step(g,{},1/120);assert.equal(g.hp,2);assert.ok(g.invulnerable>2.4);
});
test('expanded map fits all collision boxes and preserves safe spawns',()=>{
  assert.ok(R.WORLD>=450);for(const b of R.buildings){assert.ok(b.x>=-R.WORLD/2&&b.z>=-R.WORLD/2);assert.ok(b.x+b.w<R.WORLD/2&&b.z+b.d<R.WORLD/2);}
  for(const p of [R.createGame().player,R.createGame().hunter])for(const b of R.buildings)assert.ok(!(p.x+p.r>b.x&&p.x-p.r<b.x+b.w&&p.z+p.r>b.z&&p.z-p.r<b.z+b.d));
});
test('ground acceleration is smooth and braking settles',()=>{
  const g=safe();g.player.y=g.player.r;g.player.grounded=true;R.step(g,{forward:true});assert.ok(g.player.vz<0&&g.player.vz>-2);
  advance(g,{forward:true},.3);assert.ok(Math.abs(g.player.vz)>10);advance(g,{},.2);assert.equal(g.player.vz,0);
});
test('coarse physics steps match fixed substeps',()=>{
  const a=safe(),b=safe();for(let i=0;i<30;i++)R.step(a,{forward:true},1/30);advance(b,{forward:true},1);
  for(const k of ['x','y','z','vx','vy','vz'])assert.ok(Math.abs(a.player[k]-b.player[k])<1e-8,k);
});
test('jump just after leaving a roof is forgiven',()=>{
  const g=safe();Object.assign(g.player,{y:90,grounded:false,fly:true,coyote:.07});R.step(g,{jump:true});assert.ok(g.player.vy>10);
});
test('both modes share the enlarged city and default to story',()=>{
  assert.ok(Math.abs(R.WORLD*R.WORLD/(644*644*3)-2)<1e-12,'double previous area');assert.equal(R.GRID,48);
  assert.ok(R.BLOCK>=32&&R.BLOCK<33,'preserve street density');
  assert.equal(R.createGame().mode,'story');assert.equal(R.createGame('unknown').mode,'story');
  for(const mode of ['story','free']){const g=R.createGame(mode);assert.equal(g.mode,mode);for(const b of R.buildings)assert.ok(!(g.player.x+g.player.r>b.x&&g.player.x-g.player.r<b.x+b.w&&g.player.z+g.player.r>b.z&&g.player.z-g.player.r<b.z+b.d));}
});
test('free play has no hunter damage, AI or ten minute ending',()=>{
  const g=R.createGame('free');g.elapsed=599.95;Object.assign(g.hunter,{x:0,y:1,z:0});const h=JSON.stringify(g.hunter);
  advance(g,{},2);assert.equal(g.state,'playing');assert.equal(g.hp,3);assert.ok(g.elapsed>601);assert.equal(JSON.stringify(g.hunter),h);
});
test('free play keeps story web forces, collisions and momentum',()=>{
  const a=R.createGame('story'),b=R.createGame('free'),building=R.buildings.find(b=>b.h>55);
  for(const g of [a,b]){Object.assign(g.player,{x:building.x-7,y:building.h-20,z:building.z+building.d/2});Object.assign(g.hunter,{x:300,z:300});assert.ok(R.shootWeb(g,{x:7,y:19,z:0}));}
  advance(a,{right:true,reel:true},.4);advance(b,{right:true,reel:true},.4);
  for(const k of ['x','y','z','vx','vy','vz'])assert.equal(a.player[k],b.player[k]);
  assert.equal(a.web.len,b.web.len);b.web=null;const x=b.player.x;advance(b,{},.1);assert.ok(b.player.x!==x);
  Object.assign(b.player,{x:building.x-b.player.r,y:1,z:building.z+building.d/2,vx:0,vy:0,vz:0,fly:false});advance(b,{right:true},.3);assert.equal(b.player.x,building.x-b.player.r);
});
test('new mode resets previous session state',()=>{
  const old=R.createGame('free');old.elapsed=700;old.player.x=200;
  const fresh=R.createGame('story');assert.equal(fresh.elapsed,0);assert.equal(fresh.player.x,0);assert.equal(fresh.web,null);assert.equal(fresh.hp,3);
});
test('spatial queries include every overlapping building across city and cell edges',()=>{
  for(let i=0;i<180;i++){
    const x=-R.WORLD/2+(i*97.31)%R.WORLD,z=-R.WORLD/2+(i*131.73)%R.WORLD,pad=i%4===0?R.RANGE:1;
    const found=R.query(x-pad,z-pad,x+pad,z+pad);
    for(const b of R.buildings)if(b.x<=x+pad&&b.x+b.w>=x-pad&&b.z<=z+pad&&b.z+b.d>=z-pad)assert.ok(found.includes(b),'missing '+b.id);
    assert.equal(new Set(found).size,found.length);
  }
  assert.ok(R.query(-1,-1,1,1).length<16,'local collision workload stays bounded');
});
test('indexed aim and obstruction agree with exhaustive ray tests throughout map',()=>{
  for(let i=0;i<160;i++){
    const g=R.createGame('free');Object.assign(g.player,{x:Math.sin(i*3.1)*R.WORLD*.48,z:Math.cos(i*1.7)*R.WORLD*.48,y:2+i%65});
    const a=i*2.399,d={x:Math.cos(a)*.95,y:Math.sin(i)*.2,z:Math.sin(a)*.95},n=Math.hypot(d.x,d.y,d.z);
    for(const k of ['x','y','z'])d[k]/=n;
    let best=R.RANGE,hit=null;for(const b of R.solids){const t=R.rayBox(g.player,d,b);if(t!==null&&t<=best){best=t;hit=t;}}
    const actual=R.aim(g,d);assert.equal(!!actual,hit!==null);
    if(actual)assert.ok(Math.abs(Math.hypot(actual.x-g.player.x,actual.y-g.player.y,actual.z-g.player.z)-best)<1e-7);
    const w={x:g.player.x+d.x*100,y:g.player.y+d.y*100,z:g.player.z+d.z*100};
    const blocked=R.solids.some(b=>{
      if(g.player.x>b.x&&g.player.x<b.x+b.w&&g.player.y>b.y0&&g.player.y<b.h&&g.player.z>b.z&&g.player.z<b.z+b.d)return true;
      const t=R.rayBox(g.player,d,b,100);return t!==null&&t<100;
    });
    assert.equal(R.webBlocked(g.player,w),blocked);
  }
});
test('indexed chase camera matches exhaustive collision search at city edges',()=>{
  for(let i=0;i<80;i++){
    const b=R.buildings[i*29%R.buildings.length],p={x:b.x-.8,y:3+i%20,z:b.z+b.d/2};
    const a=C.pose(p,i*.37,.3,true,R.solids),broad=C.pose(p,i*.37,.3,true,[...R.solids]);
    assert.deepEqual(a,broad);
  }
});
test('full strength automatic reeling is identical with and without Shift in both modes',()=>{
  for(const mode of ['free','story']){
    const a=swinger(),b=swinger();a.mode=b.mode=mode;
    advance(a,{},.5);advance(b,{reel:true},.5);
    assert.ok(Math.abs(a.web.len-19)<1e-8,'22 metres/second without Shift');
    assert.deepEqual(a.player,b.player);assert.deepEqual(a.web,b.web);
  }
});
test('wall penetration right beside anchor or player cuts before rope acceleration',()=>{
  const b=R.buildings[0],z=b.z+b.d/2;
  for(const x of [b.x+.01,b.x+b.w+.01]){
    const g=R.createGame('free');Object.assign(g.player,{x:b.x-2,y:5,z,vx:0,vy:0,fly:true});
    g.web={x,y:5,z,len:1};R.step(g,{},1/120);
    assert.equal(g.web,null);assert.equal(g.webBreak.reason,'wall');assert.equal(g.player.vx,0);
  }
  assert.equal(R.webBlocked({x:b.x-2,y:5,z},{x:b.x,y:5,z}),false,'surface anchor');
  assert.equal(R.webBlocked({x:b.x-2,y:b.h,z:b.z+1},{x:b.x+b.w+2,y:b.h,z:b.z+1}),false,'roof grazing beside rooftop unit');
  assert.equal(R.webBlocked({x:b.x+.001,y:5,z},{x:b.x-2,y:5,z}),true,'inside player endpoint');
});
test('maximum length releases at slow and fast speeds without braking',()=>{
  for(const speed of [2,25,40]){
    const g=R.createGame('free');Object.assign(g.player,{x:20,y:110,z:0,vx:speed,fly:true});
    g.web={x:0,y:110,z:0,len:15,maxLen:20};R.step(g,{},1/120);
    assert.equal(g.web,null);assert.equal(g.webBreak.reason,'stretch');assert.ok(g.player.vx>speed*.99);
  }
  const g=R.createGame('free');Object.assign(g.player,{x:19.99,y:110,z:0,vx:25,fly:true});
  g.web={x:0,y:110,z:0,len:20,maxLen:20};R.step(g,{},1/120);assert.equal(g.web,null);
});
const W=require('./web.js');
test('silk endpoints stay attached, slack sags and tension straightens',()=>{
  const a={x:0,y:20,z:0},b={x:20,y:20,z:0},slack=W.points(a,b,25),taut=W.points(a,b,20);
  assert.deepEqual(slack[0],a);assert.ok(Math.abs(slack.at(-1).y-b.y)<1e-8);
  assert.ok(slack[12].y<19);assert.equal(taut[12].y,20);
  assert.ok(slack.every(p=>Object.values(p).every(Number.isFinite)));
  assert.equal(W.travel(0),0);assert.equal(W.travel(45),.5);assert.equal(W.travel(500),1);
});
test('every rooftop structure is solid: landing, walls and web obstruction',()=>{
  const parts=R.solids.filter(s=>s.part);
  assert.ok(parts.length>=R.buildings.length,'equipment on every roof');
  for(const type of [3,4,5,7]){
    const b=R.buildings.find(b=>b.type===type),top=R.solids.filter(s=>s.parent===b.id).sort((a,c)=>c.h-a.h).find(s=>s.w>=2);
    assert.ok(top,'part for type '+type);
    // Falling onto the structure stops on its top, not on the main roof underneath.
    const g=safe();Object.assign(g.player,{x:top.x+top.w/2,z:top.z+top.d/2,y:top.h+5,vy:-38,fly:true});advance(g,{},1.5);
    assert.ok(Math.abs(g.player.y-(top.h+g.player.r))<1e-6,'lands on part top '+type+': '+g.player.y);
    // Walking on the roof into the structure is blocked by its side.
    const base=R.solids.filter(s=>s.parent===b.id).sort((a,c)=>a.y0-c.y0)[0],w=safe(),p=w.player;
    Object.assign(p,{x:base.x-1.5,y:b.h+p.r,z:base.z+base.d/2,grounded:true});advance(w,{right:true},.6);
    assert.ok(p.x<=base.x-p.r+1e-9,'blocked by part wall '+type);
    // A strand cannot pass through it either.
    const y=base.y0+.3;assert.equal(R.webBlocked({x:base.x-3,y,z:base.z+base.d/2},{x:base.x+base.w+3,y,z:base.z+base.d/2}),true);
  }
});
test('spider can climb a penthouse wall from the roof and stand on top',()=>{
  const b=R.buildings.find(b=>b.type===3),pent=R.solids.find(s=>s.parent===b.id&&s.h>b.h+4);
  const g=safe(),p=g.player;Object.assign(p,{x:pent.x-p.r,y:b.h+p.r,z:pent.z+pent.d/2,grounded:true});
  advance(g,{forward:true,yaw:-Math.PI/2},1.2);assert.ok(Math.abs(p.y-(pent.h+p.r))<.06,'on penthouse: '+p.y);
});
test('releasing a fast swing pops upward and keeps forward speed; Space releases too',()=>{
  const g=swinger();advance(g,{},1.75);const vx=g.player.vx,vy=g.player.vy;
  assert.equal(R.releaseWeb(g),true);assert.equal(g.web,null);assert.equal(g.webBreak.reason,'release');
  assert.ok(Math.abs(g.player.vx)>=Math.abs(vx)*.99);assert.ok(g.player.vy>Math.max(vy,0)+5);
  assert.ok(Math.hypot(g.player.vx,g.player.vy,g.player.vz)<=R.MAX_SPEED+1e-9);
  const s=swinger();advance(s,{},.5);R.step(s,{jump:true},1/120);assert.equal(s.web,null);
  assert.equal(R.releaseWeb(R.createGame()),false);
});
test('steering on the web bends the arc more than before',()=>{
  const a=swinger(),b=swinger();advance(a,{},.5);advance(b,{right:true},.5);assert.ok(b.player.x-a.player.x>.9,'steer '+(b.player.x-a.player.x));
});
test('near misses remain misses: no correction towards adjacent walls',()=>{
  let misses=0;
  for(let i=0;i<400;i++){
    const g=R.createGame('free');Object.assign(g.player,{x:Math.sin(i*2.3)*600,z:Math.cos(i*1.3)*600,y:30+i%50});
    const a=i*.77,d={x:Math.cos(a),y:.05+(i%7)*.04,z:Math.sin(a)};
    if(R.aim(g,d))continue;
    assert.equal(R.assistAim(g,d),null);assert.equal(R.shootWeb(g,d),false);misses++;
  }
  assert.ok(misses>30);
});
console.log(`${count} 3D regression tests passed.`);
