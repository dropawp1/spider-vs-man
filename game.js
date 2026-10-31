(() => {
  'use strict';
  const $ = id => document.getElementById(id), R = window.SpiderRules, T = window.THREE;
  let renderer;
  try {
    if (!T) throw new Error('Не найден локальный движок vendor/three.min.js');
    renderer = new T.WebGLRenderer({canvas: $('viewport'), antialias: true});
  } catch (error) {
    $('panel-title').textContent = '3D НЕДОСТУПНО';
    $('panel-text').textContent = 'Нужен браузер с WebGL. ' + error.message;
    $('start').disabled = true; return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const NIGHT=0x101c30;
  const scene = new T.Scene(); scene.background = new T.Color(NIGHT);
  scene.fog = new T.Fog(NIGHT, 105, 350);
  const camera = new T.PerspectiveCamera(80, 1, .07, 580); camera.rotation.order = 'YXZ'; scene.add(camera);
  scene.add(new T.HemisphereLight(0x9abbed, 0x303845, 1.25));
  const sun = new T.DirectionalLight(0xabc9ff, 1.6); sun.position.set(-40, 90, 30); scene.add(sun);
  const fill = new T.DirectionalLight(0xffba84,.45);fill.position.set(60,20,-40);scene.add(fill);
  const city=SpiderModels.city(scene, R);
  // Static city transforms never need recomputing on every animation frame.
  scene.updateMatrixWorld(true);
  scene.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh)o.matrixAutoUpdate=false;});
  const hunter = SpiderModels.hunter(), spider = SpiderModels.spider(scene), firstSpider = SpiderModels.spider(camera); scene.add(hunter.root);
  firstSpider.root.position.set(0,-.64,-.18);
  const C = window.SpiderCamera;
  let thirdPerson = false;
  function toggleCamera() {
    if (ending || game.state === 'won') return;
    thirdPerson = !thirdPerson;
    $('camera-mode').textContent = thirdPerson ? 'F5 · От третьего лица' : 'F5 · От первого лица';
    $('viewport').setAttribute('aria-label', thirdPerson ? 'Город от третьего лица' : 'Город от первого лица');
  }
  $('camera-mode').addEventListener('click', toggleCamera);
  const silk = new SpiderWeb.Renderer(scene,T,R);
  // Slingshot: two taut strands drawn with the same silk renderer as the swing web.
  const slingA = new SpiderWeb.Renderer(scene,T,R), slingB = new SpiderWeb.Renderer(scene,T,R);
  const S = window.SpiderStory;
  // Story beacon: glowing core + tall translucent beam, visible above roofs from far away.
  const beacon = new T.Group(); scene.add(beacon); beacon.visible = false;
  const beaconCore = new T.Mesh(new T.OctahedronGeometry(.45), new T.MeshStandardMaterial({color:0xfff1a8,emissive:0xffc948,emissiveIntensity:2.4}));
  const beam = new T.Mesh(new T.CylinderGeometry(.35,.35,60,10,1,true), new T.MeshBasicMaterial({color:0xffd56a,transparent:true,opacity:.22,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending}));
  beam.position.y = 30; beacon.add(beaconCore, beam);
  let lastBlack = '';
  // A separate simple set for the ending, outside the playable city.
  const tunnel = new T.Group(); tunnel.position.set(0,-150,0); scene.add(tunnel);
  const concrete = new T.MeshStandardMaterial({color:0x233c43,side:T.DoubleSide});
  const tube = new T.Mesh(new T.CylinderGeometry(3,3,32,16,1,true),concrete);
  tube.rotation.x=Math.PI/2; tube.position.z=-10; tunnel.add(tube);
  const gate = new T.Mesh(new T.BoxGeometry(5.7,5.7,.22),new T.MeshStandardMaterial({color:0x66878a,wireframe:true}));
  gate.position.z=1; tunnel.add(gate);
  const glow = new T.PointLight(0x75ffe0,30,35); glow.position.set(0,1,-12); tunnel.add(glow);
  let ending = 0, endingId = 'escape';
  let game = R.createGame(), running = false, paused = false, yaw = 0, pitch = 0;
  let last = 0, accumulator = 0, jump = false, missUntil = 0, lockHint = false;
  const keys = new Set();
  function clearInput() { keys.clear(); jump = false; game.web = null; game.sling = null; }
  function trySling() { if (!R.startSling(game, aimDirection())) slingMissUntil = performance.now() + 1400; }
  let slingMissUntil = 0;
  function panel(title, text, button) {
    $('panel-title').textContent = title; $('panel-text').textContent = text;
    $('start').textContent = button; $('start').hidden = false;
    $('mode-picker').hidden = true; $('back-menu').hidden = false;
    $('overlay').querySelector('.panel').classList.remove('menu','finale');
    $('instructions').hidden = true; $('overlay').hidden = false;
  }
  function releaseMouse() { if (document.pointerLockElement) document.exitPointerLock(); }
  function captureMouse() {
    try {
      const result = $('viewport').requestPointerLock();
      if (result && result.catch) result.catch(() => { lockHint = true; });
    } catch (_) { lockHint = true; }
  }
  function pause() {
    if (!running || paused) return;
    paused = true; clearInput(); accumulator = 0; releaseMouse();
    $('pause').setAttribute('aria-label', 'Продолжить');
    panel('ПАУЗА', game.mode==='free' ? 'Свободная игра приостановлена. Город ждёт — летай сколько захочешь.' : 'Таймер остановлен. Продолжи погоню, когда будешь готов.', game.mode==='free' ? 'Продолжить полёт' : 'Продолжить погоню');
  }
  function showMenu() {
    running = false; paused = false; ending = 0; clearInput(); releaseMouse();
    game = R.createGame(); accumulator = 0;
    scene.background.setHex(NIGHT); scene.fog.color.setHex(NIGHT);
    $('pause').disabled = true;
    $('panel-title').textContent = 'Ночь Охоты';
    $('panel-text').textContent = 'Десять минут до рассвета. Целый город над тобой. За спиной — «Арахна», впереди — свобода. Но в лаборатории остались те, кто всё ещё ждёт тебя.';
    $('overlay').querySelector('.panel').classList.remove('finale');
    $('overlay').querySelector('.panel').classList.add('menu');
    $('mode-picker').hidden = false; $('instructions').hidden = true;
    $('start').hidden = true; $('back-menu').hidden = true; $('overlay').hidden = false;
  }
  function chooseMode(mode) { game = R.createGame(mode); paused = false; running = false; startSession(); }
  $('choose-free').addEventListener('click', () => chooseMode('free'));
  $('choose-story').addEventListener('click', () => chooseMode('story'));
  $('back-menu').addEventListener('click', showMenu);
  function startSession() {
    if (!paused || !running) { game = R.createGame(game.mode); yaw = 0; pitch = 0; ending = 0; scene.background.setHex(NIGHT); scene.fog.color.setHex(NIGHT); }
    running = true; paused = false; clearInput(); accumulator = 0; missUntil = 0;
    $('overlay').hidden = true; $('pause').disabled = false; $('pause').setAttribute('aria-label', 'Пауза');
    $('start').blur(); lockHint = true; // Capture only on a scene click, not while using menu/HUD buttons.
  }
  $('start').addEventListener('click', startSession);
  $('pause').addEventListener('click', () => { if (paused) startSession(); else pause(); });
  document.addEventListener('pointerlockchange', () => {
    lockHint = document.pointerLockElement !== $('viewport');
    if (lockHint && running && !paused) pause();
  });
  document.addEventListener('pointerlockerror', () => { lockHint = true; });
  const codes = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyE','KeyQ'];
  window.addEventListener('keydown', e => {
    if (e.code === 'F5') { e.preventDefault(); if (!e.repeat) toggleCamera(); return; }
    if (e.code === 'Escape') { pause(); return; }
    if (!codes.includes(e.code) || !running || paused) return;
    e.preventDefault(); keys.add(e.code); if (e.code === 'Space' && !e.repeat) jump = true;
    if (e.code === 'KeyQ' && !e.repeat) trySling();
  });
  window.addEventListener('keyup', e => { keys.delete(e.code); });
  window.addEventListener('mousemove', e => {
    if (!running || paused) return;
    if (document.pointerLockElement === $('viewport') || (e.target === $('viewport') && e.buttons === 1)) {
      const look = C.look(yaw,pitch,e.movementX,e.movementY);
      yaw = look.yaw; pitch = look.pitch;
    }
  });
  function aimDirection() {
    const d=C.direction(yaw,pitch);
    if(!thirdPerson)return d;
    const view=C.pose(game.player,yaw,pitch,true,R.solids),h=game.hunter;
    const targets=R.rayCandidates(view,d,R.RANGE);
    if(game.mode==='story')targets.push({x:h.x-.65,z:h.z-.65,w:1.3,d:1.3,y0:h.y-h.r,h:h.y-h.r+3.2});
    return C.aim(game.player,view,d,targets,R.RANGE);
  }
  $('viewport').addEventListener('pointerdown', e => {
    if (!running || paused) return;
    // LMB: first click captures the mouse; once captured it pulls the slingshot.
    if (e.button === 0) { if (document.pointerLockElement !== $('viewport')) captureMouse(); else trySling(); }
    if (e.button === 2) { e.preventDefault(); if (!R.shootWeb(game, aimDirection())) missUntil = performance.now() + 1200; }
  });
  $('game').addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('pointerup', e => { if (e.button === 2) R.releaseWeb(game); });
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
  window.addEventListener('resize', resize); resize();
  let lastHud=-Infinity;
  function render(now) {
    const p = game.player, h = game.hunter, active = running && !paused;
    const view=C.pose(p,yaw,pitch,thirdPerson,R.solids);
    camera.position.set(view.x,view.y,view.z); camera.rotation.set(pitch,yaw,0);
    spider.root.visible=thirdPerson && !ending && game.state!=='won';
    firstSpider.root.visible=!thirdPerson && !ending && game.state!=='won';
    spider.root.position.set(p.x,p.y-.12,p.z); spider.root.rotation.set(0,yaw,0);
    const touch=p.climbing ? R.wall(p) : null;
    if(touch){
      const normal=new T.Vector3(touch.nx,0,touch.nz),forward=new T.Vector3(0,1,0);
      const right=new T.Vector3().crossVectors(forward,normal);
      spider.root.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right,normal,forward.negate()));
      spider.root.position.set(p.x-touch.nx*.28,p.y,p.z-touch.nz*.28);
    }
    hunter.root.position.set(h.x, h.y-h.r, h.z); hunter.root.rotation.set(h.mode==='withdrawal'?.45:0, Math.atan2(h.x-p.x, h.z-p.z), 0);
    if(h.mode==='withdrawal') hunter.root.position.y -= .35; // hunched, shaking from withdrawal
    hunter.animate(game.elapsed, active && Math.hypot(h.vx,h.vz,h.vy)>1, h.windup>0 ? 1.1-(1-h.windup/.65)*.45 : game.attack, h.climbing);
    hunter.root.scale.setScalar(h.windup>0 ? 1.12 : 1);
    spider.animate(game.elapsed, active && Math.hypot(p.vx,p.vz,p.vy)>1, !!game.web||!!game.sling);
    firstSpider.animate(game.elapsed, active && Math.hypot(p.vx,p.vz,p.vy)>1, !!game.web||!!game.sling);
    const silkStart = thirdPerson ? new T.Vector3(p.x,p.y,p.z) : new T.Vector3(.23,-.2,-.35);
    if(!thirdPerson) camera.localToWorld(silkStart);
    const hit=game.webHit, hitAge=hit?game.elapsed-hit.at:Infinity;
    silk.update(game.web?game:{web:hitAge<.25?{...hit,len:0}:null},silkStart,now);
    // Taut slingshot strands (len 0 = no sag); distinct shot ids per side for travel/splat.
    const sl=game.sling;
    slingA.update({web:sl?{...sl.a,len:0,shot:sl.shot*2}:null},silkStart,now);
    slingB.update({web:sl&&sl.b?{...sl.b,len:0,shot:sl.shot*2+1}:null},silkStart,now);
    // Shorted block: lights fade out, then return over the last 2 s of the blackout.
    const bo=game.blackout, boLeft=bo?bo.until-game.elapsed:0;
    const dark=bo&&boLeft>0&&!ending&&game.state!=='won'?Math.min(1,boLeft/2,(game.elapsed-(bo.until-R.BLACKOUT))*3+.2):0;
    const blackKey=dark>0?bo.id+':'+dark.toFixed(2):'';
    if(blackKey!==lastBlack){city.blackout(dark>0?bo:null,dark);lastBlack=blackKey;}
    const goal=game.mode==='story'&&running?S.objective(game):null;
    beacon.visible=!!goal&&(goal.kind==='drive'||goal.kind==='rescue')&&!ending&&game.state!=='won';
    if(beacon.visible){beacon.position.set(goal.x,goal.y,goal.z);beaconCore.rotation.y=now/400;beaconCore.position.y=Math.sin(now/300)*.15;}
    if(now-lastHud>=50 || !active){
    lastHud=now;
    const free=game.mode==='free', left = Math.ceil(R.DURATION-game.elapsed), distance = Math.hypot(p.x-h.x,p.y-h.y,p.z-h.z);
    const story=free?null:S.state(game);
    hunter.root.visible = !free && (running || !!ending || game.state==='won');
    const clock=$('timer').closest('.clock'); clock.classList.toggle('free',free);
    clock.querySelector('span').textContent = free ? 'БЕЗ ОГРАНИЧЕНИЙ' : 'ДО РАССВЕТА';
    clock.querySelector('.progress').hidden=free;
    $('health').hidden=free;
    document.querySelector('.district').textContent=free?'АРАХНА / СВОБОДНЫЙ ГОРОД':'АРАХНА / НОЧЬ ОХОТЫ · СЕКТОР 07';
    $('distance').parentElement.hidden=free;
    $('evidence').hidden=free; $('evidence-count').textContent=story?story.drives:0;
    $('hunter-label').textContent=h.mode==='ally'?'ШЕСТОЙ':'ОХОТНИК';
    $('timer').textContent = free ? 'СВОБОДА' : `${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
    $('progress').style.width = `${game.elapsed/R.DURATION*100}%`;
    $('health').textContent = '♥ '.repeat(game.hp)+'♡ '.repeat(3-game.hp);
    $('health').setAttribute('aria-label', `Здоровье: ${game.hp} из 3`);
    $('altitude').textContent = Math.max(0,Math.round(p.y-p.r)); $('distance').textContent = Math.round(distance);
    const threat=!free&&active&&R.hostile(game);
    $('danger').hidden = !threat || distance>17;
    $('danger').textContent = game.elapsed<(h.webUntil||0) ? `ОХОТНИК ОПУТАН · ${Math.ceil(h.webUntil-game.elapsed)} С` : h.lost ? 'ОХОТНИК ПОТЕРЯЛ СЛЕД' : h.windup>0 ? 'ОН ПРЫГАЕТ — УКЛОНЯЙСЯ!' : 'ОХОТНИК РЯДОМ';
    const message = free ? null : S.radioAt(game.elapsed, story);
    $('radio').hidden = !message || paused || (!running && !ending);
    $('radio-from').textContent = 'РАДИО / ' + (message&&message.from ? message.from : 'ДОКТОР ЛЕВИН');
    $('radio-text').textContent = message ? message.text : '';
    // Objective with a camera-relative arrow, distance and remaining time.
    $('objective').hidden = !goal || !active;
    if(goal){
      const rel=Math.atan2(-(goal.x-p.x),-(goal.z-p.z))-yaw, arrows=['↑','↖','←','↙','↓','↘','→','↗'];
      const dir=arrows[((Math.round(rel/(Math.PI/4))%8)+8)%8], m=Math.round(Math.hypot(goal.x-p.x,goal.y-p.y,goal.z-p.z));
      $('objective-label').textContent=goal.label;
      $('objective-meta').textContent=`${dir} ${m} м · ${goal.left} с`+(goal.progress?` · ${goal.kind==='rescue'?'замки':'антидот'} ${Math.round(goal.progress*100)}%`:'');
    }
    $('damage').style.opacity = game.invulnerable>1.1 ? .7 : 0;
    $('crosshair').classList.toggle('ready', !!(R.hunterAim(game,aimDirection())||R.aim(game, aimDirection())));
    $('crosshair').classList.toggle('attached', !!game.web);
    $('crosshair').classList.toggle('sling', !!sl);
    const charge=sl?Math.round(Math.min(1,sl.charge/R.SLING_CHARGE)*100):0;
    $('hint').textContent = now<slingMissUntil ? 'Наведи точно на другую стену: рогатке нужны два разных здания.' : now<missUntil ? `Нет здания под прицелом в пределах ${R.RANGE} м.` : sl ? !sl.b ? 'Первая нить закреплена · наведи на другое здание и нажми ЛКМ / Q' : `Рогатка: натяжение ${charge}% · смотри в сторону полёта · ЛКМ / Q или Пробел — выстрел` : goal&&goal.kind==='rescue' ? 'Вернись к маяку лаборатории · удерживай E у терминала 5 с · до рассвета' : goal&&goal.kind==='help'&&distance<3.6 ? 'Держи E — ввести антидот Шестому' : game.web ? 'Держи ПКМ — авто-качели · WASD — рули дугой · отпусти ПКМ или Пробел — подброс и полёт' : lockHint ? 'Нажми на сцену для обзора мышью; запасной обзор — зажми ЛКМ и двигай мышь' : p.climbing ? 'На стене · W / S — вверх / вниз · Пробел — оттолкнуться' : game.elapsed<(h.webUntil||0) ? `Охотник опутан: ещё ${Math.ceil(h.webUntil-game.elapsed)} с · ПКМ — паутина` : 'ПКМ — зацеп / замедлить Охотника на 5 с · ЛКМ дважды по стенам — рогатка';
    }
    if (ending) {
      const t=Math.min(1,(now-ending)/6000), allies=endingId==='truth'||endingId==='allies';
      camera.position.set(0,-150,5-t*24);camera.rotation.set(0,0,0);
      gate.position.y=Math.min(7,t*22);
      // Helped Object No. 6 walks into the tunnel ahead; otherwise he stays outside the gate.
      if(allies){hunter.root.position.set(1.3,-152.7,1-t*24);hunter.root.rotation.set(0,0,0);}
      else{hunter.root.position.set(0,-152.7,7);hunter.root.rotation.set(0,Math.PI,0);}
      $('hint').textContent=allies?'ШЛЮЗ ОТКРЫТ · СЕДЬМОЙ И ШЕСТОЙ УХОДЯТ В ТОННЕЛЬ':'ШЛЮЗ ОТКРЫТ · ОБЪЕКТ №7 УХОДИТ В ТОННЕЛЬ';
      $('crosshair').hidden=true; $('objective').hidden=true;
      if(t>=1){ending=0;const e=S.ENDINGS[endingId],st=S.state(game);panel(e.title,`${e.text} Улики: ${st.drives}/2 · Шестой: ${st.helped?'спасён':'остался Охотником'}.`,'Сыграть Ночь Охоты снова');}
    } else {
      $('crosshair').hidden=game.state==='won';
      if(game.state==='won'){camera.position.set(0,-150,-19);camera.rotation.set(0,0,0);}
    }
    city.update(camera);
    renderer.render(scene,camera);
  }
  let lastView='';
  function frame(now) {
    const dt = Math.min(.1,(now-(last||now))/1000); last = now;
    if (running && !paused) {
      accumulator += dt;
      while (accumulator >= 1/120) {
        const input = {yaw,forward:keys.has('KeyW')||keys.has('ArrowUp'),back:keys.has('KeyS')||keys.has('ArrowDown'),left:keys.has('KeyA')||keys.has('ArrowLeft'),right:keys.has('KeyD')||keys.has('ArrowRight'),jump,interact:keys.has('KeyE')};
        if(jump&&game.sling&&game.sling.b){R.releaseSling(game,aimDirection());input.jump=false;}
        R.step(game, input, 1/120);
        if (game.mode === 'story') S.update(game, input, 1/120); else game.events = [];
        jump = false; accumulator -= 1/120;
        if (game.state !== 'playing') {
          running = false; clearInput(); releaseMouse(); $('pause').disabled = true;
          if(game.state==='won'){
            endingId=S.ending(game);
            if(endingId==='cells'){
              const st=S.state(game);
              panel('Открытые клетки',`${S.ENDINGS.cells.text} ${st.helped?'Шестой вывел последнюю группу и ушёл вместе с вами.':'Судьба Шестого осталась неизвестной.'} Улики: ${st.drives} из 2.`, 'Начать новую ночь');
              $('overlay').querySelector('.panel').classList.add('finale');
            }else{ending=now;scene.background.setHex(0x101d24);scene.fog.color.setHex(0x101d24);}
          }else panel('СИГНАЛ ОБЪЕКТА №7 ПОТЕРЯН',`Электробита лишила тебя сознания. Охотник вернул Объект №7 в «Арахну». До поимки: ${Math.floor(game.elapsed/60)} мин ${Math.floor(game.elapsed%60)} сек. Попробуй снова — Левин ещё на связи.`,'Повторить побег');
          break;
        }
      }
    }
    // Menus/paused scenes are static: redraw only after a view or state change.
    const viewKey=[running,paused,ending,game.mode,game.state,thirdPerson,yaw,pitch,innerWidth,innerHeight,lockHint].join('|');
    if((running&&!paused)||ending||viewKey!==lastView){render(now);lastView=viewKey;}
    requestAnimationFrame(frame);
  }
  showMenu();
  requestAnimationFrame(frame);
})();
