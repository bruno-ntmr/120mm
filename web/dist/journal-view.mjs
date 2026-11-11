import {t,locale} from './i18n.mjs';
export const recordKey=r=>JSON.stringify([r.device,r.hex]);
export const defaultPeople=()=>[{id:'me',name:t('Я')}];
export function validatePeople(people){
 if(!Array.isArray(people)||people.length>50||people.some(p=>!p||typeof p.id!=='string'||!p.id||p.id.length>100||typeof p.name!=='string'||!p.name.trim()||p.name.length>40)||new Set(people.map(p=>p.id)).size!==people.length)throw Error(t('Некорректные профили людей'));
 return people.map(p=>({id:p.id,name:p.name.trim()}));
}
export function familyState(state){return {...state,people:state.people??defaultPeople(),activePerson:state.activePerson??'me',owners:state.owners??{}};}
export function ownerOf(state,r){return Object.hasOwn(state.owners||{},recordKey(r))?state.owners[recordKey(r)]:'me';}
export function assignNew(state,previous,person=state.activePerson??'me'){
 if(person!==''&&!(state.people||defaultPeople()).some(p=>p.id===person))person='';
 const known=new Set(previous.map(recordKey)),owners={...state.owners};
 for(const r of state.records)if(!known.has(recordKey(r)))owners[recordKey(r)]=person;
 return {...state,owners};
}
export function removePerson(state,id){
 const people=state.people.filter(p=>p.id!==id),owners={...state.owners};
 for(const r of state.records)if(ownerOf(state,r)===id)owners[recordKey(r)]='';
 return {...state,people,owners,activePerson:state.activePerson===id?'':state.activePerson};
}
export function dayKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function parseDay(key){const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d,12);}
export function periodBounds(mode,key){
 const start=parseDay(key),end=parseDay(key);
 if(mode==='week'){start.setDate(start.getDate()-(start.getDay()+6)%7);end.setTime(+start);end.setDate(end.getDate()+6);}
 if(mode==='month'){start.setDate(1);end.setMonth(end.getMonth()+1,0);}
 return [dayKey(start),dayKey(end)];
}
export function filterPeriod(records,period={mode:'recent'}){
 const rows=[...records].sort((a,b)=>{
  if(a.timestamp&&b.timestamp)return b.timestamp.localeCompare(a.timestamp)||b.sequence-a.sequence;
  if(!!a.timestamp!==!!b.timestamp)return a.timestamp?-1:1;
  return b.sequence-a.sequence;
 });
 if(period.mode==='recent')return rows.slice(0,30);
 if(period.mode==='undated')return rows.filter(r=>!r.timestamp);
 const [from,to]=periodBounds(period.mode,period.day);
 return rows.filter(r=>r.timestamp&&r.timestamp.slice(0,10)>=from&&r.timestamp.slice(0,10)<=to);
}
export function calendarWeeks(month){
 const start=parseDay(month+'-01');start.setDate(start.getDate()-(start.getDay()+6)%7);
 return Array.from({length:6},(_,w)=>Array.from({length:7},(_,d)=>{const day=new Date(start);day.setDate(day.getDate()+w*7+d);return dayKey(day);}));
}
