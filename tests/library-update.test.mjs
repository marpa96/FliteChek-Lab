import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {updateChecklists} from '../web/library-update.js';
import {newState,openChecklist} from '../web/core.js';
const pkg=JSON.parse(fs.readFileSync(new URL('../web/library.flitechek.json',import.meta.url)));
const seed=JSON.parse(fs.readFileSync(new URL('../web/checklists.json',import.meta.url)));
const sha='a'.repeat(40);
function fixture(responses){const state=newState(seed);openChecklist(state,state.checklists[0].id);let value=JSON.stringify(state),writes=0;return {state,storage:{getItem:()=>value,setItem:(_k,v)=>{value=v;writes++;}},fetcher:async()=>new Response(JSON.stringify(responses.shift())),value:()=>JSON.parse(value),writes:()=>writes};}
test('one tap installs verified publication while preserving active run',async()=>{const f=fixture([{sha},{...pkg,source_commit:sha},{sha}]);const result=await updateChecklists(f);assert.equal(result.count,15);assert.equal(f.writes(),1);assert.deepEqual(f.value().runs,f.state.runs);assert.equal(f.value().libraryCommit,sha);});
test('unpublished or racing commit leaves offline storage untouched',async()=>{for(const after of [sha,'b'.repeat(40)]){const f=fixture([{sha},{...pkg,source_commit:'c'.repeat(40)},{encoding:'none'},{sha:after}]);await assert.rejects(updateChecklists(f),/not published/);assert.equal(f.writes(),0);}});
test('invalid publication leaves offline storage untouched',async()=>{const f=fixture([{sha},{...pkg,documents:[],source_commit:sha},{sha}]);await assert.rejects(updateChecklists(f));assert.equal(f.writes(),0);});
test('network failure leaves offline storage untouched',async()=>{const f=fixture([]);f.fetcher=async()=>{throw new Error('offline');};await assert.rejects(updateChecklists(f),/offline/);assert.equal(f.writes(),0);});
test('stale raw download falls back to verified GitHub contents',async()=>{const latest={...pkg,source_commit:sha};const f=fixture([{sha},{...pkg,source_commit:'b'.repeat(40)},{encoding:'base64',content:Buffer.from(JSON.stringify(latest)).toString('base64')},{sha}]);await updateChecklists(f);assert.equal(f.writes(),1);assert.equal(f.value().libraryCommit,sha);});
test('failed workflow is reported as failure, not a request to wait',async()=>{const f=fixture([{sha},{...pkg,source_commit:'b'.repeat(40)},{encoding:'none'},{sha},{workflow_runs:[{status:'completed',conclusion:'failure'}]}]);await assert.rejects(updateChecklists(f),/publication failed/);assert.equal(f.writes(),0);});
