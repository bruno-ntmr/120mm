import {test} from 'node:test';
import assert from 'node:assert/strict';
import {followSystemTheme} from '../src/theme.mjs';
test('system theme follows initial setting and live changes without a reload',()=>{
 const query=new EventTarget();query.matches=false;let color;
 const stop=followSystemTheme({query,meta:{setAttribute:(name,value)=>{assert.equal(name,'content');color=value;}}});
 assert.equal(color,'#f5f6fa');query.matches=true;query.dispatchEvent(new Event('change'));assert.equal(color,'#0b0d14');
 query.matches=false;query.dispatchEvent(new Event('change'));assert.equal(color,'#f5f6fa');stop();
});
