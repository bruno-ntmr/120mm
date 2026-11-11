import {t} from '../dist/i18n.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeStream,observe,STREAM} from '../dist/live.mjs';
import {UUID,unhex} from '../dist/protocol.mjs';
const battery='065464000036',measure='0d510000003c00000000000060',result='0d52003c00284600000000000d';
function mock(){
  const device=new EventTarget(),c=new EventTarget(),calls=[];
  c.send=s=>{const a=unhex(s);c.value=new DataView(a.buffer);c.dispatchEvent(new Event('characteristicvaluechanged'));};
  c.startNotifications=async()=>{calls.push('subscribe');c.send(battery);};
  const info={async getCharacteristic(id){return {async readValue(){return new TextEncoder().encode(id==='model_number_string'?'X1-G':'SI.W03.01.00');}};}};
  device.gatt={async connect(){calls.push('connect');return {async getPrimaryService(id){return id===UUID.info?info:{async getCharacteristic(id){if(id===STREAM)return c;assert.ok([UUID.rx,UUID.unlock].includes(id));return {async startNotifications(){calls.push(id);}};}};}};},disconnect(){calls.push('disconnect');}};
  return {device,c,calls};
}
test('synthetic battery, measuring and result packets',()=>{
  assert.equal(decodeStream(unhex(battery)).battery_percent,100);
  assert.equal(decodeStream(unhex(measure)).cuff_pressure,120);
  const r=decodeStream(unhex(result));assert.deepEqual([r.systolic,r.diastolic,r.pulse],[120,80,70]);
  for(const s of ['065464000037','035152','0654'])assert.throws(()=>decodeStream(unhex(s)));
  assert.equal(decodeStream(unhex('037073')).kind,'unknown');
});
test('passive listener catches immediate events, stale is unknown, abort removes listeners',async()=>{
  const {device,c,calls}=mock(),controller=new AbortController(),events=[],states=[];
  let ready;const started=new Promise(r=>ready=r);let stale;const staleReady=new Promise(r=>stale=r);
  const run=observe(device,{signal:controller.signal,onEvent:p=>{events.push(p);ready();},onState:s=>{states.push(s);if(s==='stale')stale();},staleMs:10,tickMs:5});
  await started;c.send(measure);c.send(result);c.send(result);
  await staleReady;assert.equal(states.at(-1),'stale');assert.equal(events.at(-1).kind,'result');
  controller.abort();await run;const n=events.length;c.send(battery);assert.equal(events.length,n);
  assert.deepEqual(calls,['connect','subscribe',UUID.rx,UUID.unlock,'disconnect']);
});
test('disconnect rejects and late connection after cancelled setup is closed',async()=>{
  const m=mock();let ready;const started=new Promise(r=>ready=r);
  const run=observe(m.device,{onEvent:()=>ready()});await started;m.device.dispatchEvent(new Event('gattserverdisconnected'));await assert.rejects(run,e=>e.message.includes(t('Связь с тонометром потеряна')));
  const controller=new AbortController(),late=mock();let connect;late.device.gatt.connect=()=>new Promise(r=>connect=r);
  const cancelled=observe(late.device,{signal:controller.signal});controller.abort();await cancelled;connect({});await Promise.resolve();assert.equal(late.calls.filter(c=>c==='disconnect').length,2);
});
