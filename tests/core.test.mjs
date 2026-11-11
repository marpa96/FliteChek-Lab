import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse,replaceBlock,moveTask,revision,latest,newState,openChecklist,tasks,current,complete,setItem,saveDraft,restore,restart,nextChecklist,validateState,syncBundled,automaticTarget} from '../web/core.js';
const md='# Test\n\n- [ ] Parent\n  - [ ] Child\n- [x] Last\n\n> [!WARNING]\n> Keep visible\n\n| If | Then |\n|---|---|\n| A | B |\n\n```md\n- [ ] Example only\n```\n';
const checklist=(id='a',title='Preflight',variant='C172S',emergency=false)=>({id,title,variant,emergency,revisions:[{...revision(md),title,variant,emergency}]});
const setup=()=>{const s=newState([checklist()]);openChecklist(s,'a');return s;};
test('parser ignores checkbox examples in fences',()=>assert.equal(parse(md).filter(b=>b.kind==='task').length,3));
test('tables and warnings remain visible',()=>{assert.ok(parse(md).find(b=>b.kind==='table').text.includes('| A | B |'));assert.ok(parse(md).find(b=>b.kind==='note').text.includes('Keep visible'));});
test('visual edits preserve untouched Markdown',()=>assert.equal(replaceBlock(md,parse(md).find(b=>b.kind==='task'),'New'),md.replace('Parent','New')));
test('reordering carries nested checks',()=>assert.ok(moveTask(md,2,1).includes('- [x] Last\n\n- [ ] Parent\n  - [ ] Child')));
test('reordering cannot cross a heading',()=>assert.equal(moveTask(md,2,-1),md));
test('fresh runs ignore source check marks',()=>{const s=setup();assert.deepEqual(s.runs.a.states,{});assert.equal(current(s.runs.a),2);});
test('pending advances without marking complete',()=>{const r=setup().runs.a;setItem(r,2,'pending');assert.equal(current(r),3);assert.equal(complete(r),false);});
test('pending blocks completion and is returned to',()=>{const r=setup().runs.a;setItem(r,2,'pending');setItem(r,3,'done');setItem(r,4,'done');assert.equal(current(r),2);assert.equal(complete(r),false);});
test('checks are reversible',()=>{const r=setup().runs.a;for(const t of tasks(r))setItem(r,t.line,'done');assert.ok(complete(r));setItem(r,3,'done');assert.equal(current(r),3);});
test('empty draft is not complete',()=>assert.equal(complete({markdown:'# Draft',states:{}}),false));
test('variants keep independent progress',()=>{const s=newState([checklist(),checklist('b','Preflight','Other')]);openChecklist(s,'a');setItem(s.runs.a,2,'done');openChecklist(s,'b');assert.deepEqual(s.runs.b.states,{});openChecklist(s,'a');assert.equal(s.runs.a.states[2],'done');});
test('emergency preserves previous normal procedure',()=>{const s=newState([checklist(),checklist('e','Emergency','Default',true)]);openChecklist(s,'a');openChecklist(s,'e');assert.equal(s.returnTo,'a');openChecklist(s,'a');assert.equal(s.returnTo,null);});
test('editing leaves active run snapshot intact',()=>{const s=setup();s.draft={checklistID:'a',title:'Preflight',variant:'C172S',emergency:false,markdown:md+'New text'};saveDraft(s);assert.equal(s.runs.a.markdown,md);assert.equal(s.checklists[0].revisions.length,2);});
test('unchanged Done does not duplicate revision',()=>{const s=setup();s.draft={checklistID:'a',title:'Preflight',variant:'C172S',emergency:false,markdown:md};saveDraft(s);assert.equal(s.checklists[0].revisions.length,1);});
test('restore appends revision and restores metadata',()=>{const s=setup(),id=latest(s.checklists[0]).id;s.draft={checklistID:'a',title:'Renamed',variant:'New',emergency:true,markdown:'Changed'};saveDraft(s);restore(s,'a',id);assert.equal(s.checklists[0].title,'Preflight');assert.equal(s.checklists[0].revisions.length,3);assert.equal(latest(s.checklists[0]).markdown,md);});
test('restart applies latest revision',()=>{const s=setup();s.checklists[0].revisions.push(revision('- [ ] New'));restart(s);assert.equal(s.runs.a.markdown,'- [ ] New');});
test('new flight clears all run progress, preserves revisions',()=>{const s=setup();setItem(s.runs.a,2,'done');restart(s,true);assert.deepEqual(s.runs.a.states,{});assert.equal(s.checklists[0].revisions.length,1);});
test('next procedure skips alternate variants and emergencies',()=>{const s=newState([checklist(),checklist('b','Preflight','Other'),checklist('e','Emergency','Other',true),checklist('c','Cruise')]);openChecklist(s,'a');assert.equal(nextChecklist(s).id,'c');});
test('backup round trip retains progress and draft',()=>{const s=setup();setItem(s.runs.a,2,'done');s.draft={title:'Draft',variant:'Custom',emergency:false,markdown:md};assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))),s);});
test('invalid backup rejected',()=>assert.throws(()=>validateState({schema:99})));
test('duplicate checklist identities rejected',()=>{const s=setup();s.checklists.push(s.checklists[0]);assert.throws(()=>validateState(s));});
test('bundled library validates and contains the canonical source documents and mock trial',()=>{const list=JSON.parse(fs.readFileSync(new URL('../web/checklists.json',import.meta.url)));assert.equal(list.length,15);validateState(newState(list));});

 test('heading hierarchy follows Markdown levels and current-task path',()=>{
  const b=parse('# Title\n## Equipment\n### Update Software\n#### Foreflight\n- [ ] Databases\n## Kneeboard\n- [ ] Pens');
  assert.deepEqual(b.filter(x=>x.kind==='heading').map(x=>x.level),[1,2,3,4,2]);
  assert.deepEqual(b.filter(x=>x.kind==='task').map(x=>x.sectionPath),[['Equipment','Update Software','Foreflight'],['Kneeboard']]);
 });
 test('quoted reference bullets remain reference text',()=>assert.equal(parse('> - A possible condition\n> - Another condition').filter(b=>b.kind==='task').length,0));
 test('bundled formatting correction preserves run progress and history',()=>{
  const s=setup();setItem(s.runs.a,2,'done');const seed=structuredClone(s.checklists[0]);seed.revisions.push(revision(md+'\n- [ ] Added check'));
  assert.equal(syncBundled(s,[seed]),1);assert.equal(s.checklists[0].revisions.length,2);
  assert.equal(s.runs.a.markdown,md);assert.equal(s.runs.a.states[2],'done');assert.equal(syncBundled(s,[seed]),0);
 });
 test('bundled correction never overwrites personal edits',()=>{
  const s=setup(),seed=structuredClone(s.checklists[0]);seed.revisions.push(revision('Bundled change'));s.checklists[0].revisions.push(revision('My own edit'));
  assert.equal(syncBundled(s,[seed]),0);assert.equal(latest(s.checklists[0]).markdown,'My own edit');
 });
 test('original Day Before preparation bullets are interpreted as tasks in both variants',()=>{
  const list=JSON.parse(fs.readFileSync(new URL('../web/checklists.json',import.meta.url)));
  for(const c of list.filter(c=>c.title==='Day Before')){
   const b=parse(latest(c).markdown),ts=b.filter(b=>b.kind==='task');
   assert.ok(ts.some(t=>t.text==='Foreflight Databases up to date'));
   assert.ok(ts.some(t=>t.text.includes('Pens x 3')));
   assert.ok(ts.some(t=>t.text.includes('Generate preliminary flight briefing')));
   assert.ok(ts.length>30);
  }
 });

 test('plain bullets and numbered lists become actions without changing source',()=>{
  const md='## Pack\n- Pens\n* Earplugs\n+ Headset\n1. Set route\n2) Get briefing';
  const items=parse(md).filter(b=>b.kind==='task');assert.equal(items.length,5);assert.ok(items.every(b=>b.implicit));
  assert.equal(replaceBlock(md,items[0],'Three pens'),md.replace('Pens','Three pens'));
  assert.equal(items[0].prefix,'- ');assert.equal(items[3].prefix,'1. ');
 });
 test('reference mode keeps unmarked emergency alternatives as text',()=>{
  const r={markdown:'Fly highest of:\n- Assigned altitude\n- Expected altitude\n- [ ] Tune radio',states:{},plainLists:false};
  assert.equal(tasks(r).length,1);
 });
 test('dividers and fenced examples do not become actions',()=>{
  assert.equal(parse('- - -\n***\n```\n- Example\n```\n> - Reference').filter(b=>b.kind==='task').length,0);
 });
 test('undoing our formatting rewrite preserves checked steps',()=>{
  const s=setup(),c=s.checklists[0],seed=structuredClone(c);
  const formatted=md+'\n- [ ] Pens',original=md+'\n- Pens';
  c.revisions.push(revision(formatted));s.runs.a.markdown=formatted;setItem(s.runs.a,2,'done');
  seed.revisions.push(revision(formatted),{...revision(original),revertsFormattingEdit:true});
  assert.equal(syncBundled(s,[seed]),1);assert.equal(s.runs.a.markdown,original);assert.equal(s.runs.a.states[2],'done');
 });

test('callouts interpret quoted and inline markers without changing Markdown',()=>{
  for(const type of ['NOTE','TIP','IMPORTANT','WARNING','CAUTION']){
    const md=`> [!${type}]\n> Read **this**\n> And this`;
    const b=parse(md)[0];assert.equal(b.callout,type.toLowerCase());assert.equal(b.body,'Read **this**\nAnd this');assert.equal(b.text,md.replace(/^> /gm,''));
    assert.equal(parse(`[!${type}] Inline notice`)[0].body,'Inline notice');
  }
});
test('automatic movement stops at earliest callout before next task, without counting it',()=>{
  const run={markdown:'- First\n> [!CAUTION]\n> Stop here\n\n> [!TIP]\n> Read too\n- Second',states:{0:'done'}};
  assert.equal(tasks(run).length,2);assert.equal(current(run),6);assert.equal(automaticTarget(run),1);
  setItem(run,6,'done');assert.equal(automaticTarget(run),null);
  setItem(run,6,'done');assert.equal(automaticTarget(run),1);
});
test('initial callouts stay ahead of first item and ordinary notes remain references',()=>{
  assert.equal(automaticTarget({markdown:'> [!WARNING] Read first\n- First',states:{}}),0);
  assert.equal(automaticTarget({markdown:'> Reference\n- First',states:{}}),1);
  assert.equal(parse('```\n[!CAUTION] example\n```')[0].callout,undefined);
});
