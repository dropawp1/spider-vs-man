// Regression tests for the slingshot, rooftop panels (blackout) and the «Ночь Охоты» story.
const assert = require('node:assert/strict');
const R = require('./physics.js');
const S = require('./story.js');
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
function advance(g,input,seconds){for(let i=0;i<Math.ceil(seconds*120);i++){R.step(g,input,1/120);if(g.mode==='story')S.update(g,input,1/120);}}
function away(g){g.hunter.x=g.player.x+300;g.hunter.z=g.player.z+300;}

// Select opposite walls with two separate, exact shots.
function slingSpot(){
  for(const b of R.buildings.slice(0,200)){
    const g=R.createGame('free');
    Object.assign(g.player,{x:b.x+b.w+5,y:3,z:b.z+1});
    if(!R.startSling(g,{x:-1,y:0,z:0}))continue;
    if(R.startSling(g,{x:1,y:0,z:0})&&g.sling.b)return g;
  }
  throw new Error('No sling street');
}
test('two clicks select different buildings; full charge is fast and launch is stronger',()=>{
  const g=slingSpot();assert.notEqual(g.sling.a.building,g.sling.b.building);
  advance(g,{},.46);assert.ok(g.sling);assert.equal(g.sling.charge,R.SLING_CHARGE);
  assert.ok(R.startSling(g,{x:0,y:0,z:1}));assert.equal(g.sling,null);
  assert.ok(g.player.vz>60);advance(g,{},.1);assert.ok(g.player.vz>55,'not capped back to 42');
  assert.equal(R.startSling(g,{x:1,y:0,z:0}),false);
});
test('first anchor persists on release or miss; same building is rejected; Space needs two anchors',()=>{
  const full=slingSpot(),g=R.createGame('free');Object.assign(g.player,full.player);
  const d={x:-1,y:0,z:0};assert.ok(R.startSling(g,d));const a=g.sling.a;
  assert.equal(g.sling.b,null);assert.equal(R.releaseSling(g),false);
  assert.equal(R.startSling(g,{x:0,y:1,z:0}),false);assert.equal(g.sling.a,a);
  assert.equal(R.startSling(g,d),false);R.step(g,{jump:true});assert.ok(g.sling&&!g.sling.b);
});
test('Space releases a charged sling; ordinary web cancels assembly',()=>{
  const g=slingSpot();advance(g,{},.46);R.step(g,{jump:true});assert.equal(g.sling,null);assert.ok(Math.hypot(g.player.vx,g.player.vy,g.player.vz)>60);
  const other=slingSpot();R.shootWeb(other,{x:0,y:1,z:0});assert.equal(other.sling,null);
});
test('web hits hunter exactly, slows for five seconds, refreshes but does not stack',()=>{
  const g=R.createGame();g.invulnerable=99;Object.assign(g.hunter,{x:0,y:1,z:20,cd:99});
  assert.ok(R.shootWeb(g,{x:0,y:0,z:1}));assert.equal(g.web,null);assert.equal(g.hunter.webUntil,5);
  R.step(g,{},1/120);assert.ok(Math.hypot(g.hunter.vx,g.hunter.vz)<2);
  g.elapsed=2;assert.ok(R.shootWeb(g,{x:g.hunter.x,y:g.hunter.y-g.player.y,z:g.hunter.z}));assert.equal(g.hunter.webUntil,7);
  g.elapsed=6.98;R.step(g,{});assert.ok(Math.hypot(g.hunter.vx,g.hunter.vz)<2.5);
  g.elapsed=7;R.step(g,{});assert.ok(Math.hypot(g.hunter.vx,g.hunter.vz)>5);
});
test('wall occludes hunter and air misses do not slow him',()=>{
  const b=R.buildings[0],g=R.createGame();
  Object.assign(g.player,{x:b.x-3,y:2,z:b.z+b.d/2});Object.assign(g.hunter,{x:b.x+b.w+3,y:2,z:g.player.z});
  assert.equal(R.hunterAim(g,{x:1,y:0,z:0}),null);R.shootWeb(g,{x:1,y:0,z:0});assert.equal(g.hunter.webUntil,undefined);
  assert.equal(R.shootWeb(g,{x:0,y:1,z:0}),false);assert.equal(g.hunter.webUntil,undefined);
});

// Rooftop electrical panel: hit it with the web to short the block.
function panelShot(){
  const panel=R.solids.find(s=>s.kind==='panel');
  const g=R.createGame('story');
  Object.assign(g.player,{x:panel.x+panel.w/2,y:panel.y0+g.player.r+.02,z:panel.z-2.2});
  away(g);
  const d={x:panel.x+panel.w/2-g.player.x,y:panel.y0+.9-g.player.y,z:panel.z+panel.d/2-g.player.z};
  return {g,panel,d};
}
test('web on a rooftop panel causes a blackout that blinds the hunter for 15 s',()=>{
  const {g,panel,d}=panelShot();
  assert.ok(R.aim(g,d)&&R.aim(g,d).panel===panel.id,'aim reports the panel');
  assert.equal(R.shootWeb(g,d),true);
  assert.ok(g.blackout&&g.blackout.id===panel.id);assert.equal(R.blind(g),true);
  advance(g,{},.1);
  assert.equal(g.hunter.lost,true,'chasing hunter lost the trail');
  assert.match(S.state(g).radio.text,/обесточен/);
  assert.equal(R.cutPanel(g,panel.id),false,'each panel shorts once');
  g.elapsed=g.blackout.until+.01;assert.equal(R.blind(g),false);
});
test('flash drives appear at 3:00 and 6:00, pickup counts, timeout expires',()=>{
  const g=R.createGame('story');away(g);
  g.elapsed=180;S.update(g,{},1/120);
  let o=S.objective(g);assert.equal(o.kind,'drive');assert.ok(o.left<=100&&o.left>=99);
  const b=R.buildings[S.state(g).objective.building];assert.ok(Math.abs(o.y-(b.h+.8))<1e-9,'beacon on a roof');
  Object.assign(g.player,{x:o.x,y:o.y,z:o.z});S.update(g,{},1/120);
  assert.equal(S.state(g).drives,1);assert.equal(S.objective(g),null);
  g.elapsed=360;S.update(g,{},1/120);assert.equal(S.objective(g).kind,'drive');
  g.elapsed=461;S.update(g,{},1/120);
  assert.equal(S.state(g).drives,1,'second drive missed');assert.match(S.state(g).radio.text,/Маяк погас/);
});
test('7:00 withdrawal: hunter is harmless, holding E nearby makes him an ally',()=>{
  const g=R.createGame('story');
  g.elapsed=420;S.update(g,{},1/120);
  assert.equal(g.hunter.mode,'withdrawal');assert.equal(R.hostile(g),false);
  Object.assign(g.player,{x:g.hunter.x+1,y:g.hunter.y,z:g.hunter.z});
  const hp=g.hp;advance(g,{interact:true},S.HELP_TIME+.1);
  assert.equal(g.hp,hp,'no hits during withdrawal');
  assert.equal(g.hunter.mode,'ally');assert.equal(S.state(g).helped,true);
  assert.match(S.radioAt(480,S.state(g)).text,/Шестой идёт с тобой/);
  g.invulnerable=0;Object.assign(g.player,{x:g.hunter.x,y:g.hunter.y,z:g.hunter.z});advance(g,{},.5);
  assert.equal(g.hp,hp,'ally never strikes');
});
test('ignoring Object No. 6 re-doses him into a faster chase',()=>{
  const g=R.createGame('story');away(g);
  g.elapsed=420;S.update(g,{},1/120);
  g.elapsed=420+S.CHOICE_TTL;S.update(g,{},1/120);
  assert.equal(g.hunter.mode,'chase');assert.equal(g.hunter.dosed,true);assert.equal(S.state(g).helped,false);
  assert.equal(R.hostile(g),true);
});
test('four endings follow drives and the choice',()=>{
  const g=R.createGame('story'),s=S.state(g);
  const pick=(drives,helped)=>{s.drives=drives;s.helped=helped;return S.ending(g);};
  assert.equal(pick(2,true),'truth');assert.equal(pick(2,false),'expose');
  assert.equal(pick(1,true),'allies');assert.equal(pick(0,false),'escape');
  for(const k of ['truth','expose','allies','escape'])assert.ok(S.ENDINGS[k].title&&S.ENDINGS[k].text);
});
test('free play has no story objectives or radio',()=>{
  const g=R.createGame('free');g.elapsed=180;S.update(g,{},1/120);
  assert.equal(g.story,undefined);
});
console.log(`${count} story/slingshot tests passed.`);
