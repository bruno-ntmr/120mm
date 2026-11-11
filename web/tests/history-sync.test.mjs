import {test} from 'node:test';
import assert from 'node:assert/strict';
import {historyIndex,readHistory} from '../dist/history-sync.mjs';
import {decodeRecord,unhex} from '../dist/protocol.mjs';
const idx=(next,seq)=>Uint8Array.from([next,128,0,128,0,128,0,128,seq&255,seq>>8,0,128,0,0,0,128,0,128,0,128]);
const raw=seq=>{const r=unhex('5f50461a20043f3080000a000000');r[10]=seq&255;r[11]=seq>>8;return r;};
function setup(seq){
 const bytes=new Uint8Array(1400);for(let n=Math.max(1,seq-99);n<=seq;n++)bytes.set(raw(n),(n-1)%100*14);
 const calls=[],memory={async read(address,size){calls.push([address,size]);return bytes.slice(address-0x2e8,address-0x2e8+size);}};
 const slots=Array.from({length:100},(_,i)=>decodeRecord(bytes.slice(i*14,i*14+14),i));
 return {bytes,calls,memory,previous:{index:historyIndex(idx(seq%100,seq)),slots}};
}
test('profile index matches profile fixture and initial history uses 25 reads without PPI',async()=>{
 assert.deepEqual(historyIndex(unhex('0a8000800a8000800a000080000000800a800a80')),{next:10,sequence:10});
 const x=setup(10);const rows=await readHistory(x.memory,idx(10,10),null,decodeRecord);
 assert.equal(x.calls.length,25);assert.equal(rows.filter(r=>!r.empty).length,10);
});
test('one new measurement reads anchor and one record; unchanged history only anchor',async()=>{
 const x=setup(10);x.bytes.set(raw(11),140);
 const rows=await readHistory(x.memory,idx(11,11),x.previous,decodeRecord);
 assert.deepEqual(x.calls,[[0x2e8+126,14],[0x2e8+140,14]]);assert.equal(rows[10].sequence,11);
 x.calls.length=0;await readHistory(x.memory,idx(11,11),{index:historyIndex(idx(11,11)),slots:rows},decodeRecord);assert.equal(x.calls.length,1);
});
test('ring boundary is split and keeps chronological sequences',async()=>{
 const x=setup(98);for(let n=99;n<=103;n++)x.bytes.set(raw(n),(n-1)%100*14);
 const rows=await readHistory(x.memory,idx(3,103),x.previous,decodeRecord);
 assert.deepEqual(x.calls.map(c=>c[1]),[14,28,42]);assert.equal(rows[2].sequence,103);assert.equal(rows[99].sequence,100);
});
test('reset, rollover, overwritten ring and pointer mismatch fall back to full history',async()=>{
 for(const [old,next,seq] of [[10,2,2],[65535,0,0],[10,10,110],[10,20,11]]){
  const x=setup(old);await readHistory(x.memory,idx(next,seq),x.previous,decodeRecord);assert.equal(x.calls.length,25);
 }
});
test('anchor or new sequence mismatch falls back; previous checkpoint stays unchanged',async()=>{
 for(const anchor of [true,false]){
  const x=setup(10),before=JSON.stringify(x.previous);x.bytes.set(raw(99),anchor?126:140);
  await readHistory(x.memory,idx(11,11),x.previous,decodeRecord);
  assert.equal(x.calls.length,anchor?26:27);assert.equal(JSON.stringify(x.previous),before);
 }
});
test('checkpoint survives reload, is scoped to device ID and advances only on completion',async()=>{
 const {Journal}=await import('../dist/store.mjs');
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const journal=new Journal(storage),x=setup(10);
 journal.save({device:'X1-G',slots:x.previous.slots});assert.equal(journal.checkpoint('A'),null);
 journal.completed('A',x.previous);
 const reload=new Journal(storage);assert.deepEqual(reload.checkpoint('A'),x.previous);assert.equal(reload.checkpoint('B'),null);
 reload.save({device:'X1-G',slots:setup(11).previous.slots});assert.deepEqual(reload.checkpoint('A'),x.previous);
});
