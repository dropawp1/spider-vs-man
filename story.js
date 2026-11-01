/* «Ночь Охоты» — сюжет поверх физики. Всё считается по игровому времени: пауза его останавливает,
   новый раунд запускает сюжет заново. update(g,input,dt) вызывается после каждого R.step в режиме story. */
(function(root){
  'use strict';
  const R=typeof module!=='undefined'&&module.exports?require('./physics.js'):root.SpiderRules;
  const title='НОЧЬ ОХОТЫ';
  const intro='Ты — Объект №7, паук-мутант из лаборатории «Арахна». За тобой выпустили Охотника. До рассвета 10 минут: продержись, собери улики и реши, кем на самом деле был твой преследователь.';
  const LEVIN='ДОКТОР ЛЕВИН',HUNTER='ОХОТНИК',ARACHNA='«АРАХНА» / ПЕРЕХВАТ';
  // Расписание. alt — замена текста, если Шестому помогли.
  const messages=[
    {at:0,duration:14,from:LEVIN,text:'Седьмой, это Левин. «Арахна» объявила Ночь Охоты. До рассвета десять минут, потом я открою шлюз. Держись крыш.'},
    {at:60,duration:12,from:LEVIN,text:'На крышах есть щитки с красной лампой. Попади в щиток паутиной: квартал погаснет, и Охотник на 15 секунд потеряет след.'},
    {at:120,duration:12,from:LEVIN,text:'Нужен быстрый рывок? ЛКМ по одной стене, потом по другому зданию — две нити. Натяжение за полсекунды. Посмотри в сторону полёта и нажми ЛКМ ещё раз или Пробел!'},
    {at:180,duration:13,from:LEVIN,text:'Курьер «Арахны» бросил на крыше флешку с протоколами опытов. Маяк уже горит. У тебя 100 секунд. Это улика.'},
    {at:300,duration:12,from:ARACHNA,text:'«Объекту №6 ввести вторую дозу. Седьмого вернуть живым. Свидетелей не оставлять».'},
    {at:360,duration:13,from:LEVIN,text:'Вторая флешка — журнал серверов «Арахны». Снова 100 секунд. С двумя флешками я смогу выложить всё.'},
    {at:420,duration:16,from:HUNTER,text:'…доза кончилась… руки трясутся… Я тоже был экспериментом. Объект №6. Меня сделали так же, как тебя.'},
    {at:436,duration:14,from:LEVIN,text:'Он прав, Шестой есть в журналах. Твой яд нейтрализует стимулятор. Подойди и держи E — или беги, пока ему не прислали новую дозу.'},
    {at:480,duration:14,from:LEVIN,text:'Ещё две минуты. Готовлю шлюз. Охотник на новой дозе, он быстрее прежнего — не спускайся на землю.',alt:'Ещё две минуты. Шестой идёт с тобой: «Арахна» охотится уже на вас обоих. Держитесь крыш.'},
    {at:600,duration:20,from:LEVIN,text:'Шлюз открыт! Быстрее в тоннель, Седьмой.',alt:'Шлюз открыт! Уходите оба, быстрее!'}
  ];
  const DRIVES=[{at:180,ttl:100,name:'ФЛЕШКА: ПРОТОКОЛЫ'},{at:360,ttl:100,name:'ФЛЕШКА: ЖУРНАЛ СЕРВЕРОВ'}];
  const CHOICE_AT=420,CHOICE_TTL=45,HELP_TIME=1.5,HELP_RANGE=3.6,PICKUP=2.6;
  const RESCUE_AT=480,RESCUE_TIME=5,RESCUE_RANGE=3;
  const ENDINGS={
    cells:{title:'ФИНАЛ: ОТКРЫТЫЕ КЛЕТКИ',text:'Ты вернулся туда, откуда бежал. Один за другим замки лаборатории погасли: клетки открыты. Левин отключил охрану, а ты вывел подопытных через служебный ход. На рассвете город увидел их силуэты на крышах. «Арахна» потеряла своих пленников — и право называть их объектами. Это уже не побег одного. Это начало свободы для всех.'},
    truth:{title:'ФИНАЛ: ПРАВДА',text:'Обе флешки у Левина, Шестой свободен. К утру протоколы «Арахны» во всех новостях, лабораторию опечатывают. Два бывших эксперимента уходят по тоннелю вместе — больше за ними никто не придёт.'},
    expose:{title:'ФИНАЛ: РАЗОБЛАЧЕНИЕ',text:'Ты унёс обе флешки, и Левин выложил их в сеть. «Арахне» конец. Но Шестой остался наверху на новой дозе — его судьбу решит уже суд, а не корпорация.'},
    allies:{title:'ФИНАЛ: ДВА БЕГЛЕЦА',text:'Улик не хватило, «Арахна» уцелела. Зато за шлюзом вас двое: Седьмой и Шестой. Охота не закончилась — теперь охотятся на обоих.'},
    escape:{title:'ФИНАЛ: ПОБЕГ',text:'Шлюз закрылся за тобой, Охотник остался снаружи. Ты свободен, но «Арахна» цела и продолжит опыты. Может быть, в следующую ночь ты успеешь больше.'}
  };
  function state(g){return g.story||(g.story={drives:0,fired:{},objective:null,radio:null,helped:false,decided:false,help:0});}
  function say(g,from,text,duration=12){state(g).radio={from,text,at:g.elapsed,duration};}
  // Детерминированный выбор крыши в 60–140 м от паука, доступной по высоте.
  function pickRoof(g,salt){
    const p=g.player,list=R.query(p.x-140,p.z-140,p.x+140,p.z+140).filter(s=>!s.part&&s.h<62&&s.type!==4)
      .filter(b=>{const d=Math.hypot(b.x+b.w/2-p.x,b.z+b.d/2-p.z);return d>60&&d<140;});
    const pool=list.length?list:R.buildings;
    const b=pool[Math.abs(Math.floor(salt*7919+p.x*13+p.z*7))%pool.length];
    return {x:b.x+1.2,y:b.h+.8,z:b.z+1.2,building:b.id};
  }
  function radioAt(elapsed,story){
    const live=story&&story.radio;
    if(live&&elapsed>=live.at&&elapsed<live.at+live.duration)return live;
    if(story&&story.freed&&elapsed>=600)return {from:LEVIN,text:'Все вышли. Служебный ход свободен. Седьмой, ты открыл не только свою клетку.'};
    if(story&&story.rescue&&elapsed>=480&&elapsed<498)return {from:LEVIN,text:'Маяк ведёт к аварийному терминалу лаборатории. Держи E пять секунд рядом с ним, чтобы освободить подопытных. Или продолжай побег — выбор за тобой.'};
    const m=messages.find(m=>elapsed>=m.at&&elapsed<m.at+m.duration);
    if(!m)return null;
    return story&&story.helped&&m.alt?{...m,text:m.alt}:m;
  }
  function update(g,input={},dt=1/120){
    if(g.mode!=='story'||g.state!=='playing')return;
    const s=state(g),t=g.elapsed,p=g.player,h=g.hunter;
    // События физики: короткое замыкание щитка.
    for(const e of g.events||[])if(e.type==='blackout')say(g,LEVIN,'Квартал обесточен! Охотник ослеп на 15 секунд — уходи из его поля зрения.',8);
    g.events=[];
    DRIVES.forEach((d,i)=>{
      const key='drive'+i;
      if(t>=d.at&&!s.fired[key]){s.fired[key]=true;s.objective={type:'drive',index:i,name:d.name,until:d.at+d.ttl,...pickRoof(g,i+1)};}
    });
    const o=s.objective;
    if(o&&o.type==='drive'){
      if(Math.hypot(p.x-o.x,p.y-o.y,p.z-o.z)<PICKUP){
        s.drives++;s.objective=null;
        say(g,LEVIN,s.drives>=2?'Обе флешки у тебя! Этого хватит, чтобы утопить «Арахну».':'Есть первая флешка. Держи её крепче, Седьмой.',8);
      }else if(t>=o.until){s.objective=null;say(g,LEVIN,'Маяк погас — курьер «Арахны» забрал флешку. Ничего, главное выжить.',8);}
    }
    if(t>=CHOICE_AT&&!s.fired.choice){
      s.fired.choice=true;h.mode='withdrawal';h.vx=h.vz=0;
      s.choice={until:CHOICE_AT+CHOICE_TTL};
    }
    if(s.choice&&!s.decided){
      const near=Math.hypot(p.x-h.x,p.y-h.y,p.z-h.z)<HELP_RANGE;
      s.help=near&&input.interact?s.help+dt:Math.max(0,s.help-dt*.5);
      if(s.help>=HELP_TIME){
        s.decided=true;s.helped=true;h.mode='ally';
        say(g,HUNTER,'…отпустило. Спасибо, Седьмой. Я пойду за тобой и прикрою. Больше я на них не работаю.',10);
      }else if(t>=s.choice.until){
        s.decided=true;h.mode='chase';h.dosed=true;h.cd=2;
        s.assaultAt=t;
        say(g,ARACHNA,'«Объект №6 снова в строю. Поднять отряды захвата, пулемётные машины и ракетные расчёты. Авиации — перекрыть крыши». Левин: красный луч — прицеливание; меняй направление, стены прикроют. Щиток сорвёт их наведение.',15);
      }
    }
    if(t>=RESCUE_AT&&!s.fired.rescue){
      s.fired.rescue=true;
      s.rescue={...pickRoof(g,7),hold:0};
      say(g,'НЕИЗВЕСТНЫЙ СИГНАЛ','Седьмой… мы ещё в клетках. На крыше лаборатории есть аварийный терминал. Маяк включён. Вернёшься — держи E пять секунд, и замки откроются. До рассвета две минуты.',18);
    }
    if(s.rescue&&!s.freed){
      const r=s.rescue,near=Math.hypot(p.x-r.x,p.y-r.y,p.z-r.z)<RESCUE_RANGE;
      r.hold=near&&input.interact?r.hold+dt:0;
      if(r.hold>=RESCUE_TIME){
        s.freed=true;
        say(g,LEVIN,s.helped?'Замки открыты! Шестой прикроет служебный ход. Выводи остальных, я отключаю охрану. Сегодня никто не останется в клетке.':'Замки открыты! Я отключаю охрану и веду подопытных к служебному ходу. Держись до рассвета — вы уйдёте вместе.',18);
      }
    }
  }
  function ending(g){const s=state(g);return s.freed?'cells':s.drives>=2&&s.helped?'truth':s.drives>=2?'expose':s.helped?'allies':'escape';}
  // HUD: текущая цель сюжета, null если цели нет.
  function objective(g){
    const s=state(g),t=g.elapsed;
    if(s.rescue&&!s.freed)return {kind:'rescue',label:'ОТКРЫТЫЕ КЛЕТКИ · ДЕРЖИ E У ТЕРМИНАЛА',x:s.rescue.x,y:s.rescue.y,z:s.rescue.z,left:Math.max(0,Math.ceil(R.DURATION-t)),progress:Math.min(1,s.rescue.hold/RESCUE_TIME)};
    if(s.objective&&s.objective.type==='drive')return {kind:'drive',label:s.objective.name,x:s.objective.x,y:s.objective.y,z:s.objective.z,left:Math.max(0,Math.ceil(s.objective.until-t))};
    if(s.choice&&!s.decided)return {kind:'help',label:'ПОМОЧЬ ШЕСТОМУ — ПОДОЙДИ И ДЕРЖИ E',x:g.hunter.x,y:g.hunter.y,z:g.hunter.z,left:Math.max(0,Math.ceil(s.choice.until-t)),progress:Math.min(1,s.help/HELP_TIME)};
    return null;
  }
  const api={title,intro,messages,DRIVES,ENDINGS,CHOICE_AT,CHOICE_TTL,HELP_TIME,RESCUE_AT,RESCUE_TIME,RESCUE_RANGE,radioAt,update,ending,objective,pickRoof,state};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SpiderStory=api;
})(typeof window!=='undefined'?window:globalThis);
