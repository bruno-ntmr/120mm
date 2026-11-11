import {t,locale,localizeMarkup} from './i18n.mjs';
import {ownerOf,filterPeriod} from './journal-view.mjs';
import {createJournalControls} from './journal-controls.mjs';
import {UUID,synchronize,decodeRecord} from './protocol.mjs';
import {observe} from './live.mjs';
import {MeasurementCycle} from './measurement-cycle.mjs';
const measurementCycle=new MeasurementCycle();
import {Journal,importHistory} from './store.mjs';
localizeMarkup(document);
const $=id=>document.getElementById(id);
function closeSettings(){$('settings').hidden=true;$('settings-toggle').setAttribute('aria-expanded','false');}
$('settings-toggle').onclick=()=>{const open=$('settings').hidden;$('settings').hidden=!open;$('settings-toggle').setAttribute('aria-expanded',String(open));};
document.addEventListener('click',e=>{if(!e.target.closest('#settings')&&!e.target.closest('#settings-toggle'))closeSettings();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSettings();});
let journal,device=null,busy=false,selecting=false,demo=false,selectedSource='',autoErrors=0;
let diagnostic=[];
let liveBattery=null;
function renderBattery(){
  const value=liveBattery;
  const known=!demo&&!!device?.gatt.connected&&Number.isFinite(value)&&value>=0&&value<=100;
  $('battery').hidden=!known;
  $('battery-percent').textContent=known?`${value}%`:'—';
  $('battery-fill').setAttribute('width',known?String(16*value/100):'0');
  $('battery').classList.toggle('low',known&&value<=20);
  const label=known?t('Заряд {0}%',value):t('Заряд неизвестен');
  $('battery').setAttribute('aria-label',label);$('battery').title=label;
}
let measurementActive=false,measurementDismissed=false,completionTimer=null,countdownTimer=null,resultDisplayed=false;
function showResultCountdown(){
  clearInterval(countdownTimer);resultDisplayed=true;
  $('live-title').textContent=t('Измерение завершено');$('live-status').textContent='';
  $('result-countdown').hidden=false;
  const deadline=Date.now()+3000;$('countdown-seconds').textContent='3';
  countdownTimer=setInterval(()=>{const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));$('countdown-seconds').textContent=left;if(!left){clearInterval(countdownTimer);$('live-overlay').hidden=true;}},100);
}
function closeMeasurement(){ clearInterval(countdownTimer);$('live-overlay').hidden=true;measurementDismissed=true; }
$('close-live').onclick=closeMeasurement;
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMeasurement();});
let liveController=null,liveResult=null,liveStatus='off',liveTask=null,retryTimer=null,retryDelay=2000,unloading=false;
function scheduleWatch(delay=0){
  clearTimeout(retryTimer);
  if(!device||demo||unloading||!supported||(window.x1Native&&document.hidden))return;
  retryTimer=setTimeout(()=>{if(!busy&&!selecting&&!liveController)liveTask=watch();},delay);
}
async function pauseWatch(){
  clearTimeout(retryTimer);
  if(liveController){liveController.abort();await liveTask;}
  clearTimeout(retryTimer);
}
function log(line){diagnostic.push(new Date().toISOString()+' '+line);diagnostic=diagnostic.slice(-300);}
function connectionError(e){
  if(e.message.includes('Unsupported device')){
    device=null;
    try{localStorage.removeItem('x1g-device-id');}catch{}
    return t('Chrome отверг выбранное подключение. Нажмите кнопку ещё раз и выберите устройство из нового BLE-поиска. Системную пару удалять не нужно.');
  }
  return e.message;
}
function message(text,type=''){$('notice').textContent=text;$('notice').className='notice '+type;$('notice').hidden=!text||type==='success';}
try{journal=new Journal(localStorage);}catch(e){message(e.message,'error');}
const supported=!!navigator.bluetooth && window.isSecureContext;
if(!supported && journal)message(t('Для Bluetooth откройте страницу в Chrome на компьютере или Android через HTTPS либо localhost. Импорт и экспорт доступны здесь.'));
let demoRecords=[],measurementPerson=null;
const controls=journal?createJournalControls({journal,getRecords:personRecords,render,locked:()=>demo||selecting||measurementActive||(busy&&!liveController)}):null;
function personRecords(){return (demo?demoRecords:journal?.state.records||[]).filter(r=>(demo||ownerOf(journal.state,r)===journal.state.activePerson)&&(!selectedSource||r.device===selectedSource));}
function visibleRecords(){return filterPeriod(personRecords(),controls?.period);}
function dateLabel(r){return r.timestamp?new Date(r.timestamp).toLocaleString(locale,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):t('Без даты');}
function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function render(){
  const records=demo?demoRecords:journal?.state.records||[];
  const firstRun=!demo&&!device&&!localStorage.getItem('x1g-device-id')&&!records.length;
  document.documentElement.classList.toggle('first-run',firstRun);
  $('overview-data').hidden=firstRun;$('history').hidden=firstRun;
  $('settings-toggle').hidden=firstRun;
  if(firstRun)closeSettings();
  const sources=[...new Set(records.map(r=>r.device))];
  if(!sources.includes(selectedSource))selectedSource=sources.at(-1)||'';
  $('source').replaceChildren(...(sources.length?sources.map(s=>{const o=el('option',s);o.value=s;return o;}):[el('option',t('Нет данных'))]));$('source').value=selectedSource;
  const rows=visibleRecords(),latest=rows[0];
  $('sys').textContent=latest?.systolic??'—';$('dia').textContent=latest?.diastolic??'—';$('pulse').textContent=latest?.pulse??'—';$('latest-date').textContent=latest?dateLabel(latest):t('Пока нет данных');$('count').textContent=rows.length;
  const unknown=rows.filter(r=>!r.timestamp).length;
  $('time-note').textContent=unknown?t('{0} без даты',unknown):'';
  $('source').closest('label').hidden=sources.length<2;
  $('rows').replaceChildren(...rows.map(r=>{const tr=el('tr');tr.append(selectionCell(r),el('td',dateLabel(r),r.timestamp?'':'unknown'),el('td',`${r.systolic} / ${r.diastolic}`),el('td',String(r.pulse)),flagIcons(r));return tr;}));
  if(!rows.length){const tr=el('tr'),td=el('td',t('Нет измерений за выбранный период.'),'table-empty');td.colSpan=5;tr.append(td);$('rows').append(tr);}
  $('demo-banner').hidden=!demo;
  $('csv').disabled=!rows.length||demo;$('json').disabled=!journal?.state.records.length||demo;
  $('disconnect').disabled=!device||selecting||(busy&&!liveController);
  $('sync').disabled=(busy&&!liveController)||liveStatus==='measuring'||selecting||!supported||!journal||demo;$('choose').disabled=(busy&&!liveController)||liveStatus==='measuring'||selecting||!supported||demo;$('import-file').disabled=busy||selecting||!journal||demo;
  const syncing=busy&&!liveController,iconOnly=!!device&&!firstRun;
  const syncLabel=syncing?t('Синхронизация…'):device?t('Обновить'):firstRun?(selecting?t('Выберите тонометр…'):t('Добавить тонометр')):t('Подключить');
  $('sync').classList.toggle('sync-icon-button',iconOnly);$('sync').classList.toggle('is-syncing',syncing);
  $('sync').setAttribute('aria-label',syncLabel);$('sync').setAttribute('title',syncLabel);$('sync').setAttribute('aria-busy',String(syncing));
  if(iconOnly)$('sync').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 19.5 10M4.5 14a8 8 0 0 0 13.4 3.9"/></svg>';
  else $('sync').replaceChildren(document.createTextNode(syncLabel),el('span','↗'));
  $('connection').textContent=liveController?(liveStatus==='measuring'?t('Измерение'):liveStatus==='connecting'?t('Подключение…'):liveStatus==='disconnected'?t('Нет связи'):t('На связи')):busy?t('Синхронизация'):device?'X1-G':t('Не подключён');$('connection').className='badge'+(device?' connected':'');
  renderBattery();
  controls?.render(rows,firstRun);
  document.querySelector('.latest h2').textContent=controls?.period.mode==='recent'?t('Последнее измерение'):t('Последнее за период');
  drawChart([...rows].reverse());
}
function selectionCell(r){const cell=el('td');if(controls)cell.append(controls.checkbox(r));return cell;}
function flagIcons(r){
  const cell=el('td',undefined,'record-flags');
  if(!r.flags){cell.textContent='—';return cell;}
  const icons=[
    {kind:'pulse',active:r.flags.irregular_pulse,label:r.flags.irregular_pulse?t('Нерегулярный пульс отмечен'):t('Нерегулярный пульс не отмечен'),paths:['M2 12h4l3-7 4 14 3-9 2 2h4']},
    {kind:'movement',active:r.flags.body_movement,label:r.flags.body_movement?t('Движение отмечено'):t('Движение не отмечено'),paths:['M8 4.5h8a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z','M9 7h6v5H9Z','M4 8v8','M1.5 10v4','M20 8v8','M22.5 10v4'],circle:[12,16,1]},

  ];
  const group=el('div',undefined,'flag-icons');
  for(const item of icons){
    const badge=el('span',undefined,`flag-icon ${item.kind} ${item.active?'active':'inactive'}`);
    badge.tabIndex=0;badge.setAttribute('role','img');badge.setAttribute('aria-label',item.label);
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    for(const[k,v]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.25','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(k,v);
    for(const d of item.paths){const path=document.createElementNS(ns,'path');path.setAttribute('d',d);svg.append(path);}
    if(item.circle){const circle=document.createElementNS(ns,'circle');['cx','cy','r'].forEach((k,i)=>circle.setAttribute(k,item.circle[i]));svg.append(circle);}
    badge.append(svg);group.append(badge);
  }
  cell.append(group);return cell;
}
const emptyChart=$('chart').innerHTML;
let chartRows=[],chartWidth=0;
new ResizeObserver(()=>{const width=$('chart').clientWidth;if(width!==chartWidth){chartWidth=width;drawChart(chartRows);}}).observe($('chart'));
function drawChart(rows){
  chartRows=rows;
  if(!rows.length){if(journal?.state.records.length){const empty=el('div',t('Нет измерений за этот период'),'empty');$('chart').replaceChildren(empty);}else{$('chart').innerHTML=emptyChart;$('show-demo').onclick=showDemo;}return;}
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${Math.max(260,$('chart').clientWidth-32)} 205`);svg.setAttribute('role','img');svg.setAttribute('aria-label',t('Давление за выбранный период. Систолическое и диастолическое.'));
  const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n;};
  const width=Math.max(260,$('chart').clientWidth-32),left=42,right=width-24,span=right-left;
  const low=Math.floor(Math.min(...rows.map(r=>r.diastolic))/20)*20-10,high=Math.ceil(Math.max(...rows.map(r=>r.systolic))/20)*20+10;
  const y=v=>175-(v-low)/(high-low)*155,x=i=>rows.length===1?(left+right)/2:left+i/(rows.length-1)*span;
  for(let v=Math.ceil(low/20)*20;v<=high;v+=20){add('line',{x1:left,x2:right,y1:y(v),y2:y(v),stroke:'var(--chart-grid,#242837)','stroke-dasharray':'3 5'});add('text',{x:32,y:y(v)+4,fill:'var(--chart-tick,#a5aec2)','font-size':13,'text-anchor':'end'},v);}
  for(const[field,color]of[['systolic','var(--chart-upper,#a78bfa)'],['diastolic','var(--chart-lower,#57c7bc)']]){add('polyline',{points:rows.map((r,i)=>`${x(i)},${y(r[field])}`).join(' '),fill:'none',stroke:color,'stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'});rows.forEach((r,i)=>{const c=add('circle',{cx:x(i),cy:y(r[field]),r:3.5,fill:color,stroke:'var(--chart-point-border,#151822)','stroke-width':1.5});});}
  const labelCount=Math.min(rows.length,Math.max(2,Math.floor(span/72)+1));
  const labelIndexes=new Set(Array.from({length:labelCount},(_,i)=>labelCount===1?0:Math.round(i*(rows.length-1)/(labelCount-1))));
  rows.forEach((r,i)=>{if(labelIndexes.has(i))add('text',{x:x(i),y:199,fill:'var(--chart-tick,#a5aec2)','font-size':13,'text-anchor':'middle'},r.timestamp?new Date(r.timestamp).toLocaleString(locale,controls?.period.mode==='day'?{hour:'2-digit',minute:'2-digit'}:{day:'2-digit',month:'2-digit'}):t('№{0}',r.sequence));});
  const guide=add('line',{x1:0,x2:0,y1:15,y2:180,stroke:'var(--chart-tick,#a1a9bf)','stroke-width':1,'stroke-dasharray':'4 4','pointer-events':'none',visibility:'hidden'});
  const markers=[['systolic','var(--chart-upper,#a78bfa)'],['diastolic','var(--chart-lower,#57c7bc)']].map(([field,color])=>({field,node:add('circle',{r:5,fill:color,stroke:'var(--chart-point-border,#141720)','stroke-width':2,'pointer-events':'none',visibility:'hidden'})}));
  const tooltip=el('div',undefined,'chart-tooltip');tooltip.hidden=true;tooltip.setAttribute('role','tooltip');tooltip.id='chart-tooltip';
  const date=el('div',undefined,'chart-tooltip-date'),pressure=el('div',undefined,'chart-tooltip-pressure'),pulse=el('div',undefined,'chart-tooltip-pulse');tooltip.append(date,pressure,pulse);
  $('chart').replaceChildren(svg,tooltip);
  svg.setAttribute('tabindex','0');svg.setAttribute('aria-describedby','chart-tooltip');
  let active=rows.length-1;
  const hide=()=>{tooltip.hidden=true;guide.setAttribute('visibility','hidden');markers.forEach(m=>m.node.setAttribute('visibility','hidden'));};
  const show=index=>{
    active=Math.max(0,Math.min(rows.length-1,index));const r=rows[active];
    guide.setAttribute('x1',x(active));guide.setAttribute('x2',x(active));guide.setAttribute('visibility','visible');
    for(const m of markers){m.node.setAttribute('cx',x(active));m.node.setAttribute('cy',y(r[m.field]));m.node.setAttribute('visibility','visible');}
    date.textContent=r.timestamp?dateLabel(r):t('№{0} · без даты',r.sequence);
    pressure.textContent=`${r.systolic} / ${r.diastolic}`;
    pulse.textContent=t('мм рт. ст. · пульс {0}',r.pulse);
    tooltip.hidden=false;
    const matrix=svg.getScreenCTM();if(!matrix)return;
    const point=new DOMPoint(x(active),15).matrixTransform(matrix),box=$('chart').getBoundingClientRect();
    const left=Math.max(8,Math.min(box.width-tooltip.offsetWidth-8,point.x-box.left-tooltip.offsetWidth/2));
    tooltip.style.left=`${left}px`;tooltip.style.top='0px';
  };
  const pointAt=e=>{const matrix=svg.getScreenCTM();if(!matrix)return;const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());show(rows.length===1?0:Math.round((point.x-left)/span*(rows.length-1)));};
  svg.addEventListener('pointermove',pointAt);svg.addEventListener('pointerdown',pointAt);
  svg.addEventListener('pointerleave',hide);svg.addEventListener('pointercancel',hide);
  svg.addEventListener('focus',()=>show(active));svg.addEventListener('blur',hide);
  svg.addEventListener('keydown',e=>{if(e.key==='Escape'){hide();return;}if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();show(e.key==='Home'?0:e.key==='End'?rows.length-1:active+(e.key==='ArrowRight'?1:-1));}});

}
async function choose(){
  if(selecting)return null;
  selecting=true;render();
  try{const chosen=await navigator.bluetooth.requestDevice({filters:[{services:[UUID.service]}],optionalServices:[UUID.service,UUID.info]});
  device=chosen;localStorage.removeItem('x1g-autoconnect-paused');liveBattery=null;log(t('Выбрано BLE-устройство: ')+(device.name||device.id));localStorage.setItem('x1g-device-id',device.id);return device;
  }finally{selecting=false;render();}
}
async function sync(register=false,afterMeasurement=false){
  if((busy&&!liveController)||liveStatus==='measuring'||selecting||!supported||!journal||demo)return;
  const personForSync=afterMeasurement?(measurementPerson??journal.state.activePerson):journal.state.activePerson;
  await pauseWatch();
  try{localStorage.removeItem('x1g-autoconnect-paused');if(!device)await restoreDevice(false);if(!device)await choose();}catch(e){if(e.name!=='NotFoundError')message(e.message,'error');return;}
  busy=true;render();message('');$('progress').value=0;$('sync-percent').textContent='0%';$('progress-wrap').hidden=false;let added=0,saved=false;
  try{
    const result=await synchronize(device,{register,previous:journal.checkpoint(device.id),log,progress:(s,n)=>{log(s);$('progress').value=n;$('sync-percent').textContent=`${Math.round(n)}%`;},save:data=>{added+=journal.save(data,personForSync);saved=true;selectedSource=data.device;render();},saveBackup:data=>journal.backup(device.name||device.id,data)});
    journal.completed(device.id,result.checkpoint);autoErrors=0;message(register?t('Регистрация завершена. Обычное подключение нужно проверить без кнопки.'):t('Синхронизация завершена. {0}',added?t('Новых записей: ')+added+'.':t('Новых измерений нет.')),'success');
  }catch(e){log('ERROR '+e.message);message((saved?t('История сохранена. Завершить сеанс не удалось. '):'')+connectionError(e),'error');if(++autoErrors>=3){log(t('Повторные ошибки синхронизации'));}}
  finally{busy=false;$('progress-wrap').hidden=true;render();scheduleWatch(500);}
}
function setLiveState(state){
  if(liveStatus===state)return;
  log(t('Наблюдение: ')+state);
  liveStatus=state;
  $('person').disabled=$('manage-people').disabled=state==='measuring'||selecting||(busy&&!liveController);
  $('live-panel').classList.toggle('measuring',state==='measuring');
  $('sync').disabled=(busy&&!liveController)||state==='measuring'||selecting||!supported||!journal||demo;
  const labels={off:t('Наблюдение выключено'),connecting:t('Подключение…'),waiting:t('Ожидаем данные. Запустите измерение кнопкой на тонометре.'),battery:t('Прибор на связи. Начните измерение кнопкой START.'),measuring:t('Идёт измерение'),result:t('Прибор передал результат'),device_error:t('Прибор сообщил об ошибке'),stale:t('Данные не поступают. Состояние измерения неизвестно.'),disconnected:t('Нет связи. Подключимся снова автоматически.')};
  if(!resultDisplayed)$('live-status').textContent=labels[state]||state;
  $('connection').textContent=state==='measuring'?t('Измерение'):state==='connecting'?t('Подключение…'):['stale','disconnected'].includes(state)?t('Нет данных'):t('На связи');
  if(state!=='measuring')$('live-pressure').textContent='—';
}
async function watch(){
  if(liveController||busy||selecting||!supported||demo||!device)return;
  liveBattery=null;
  busy=true;liveController=new AbortController();const controller=liveController;
  render();
  try{
    await observe(device,{signal:controller.signal,log,onState:setLiveState,onEvent:packet=>{
      const completedMeasurement=measurementCycle.accept(packet.kind);
      retryDelay=2000;
      // Battery packets can arrive between measurement packets.
      if(packet.kind!=='battery'||!['measuring','result','device_error'].includes(liveStatus))setLiveState(packet.kind);
      if(packet.kind==='measuring'){
        if(!measurementActive){measurementPerson=journal.state.activePerson;measurementDismissed=false;measurementActive=true;resultDisplayed=false;clearInterval(countdownTimer);$('result-countdown').hidden=true;$('live-title').textContent=t('Измерение');$('live-status').textContent=t('Идёт измерение');}
        clearTimeout(completionTimer);
        if(!measurementDismissed)$('live-overlay').hidden=false;
        $('live-pressure').textContent=packet.cuff_pressure;liveResult=null;}
      if(packet.kind==='battery'){liveBattery=packet.battery_percent;renderBattery();}
      if(packet.kind==='result'){
        if(liveResult?.hex!==packet.hex)log(t('Результат потока: ')+packet.hex);
        if(completedMeasurement){
          measurementActive=false;
          showResultCountdown();
          clearTimeout(completionTimer);
          completionTimer=setTimeout(()=>sync(false,true),1500);
        }
        liveResult=packet;$('result-sys').textContent=packet.systolic;$('result-dia').textContent=packet.diastolic;$('result-pulse').textContent=packet.pulse;
      }
      if(packet.kind==='device_error'){measurementActive=false;$('live-status').textContent=t('Ошибка {0}',packet.code);}
    }});
    setLiveState('off');
  }catch(e){setLiveState('disconnected');log(e.message);if(e.message.includes('Unsupported device'))message(connectionError(e),'error');}
  finally{liveBattery=null;liveController=null;busy=false;render();if(!controller.signal.aborted){scheduleWatch(retryDelay);retryDelay=Math.min(retryDelay*2,30000);}}
}
async function download(name,content,type){if(window.x1Native){try{await window.x1Native.exportFile(name,content,type);}catch(e){message(t('Не удалось сохранить файл: ')+e.message,'error');}return;}const url=URL.createObjectURL(new Blob([content],{type}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function showDemo(){
  if(busy||selecting)return;demo=true;
  demoRecords=Array.from({length:12},(_,i)=>{const raw=Uint8Array.from([97+[0,5,2,7,3,0,-2,4,1,-3,2,0][i],76+i%5,68+i%7,26,0,0,63,0,0,0,i+1,0,0,0]);return {...decodeRecord(raw,i),device:t('Пример · вымышленные данные')};});
  selectedSource='';render();
}
$('disconnect').onclick=async()=>{
  clearTimeout(completionTimer);clearInterval(countdownTimer);
  await pauseWatch();
  device?.gatt.disconnect();device=null;liveBattery=null;
  measurementActive=false;measurementCycle.active=false;resultDisplayed=false;
  $('live-overlay').hidden=true;
  try{localStorage.setItem('x1g-autoconnect-paused','1');}catch{}
  setLiveState('off');message('');closeSettings();render();
};
$('sync').onclick=()=>sync();$('choose').onclick=async()=>{await pauseWatch();try{await choose();closeSettings();}catch(e){if(e.name!=='NotFoundError')message(e.message,'error');}finally{scheduleWatch();}};
$('source').onchange=()=>{selectedSource=$('source').value;controls?.reset();render();};$('exit-demo').onclick=()=>{demo=false;selectedSource='';render();scheduleWatch();};
$('json').onclick=()=>download('x1g-journal.json',JSON.stringify(journal.state,null,2),'application/json');
$('csv').onclick=()=>{const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';const lines=[['person','sequence','device_time','systolic','diastolic','pulse','time_status','irregular_pulse','body_movement','cuff_fit_raw','consecutive_measurement_count'],...visibleRecords().map(r=>[journal.state.people.find(p=>p.id===ownerOf(journal.state,r))?.name||t('Без владельца'),r.sequence,r.timestamp,r.systolic,r.diastolic,r.pulse,r.time_status,r.flags?.irregular_pulse,r.flags?.body_movement,r.flags?.cuff_fit_raw,r.consecutive_measurement_count])];download('x1g-measurements.csv','\uFEFF'+lines.map(r=>r.map(quote).join(',')).join('\r\n'),'text/csv;charset=utf-8');};

$('import-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>5_000_000)throw Error(t('Файл слишком большой (максимум 5 МБ)'));
    const result=importHistory(journal.state,JSON.parse(await file.text()));
    journal.commit(result.state);selectedSource='';render();message(t('Импорт завершён. Новых записей: {0}.',result.added),'success');
  }catch(e){message(t('Импорт не выполнен: ')+e.message,'error');}finally{$('import-file').value='';}
};
window.addEventListener('beforeunload',()=>{unloading=true;clearTimeout(retryTimer);clearTimeout(completionTimer);clearInterval(countdownTimer);liveController?.abort();device?.gatt.disconnect();});
render();
let restoring=null;
async function restoreDevice(start=true){
  if(!supported||!navigator.bluetooth.getDevices||localStorage.getItem('x1g-autoconnect-paused')==='1')return;
  if(!device){
    restoring??=navigator.bluetooth.getDevices().finally(()=>{restoring=null;});
    const devices=await restoring;
    if(localStorage.getItem('x1g-autoconnect-paused')==='1')return;
    const id=localStorage.getItem('x1g-device-id');
    device??=devices.find(d=>d.id===id)||null;
    render();
  }
  if(start)scheduleWatch();
}
function resumeConnection(){restoreDevice().catch(e=>{log(t('Восстановление подключения: ')+e.message);});}
resumeConnection();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resumeConnection();else if(window.x1Native)pauseWatch();});
window.addEventListener('focus',()=>{if(window.x1Native)resumeConnection();});
