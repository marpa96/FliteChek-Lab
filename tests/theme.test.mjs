import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../web/theme.js',import.meta.url),'utf8');
function boot(hour,preference='auto'){
 const handlers={},root={dataset:{}},saved={value:preference},clock={hour};
 const context={document:{documentElement:root,hidden:false,querySelector:()=>({setAttribute(){}}),addEventListener:(name,fn)=>handlers[name]=fn},window:{},Date:class{getHours(){return clock.hour}},localStorage:{getItem:()=>saved.value,setItem:(_,v)=>saved.value=v},matchMedia:()=>({matches:true})};
 vm.runInNewContext(source,context);return {handlers,root,saved,clock,context};
}
test('Auto is daytime at noon even if the device has dark appearance',()=>assert.equal(boot(12).root.dataset.theme,'day'));
test('Auto schedule boundaries are 06:00 and 18:00 local time',()=>{for(const [hour,theme] of [[5,'night'],[6,'day'],[17,'day'],[18,'night']])assert.equal(boot(hour).root.dataset.theme,theme);});
test('resuming in daytime clears a previous automatic night palette',()=>{const b=boot(22);b.clock.hour=10;b.handlers.visibilitychange();assert.equal(b.root.dataset.theme,'day');});
test('manual Night remains an explicit override, and Auto restores clock selection',()=>{const b=boot(12,'night');assert.equal(b.root.dataset.theme,'night');b.handlers.visibilitychange();assert.equal(b.root.dataset.theme,'night');b.context.window.fliteTheme.set('auto');assert.equal(b.root.dataset.theme,'day');assert.equal(b.saved.value,'auto');});
