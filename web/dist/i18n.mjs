import {english} from './translations.mjs';

// Use the first system language, not a secondary language preference.
export function resolveLocale(languages=globalThis.navigator?.languages, language=globalThis.navigator?.language){
  const requested=languages?.[0]||language||'en';
  return /^ru(?:[-_]|$)/i.test(requested)?'ru':'en';
}
export const locale=resolveLocale();
export function translate(key,values=[],language=locale){
  const message=language==='ru'?key:(english[key]??key);
  return message.replace(/\{(\d+)\}/g,(match,index)=>String(values[index]??match));
}
export const t=(key,...values)=>translate(key,values);

// Translate only static markup before it is populated with personal data.
// Never run this over rendered readings or user-entered profile names.
export function localizeMarkup(root,language=locale){
  const doc=root.ownerDocument||root;
  const walker=doc.createTreeWalker(root,4); // SHOW_TEXT
  let node;
  while((node=walker.nextNode())){
    if(['SCRIPT','STYLE'].includes(node.parentElement?.tagName))continue;
    const key=node.textContent.trim();
    if(Object.hasOwn(english,key))node.textContent=node.textContent.replace(key,translate(key,[],language));
  }
  for(const element of [root,...root.querySelectorAll('*')]){
    if(!element.getAttribute)continue;
    for(const attribute of ['aria-label','title','placeholder','content']){
      const key=element.getAttribute(attribute);
      if(key&&Object.hasOwn(english,key))element.setAttribute(attribute,translate(key,[],language));
    }
  }
  if(root===doc)doc.documentElement.lang=language;
}
