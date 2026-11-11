// Offline is paramount: every file the app loads must be in the service worker's install list,
// or the app can fail to open in the air. This walks the real import graph from the page.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const web=new URL('../web/',import.meta.url);
const read=f=>fs.readFileSync(new URL(f.replace(/^\.\//,''),web),'utf8');

function installList(){
  const sw=read('sw.js');
  const files=JSON.parse(sw.match(/const FILES=(\[[^\]]*\])/)[1].replace(/'/g,'"'));
  const extra=JSON.parse(sw.match(/FILES\.push\(\.\.\.(\[[^\]]*\])\)/)[1]);
  return new Set([...files,...extra]);
}
function pageAssets(){
  const html=read('index.html');
  return [...html.matchAll(/(?:src|href)="(\.\/[^"?]+)/g)].map(m=>m[1]);
}
function moduleGraph(entries){
  const seen=new Set(),queue=[...entries];
  while(queue.length){
    const f=queue.shift();if(seen.has(f)||!f.endsWith('.js'))continue;seen.add(f);
    for(const m of read(f).matchAll(/(?:from|import)\s*['"](\.\/[^'"]+)['"]/g))queue.push(m[1]);
  }
  return seen;
}

test('every script, style and icon the page loads is cached for offline use',()=>{
  const list=installList(),missing=pageAssets().filter(f=>!list.has(f));
  assert.deepEqual(missing,[]);
});
test('every JavaScript module reachable from the app is cached for offline use',()=>{
  const list=installList(),graph=moduleGraph(pageAssets().filter(f=>f.endsWith('.js')));
  assert.ok(graph.has('./resolver.js')&&graph.has('./core.js'));
  assert.deepEqual([...graph].filter(f=>!list.has(f)),[]);
});
test('the starter checklists are cached, and every listed file exists',()=>{
  const list=installList();assert.ok(list.has('./checklists.json'));
  const absent=[...list].filter(f=>f!=='./'&&!fs.existsSync(new URL(f.replace(/^\.\//,''),web)));
  assert.deepEqual(absent,[],'a missing file makes the whole offline install fail');
});
