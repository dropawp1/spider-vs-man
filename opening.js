/* Two staged story scenes and a playable medicine interception. Simulation time only. */
(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const INTRO=23,MISS=12;
  const introLines=[
    [0,'ЛАБОРАТОРИЯ «АРАХНА»','За стеклом стоит Объект №6. Он перекрывает единственный выход.'],
    [4,'ШЕСТОЙ','Я должен вернуть тебя в клетку… Нет. Не сегодня.'],
    [8,'ШЕСТОЙ','Беги. Пока я помню, кто я.'],
    [12,'«АРАХНА» / СЕЛЕКТОР','Шестой открыл шлюз! Включить инъектор. Повторная доза, немедленно.'],
    [16,'ШЕСТОЙ','Не стой… Когда препарат подействует, я пойду за тобой.'],
    [20,'ДОКТОР ЛЕВИН','Седьмой, я слышу тебя. Выход ведёт в город. До рассвета десять минут.']
  ];
  const missLines=[
    [0,'СЛУЖЕБНЫЙ ПРОХОД','Сзади — шаги Шестого. Впереди бетонная стена, слева запертая решётка.'],
    [3,'ШЕСТОЙ','Седьмой… пригнись.'],
    [5,'УДАР','Бита проходит мимо тебя и выбивает крепления решётки.'],
    [7,'ШЕСТОЙ','Налево. Быстро.'],
    [9,'ДОКТОР ЛЕВИН','Он мог тебя схватить. Но открыл проход. Значит, ещё сопротивляется препарату.']
  ];
  function active(g){return !!(g.opening&&g.opening.active);}
  function begin(g,kind,R){
    if(g.mode!=='story'||g.state!=='playing')return false;
    const saved={player:{...g.player},hunter:{...g.hunter}};
    if(g.web)R.cutWeb(g,'scene');R.cancelSling(g);
    g.opening={kind,age:0,active:true,saved};g.hunter.mode='scripted';return true;
  }
  function start(g,R){return begin(g,'intro',R);}
  function finish(g,R){
    const a=g.opening;if(!a||!a.active)return;
    Object.assign(g.player,a.saved.player,{vx:0,vy:0,vz:0});Object.assign(g.hunter,a.saved.hunter,{mode:a.saved.hunter.mode||'chase',vx:0,vy:0,vz:0,windup:0,lunge:0});a.active=false;
    const s=g.story||(g.story={drives:0,fired:{},helped:false,decided:false,help:0});
    if(a.kind==='intro'){s.sixReleased=true;g.hunter.initialDose=true;s.radio={from:'ДОКТОР ЛЕВИН',text:'Шестой открыл тебе выход, но им снова управляет препарат. Пока держись крыш. Я попробую понять, как снять контроль.',at:g.elapsed,duration:14};}
    else{
      s.missDone=true;const d=s.missDoor;if(d){g.player.x=d.x-8;g.player.y=g.player.r;g.player.z=d.z;g.hunter.x=d.x+12;g.hunter.y=g.hunter.r;g.hunter.z=d.z;}
      s.radio={from:'ДОКТОР ЛЕВИН',text:'Он промахнулся специально. Ты видел: удар пришёлся по замку, не по тебе. Шестой ещё борется. Помни это, когда появится шанс помочь ему.',at:g.elapsed,duration:13};
    }
  }
  function step(g,dt,R){
    if(!active(g)||g.state!=='playing'||!(dt>0))return;
    const a=g.opening;a.age+=Math.min(dt,.1);
    const t=a.age;Object.assign(g.player,{x:0,y:-78.5,z:6,vx:0,vy:0,vz:0});
    Object.assign(g.hunter,{x:a.kind==='intro'?-2:1,y:-79.35,z:a.kind==='intro'?-4:2-Math.min(6,t),vx:0,vy:0,vz:0,windup:0,lunge:0,mode:'scripted'});
    if(t>=(a.kind==='intro'?INTRO:MISS))finish(g,R);
  }
  function caption(g){if(!active(g))return null;const a=g.opening,lines=a.kind==='intro'?introLines:missLines;return lines.filter(v=>a.age>=v[0]).slice(-1)[0];}
  function update(g,input,dt,R){
    if(g.mode!=='story'||g.state!=='playing'||active(g)||!(dt>0))return;
    const s=g.story,t=g.elapsed,p=g.player;
    if(!s.sixReleased)return;
    const street=v=>clamp(Math.round((v+R.WORLD/2-2)/R.BLOCK),2,R.GRID-3)*R.BLOCK-R.WORLD/2+2;
    if(t>=45&&t<175&&!s.missDoor){s.missDoor={x:street(p.x),y:1,z:street(p.z)-R.BLOCK};s.radio={from:'ДОКТОР ЛЕВИН',text:'У служебного прохода впереди есть выход в соседнюю улицу. Маяк включён. Спустись к входу, если хочешь оторваться от Шестого.',at:t,duration:13};}
    if(s.missDoor&&!s.missDone&&t<175&&Math.hypot(p.x-s.missDoor.x,p.y-s.missDoor.y,p.z-s.missDoor.z)<3.5){begin(g,'miss',R);return;}
    if(t>=130&&t<205&&!g.courier){
      g.courier={x:clamp(street(p.x)-R.BLOCK*2,-R.WORLD/2+8,R.WORLD/2-8),y:0,z:street(p.z),direction:1,yaw:-Math.PI/2,hits:0,hold:0,speed:6,status:'moving',stoppedUntil:0,until:205};
      s.radio={from:'ДОКТОР ЛЕВИН',text:'Медицинский курьер везёт новую дозу Шестому. Три попадания ПКМ остановят фургон. Держи E две секунды у задних дверей — уничтожишь запас. До седьмой минуты его рывки станут реже. X переключает маяк.',at:t,duration:18};
    }
    const c=g.courier;if(!c||['destroyed','escaped'].includes(c.status))return;
    const oldX=c.x;
    if(t>=c.until){c.status='escaped';s.radio={from:'«АРАХНА» / ПЕРЕХВАТ',text:'Медицинский груз доставлен. Объект №6 остаётся на полном снабжении.',at:t,duration:8};return;}
    if(c.hits>=3&&t<c.stoppedUntil){
      c.status='stopped';c.speed=0;const near=Math.hypot(p.x-(c.x-c.direction*3.8),p.y-1,p.z-c.z)<3.2;
      c.hold=near&&input.interact?c.hold+dt:0;
      if(c.hold>=2){c.status='destroyed';s.doseDestroyed=true;g.hunter.supplyCut=true;s.radio={from:'ДОКТОР ЛЕВИН',text:'Запас уничтожен! Рывки Шестого будут реже и слабее до седьмой минуты. На ящике маркировка «Конвой №0». Они перевозят не только препараты…',at:t,duration:14};}
    }else{if(c.status==='stopped'){c.hits=0;c.hold=0;}c.status='moving';c.speed=6;c.x+=c.direction*6*dt;if(Math.abs(c.x)>R.WORLD/2-8){c.direction*=-1;c.yaw=-c.direction*Math.PI/2;}}
    const hw=3.55+p.r,hd=1.55+p.r;
    if(Math.abs(p.x-c.x)<hw&&Math.abs(p.z-c.z)<hd&&p.y+p.r>0&&p.y-p.r<3.1){
      const A=typeof module!=='undefined'&&module.exports?require('./assault.js'):root.SpiderAssault;if(oldX!==c.x&&p.y<2.9)A.damage(g,R,'runover');
      if(p.y>2.9){p.y=3.1+p.r;p.vy=Math.max(0,p.vy);}else if(hw-Math.abs(p.x-c.x)<hd-Math.abs(p.z-c.z))p.x=c.x+(p.x<c.x?-hw:hw);else p.z=c.z+(p.z<c.z?-hd:hd);
    }
  }
  function objective(g){const s=g.story,c=g.courier;if(c&&['moving','stopped'].includes(c.status)&&g.trackCourier!==false)return {kind:'courier',label:c.status==='stopped'?'НОВАЯ ДОЗА · E 2 С У ЗАДНИХ ДВЕРЕЙ':`ПЕРЕХВАТИ ДОЗУ · ПКМ ${c.hits}/3 · X: ДРУГАЯ ЦЕЛЬ`,x:c.x-(c.status==='stopped'?c.direction*3.8:0),y:1,z:c.z,left:Math.max(0,Math.ceil((c.status==='stopped'?Math.min(c.stoppedUntil,c.until):c.until)-g.elapsed)),progress:c.hold/2};
    if(s&&s.missDoor&&!s.missDone&&g.elapsed<175)return {kind:'passage',label:'СЛУЖЕБНЫЙ ПРОХОД · СПУСТИСЬ К ВХОДУ',...s.missDoor,left:Math.ceil(175-g.elapsed)};return null;
  }
  function createRenderer(T,scene,C){
    const room=new T.Group();room.name='sixth-story-stage';scene.add(room);
    const geo=new T.BoxGeometry(1,1,1),concrete=new T.MeshStandardMaterial({color:0x6c7673,roughness:.86}),metal=new T.MeshStandardMaterial({color:0x344747,metalness:.45,roughness:.55}),light=new T.MeshBasicMaterial({color:0xc5f6dd}),red=new T.MeshBasicMaterial({color:0xff5140});
    function box(parent,x,y,z,w,h,d,m){const v=new T.Mesh(geo,m);v.position.set(x,y,z);v.scale.set(w,h,d);v.castShadow=v.receiveShadow=true;parent.add(v);return v;}
    box(room,0,-80,0,12,.3,32,concrete);box(room,0,-75,0,12,.3,32,concrete);box(room,5.9,-77.5,0,.2,5,32,concrete);box(room,0,-77.5,15.9,12,5,.2,concrete);
    for(const side of [-1,1])box(room,side*4.5,-77.5,-12,3,5,.3,concrete);
    box(room,-5.9,-77.5,4,.2,5,24,concrete);box(room,-5.9,-77.5,-14,.2,5,4,concrete);box(room,-12,-80,-10,12,.3,4,concrete);box(room,-12,-75,-10,12,.3,4,concrete);
    for(const z of [-12,-8])box(room,-12,-77.5,z,12,5,.2,concrete);
    const door=new T.Group();room.add(door);box(door,0,-77.8,-12,6,4.4,.22,metal);box(door,0,-76.8,-12.15,1.5,.2,.03,light);
    const grate=new T.Group();grate.position.set(-5.8,-80,-10);room.add(grate);for(let i=0;i<9;i++)box(grate,0,2,-1.7+i*.42,.12,4,.08,metal);for(const y of [.4,3.6])box(grate,0,y,0,.13,.12,3.8,metal);
    box(room,-2,-78.8,-5,.9,1.3,.6,metal);box(room,-2,-78.1,-4.65,.65,.3,.04,light);const alarm=box(room,0,-75.6,-8,.5,.15,.5,red);
    const injector=new T.Group();injector.name='forced-dose-injector';room.add(injector);box(injector,-1.6,-76.2,-4,.18,2.1,.18,metal);box(injector,-1.6,-77.3,-4,.12,.25,.12,red);
    for(const z of [-9,0,9])box(room,0,-75.3,z,2.5,.08,.4,light);
    const lamp=new T.PointLight(0xb8e7d2,0,25,2);lamp.position.set(0,-76,0);scene.add(lamp);
    const transport=C.createRenderer(T,scene,{medical:true});
    function update(g,camera,hunter){
      room.visible=active(g);lamp.intensity=room.visible?115:0;
      transport.update({...g,convoy:g.courier?{...g.courier,status:g.courier.status==='destroyed'?'rescued':g.courier.status}:null});
      if(!room.visible)return;const a=g.opening,t=a.age,isIntro=a.kind==='intro';
      door.position.y=isIntro?Math.min(5,Math.max(0,t-7)*1.7):0;grate.visible=!isIntro;grate.rotation.z=!isIntro&&t>=5?Math.min(1.4,(t-5)*2):0;alarm.visible=t>=12||!isIntro;
      injector.visible=isIntro&&t>=12&&t<17;injector.position.y=-Math.sin(Math.min(1,(t-12)/4)*Math.PI)*.6;
      if(isIntro){camera.position.set(-Math.min(1.5,Math.max(0,t-18)*.3),-78.4,6-Math.max(0,t-9)*1.4);camera.lookAt(t<12?-2:0,-78.1,t>18?-20:-7);hunter.root.rotation.y=t<12?Math.PI:0;hunter.root.rotation.z=t>=13?Math.sin(t*20)*.06:0;}
      else{camera.position.set(t<8?0:-Math.min(13,(t-8)*3),-78.5,t<8?-6:-10);camera.lookAt(t<3?0:t<8?-5.8:-24,-78,-10);hunter.root.position.set(1-Math.min(5.4,t*1.8),-80,2-Math.min(11,t*3.67));hunter.root.rotation.set(0,Math.PI/2,0);hunter.animate(t,t<3,t>=3&&t<5?1.1-(t-3)*.2:0,false);}
    }
    function dispose(){transport.dispose();room.removeFromParent();scene.remove(lamp);lamp.dispose();geo.dispose();for(const m of [concrete,metal,light,red])m.dispose();}
    room.visible=false;return {update,dispose,root:room};
  }
  const api={start,active,step,finish,update,objective,caption,createRenderer,INTRO,MISS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SpiderOpening=api;
})(typeof window!=='undefined'?window:globalThis);
