import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
import {validatePackage} from '../src/catalog.js';
test('GitHub builder advances changed content without editing authored YAML',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flitechek-ci-'));
 try{
  fs.cpSync(new URL('../../Flight-Checklists/.flitechek/',import.meta.url),path.join(dir,'.flitechek'),{recursive:true});
  const base=JSON.parse(fs.readFileSync(new URL('../web/library.flitechek.json',import.meta.url)));
  const item=validatePackage(base)[0],entry={...item.metadata,revision:1};
  const catalog=JSON.stringify({schema_version:1,checklists:[entry]});fs.writeFileSync(dir+'/catalog.yaml',catalog);fs.writeFileSync(dir+'/Named checklist.md',item.markdown);
  const run=(out,prev)=>execFileSync(process.execPath,[dir+'/.flitechek/build.mjs',dir+'/'+out,...prev?[dir+'/'+prev]:[]]);
  run('first.json');run('second.json','first.json');assert.equal(validatePackage(JSON.parse(fs.readFileSync(dir+'/second.json')))[0].metadata.revision,1);
  fs.appendFileSync(dir+'/Named checklist.md','\n- [ ] New test step\n');run('third.json','second.json');assert.equal(validatePackage(JSON.parse(fs.readFileSync(dir+'/third.json')))[0].metadata.revision,2);
  assert.equal(fs.readFileSync(dir+'/catalog.yaml','utf8'),catalog);
  fs.writeFileSync(dir+'/Named checklist.md','# Missing ID');assert.throws(()=>run('third.json','second.json'));assert.equal(validatePackage(JSON.parse(fs.readFileSync(dir+'/third.json')))[0].metadata.revision,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('publisher rejects new unregistered checklist rather than silently skipping it',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flitechek-missing-id-'));
 try{
  fs.cpSync(new URL('../../Flight-Checklists/.flitechek/',import.meta.url),dir+'/.flitechek',{recursive:true});
  const pkg=JSON.parse(fs.readFileSync(new URL('../web/library.flitechek.json',import.meta.url)));
  const item=validatePackage(pkg)[0];fs.writeFileSync(dir+'/catalog.yaml',JSON.stringify({schema_version:1,checklists:[item.metadata]}));fs.writeFileSync(dir+'/Registered.md',item.markdown);
  fs.mkdirSync(dir+'/5. Ground Ops');fs.writeFileSync(dir+'/5. Ground Ops/Test checklist.md','# Test\n- [ ] Step');
  const out=dir+'/library.json';fs.writeFileSync(out,'previous publication');
  assert.throws(()=>execFileSync(process.execPath,[dir+'/.flitechek/build.mjs',out],{stdio:'pipe'}),error=>error.stderr.toString().includes('Test checklist.md'));
  assert.equal(fs.readFileSync(out,'utf8'),'previous publication');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
