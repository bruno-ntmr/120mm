import {t,locale} from './i18n.mjs';
import {historyIndex,readHistory} from './history-sync.mjs';
// X1-G / HEM-7610T1-SHDS, firmware SI.W03.01.00 only.
export const UUID = {service: '0000fe4a-0000-1000-8000-00805f9b34fb', info: '0000180a-0000-1000-8000-00805f9b34fb', unlock: 'b305b680-aee7-11e1-a730-0002a5d5c51b', tx: 'db5b55e0-aee7-11e1-965e-0002a5d5c51b', rx: '49123040-aee8-11e1-a74d-0002a5d5c51b'};
export const hex = a => Array.from(a, x => x.toString(16).padStart(2, '0')).join('');
export function unhex(s) {
  if (typeof s !== 'string' || !/^(?:[a-f\d]{2})+$/i.test(s)) throw Error(t('Некорректные сырые данные'));
  return Uint8Array.from(s.match(/../g), x => parseInt(x, 16));
}
const xor = a => a.reduce((n, x) => n ^ x, 0);
const equal = (a,b) => a.length === b.length && a.every((v,i) => v === b[i]);
const packet = a => Uint8Array.from([...a, xor(a)]);
export function validateFrame(a) {
  if (a.length < 8 || a[0] !== a.length || xor(a)) throw Error(t('Повреждённый ответ тонометра'));
  return a;
}
export function readCommand(address, size) {
  if (!Number.isInteger(address) || address < 0 || address > 65535 || !Number.isInteger(size) || size < 1 || size > 56) throw Error(t('Недопустимый диапазон чтения'));
  return packet([8,1,0,address >> 8,address & 255,size,0]);
}
export function mirrorCommand(index) {
  if (index.length !== 20) throw Error(t('Некорректный индекс'));
  return packet([28,1,192,2,164,20,...index,0]);
}
export function registrationBlocks(snapshot, now = new Date()) {
  if (snapshot.length !== 68 || now.getFullYear() < 2024 || now.getFullYear() > 2050 || !Number.isFinite(+now)) throw Error(t('Неподдерживаемая дата или настройки'));
  if (hex(snapshot.slice(20,34)) !== 'ffff00000000000000000000fe01') throw Error(t('Профиль уже заполнен. Повторная регистрация этим способом не поддерживается; используйте обычную синхронизацию.'));
  const head = snapshot.slice(0,34), tail = snapshot.slice(48,60);
  if ((tail.slice(0,10).reduce((a,b) => a+b,0)&255) !== tail[10]) throw Error(t('Повреждён блок часов'));
  head.set([0,1,1],20); head.set([1,0,0,0],24);
  head[32] = head.slice(20,32).reduce((a,b)=>a+b,0)&255;
  tail[2] |= 1;
  tail.set([now.getFullYear()-2000,now.getMonth()+1,now.getDate(),now.getHours(),now.getMinutes(),now.getSeconds()],4);
  tail[10] = tail.slice(0,10).reduce((a,b)=>a+b,0)&255;
  return [{address:0x2a4,payload:head},{address:0x2d4,payload:tail}];
}
export function registrationCommand(address,payload) {
  if (!(address === 0x2a4 && payload.length === 34 || address === 0x2d4 && payload.length === 12)) throw Error(t('Недопустимый блок регистрации'));
  return packet([payload.length+8,1,192,address>>8,address&255,payload.length,...payload,0]);
}
export function decodeRecord(raw, slot=0) {
  if (raw.length !== 14) throw Error(t('Запись должна содержать 14 байт'));
  const result = {slot,hex:hex(raw),empty:raw[0]>225 || raw.every(v=>v===0) || raw.slice(1,8).every(v=>v===0)};
  if (result.empty) return result;
  const f1=raw[4]|raw[5]<<8, f2=raw[6]|raw[7]<<8;
  const p={year:2000+(raw[3]&63),month:(f1>>10)&15,day:(f1>>5)&31,hour:f1&31,minute:(f2>>6)&63,second:f2&63};
  const d=new Date(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
  const valid = d.getFullYear()===p.year && d.getMonth()+1===p.month && d.getDate()===p.day && d.getHours()===p.hour && d.getMinutes()===p.minute && d.getSeconds()===p.second;
  const z = n=>String(n).padStart(2,'0');
  return {...result,systolic:raw[0]+25,diastolic:raw[1],pulse:raw[2],sequence:raw[10]|raw[11]<<8,flags:{irregular_pulse:!!(f1&0x4000),body_movement:!!(f1&0x8000),cuff_fit_raw:(f2>>12)&1},consecutive_measurement_count:(f2>>14)&3,timestamp_fields:p,timestamp:valid?`${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}:${z(p.second)}`:null,time_status:valid?'device_local_time_unverified':'invalid_or_unset'};
}
export function decodeSettings(raw) {
  if(raw.length!==68)throw Error(t('Настройки должны содержать 68 байт'));
  const level=raw[49]>>4;
  return {hex:hex(raw),battery_raw:level,battery_percent:level<=10?level*10:null,battery_status:level<=10?'profile_estimate':'unknown_code'};
}
export function decodePpi(raw,slot=0) {
  if(raw.length!==80)throw Error(t('Запись PPI должна содержать 80 байт'));
  return {slot,hex:hex(raw),fill_pattern:raw.every(v=>v===255)?'all_ff':raw.every(v=>v===0)?'all_zero':null,
    sequence:raw[0]|raw[1]<<8,values_raw:Array.from({length:35},(_,i)=>raw[4+i*2]|raw[5+i*2]<<8),units:'unverified',decoding_status:'profile_layout_only'};
}
export const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
export async function bounded(promise, ms=10000) {
  let timer;
  try { return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(t('Тонометр не ответил вовремя'))),ms);})]); }
  finally { clearTimeout(timer); }
}
// One request at a time, listener armed before the write. Partial frames are
// assembled; unsolicited frames are ignored, corruption aborts the session.
export class Channel {
  constructor(tx, rx, {framed=true,log=()=>{},timeout=8000}={}) {
    Object.assign(this,{tx,rx,framed,log,timeout}); this.pending=null; this.buffer=[];
    this.listener = e => this.receive(new Uint8Array(e.target.value.buffer,e.target.value.byteOffset,e.target.value.byteLength));
    rx.addEventListener('characteristicvaluechanged',this.listener);
  }
  receive(data) {
    this.log('RX '+hex(data));
    if (!this.pending) return;
    try {
      if (!this.framed) { this.accept(data); return; }
      this.buffer.push(...data);
      while (this.buffer.length) {
        const n=this.buffer[0];
        if (n<8 || n>64) throw Error(t('Некорректная длина ответа'));
        if (this.buffer.length<n) break;
        this.accept(validateFrame(Uint8Array.from(this.buffer.splice(0,n))));
      }
    } catch(e) { this.fail(e); }
  }
  accept(data) { if (this.pending?.accept(data)) this.pending.resolve(data); }
  fail(e) { this.pending?.reject(e); }
  async exchange(data,accept) {
    if (this.pending) throw Error(t('Обмен уже выполняется'));
    this.buffer=[];
    let timer;
    const response=new Promise((resolve,reject)=>{this.pending={accept,resolve,reject};timer=setTimeout(()=>reject(Error(t('Тайм-аут ответа тонометра'))),this.timeout);});
    // Attach rejection handling before the asynchronous write starts.
    response.catch(()=>{});
    try {
      this.log('TX '+hex(data));
      await bounded(this.tx.writeValueWithoutResponse(data),this.timeout);
      return await response;
    } finally { clearTimeout(timer);this.pending=null;this.buffer=[]; }
  }
  dispose() { this.fail(Error(t('Соединение закрыто')));this.rx.removeEventListener('characteristicvaluechanged',this.listener); }
}
export class Memory {
  constructor(channel){this.channel=channel;}
  async command(p) {
    return this.channel.exchange(p,r=>{
      if (r[1]===143 && p[1]!==15) throw Error(t('Тонометр отклонил команду: ')+hex(r));
      return r[1]===(p[1]|128) && r[2]===p[2] && r[3]===p[3] && r[4]===p[4];
    });
  }
  async open(){const r=await this.command(unhex('0800000000100018'));if(r.length!==8||r[5]!==16||r[6])throw Error(t('Не удалось открыть сеанс'));}
  async close(){const r=await this.command(unhex('080f000000000007'));if(r.length!==8||r[5]!==0||r[6])throw Error(t('Данные сохранены, но тонометр не подтвердил завершение: ')+hex(r));}
  async read(a,n){const r=await this.command(readCommand(a,n));if(r.length!==n+8||r[5]!==n||r.at(-2))throw Error(t('Ошибка чтения памяти'));return r.slice(6,-2);}
  async echoWrite(command,payload){const r=await this.command(command);if(r.length!==payload.length+8||r[5]!==payload.length||r.at(-2)||!equal(r.slice(6,-2),payload))throw Error(t('Запись не подтверждена тонометром'));}
  async finish(index,saveBackup,register=false) {
    if (register) {
      const snapshot=new Uint8Array([...(await this.read(0x260,56)),...(await this.read(0x298,12))]);
      if(!equal(snapshot.slice(0,20),index))throw Error(t('Индекс изменился во время чтения'));
      const blocks=registrationBlocks(snapshot);
      await saveBackup({snapshot:hex(snapshot),writes:blocks.map(b=>({address:b.address,hex:hex(b.payload)}))});
      for(const b of blocks)await this.echoWrite(registrationCommand(b.address,b.payload),b.payload);
    } else {
      const current=await this.read(0x260,20);
      if(!equal(current,index))throw Error(t('Индекс изменился во время чтения'));
      await saveBackup({index:hex(index)});
      await this.echoWrite(mirrorCommand(index),index);
    }
    await this.close();
  }
}
export async function synchronize(device,{save,saveBackup,progress=()=>{},log=()=>{},register=false,previous=null}) {
  let unlockChannel,channel,closed=false,aborted=false;
  const onDisconnect=()=>{const e=Error(t('Bluetooth-соединение прервано'));channel?.fail(e);unlockChannel?.fail(e);};
  device.addEventListener('gattserverdisconnected',onDisconnect);
  try {
    progress(t('Подключение к тонометру…'),0);
    const connecting=device.gatt.connect();
    connecting.then(()=>{if(aborted)device.gatt.disconnect();},()=>{});
    const server=await bounded(connecting,20000);
    const info=await bounded(server.getPrimaryService(UUID.info));
    const text=async id=>{const c=await bounded(info.getCharacteristic(id));return new TextDecoder().decode(await bounded(c.readValue())).replace(/\0+$/,'');};
    if(await text('model_number_string')!=='X1-G'||await text('firmware_revision_string')!=='SI.W03.01.00')throw Error(t('Поддерживается только X1-G с прошивкой SI.W03.01.00'));
    const service=await bounded(server.getPrimaryService(UUID.service));
    const rx=await bounded(service.getCharacteristic(UUID.rx)),tx=await bounded(service.getCharacteristic(UUID.tx)),unlock=await bounded(service.getCharacteristic(UUID.unlock));
    channel=new Channel(tx,rx,{log});unlockChannel=new Channel(unlock,unlock,{log,framed:false});
    await bounded(rx.startNotifications());await delay(300);
    await bounded(unlock.startNotifications());await delay(300);
    const token=crypto.getRandomValues(new Uint8Array(4));
    await unlockChannel.exchange(Uint8Array.from([17,...token,...new Uint8Array(15)]),r=>r.length>=6&&r[0]===145&&r[1]===0&&equal(r.slice(2,6),token));
    const memory=new Memory(channel);await memory.open();
    const index=await memory.read(0x260,20);
    const slots=await readHistory(memory,index,register?null:previous,decodeRecord,n=>progress(t('Чтение памяти…'),n));
    const data={device:device.name||device.id,index_hex:hex(index),slots,read_at:new Date().toISOString()};
    const settings=new Uint8Array([...(await memory.read(0x260,56)),...(await memory.read(0x298,12))]);
    if(!equal(settings.slice(0,20),index))throw Error(t('Индекс изменился во время чтения'));
    data.settings=decodeSettings(settings);
    progress(t('Сохранение истории…'),90);await save(data);
    progress(register?t('Завершение регистрации…'):t('Завершение передачи…'),100);
    await memory.finish(index,saveBackup,register);closed=true;
    return {...data,checkpoint:{index:historyIndex(index),slots}};
  } finally {
    aborted=true;unlockChannel?.dispose();channel?.dispose();device.removeEventListener('gattserverdisconnected',onDisconnect);
    // Do not disable CCCDs: this can invalidate the bond on this protocol family.
    device.gatt.disconnect();log(closed?t('ENDOK подтверждён'):t('Сеанс не завершён; сохранённые записи доступны'));
  }
}
