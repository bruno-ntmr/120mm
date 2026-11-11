import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkVersion,setVersion} from '../scripts/version.mjs';
function fixture(){const root=mkdtempSync(join(tmpdir(),'journal-version-'));mkdirSync(join(root,'mobile/android/app'),{recursive:true});writeFileSync(join(root,'mobile/package.json'),JSON.stringify({version:'1.2.3'}));writeFileSync(join(root,'mobile/package-lock.json'),JSON.stringify({version:'1.2.3',packages:{'':{version:'1.2.3'}}}));writeFileSync(join(root,'mobile/android/app/build.gradle'),'versionCode 12\nversionName "1.2.3"\n');return root;}
test('release check is read-only and requires exact tag/version agreement',()=>{const root=fixture();try{const before=readFileSync(join(root,'mobile/android/app/build.gradle'),'utf8');assert.equal(checkVersion(root,'v1.2.3').code,12);assert.throws(()=>checkVersion(root,'v1.2.4'));assert.throws(()=>checkVersion(root,'v1.2.3; echo injected'));assert.equal(readFileSync(join(root,'mobile/android/app/build.gradle'),'utf8'),before);}finally{rmSync(root,{recursive:true});}});
test('explicit version preparation updates all files and increments Android code once',()=>{const root=fixture();try{const result=setVersion(root,'1.3.0');assert.equal(result.code,13);assert.equal(checkVersion(root,'v1.3.0').version,'1.3.0');assert.throws(()=>setVersion(root,'1.3.0'));assert.throws(()=>setVersion(root,'0.9.0'));assert.throws(()=>setVersion(root,'bad'));}finally{rmSync(root,{recursive:true});}});
