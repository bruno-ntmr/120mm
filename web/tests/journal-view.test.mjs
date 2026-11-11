import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Journal,importHistory} from '../dist/store.mjs';
import {recordKey,ownerOf,filterPeriod,periodBounds,calendarWeeks} from '../dist/journal-view.mjs';
const sample='5f50461a20043f3080000a000000';
function setup(old){let raw=old?JSON.stringify(old):null;const storage={getItem:()=>raw,setItem:(_,v)=>raw=v};return {journal:new Journal(storage),storage};}
const snapshot=(sequence=10)=>({device:'X1-G',slots:[{hex:sample.slice(0,20)+sequence.toString(16).padStart(2,'0')+sample.slice(22)}]});
test('old history migrates to me and survives profile transfer, repeated sync and reload',()=>{
 const {journal:j,storage}=setup({version:1,records:[{device:'X1-G',hex:sample}],snapshots:[],backups:[]});
 assert.equal(ownerOf(j.state,j.state.records[0]),'me');j.addPerson('Анна');const anna=j.state.activePerson;
 j.save(snapshot());assert.equal(ownerOf(j.state,j.state.records[0]),'me');j.save(snapshot(11));assert.equal(ownerOf(j.state,j.state.records[1]),anna);
 j.moveRecords(new Set([recordKey(j.state.records[0])]),anna);j.setPerson('me');j.save(snapshot());
 const fresh=new Journal(storage);assert.ok(fresh.state.records.every(r=>ownerOf(fresh.state,r)===anna));assert.equal(fresh.state.activePerson,'me');
});
test('profile removal retains records unassigned through resync and export/import',()=>{
 const {journal:j}=setup();j.addPerson('Анна');const id=j.state.activePerson;j.save(snapshot());j.removePerson(id);
 assert.equal(j.state.records.length,1);assert.equal(ownerOf(j.state,j.state.records[0]),'');j.setPerson('me');j.save(snapshot());assert.equal(ownerOf(j.state,j.state.records[0]),'');
 const exported=JSON.parse(JSON.stringify(j.state)),other=setup().journal;const result=importHistory(other.state,exported);assert.equal(ownerOf(result.state,result.state.records[0]),'');
});
test('import preserves people and owners without stealing already assigned duplicates',()=>{
 const a=setup().journal;a.addPerson('Иван');a.save(snapshot());const id=a.state.activePerson;
 const b=setup().journal;let r=importHistory(b.state,JSON.parse(JSON.stringify(a.state)));assert.equal(ownerOf(r.state,r.state.records[0]),id);assert.ok(r.state.people.some(p=>p.name==='Иван'));
 b.save(snapshot());r=importHistory(b.state,a.state);assert.equal(ownerOf(r.state,r.state.records[0]),'me');
 assert.throws(()=>importHistory(b.state,{...a.state,people:[{id:'x',name:''}]}));
});
test('sync owner captured at start is independent of later selection',()=>{
 const j=setup().journal;const captured=j.state.activePerson;j.addPerson('Другой');j.save(snapshot(),captured);assert.equal(ownerOf(j.state,j.state.records[0]),'me');
});
test('period bounds handle Monday weeks, month/year boundaries and leap days',()=>{
 assert.deepEqual(periodBounds('week','2026-11-01'),['2026-10-26','2026-11-01']);
 assert.deepEqual(periodBounds('week','2026-01-01'),['2025-12-29','2026-01-04']);
 assert.deepEqual(periodBounds('month','2024-02-19'),['2024-02-01','2024-02-29']);
 const weeks=calendarWeeks('2026-11');assert.equal(weeks[0][0],'2026-10-26');assert.equal(weeks[0][6],'2026-11-01');
});
test('latest caps at 30, periods include all matching rows and keep undated separate',()=>{
 const rows=Array.from({length:45},(_,i)=>({sequence:i+1,timestamp:'2026-11-01T12:'+String(i).padStart(2,'0')+':00'}));rows.push({sequence:46,timestamp:null});
 assert.equal(filterPeriod(rows).length,30);assert.equal(filterPeriod(rows)[0].sequence,45);
 assert.equal(filterPeriod(rows,{mode:'day',day:'2026-11-01'}).length,45);
 assert.equal(filterPeriod(rows,{mode:'week',day:'2026-11-01'}).length,45);
 assert.equal(filterPeriod(rows,{mode:'month',day:'2026-10-01'}).length,0);
 assert.equal(filterPeriod(rows,{mode:'undated'}).length,1);
});

test('removing a profile during an in-flight sync keeps its new records unassigned',()=>{
 const {journal:j,storage}=setup();j.addPerson('Временный');const captured=j.state.activePerson;j.removePerson(captured);j.save(snapshot(),captured);
 assert.equal(ownerOf(j.state,j.state.records[0]),'');assert.equal(new Journal(storage).state.records.length,1);
});
