import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
export function checkVersion(root,tag){
 const pkg=JSON.parse(readFileSync(resolve(root,'mobile/package.json'))),lock=JSON.parse(readFileSync(resolve(root,'mobile/package-lock.json'))),gradle=readFileSync(resolve(root,'mobile/android/app/build.gradle'),'utf8');
 const version=pkg.version,code=Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
 if(!/^\d+\.\d+\.\d+$/.test(version)||!Number.isSafeInteger(code)||code<1||code>2100000000)throw Error('Invalid version or Android versionCode');
 if(lock.version!==version||lock.packages[''].version!==version||gradle.match(/versionName\s+"([^"]+)"/)?.[1]!==version)throw Error('Version files disagree');
 if(tag!==undefined&&tag!==`v${version}`)throw Error(`Tag must be v${version}`);
 return {version,code,pkg,lock,gradle};
}
export function setVersion(root,version){
 const old=checkVersion(root);
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Use X.Y.Z');
 const next=version.split('.').map(Number),prev=old.version.split('.').map(Number);const difference=next.findIndex((n,i)=>n!==prev[i]);
 if(difference<0||next[difference]<prev[difference]||next.some(n=>!Number.isSafeInteger(n))||old.code>=2100000000)throw Error('New release version must increase');
 old.pkg.version=old.lock.version=old.lock.packages[''].version=version;
 writeFileSync(resolve(root,'mobile/package.json'),JSON.stringify(old.pkg,null,2)+'\n');writeFileSync(resolve(root,'mobile/package-lock.json'),JSON.stringify(old.lock,null,2)+'\n');
 writeFileSync(resolve(root,'mobile/android/app/build.gradle'),old.gradle.replace(/versionCode\s+\d+/,`versionCode ${old.code+1}`).replace(/versionName\s+"[^"]+"/,`versionName "${version}"`));
 return checkVersion(root);
}
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=process.argv[2];
 if(arg==='--check'){
  const current=checkVersion(root,process.env.RELEASE_TAG);
  if(process.env.RELEASE_TAG){
   const tags=execFileSync('git',['tag','--list','v*'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(t=>/^v\d+\.\d+\.\d+$/.test(t)&&t!==process.env.RELEASE_TAG);
   for(const tag of tags){const old=execFileSync('git',['show',`${tag}:mobile/android/app/build.gradle`],{cwd:root,encoding:'utf8'});const code=Number(old.match(/versionCode\s+(\d+)/)?.[1]);if(code>=current.code)throw Error(`versionCode must exceed ${tag}`);}
  }
  console.log(`Version ${current.version}, Android code ${current.code}`);
 }else{if(!arg)throw Error('Usage: node scripts/version.mjs --check | X.Y.Z');const updated=setVersion(root,arg);console.log(`Prepared ${updated.version} (code ${updated.code}). Commit and tag manually.`);}
}
