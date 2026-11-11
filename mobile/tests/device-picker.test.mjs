import {t} from '../../web/dist/i18n.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanForDevice,deviceLabel} from '../src/device-picker.mjs';
function setup(){let actions;const events=[];const view={open:a=>{actions=a;},update:rows=>events.push(rows),idle:count=>events.push(count),close:()=>events.push('closed')};return {view,events,get actions(){return actions;}};}
test('selection keeps actual ID, deduplicates advertisements and stops scanning before return',async()=>{
 const x=setup();let callback;const calls=[];const ble={requestLEScan:async(options,cb)=>{callback=cb;calls.push(options);},stopLEScan:async()=>calls.push('stop')};
 const promise=scanForDevice(ble,{services:['fe4a']},x.view);
 callback({device:{deviceId:'AA',name:'BLESmart_123'}});callback({device:{deviceId:'AA',name:'X1-G'}});
 assert.equal(x.events.at(-1).length,1);x.actions.select('AA');assert.equal((await promise).deviceId,'AA');assert.equal(calls.at(-1),'stop');assert.equal(x.events.at(-1),'closed');
});
test('cancel during pending scan startup ignores late advertisements and cleans up',async()=>{
 const x=setup();let start,callback,stops=0;
 const promise=scanForDevice({requestLEScan:(_,cb)=>{callback=cb;return new Promise(r=>start=r);},stopLEScan:async()=>{stops++;}}, {},x.view);
 x.actions.cancel();callback({device:{deviceId:'AA'}});start();await assert.rejects(promise,{name:'NotFoundError'});assert.deepEqual(x.events,['closed']);assert.equal(stops,1);
});
test('native scan errors close picker and propagate',async()=>{
 const x=setup();await assert.rejects(scanForDevice({requestLEScan:async()=>{throw Error('radio off');},stopLEScan:async()=>{}},{},x.view),/radio off/);assert.equal(x.events.at(-1),'closed');
});
test('timeout stops scan but leaves discovered devices selectable',async()=>{
 const x=setup();let cb,stops=0;
 const promise=scanForDevice({requestLEScan:async(_,fn)=>{cb=fn;},stopLEScan:async()=>{stops++;}},{},x.view,{timeout:1});
 cb({device:{deviceId:'AA'}});await new Promise(r=>setTimeout(r,10));assert.equal(stops,1);assert.equal(x.events.at(-1),1);x.actions.select('AA');await promise;assert.equal(x.events.at(-1),'closed');
});
test('friendly names do not claim a model from generic BLE advertisement',()=>{
 assert.equal(deviceLabel({name:'X1-G'}),'Omron X1-G');assert.equal(deviceLabel({name:'BLESmart_000000ABCD'}),t('Тонометр Omron'));assert.equal(deviceLabel({}),t('Тонометр Omron'));
});
