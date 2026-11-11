import {t,locale} from '../../web/dist/i18n.mjs';
// Only the GATT subset consumed by the shared, tested X1-G protocol.
const aliases={model_number_string:'00002a24-0000-1000-8000-00805f9b34fb',firmware_revision_string:'00002a26-0000-1000-8000-00805f9b34fb'};
const uuid=value=>aliases[value]||value.toLowerCase();
const view=value=>new DataView(value.buffer,value.byteOffset,value.byteLength);
export function createBluetoothAdapter(ble,{storage,visible=()=>true,selectDevice=options=>ble.requestDevice(options)}={}){
  const devices=new Map();let initialized=null;
  const initialize=()=>initialized??=(ble.initialize({androidNeverForLocation:true}).catch(e=>{initialized=null;throw e;}));
  class Characteristic extends EventTarget {
    constructor(device,service,id,epoch){super();Object.assign(this,{device,service,id,epoch});}
    check(){if(!this.device.gatt.connected||this.epoch!==this.device.epoch)throw Error(t('Bluetooth-соединение закрыто'));}
    async readValue(){this.check();return ble.read(this.device.id,this.service,this.id);}
    async writeValueWithoutResponse(value){this.check();return ble.writeWithoutResponse(this.device.id,this.service,this.id,view(value));}
    async startNotifications(){
      this.check();
      await ble.startNotifications(this.device.id,this.service,this.id,value=>{
        if(!this.device.gatt.connected||this.epoch!==this.device.epoch)return;
        this.value=value;this.dispatchEvent(new Event('characteristicvaluechanged'));
      });return this;
    }
  }
  class Device extends EventTarget {
    constructor(raw){
      super();this.id=raw.deviceId;this.name='X1-G';this.epoch=0;this.closing=Promise.resolve();this.connecting=null;
      this.gatt={connected:false,connect:()=>this.connect(),disconnect:()=>this.disconnect(),getPrimaryService:async id=>{
        if(!this.gatt.connected)throw Error(t('Bluetooth-соединение закрыто'));
        const epoch=this.epoch;
        return {getCharacteristic:async characteristic=>new Characteristic(this,uuid(id),uuid(characteristic),epoch)};
      }};
    }
    async connect(){
      if(this.connecting)return this.connecting;
      this.connecting=this.open();
      try{return await this.connecting;}finally{this.connecting=null;}
    }
    async open(){
      await this.closing;await initialize();
      if(!visible())throw Error(t('Приложение свёрнуто'));
      if(this.gatt.connected)return this.gatt;
      const epoch=++this.epoch;
      await ble.connect(this.id,()=>{
        if(this.epoch!==epoch)return;
        this.gatt.connected=false;this.epoch++;
        this.dispatchEvent(new Event('gattserverdisconnected'));
      },{timeout:15000});
      if(this.epoch!==epoch){await ble.disconnect(this.id);throw Error(t('Подключение отменено'));}
      this.gatt.connected=true;return this.gatt;
    }
    disconnect(){
      const wasConnected=this.gatt.connected;this.gatt.connected=false;this.epoch++;
      this.closing=this.closing.catch(()=>{}).then(()=>ble.disconnect(this.id));
      // Preserve rejection for the next connect but avoid an unhandled rejection.
      this.closing.catch(()=>{});
      if(wasConnected)this.dispatchEvent(new Event('gattserverdisconnected'));
    }
  }
  const get=raw=>{let d=devices.get(raw.deviceId);if(!d){d=new Device(raw);devices.set(d.id,d);}return d;};
  return {
    async requestDevice(options){
      await initialize();if(!await ble.isEnabled())await ble.requestEnable();
      let raw;
      try{raw=await selectDevice({services:options.filters?.[0]?.services||[]});}
      catch(e){if(/cancel|no device selected/i.test(e.message))throw new DOMException(t('Выбор отменён'),'NotFoundError');throw e;}
      // Establish Android's bond once; subsequent connections reuse it.
      if(!await ble.isBonded(raw.deviceId))await ble.createBond(raw.deviceId,{timeout:30000});
      storage?.setItem('x1-native-device-name',raw.name||'X1-G');
      return get(raw);
    },
    async getDevices(){
      const id=storage?.getItem('x1g-device-id');if(!id)return [];
      // Restore synchronously available identity even before Bluetooth permissions/radio are ready.
      // connect() initializes Bluetooth; failed connections then use the normal retry loop.
      return [get({deviceId:id,name:storage?.getItem('x1-native-device-name')||'X1-G'})];
    }
  };
}
