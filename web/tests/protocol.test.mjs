import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readCommand,mirrorCommand,hex,unhex,validateFrame,registrationBlocks,decodeRecord,Channel,Memory} from '../dist/protocol.mjs';
import {Journal,mergeRecords} from '../dist/store.mjs';
const index=unhex('0a8000800a8000800a000080000000800a800a80');
const sample='5f50461a20043f3080000a000000';
test('protocol wire vectors and invalid frames',()=>{
  assert.equal(hex(readCommand(0x260,20)),'080100026014007f');
  assert.equal(hex(mirrorCommand(index)),'1c01c002a4140a8000800a8000800a000080000000800a800a800065');
  assert.throws(()=>validateFrame(unhex('088f000000000086')));
  assert.throws(()=>readCommand(0,57));
  const r=decodeRecord(unhex(sample));assert.deepEqual([r.systolic,r.diastolic,r.pulse],[120,80,70]);assert.equal(r.timestamp,null);
});
test('registration matches SHDS offsets, preserves index and final bytes',()=>{
  const snapshot=unhex(hex(index)+'ffff00000000000000000000fe01'.repeat(2)+'c0a1000018010100003fba45'+'ff'.repeat(8));
  const [a,b]=registrationBlocks(snapshot,new Date(2026,9,31,20,0,0));
  assert.equal(hex(a.payload),hex(index)+'0001010001000000000000000301');
  assert.equal(hex(b.payload),'c0a101001a0a1f140000b945');
  snapshot[20]=0;assert.throws(()=>registrationBlocks(snapshot));
});
class Notify extends EventTarget {send(bytes){this.value=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);this.dispatchEvent(new Event('characteristicvaluechanged'));}}
test('listener precedes write, fragmented reply and E5 checksum accepted',async()=>{
  const rx=new Notify();const ack=unhex('1c81c002a4140a8000800a8000800a000080000000800a800a8000e5');
  const channel=new Channel({async writeValueWithoutResponse(){rx.send(ack.slice(0,5));rx.send(ack.slice(5));}},rx);
  const memory=new Memory(channel);await memory.echoWrite(mirrorCommand(index),index);channel.dispose();
});
test('timeout, corruption and disconnect reject waiting request',async()=>{
  for(const action of ['timeout','corrupt','disconnect']){
    const rx=new Notify();let c;
    c=new Channel({async writeValueWithoutResponse(){if(action==='corrupt')rx.send(unhex('088f000000000086'));if(action==='disconnect')c.fail(Error('disconnected'));}},rx,{timeout:15});
    await assert.rejects(c.exchange(readCommand(0x260,20),()=>true));c.dispose();
  }
});
test('ENDOK E5 is failure; unchanged index is mandatory and persistence precedes write',async()=>{
  const m=new Memory(null);m.command=async()=>unhex('088f00000000e562');await assert.rejects(m.close());
  let writes=0;m.echoWrite=async()=>{writes++;};m.read=async()=>new Uint8Array(20);
  await assert.rejects(m.finish(index,async()=>{}));assert.equal(writes,0);
  m.read=async()=>index;await assert.rejects(m.finish(index,async()=>{throw Error('disk full');}));assert.equal(writes,0);
  m.command=async()=>unhex('088f000000000087');await m.finish(index,async()=>{});assert.equal(writes,1);
});
test('deduplication, ignore supplied decoded values, atomic storage failure',()=>{
  const snapshot={device:'test',slots:[{hex:sample,systolic:999}]};
  const a=mergeRecords([],snapshot);assert.equal(a.added,1);assert.equal(a.records[0].systolic,120);assert.equal(mergeRecords(a.records,snapshot).added,0);
  assert.throws(()=>mergeRecords(a.records,{device:'test',slots:[{hex:'bad'}]}));
  const j=new Journal({getItem(){return null;},setItem(){throw Error('quota');}});
  assert.throws(()=>j.save(snapshot));assert.equal(j.state.records.length,0);
});

test('extended flags, unknown battery codes and unfiltered PPI words',async()=>{
  const {decodeSettings,decodePpi}=await import('../dist/protocol.mjs');
  const r=unhex(sample);r[5]|=192;r[7]=r[7]&15|208;
  const decoded=decodeRecord(r);assert.deepEqual(decoded.flags,{irregular_pulse:true,body_movement:true,cuff_fit_raw:1});assert.equal(decoded.consecutive_measurement_count,3);assert.equal(decoded.timestamp_fields.second,63);
  const s=new Uint8Array(68);for(let i=0;i<16;i++){s[49]=i<<4|15;assert.equal(decodeSettings(s).battery_percent,i<=10?i*10:null);}
  const p=new Uint8Array(80).fill(255);assert.equal(decodePpi(p).fill_pattern,'all_ff');p.set([52,18]);p.set([0,0,52,18],4);
  const d=decodePpi(p);assert.equal(d.sequence,4660);assert.deepEqual(d.values_raw.slice(0,3),[0,4660,65535]);assert.equal(d.values_raw.length,35);assert.equal(d.units,'unverified');assert.throws(()=>decodePpi(p.slice(1)));
});
test('extended archive survives export, reload, dedup and invalid imports atomically',async()=>{
  const {importHistory}=await import('../dist/store.mjs');
  let raw=null;const storage={getItem:()=>raw,setItem:(_,s)=>{raw=s;}};const j=new Journal(storage);
  const p=new Uint8Array(80);p.set([10,0]);p[4]=42;const settings=new Uint8Array(68);settings[49]=160;
  const snapshot={device:'test',slots:[{hex:sample}],ppi_slots:[{hex:hex(p)}],settings:{hex:hex(settings)}};
  assert.equal(j.save(snapshot),1);assert.equal(j.save(snapshot),0);assert.equal(j.state.ppi_records.length,1);
  const fresh=new Journal(storage);assert.equal(fresh.state.ppi_records[0].values_raw[0],42);assert.equal(fresh.state.settingsByDevice.test.battery_percent,100);
  const imported=importHistory(new Journal({getItem:()=>null}).state,JSON.parse(raw));assert.equal(imported.state.ppi_records.length,1);assert.equal(imported.state.records[0].flags.cuff_fit_raw,1);
  const before=JSON.stringify(j.state);assert.throws(()=>importHistory(j.state,{...JSON.parse(raw),ppi_records:[{device:'test',hex:'bad'}]}));assert.equal(JSON.stringify(j.state),before);
  // Old journals are decoded from raw bytes without requiring another BLE session.
  const old={version:1,records:[{device:'test',hex:sample}],snapshots:[],backups:[],lastSync:null};
  const migrated=new Journal({getItem:()=>JSON.stringify(old)});assert.equal(migrated.state.records[0].flags.cuff_fit_raw,1);
});

test('complete BLE flow persists before writes and never reads PPI',async()=>{
  const {synchronize,UUID}=await import('../dist/protocol.mjs');
  for(const failPpi of [false,true]){
    const memory=new Uint8Array(0x1300).fill(255);memory.set(index,0x260);memory[0x291]=160;memory.set(unhex(sample),0x2e8);
    const ppi=new Uint8Array(80);ppi[0]=10;ppi[4]=42;memory.set(ppi,0x8c4);
    const rx=new Notify(),unlock=new Notify();rx.startNotifications=unlock.startNotifications=async()=>{};
    const events=[];const frame=body=>{const r=Uint8Array.from([...body,body.reduce((a,b)=>a^b,0)]);rx.send(r);};
    unlock.writeValueWithoutResponse=async p=>unlock.send(Uint8Array.from([145,0,...p.slice(1,5)]));
    const tx={async writeValueWithoutResponse(p){
      const a=p[3]<<8|p[4],n=p[5];
      if(p[1]===0)frame([8,128,0,0,0,16,0]);
      else if(p[1]===15){events.push('end');frame([8,143,0,0,0,0,0]);}
      else if(p[2]===192){events.push('write');frame([...p.slice(0,1),129,...p.slice(2,-1)]);}
      else{if(failPpi&&a===0x8c4)throw Error('PPI read failed');frame([n+8,129,0,p[3],p[4],n,...memory.slice(a,a+n),0]);}
    }};
    const service={async getCharacteristic(id){return {[UUID.rx]:rx,[UUID.tx]:tx,[UUID.unlock]:unlock}[id];}};
    const info={async getCharacteristic(id){return {async readValue(){return new TextEncoder().encode(id==='model_number_string'?'X1-G':'SI.W03.01.00');}};}};
    const device=new EventTarget();device.name='test';device.gatt={async connect(){return {async getPrimaryService(id){return id===UUID.info?info:service;}};},disconnect(){events.push('disconnect');}};
    const saves=[];const run=synchronize(device,{save:s=>{saves.push(structuredClone(s));events.push('save');},saveBackup:()=>events.push('backup')});
    const result=await run;assert.equal(saves.length,1);assert.equal(saves[0].ppi_slots,undefined);assert.equal(saves[0].settings.battery_percent,100);assert.equal(result.checkpoint.slots.length,100);assert.deepEqual(events,['save','backup','write','end','disconnect']);
  }
});
