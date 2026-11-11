import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MeasurementCycle} from '../dist/measurement-cycle.mjs';
test('sync once after observed measurement, never for replayed results',()=>{
  const cycle=new MeasurementCycle();
  for(const kind of ['battery','result','result'])assert.equal(cycle.accept(kind),false);
  for(const kind of ['measuring','measuring','battery'])assert.equal(cycle.accept(kind),false);
  assert.equal(cycle.accept('result'),true);
  for(let i=0;i<100;i++)assert.equal(cycle.accept('result'),false);
  cycle.accept('measuring');assert.equal(cycle.accept('result'),true);
});
test('measurement error cancels completion; silence does not complete it',()=>{
  const cycle=new MeasurementCycle();cycle.accept('measuring');
  assert.equal(cycle.accept('stale'),false);
  cycle.accept('device_error');assert.equal(cycle.accept('result'),false);
});
