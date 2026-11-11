import {t,locale} from './i18n.mjs';
import {UUID,bounded,hex} from './protocol.mjs';
export const STREAM='8858eb40-aee8-11e1-bb67-0002a5d5c51b';
export function decodeStream(raw){
  if(raw.length<3||raw[0]!==raw.length||raw.reduce((a,b)=>a^b,0))throw Error(t('Повреждён пакет наблюдения'));
  const kind=raw[1],sizes={81:13,82:13,83:5,84:6};
  if(sizes[kind]&&raw.length!==sizes[kind])throw Error(t('Неверная длина пакета наблюдения'));
  const out={hex:hex(raw),kind:'unknown',type:kind},word=i=>raw[i]|raw[i+1]<<8;
  if(kind===84)return {...out,kind:'battery',battery_percent:raw[2]<=100?raw[2]:null,battery_raw:raw[2]};
  if(kind===81)return {...out,kind:'measuring',cuff_pressure:Math.floor(word(4)/128)};
  if(kind===82)return {...out,kind:'result',systolic:Math.round(word(2)/128),diastolic:Math.round(word(4)/128),pulse:raw[6]};
  if(kind===83)return {...out,kind:'device_error',code:raw[2]};
  return out;
}
// Passive subscription: no authentication, memory session or control commands.
// Resolves only after stop; disconnect/setup failures reject and always clean up.
export async function observe(device,{signal,onEvent=()=>{},onState=()=>{},log=()=>{},staleMs=5000,tickMs=1000,timeout=20000}={}){
  let characteristic,listener,timer,finished=false,lastPacket=Date.now(),stale=false,ready=false;
  let resolveDone,rejectDone,stage=t('Bluetooth-соединение');
  const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});done.catch(()=>{});
  const stop=()=>resolveDone();
  const disconnected=()=>rejectDone(Error(t('Связь с тонометром потеряна')));
  const step=p=>Promise.race([bounded(p,timeout),done.then(()=>{throw new DOMException(t('Наблюдение остановлено'),'AbortError');})]);
  device.addEventListener('gattserverdisconnected',disconnected);signal?.addEventListener('abort',stop,{once:true});
  try{
    if(signal?.aborted)return;
    onState('connecting');log(t('Подключение к ')+(device.name||device.id));
    const connecting=device.gatt.connect();
    connecting.then(()=>{if(finished)device.gatt.disconnect();},()=>{});
    const server=await step(connecting);
    stage=t('Сервис сведений об устройстве');log(stage);
    const info=await step(server.getPrimaryService(UUID.info));
    const readText=async id=>{stage=t('Чтение ')+id;log(stage);const c=await step(info.getCharacteristic(id));const value=new TextDecoder().decode(await step(c.readValue())).replace(/\0+$/,'');log(id+': '+value);return value;};
    if(await readText('model_number_string')!=='X1-G'||await readText('firmware_revision_string')!=='SI.W03.01.00')throw Error(t('Неподдерживаемая модель или прошивка'));
    stage=t('Сервис Omron FE4A');log(stage);
    const service=await step(server.getPrimaryService(UUID.service));stage=t('Потоковая характеристика');log(stage);characteristic=await step(service.getCharacteristic(STREAM));
    listener=e=>{
      if(finished)return;
      const v=e.target.value;
      let packet;try{packet=decodeStream(new Uint8Array(v.buffer,v.byteOffset,v.byteLength));}catch(error){log(error.message);return;}
      if(packet.kind==='unknown'){log(t('Неизвестный потоковый пакет ')+packet.hex);return;}
      lastPacket=Date.now();stale=false;ready=true;onEvent(packet);
    };
    characteristic.addEventListener('characteristicvaluechanged',listener);
    stage=t('Подписка на поток');log(stage);
    await step(characteristic.startNotifications());
    // Match the physically verified Python session: STREAM, RX, then UNLOCK.
    for(const [id,label] of [[UUID.rx,'RX'],[UUID.unlock,'UNLOCK']]){
      stage=t('Подписка ')+label;log(stage);
      const channel=await step(service.getCharacteristic(id));
      await step(channel.startNotifications());
    }
    stage=t('Приём уведомлений');log(stage);
    if(!ready)onState('waiting');
    lastPacket=Date.now();
    timer=setInterval(()=>{if(!stale&&Date.now()-lastPacket>=staleMs){stale=true;onState('stale');}},tickMs);
    await done;
  }catch(e){if(!signal?.aborted)throw Error(`${stage}: ${e.name}: ${e.message}`,{cause:e});}
  finally{
    finished=true;clearInterval(timer);resolveDone();
    if(listener)characteristic.removeEventListener('characteristicvaluechanged',listener);
    signal?.removeEventListener('abort',stop);device.removeEventListener('gattserverdisconnected',disconnected);
    // Preserve CCCDs as with the verified history transport.
    device.gatt.disconnect();
  }
}
