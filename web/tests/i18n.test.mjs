import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolveLocale,translate} from '../dist/i18n.mjs';
import {english} from '../dist/translations.mjs';

test('system language selects Russian, regional English and unsupported languages fall back to English',()=>{
  for(const lang of ['ru','ru-RU','ru-BY','RU_ru'])assert.equal(resolveLocale([lang]),'ru');
  for(const lang of ['en','en-GB','de-DE','uk-UA','fr',''])assert.equal(resolveLocale([lang],''),'en');
  assert.equal(resolveLocale(['de-DE','ru-RU']),'en');
  assert.equal(resolveLocale([], 'ru-RU'),'ru');
});
test('all translations preserve placeholders and interpolate names without recursive substitution',()=>{
  for(const [ru,en] of Object.entries(english)){
    assert.ok(en.trim());assert.doesNotMatch(en,/[А-Яа-яЁё]/);
    assert.deepEqual([...ru.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(),[...en.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(),ru);
  }
  assert.equal(translate('Удалить профиль «{0}»?',['Анна {0}'],'en'),'Delete profile “Анна {0}”?');
  assert.equal(translate('Заряд {0}%',[50],'ru'),'Заряд 50%');
});
test('static page and picker labels, including accessibility text, have translations',()=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const picker=readFileSync(new URL('../../mobile/src/device-picker.mjs',import.meta.url),'utf8');
  for(const source of [html,picker]){
    for(const match of source.matchAll(/>([^<>]+)<|(?:aria-label|title|placeholder|content)="([^"]+)"/g)){
      const value=(match[1]??match[2]).trim();
      if(/[А-Яа-яЁё]/.test(value))assert.ok(Object.hasOwn(english,value),value);
    }
  }
});
test('every explicit translation key in shared and native code is present',()=>{
  for(const dir of ['../dist/','../../mobile/src/'])for(const name of readdirSync(new URL(dir,import.meta.url))){
    if(!name.endsWith('.mjs')||['translations.mjs','i18n.mjs'].includes(name))continue;
    const source=readFileSync(new URL(dir+name,import.meta.url),'utf8');
    for(const m of source.matchAll(/\bt\('([^']+)'/g))assert.ok(Object.hasOwn(english,m[1]),name+': '+m[1]);
  }
});

test('English uses measurement terminology and # for measurement numbers',()=>{
  assert.equal(translate('№{0}',[42],'en'),'#42');
  assert.equal(translate('№{0} · без даты',[42],'en'),'#42 · undated');
  assert.equal(translate('Последнее измерение',[],'en'),'Last measurement');
  for(const [key,value] of Object.entries(english))if(key!=='Чтение ')assert.doesNotMatch(value,/\breadings?\b|№/i);
});
