import {t,locale} from './i18n.mjs';
import {recordKey,defaultPeople,validatePeople,assignNew,removePerson} from './journal-view.mjs';
import {decodeRecord,decodePpi,decodeSettings,unhex} from './protocol.mjs';
export const KEY='x1g-journal-v1';
const sourceOK=s=>typeof s==='string'&&s.length>0&&s.length<=150;
function decodeHex(r,length,decode,i){if(!r||typeof r.hex!=='string'||r.hex.length!==length*2)throw Error(t('Некорректная запись в файле'));return decode(unhex(r.hex),i);}
export function normalizeSnapshot(input){
  if(!input||!sourceOK(input.device)||!Array.isArray(input.slots)||input.slots.length>100)throw Error(t('Ожидается файл истории X1-G (.history.json)'));
  const result={device:input.device,slots:input.slots.map((r,i)=>decodeHex(r,14,decodeRecord,i))};
  if(input.ppi_slots!==undefined){if(!Array.isArray(input.ppi_slots)||input.ppi_slots.length>30)throw Error(t('Некорректная память PPI'));result.ppi_slots=input.ppi_slots.map((r,i)=>decodeHex(r,80,decodePpi,i));}
  if(input.settings!==undefined)result.settings=decodeHex(input.settings,68,decodeSettings);
  return result;
}
function merge(old,rows,device){
  const map=new Map(old.map(r=>[r.device+':'+r.hex,r])),now=new Date().toISOString();let added=0;
  for(const r of rows){const key=device+':'+r.hex,prior=map.get(key);if(!prior)added++;map.set(key,{...r,device,received_at:prior?.received_at||now});}
  return {records:[...map.values()],added};
}
export function mergeRecords(old,snapshot){const {device,slots}=normalizeSnapshot(snapshot);return merge(old,slots.filter(r=>!r.empty),device);}
export function mergeSnapshot(state,input){
  const s=normalizeSnapshot(input),bp=mergeRecords(state.records,s);
  const ppi=merge(state.ppi_records||[],(s.ppi_slots||[]).filter(r=>!r.fill_pattern),s.device);
  const settingsByDevice={...state.settingsByDevice};
  if(s.settings)settingsByDevice[s.device]={...s.settings,read_at:input.read_at||new Date().toISOString()};
  return {state:{...state,records:bp.records,ppi_records:ppi.records,settingsByDevice},added:bp.added};
}
export function importHistory(state,input){
  if(input.version!==1||!Array.isArray(input.records)){const result=mergeSnapshot(state,input);return {...result,state:assignNew(result.state,state.records)};}
  // Validate and decode every raw record before the caller commits anything.
  const existingKeys=new Set(state.records.map(recordKey));
  let next=state,added=0;
  if(input.people!==undefined){
    const incoming=validatePeople(input.people),people=[...(state.people||defaultPeople())];
    for(const p of incoming){const i=people.findIndex(x=>x.id===p.id);if(i<0)people.push(p);else if(!state.records.length)people[i]=p;}
    next={...next,people};
  }
  for(const [key,size] of [['records',14],['ppi_records',80]]){
    const rows=input[key]??[];if(!Array.isArray(rows))throw Error(t('Некорректный журнал'));
    for(const r of rows){if(!sourceOK(r?.device))throw Error(t('Некорректный источник'));
      decodeHex(r,size,size===14?decodeRecord:decodePpi);
      const result=mergeSnapshot(next,{device:r.device,slots:key==='records'?[r]:[],...(key==='ppi_records'?{ppi_slots:[r]}:{})});
      next=result.state;added+=result.added;
    }
  }
  if(input.settingsByDevice!==undefined){
    if(!input.settingsByDevice||typeof input.settingsByDevice!=='object'||Array.isArray(input.settingsByDevice))throw Error(t('Некорректные настройки'));
    for(const [device,settings] of Object.entries(input.settingsByDevice)){
      next=mergeSnapshot(next,{device,slots:[],settings,read_at:settings.read_at}).state;
    }
  }
  const owners={...next.owners},valid=new Set((next.people||defaultPeople()).map(p=>p.id));
  if(input.owners!==undefined&&(!input.owners||typeof input.owners!=='object'||Array.isArray(input.owners)))throw Error(t('Некорректные владельцы записей'));
  for(const r of next.records){const key=recordKey(r);if(existingKeys.has(key))continue;
    const owner=input.owners?.[key]??state.activePerson??'me';
    if(owner!==''&&!valid.has(owner))throw Error(t('Неизвестный владелец измерения'));owners[key]=owner;
  }
  return {state:{...next,owners},added};
}
export class Journal {
  constructor(storage){
    this.storage=storage;this.state={people:defaultPeople(),activePerson:'me',owners:{},version:1,records:[],ppi_records:[],settingsByDevice:{},snapshots:[],backups:[],lastSync:null};
    const raw=storage.getItem(KEY);if(raw){const s=JSON.parse(raw);if(s.version!==1||!Array.isArray(s.records)||!Array.isArray(s.snapshots)||!Array.isArray(s.backups))throw Error(t('Локальный журнал повреждён. Сохраните данные браузера до дальнейшей синхронизации.'));
      this.state={...importHistory(this.state,s).state,snapshots:s.snapshots,backups:s.backups,lastSync:s.lastSync,syncCache:s.syncCache||{}};
      if(s.people!==undefined)this.state.people=validatePeople(s.people);
      this.state.activePerson=this.state.people.some(p=>p.id===s.activePerson)?s.activePerson:s.activePerson===''?'':this.state.people[0]?.id||'';}
  }
  commit(next){this.storage.setItem(KEY,JSON.stringify(next));this.state=next;}
  save(snapshot,person=this.state.activePerson){const result=mergeSnapshot(this.state,snapshot);this.commit({...assignNew(result.state,this.state.records,person),snapshots:[...this.state.snapshots,structuredClone(snapshot)].slice(-20)});return result.added;}
  setPerson(id){if(id!==''&&!this.state.people.some(p=>p.id===id))throw Error(t('Человек не найден'));this.commit({...this.state,activePerson:id});}
  addPerson(name){name=name.trim();if(!name||name.length>40)throw Error(t('Введите имя до 40 символов'));if(this.state.people.length>=50)throw Error(t('Достигнут предел профилей'));const id=crypto.randomUUID();this.commit({...this.state,people:[...this.state.people,{id,name}],activePerson:id});}
  renamePerson(id,name){name=name.trim();if(!name||name.length>40)throw Error(t('Введите имя до 40 символов'));this.commit({...this.state,people:this.state.people.map(p=>p.id===id?{...p,name}:p)});}
  removePerson(id){this.commit(removePerson(this.state,id));}
  moveRecords(keys,id){if(id!==''&&!this.state.people.some(p=>p.id===id))throw Error(t('Человек не найден'));const owners={...this.state.owners};for(const r of this.state.records)if(keys.has(recordKey(r)))owners[recordKey(r)]=id;this.commit({...this.state,owners});}
  backup(device,data){this.commit({...this.state,backups:[...this.state.backups,{device,at:new Date().toISOString(),...data}].slice(-20)});}
  checkpoint(id){return this.state.syncCache?.[id]??null;}
  completed(id,checkpoint){this.commit({...this.state,lastSync:new Date().toISOString(),syncCache:{...this.state.syncCache,...(id&&checkpoint?{[id]:checkpoint}:{})}});}
}
