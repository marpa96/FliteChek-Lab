import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');
function worker(){
 const handlers={},shell={body:'local shell'},network={body:'network'},calls=[];
 vm.runInNewContext(source,{URL,self:{location:{origin:'https://flight.test'},registration:{scope:'https://flight.test/'},addEventListener:(name,handler)=>handlers[name]=handler},caches:{match:async key=>key==='https://flight.test/index.html'?shell:undefined},fetch:async req=>{calls.push(req.url);return network;}});
 const navigate=async path=>{let response;handlers.fetch({request:{url:'https://flight.test'+path,method:'GET',mode:'navigate'},respondWith:p=>response=p});return response;};
 return {navigate,calls,shell,network};
}
test('installed launch opens local shell without contacting the Mac',async()=>{
 const w=worker();for(const path of ['/install?access=private','/','/index.html'])assert.equal(await w.navigate(path),w.shell);
 assert.equal(w.calls.length,0);
});
test('explicit updater still reaches the server',async()=>{
 const w=worker();assert.equal(await w.navigate('/install?access=private&update=1'),w.network);assert.equal(w.calls.length,1);
});
