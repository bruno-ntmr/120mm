import {Capacitor,registerPlugin} from '@capacitor/core';
import {BleClient} from '@capacitor-community/bluetooth-le';
import {createBluetoothAdapter} from './ble-adapter.mjs';
import {pickDevice} from './device-picker.mjs';
import {followSystemTheme} from './theme.mjs';
followSystemTheme({query:matchMedia('(prefers-color-scheme: dark)'),meta:document.querySelector('meta[name="theme-color"]')});
const files=registerPlugin('JournalFiles');
if(Capacitor.isNativePlatform()){
  Object.defineProperty(navigator,'bluetooth',{value:createBluetoothAdapter(BleClient,{storage:localStorage,visible:()=>!document.hidden,selectDevice:options=>pickDevice(BleClient,options)}),configurable:true});
  window.x1Native={
    exportFile:async(name,content,type)=>files.save({name,content,type}),
  };
  document.documentElement.classList.add('android-app');
}
// Bundle the exact same UI and protocol as the browser version.
await import('../../web/dist/app.mjs');
