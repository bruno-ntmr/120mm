import {t} from '../../web/dist/i18n.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBluetoothAdapter} from '../src/ble-adapter.mjs';
import {UUID} from '../../web/dist/protocol.mjs';
function setup(){
 const calls=[],data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const ble={
  async initialize(o){calls.push(['init',o]);},async isEnabled(){return true;},async requestEnable(){},
  async requestDevice(o){calls.push(['select',o]);return {deviceId:'AA:BB:CC:DD:EE:FF',name:'X1-G'};},
  async isBonded(){return false;},async createBond(id,o){calls.push(['bond',id,o]);},
  async connect(id,cb){calls.push(['connect']);this.disconnected=cb;},async disconnect(){calls.push(['disconnect']);},
  async read(id,service,char){calls.push(['read',char]);return new DataView(Uint8Array.from([1,2]).buffer);},
  async writeWithoutResponse(id,service,char,v){calls.push(['write',[...new Uint8Array(v.buffer,v.byteOffset,v.byteLength)]]);},
  async startNotifications(id,service,char,cb){calls.push(['notify',char]);this.notify=cb;}
 };
 return {ble,calls,storage,adapter:createBluetoothAdapter(ble,{storage})};
}
const select=adapter=>adapter.requestDevice({filters:[{services:[UUID.service]}]});
test('native selection filters FE4A and creates OS bond, reads UUID aliases, preserves byte slices',async()=>{
 const {adapter,ble,calls}=setup(),d=await select(adapter);
 assert.deepEqual(calls[1],['select',{services:[UUID.service]}]);assert.equal(calls[2][0],'bond');
 const g=await d.gatt.connect(),info=await g.getPrimaryService(UUID.info);
 await (await info.getCharacteristic('model_number_string')).readValue();
 assert.ok(calls.some(c=>c[1]==='00002a24-0000-1000-8000-00805f9b34fb'));
 const tx=await (await g.getPrimaryService(UUID.service)).getCharacteristic(UUID.tx);
 await tx.writeValueWithoutResponse(Uint8Array.from([99,8,15,7,99]).subarray(1,4));
 assert.deepEqual(calls.at(-1),['write',[8,15,7]]);
});
test('notifications arrive immediately and stale callbacks cannot affect a later connection',async()=>{
 const {adapter,ble}=setup(),d=await select(adapter);await d.gatt.connect();
 const c=await (await d.gatt.getPrimaryService(UUID.service)).getCharacteristic(UUID.rx);let events=0,disconnects=0;
 c.addEventListener('characteristicvaluechanged',()=>events++);d.addEventListener('gattserverdisconnected',()=>disconnects++);
 await c.startNotifications();const oldNotify=ble.notify,oldDisconnect=ble.disconnected;
 oldNotify(new DataView(new ArrayBuffer(1)));assert.equal(events,1);
 d.gatt.disconnect();await d.gatt.connect();oldNotify(new DataView(new ArrayBuffer(1)));oldDisconnect();
 assert.equal(events,1);assert.equal(disconnects,1);assert.equal(d.gatt.connected,true);
 await assert.rejects(c.readValue(),e=>e.message.includes(t('Bluetooth-соединение закрыто')));
});
test('reconnect waits for native disconnect; no descriptor unsubscribe on shutdown',async()=>{
 const {adapter,ble,calls}=setup(),d=await select(adapter);await d.gatt.connect();let finish;
 ble.disconnect=()=>new Promise(r=>finish=r);d.gatt.disconnect();const pending=d.gatt.connect();
 await new Promise(r=>setImmediate(r));assert.equal(calls.filter(c=>c[0]==='connect').length,1);
 finish();await pending;assert.equal(calls.filter(c=>c[0]==='connect').length,2);
});
test('fresh install does not request permissions; saved device restores without scanning',async()=>{
 const {adapter,storage,calls}=setup();assert.deepEqual(await adapter.getDevices(),[]);assert.equal(calls.length,0);
 storage.setItem('x1g-device-id','AA:BB:CC:DD:EE:FF');const devices=await adapter.getDevices();assert.equal(devices[0].id,'AA:BB:CC:DD:EE:FF');assert.equal(calls.length,0);
});
test('permission denial can be retried, cancellation remains a silent user action',async()=>{
 const {adapter,ble}=setup();let attempt=0;
 ble.initialize=async()=>{if(!attempt++)throw Error('permission denied');};
 await assert.rejects(select(adapter),/permission/);
 ble.requestDevice=async()=>{throw Error('No device selected.');};
 await assert.rejects(select(adapter),e=>e.name==='NotFoundError');assert.equal(attempt,2);
});
test('shared observation works through native GATT and decodes a synthetic result',async()=>{
 const {observe,STREAM}=await import('../../web/dist/live.mjs');
 const {adapter,ble,calls}=setup(),d=await select(adapter),controller=new AbortController(),packets=[];
 ble.read=async(id,service,char)=>new DataView(new TextEncoder().encode(char.includes('2a24')?'X1-G':'SI.W03.01.00').buffer);
 const notify=new Map();let subscribed;const ready=new Promise(r=>subscribed=r);
 ble.startNotifications=async(id,service,char,cb)=>{notify.set(char,cb);if(char===UUID.unlock)subscribed();};
 const running=observe(d,{signal:controller.signal,onEvent:p=>packets.push(p)});await ready;
 const bytes=Uint8Array.from('0d52003c00284600000000000d'.match(/../g),v=>parseInt(v,16));
 notify.get(STREAM)(new DataView(bytes.buffer));
 assert.deepEqual([packets[0].systolic,packets[0].diastolic,packets[0].pulse],[120,80,70]);
 assert.deepEqual([...notify.keys()],[STREAM,UUID.rx,UUID.unlock]);
 controller.abort();await running;assert.equal(d.gatt.connected,false);assert.ok(!calls.some(c=>c[0]==='write'));
});

test('saved device connects without a picker after a cold start; Bluetooth readiness can retry',async()=>{
 const {adapter,storage,ble,calls}=setup();storage.setItem('x1g-device-id','AA:BB:CC:DD:EE:FF');
 let attempt=0;ble.initialize=async()=>{if(!attempt++)throw Error('Bluetooth unavailable');};
 const [device]=await adapter.getDevices();assert.ok(device);
 await assert.rejects(device.gatt.connect(),/unavailable/);
 await device.gatt.connect();assert.equal(device.gatt.connected,true);
 assert.ok(!calls.some(c=>c[0]==='select'||c[0]==='bond'));
});
