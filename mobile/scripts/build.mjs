import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {build} from 'esbuild';
await rm('www',{recursive:true,force:true});await mkdir('www',{recursive:true});
let html=await readFile('../web/dist/index.html','utf8');
html=html.replace('<html lang="ru" class="first-run">','<html lang="ru" class="first-run android-app">');
html=html.replace(/src="app\.mjs[^\"]*"/,'src="app.js"').replace(/href="style\.css[^\"]*"/,'href="style.css"').replace('width=device-width,initial-scale=1','width=device-width,initial-scale=1,viewport-fit=cover');
await writeFile('www/index.html',html);
await copyFile('../web/dist/style.css','www/style.css');
await copyFile('../web/dist/privacy.html','www/privacy.html');
await writeFile('www/style.css',(await readFile('www/style.css','utf8'))+'\n.android-app main{padding-top:calc(20px + var(--safe-area-inset-top, env(safe-area-inset-top)));padding-bottom:calc(24px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)))}.android-app #live-overlay{padding-bottom:calc(12px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)))}.android-app body{-webkit-tap-highlight-color:transparent;overscroll-behavior-y:none}\n');
await writeFile('www/style.css',(await readFile('www/style.css','utf8'))+'\n'+await readFile('src/theme.css','utf8')+'\n'+await readFile('src/device-picker.css','utf8'));
await build({entryPoints:['src/main.mjs'],bundle:true,format:'esm',target:'chrome100',outfile:'www/app.js',minify:false,sourcemap:false});
let notices='120mm — third-party notices\n\n';
for(const pkg of ['@capacitor/core','@capacitor/android','@capacitor-community/bluetooth-le']){notices+=pkg+'\n'+await readFile('node_modules/'+pkg+'/LICENSE','utf8')+'\n\n';}
await writeFile('www/THIRD-PARTY.txt',notices);
notices+='Protocol reference notice\n'+await readFile('../THIRD_PARTY.md','utf8');
await writeFile('www/THIRD-PARTY.txt',notices);
await copyFile('../LICENSE','www/LICENSE.txt');
console.log('Android assets built from shared web client');
