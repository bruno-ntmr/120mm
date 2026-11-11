import {t,locale,localizeMarkup} from '../../web/dist/i18n.mjs';
export function deviceLabel(raw){
  const name=(raw.name||'').trim();
  if(/^X1-G$/i.test(name))return 'Omron X1-G';
  if(!name||/^BLESmart/i.test(name))return t('Тонометр Omron');
  return name.replace(/^OMRON\s*/i,'Omron ').slice(0,60);
}

// Own the complete scan lifetime, including cancellation while native startup is pending.
export async function scanForDevice(ble,options,view,{timeout=20000}={}){
  let done=false,timer,resolve,reject;
  const devices=new Map();
  const chosen=new Promise((yes,no)=>{resolve=yes;reject=no;});
  chosen.catch(()=>{});
  const finish=(device,error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(device);};
  view.open({select:id=>{if(devices.has(id))finish(devices.get(id));},cancel:()=>finish(null,new DOMException(t('Выбор отменён'),'NotFoundError'))});
  try{
    await ble.requestLEScan({...options,allowDuplicates:false},result=>{
      if(done||!result.device?.deviceId)return;
      const raw={...result.device,name:result.localName||result.device.name};
      devices.set(raw.deviceId,raw);view.update([...devices.values()]);
    });
    if(!done)timer=setTimeout(()=>{
      // Stop radio scanning but keep discovered choices available.
      ble.stopLEScan().then(()=>{if(!done)view.idle(devices.size);},e=>finish(null,e));
    },timeout);
    return await chosen;
  }finally{
    done=true;clearTimeout(timer);
    try{await ble.stopLEScan();}finally{view.close();}
  }
}

export function createPickerView(doc=document){
  let dialog,rows,status,abort,previousFocus;
  const icon='<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="4" width="22" height="25" rx="5"/><rect x="9" y="8" width="14" height="9" rx="2"/><path d="M12 12h3m3 0h2M11 23h3"/><circle cx="22" cy="23" r="2"/></svg>';
  return {
    open({select,cancel}){
      previousFocus=doc.activeElement;abort=new AbortController();
      dialog=doc.createElement('dialog');dialog.className='device-picker';
      dialog.setAttribute('aria-labelledby','device-picker-title');
      dialog.innerHTML='<div class="picker-heading"><h2 id="device-picker-title">Добавить тонометр</h2><button type="button" class="picker-close" aria-label="Закрыть">×</button></div><div class="picker-status" role="status"><i aria-hidden="true"></i><span>Поиск поблизости…</span></div><div class="picker-devices"></div>';
      localizeMarkup(dialog);
      rows=dialog.querySelector('.picker-devices');status=dialog.querySelector('.picker-status');
      dialog.querySelector('.picker-close').onclick=cancel;
      dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});
      dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)cancel();}});
      doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();},{signal:abort.signal});
      rows.onclick=e=>{const button=e.target.closest('button[data-device]');if(button)select(button.dataset.device);};
      doc.body.append(dialog);dialog.showModal();
    },
    update(devices){
      const active=doc.activeElement?.dataset.device;
      rows.replaceChildren(...devices.map(raw=>{
        const button=doc.createElement('button');button.type='button';button.className='picker-device';button.dataset.device=raw.deviceId;
        const label=deviceLabel(raw),duplicate=devices.filter(d=>deviceLabel(d)===label).length>1;
        button.innerHTML=icon;
        const name=doc.createElement('span');name.className='picker-name';name.textContent=label;button.append(name);
        if(duplicate){const suffix=doc.createElement('small');suffix.textContent=raw.deviceId.replace(/[^a-z0-9]/gi,'').slice(-4).toUpperCase();button.append(suffix);}
        button.setAttribute('aria-label',label+(duplicate?' '+raw.deviceId.slice(-5):''));
        const arrow=doc.createElement('span');arrow.className='picker-arrow';arrow.textContent='›';button.append(arrow);return button;
      }));
      if(active)Array.from(rows.children).find(b=>b.dataset.device===active)?.focus();
    },
    idle(count){status.classList.add('idle');status.querySelector('span').textContent=count?t('Выберите тонометр'):t('Тонометр не найден. Включите Bluetooth на приборе и попробуйте снова.');},
    close(){abort?.abort();dialog?.close();dialog?.remove();previousFocus?.focus();}
  };
}
export function pickDevice(ble,options){return scanForDevice(ble,options,createPickerView());}
