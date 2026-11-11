import {t,locale} from './i18n.mjs';
import {recordKey,dayKey,parseDay,calendarWeeks,periodBounds} from './journal-view.mjs';
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function createJournalControls({journal,getRecords,render,locked}){
 const state={period:{mode:'recent'},selecting:false,selected:new Set()};let month=dayKey(new Date()).slice(0,7),visible=[];
 const safe=fn=>{try{fn();}catch(e){$('people-error').textContent=e.message;}};
 const close=id=>$(id).close();
 document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>close(b.dataset.close));
 function reset(){state.selecting=false;state.selected.clear();}
 function period(mode,day){state.period={mode,day};reset();close('calendar-dialog');render();}
 $('person').onchange=()=>{journal.setPerson($('person').value);reset();render();};
 $('recent-period').onclick=()=>period('recent');
 $('manage-people').onclick=()=>{people();$('people-error').textContent='';$('people-dialog').showModal();};
 function people(){
  $('people-list').replaceChildren(...journal.state.people.map(p=>{
   const form=node('form',undefined,'person-row'),input=node('input');input.value=p.name;input.maxLength=40;input.required=true;input.setAttribute('aria-label',t('Имя: ')+p.name);
   const save=node('button','✓','quiet-icon');save.setAttribute('aria-label',t('Сохранить имя ')+p.name);
   const remove=node('button','×','quiet-icon');remove.type='button';remove.setAttribute('aria-label',t('Удалить профиль ')+p.name);
   form.onsubmit=e=>{e.preventDefault();safe(()=>{journal.renamePerson(p.id,input.value);render();people();});};
   remove.onclick=()=>{
    const box=node('div',undefined,'delete-person');box.append(node('p',t('Удалить профиль «{0}»?',p.name)),node('p',t('Измерения сохранятся в «Без владельца».'),'dialog-hint'));
    const yes=node('button',t('Удалить профиль')),no=node('button',t('Отмена'),'text-button');yes.type=no.type='button';yes.onclick=()=>safe(()=>{journal.removePerson(p.id);reset();render();people();});no.onclick=people;box.append(yes,no);form.replaceWith(box);
   };form.append(input,save,remove);return form;
  }));
 }
 $('add-person').onsubmit=e=>{e.preventDefault();safe(()=>{journal.addPerson($('person-name').value);$('person-name').value='';reset();people();render();});};
 $('select-records').onclick=()=>{state.selecting=!state.selecting;state.selected.clear();render();};
 $('cancel-selection').onclick=()=>{reset();render();};
 $('select-all').onchange=()=>{for(const r of visible){const key=recordKey(r);$('select-all').checked?state.selected.add(key):state.selected.delete(key);}render();};
 $('move-records').onclick=()=>{
  $('move-people').replaceChildren(...[...journal.state.people,{id:'',name:t('Без владельца')}].map(p=>{
   const b=node('button',p.name,'person-choice');b.onclick=()=>safe(()=>{journal.moveRecords(state.selected,p.id);reset();close('move-dialog');render();});return b;
  }));$('move-dialog').showModal();
 };
 function calendar(){
  const records=getRecords(),counts=new Map();for(const r of records)if(r.timestamp){const k=r.timestamp.slice(0,10);counts.set(k,(counts.get(k)||0)+1);}
  $('month-select').textContent=parseDay(month+'-01').toLocaleDateString(locale,{month:'long',year:'numeric'});
  $('month-select').disabled=![...counts.keys()].some(k=>k.startsWith(month));
  $('month-select').onclick=()=>period('month',month+'-01');
  const selected=state.period.day?periodBounds(state.period.mode,state.period.day):null;
  $('calendar-grid').replaceChildren(...calendarWeeks(month).map(week=>{
   const row=node('div',undefined,'calendar-week'),button=node('button','›','week-pick');button.setAttribute('aria-label',t('Неделя с ')+parseDay(week[0]).toLocaleDateString(locale));button.disabled=!week.some(d=>counts.has(d));button.onclick=()=>period('week',week[0]);row.append(button);
   for(const key of week){const b=node('button',String(parseDay(key).getDate()),'calendar-day');b.classList.toggle('outside',!key.startsWith(month));b.classList.toggle('has-records',counts.has(key));b.classList.toggle('selected',!!selected&&key>=selected[0]&&key<=selected[1]);b.classList.toggle('today',key===dayKey(new Date()));b.disabled=!counts.has(key);b.setAttribute('aria-label',parseDay(key).toLocaleDateString(locale)+t(', измерений: ')+(counts.get(key)||0));b.onclick=()=>period('day',key);row.append(b);}return row;
  }));
  const unknown=records.filter(r=>!r.timestamp).length;$('undated-period').hidden=!unknown;$('undated-period').textContent=t('Без даты · {0}',unknown);
 }
 $('calendar-open').onclick=()=>{const dated=getRecords().filter(r=>r.timestamp).sort((a,b)=>b.timestamp.localeCompare(a.timestamp));month=state.period.day?.slice(0,7)||dated[0]?.timestamp.slice(0,7)||dayKey(new Date()).slice(0,7);calendar();$('calendar-dialog').showModal();};
 for(const [id,delta] of [['month-prev',-1],['month-next',1]])$(id).onclick=()=>{const d=parseDay(month+'-01');d.setMonth(d.getMonth()+delta);month=dayKey(d).slice(0,7);calendar();};
 $('undated-period').onclick=()=>period('undated');
 return {...state,get period(){return state.period;},get selecting(){return state.selecting;},reset,
  checkbox(r){const input=node('input');input.type='checkbox';input.checked=state.selected.has(recordKey(r));input.setAttribute('aria-label',t('Выбрать измерение ')+r.sequence);input.onchange=()=>{input.checked?state.selected.add(recordKey(r)):state.selected.delete(recordKey(r));render();};return input;},
  render(rows,firstRun){
   visible=rows;$('journal-nav').hidden=firstRun;
   $('person').replaceChildren(...[...journal.state.people,{id:'',name:t('Без владельца')}].map(p=>{const o=node('option',p.name);o.value=p.id;return o;}));$('person').value=journal.state.activePerson;
   $('person').disabled=$('manage-people').disabled=locked();
   const p=state.period;let label=t('Последние 30');if(p.mode==='undated')label=t('Без даты');else if(p.mode==='day')label=parseDay(p.day).toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'});else if(p.mode==='month')label=parseDay(p.day).toLocaleDateString(locale,{month:'long',year:'numeric'});else if(p.mode==='week'){const [a,b]=periodBounds('week',p.day);label=`${parseDay(a).toLocaleDateString(locale,{day:'numeric',month:'short'})} — ${parseDay(b).toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'})}`;}
   $('recent-period').textContent=label+(p.mode==='recent'?'':' ×');$('recent-period').title=p.mode==='recent'?t('Последние 30 измерений'):t('Вернуться к последним 30');
   $('history').classList.toggle('selecting-records',state.selecting);$('selection-bar').hidden=!state.selecting;$('select-records').hidden=state.selecting||!rows.length;
   $('selection-count').textContent=t('Выбрано: {0}',state.selected.size);$('move-records').disabled=!state.selected.size;
   $('select-all').checked=rows.length>0&&rows.every(r=>state.selected.has(recordKey(r)));$('select-all').indeterminate=state.selected.size>0&&!$('select-all').checked;
  }
 };
}
