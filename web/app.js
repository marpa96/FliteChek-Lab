import {updateURL} from './navigation.js';
import {loadSavedState,attachCatalogIdentity} from './recovery.js';
import {renderInline,webLinks} from './links.js';
import {checklistGroup,GROUPS} from './profile.js';
import {updateChecklists} from './library-update.js';
import {readPackage,planImport,installLibrary} from './catalog.js';
import {FUEL_LINK,fuelEndurance,duration,fuelText,applyFuel} from './fuel.js';
import {parse,latest,newState,tasks,current,complete,setItem,restore,validateState,automaticTarget,uid} from './core.js';
import {families,resolve,reason,shortLabel,flightLabel,signature,flightFrom,match,DIMENSIONS} from './resolver.js';
import {compose} from './overlay.js';
import {addDemo,removeDemo,hasDemo} from './demo.js';

const BUILD='lab-1';
const FLIGHT_ORDER=['Planning','Pre-Flight','Ground Ops','In-Flight','Post-Flight']; // the order you use them
const DEFAULT_LIBRARY='https://raw.githubusercontent.com/marpa96/Flight-Checklists/flitechek-library/library.flitechek.json';
const KEY='flitechek.state.v1', $=s=>document.querySelector(s), main=$('#main');
let state, page='home', locked=false, confirmAction=null, backupCandidate=null;
let libraryCandidate=null,librarySource='',libraryMessage='',libraryBusy=false,checkedLibraryThisSession=false;
let fuelStep=0,fuelLine=null,fuelError='';
let versionsFor=null, editingAircraft=null, flightDraft=null, detailsOpen=false, undo=null, undoTimer=null;
let lastTouch=Date.now(), dragging=false, scrollTimer, offlineReady=false, persistence=false, wakeLock=null;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,text,cls='',extra='')=>`<button type="button" data-action="${action}" class="${cls}" ${extra}>${text}</button>`;
const active=()=>state?.checklists.find(c=>c.id===state.active), run=()=>state?.runs[state.active];
const flight=()=>state.flight||{};
const aircraftOf=id=>(state.hangar||[]).find(a=>a.id===id);

// ---------- state ----------
function notice(message){$('#error').textContent=message;$('#error').hidden=!message;}
function change(action,redraw=true){
  if(locked){notice('Saved data needs recovery. Export it from the recovery screen before replacing anything.');return false;}
  try{const next=structuredClone(state);action(next);validateState(next);localStorage.setItem(KEY,JSON.stringify(next));state=next;notice('');if(redraw)render();return true;}
  catch(e){notice(`Change not saved. Previous data is intact. ${e.message}`);return false;}
}
function go(where){clearTimeout(scrollTimer);savePosition();page=where;confirmAction=null;detailsOpen=false;lastTouch=Date.now();render();main.scrollTop=0;if(where==='home')checkLibraryInBackground();}

// ---------- versions ----------
const allFamilies=()=>families(state.checklists,checklistGroup);
const familyOf=key=>allFamilies().find(f=>f.key===key);
const familyOfChecklist=c=>allFamilies().find(f=>f.versions.includes(c)||f.versions.some(v=>v.id===c?.id));
const resolveFamily=f=>resolve(f,flight(),state.choices?.[f.key]);
function composeFor(result){
  const base=result.version.checklist;
  const overlays=result.overlays.map(o=>({markdown:latest(o.checklist).markdown,label:shortLabel(o)}));
  return {...compose(latest(base).markdown,overlays),signature:signature(flight(),result.version,result.overlays)};
}
// Is the active run still the right version for today's flight?
function runMismatch(){
  const c=active(),r=run();if(!c||!r||!r.signature)return null;
  const f=familyOfChecklist(c);if(!f)return null;
  const res=resolveFamily(f);
  if(res.status!=='resolved')return r.acknowledged==='unresolved'?null:{now:null,res,sig:'unresolved'};
  const sig=signature(flight(),res.version,res.overlays);
  return sig===r.signature||sig===r.acknowledged?null:{now:res,res,sig};
}
function openFamily(key,{versionId=null,force=false}={}){
  const f=familyOf(key);if(!f)return;
  let res=resolveFamily(f);
  if(versionId){
    const picked=f.versions.find(v=>v.id===versionId);if(!picked)return;
    const m=match(picked.metadata,flight());
    if(m.applies){if(res.status==='ambiguous'||res.version?.checklist.id!==versionId)change(s=>{s.choices??={};s.choices[key]=versionId;},false);res=resolve(f,flight(),versionId);}
    else if(force)res={status:'resolved',version:{checklist:picked,...m},overlays:[],offFlight:true};
    else return;
  }
  if(res.status!=='resolved'){versionsFor=key;go('versions');return;}
  const base=res.version.checklist,composed=composeFor(res);
  savePosition();
  if(!change(s=>{
    const previous=s.checklists.find(c=>c.id===s.active);
    if(base.emergency&&previous&&!previous.emergency)s.returnTo=previous.id;
    if(!base.emergency)s.returnTo=null;
    const existing=s.runs[base.id];
    if(!existing||(existing.signature!==composed.signature&&!Object.keys(existing.states).length)){
      s.runs[base.id]={revision:latest(base).id,markdown:composed.markdown,origins:composed.origins,changes:composed.changes,errors:composed.errors,signature:composed.signature,versionLabel:res.offFlight?'Not for this flight':reason(res.version),forLabel:flightLabel(s.flight||{}),offFlight:!!res.offFlight,states:{},position:null,plainLists:!base.emergency};
    }
    s.active=base.id;
  },false))return;
  page='run';confirmAction=null;detailsOpen=false;render();restorePosition();
}
function restartActive(){
  const c=active();if(!c)return;const f=familyOfChecklist(c);
  if(!change(s=>{delete s.runs[c.id];s.active=null;if(s.returnTo===c.id)s.returnTo=null;},false))return;
  if(f)openFamily(f.key);else go('home');
}

// ---------- rendering ----------
function render(){
  if(!state)return;
  const views={home,flight:flightSetup,hangar,versions,run:runner,emergency,settings,'library-import':libraryImport,fuel:fuelCalculator,history,setup};
  if(page==='run'&&!active())page='home';
  const oldScroll=main.scrollTop;
  main.innerHTML=(views[page]||home)();
  main.dataset.page=page;
  if(page==='run')main.scrollTop=oldScroll;
  renderHeader();renderBottom();updateReturn();updateWakeLock();
}
function statusHTML(res){
  if(res.status==='resolved'){
    const changes=res.overlays.length?` <span class="changes">+ ${res.overlays.map(o=>escape(shortLabel(o))).join(' + ')}</span>`:'';
    return `<span class="ok">✓ ${escape(reason(res.version))}</span>${res.pilotChoice?' <span class="muted">· your choice</span>':''}${changes}`;
  }
  if(res.status==='needs')return `<span class="warn">Set ${escape(res.missing.map(d=>d.label.toLowerCase()).join(' & '))} to choose</span>`;
  if(res.status==='ambiguous')return `<span class="warn">${res.candidates.length} equal versions — choose one</span>`;
  return `<span class="bad">No version for this flight</span>`;
}
function flightCard(){
  const f=state.flight;
  if(!f)return `<button type="button" class="flight-card empty" data-action="flight"><span class="eyebrow">TODAY’S FLIGHT</span><strong>Set up your flight</strong><span>Pick the aircraft once — every checklist then opens to the right version.</span><span class="go">→</span></button>`;
  return `<button type="button" class="flight-card" data-action="flight"><span class="eyebrow">TODAY’S FLIGHT</span><span class="tail">${escape(f.tail||'—')}</span><span class="flight-line">${escape([f.model,f.operator].filter(Boolean).join(' · '))}</span><span class="flight-line">${escape([f.airfield,f.rules,...(f.conditions||[]),...(f.equipment||[])].filter(Boolean).join(' · ')||'No airport or rules set')}</span><span class="go">Change</span></button>`;
}
function home(){
  let html='<div class="home-side">'+flightCard();
  const c=active(),r=run();
  if(c&&r&&!c.emergency){const t=tasks(r),done=t.filter(b=>r.states[b.line]==='done').length;html+=`<button type="button" class="resume-card" data-action="resume"><span class="eyebrow">IN PROGRESS</span><strong>${escape(c.title)}</strong><span>${done} of ${t.length} · ${escape(r.versionLabel||'')}</span><span class="go">Resume →</span></button>`;}
  if(libraryCandidate)html+=`<div class="banner info">A checklist update was downloaded and validated. ${button('library-import','Review update →','outline full')}</div>`;
  html+='</div><div class="home-main">';
  const fams=allFamilies().filter(f=>!f.emergency);
  const groups=[...new Set([...FLIGHT_ORDER,...GROUPS,...(state.libraryFolders||[]).map(g=>g.replace(/^\d+\.\s+/,'')),...fams.map(f=>f.group)])].filter(g=>g!=='Emergency');
  for(const g of groups){
    const list=fams.filter(f=>f.group===g);if(!list.length)continue;
    html+=`<section class="phase"><h2>${escape(g)}</h2>`;
    for(const f of list){
      const res=resolveFamily(f),running=f.versions.some(v=>state.runs[v.id]);
      html+=`<button type="button" class="procedure ${res.status}" data-action="open-family" data-key="${escape(f.key)}"><span class="copy"><strong>${escape(f.title)}${running?' <span class="dot" aria-label="in progress"></span>':''}</strong><small>${statusHTML(res)}</small></span><span class="chevron" aria-hidden="true">›</span></button>`;
    }
    html+='</section>';
  }
  if(!fams.length)html+='<p class="help">No checklists installed. Open Settings → Import / update checklists.</p>';
  html+=`<div class="home-foot">${button('update-checklists',libraryBusy?'Updating…':'Update checklists from GitHub','outline full',libraryBusy?'disabled':'')}</div></div>`;
  return html;
}
function flightSetup(){
  const hangar=state.hangar||[];
  flightDraft??={aircraftId:state.flight?.aircraftId??hangar[0]?.id??null,rules:state.flight?.rules??state.lastChoices?.rules??null,airfield:state.flight?.airfield??state.lastChoices?.airfield??'',conditions:state.flight?.conditions??[]};
  const d=flightDraft;
  let html=`<h1>Today’s flight</h1><p class="subtitle">Set this once. Every checklist resolves to the version for this aircraft, school, airport and conditions.</p>`;
  html+=`<h2 class="step">1 · Aircraft</h2>`;
  if(!hangar.length)html+=`<div class="card"><p>Your hangar is empty. Add the aircraft you fly — tail number, type, school and equipment — once.</p>${button('hangar','Add an aircraft','primary full')}${button('demo-add','Try it with demo aircraft','outline full')}</div>`;
  else html+=`<div class="choice-grid">${hangar.map(a=>button('pick-aircraft',`<span class="tail">${escape(a.tail)}</span><span>${escape([a.model,a.operator].filter(Boolean).join(' · '))}</span>${a.equipment?.length?`<span class="muted">${escape(a.equipment.join(' · '))}</span>`:''}`,`choice ${d.aircraftId===a.id?'selected':''}`,`data-id="${escape(a.id)}" aria-pressed="${d.aircraftId===a.id}"`)).join('')}${button('hangar','＋ Hangar','choice add')}</div>`;
  html+=`<h2 class="step">2 · Flight rules</h2><div class="segmented big">${['VFR','IFR'].map(v=>button('pick-rules',v,d.rules===v?'selected':'',`data-value="${v}" aria-pressed="${d.rules===v}"`)).join('')}</div>`;
  const airfields=[...new Set([...state.checklists.flatMap(c=>c.metadata?.airfields||[]),...(state.recentAirfields||[])].filter(v=>v&&!v.includes('*')))];
  html+=`<h2 class="step">3 · Airport <span class="muted">(optional)</span></h2><input id="flight-airfield" value="${escape(d.airfield||'')}" placeholder="e.g. KSEE" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" list="airfields" enterkeyhint="done"><datalist id="airfields">${airfields.map(a=>`<option value="${escape(a)}"></option>`).join('')}</datalist>`;
  const conditions=[...new Set(['NIGHT',...state.checklists.flatMap(c=>c.metadata?.conditions||[]).map(v=>v.toUpperCase())])];
  html+=`<h2 class="step">4 · Conditions <span class="muted">(optional)</span></h2><div class="chips">${conditions.map(v=>button('toggle-condition',escape(v[0]+v.slice(1).toLowerCase()),d.conditions.includes(v)?'chip selected':'chip',`data-value="${escape(v)}" aria-pressed="${d.conditions.includes(v)}"`)).join('')}</div>`;
  const ready=!!d.aircraftId;
  const hasProgress=Object.keys(state.runs).length>0;
  html+=`<div class="sticky-actions">`;
  if(confirmAction==='new-flight')html+=`<div class="banner warn"><strong>Start a new flight?</strong> All checklist progress is cleared. Checklists stay installed.<div class="row">${button('start-flight','Clear & start','danger')}${button('cancel','Cancel','outline')}</div></div>`;
  else html+=button(hasProgress?'confirm-new-flight':'start-flight','Start new flight','primary full',ready?'':'disabled');
  if(state.flight&&confirmAction!=='new-flight')html+=button('update-flight','Update flight, keep progress','outline full',ready?'':'disabled');
  html+=`</div>`;
  return html;
}
function hangar(){
  const list=state.hangar||[];
  let html=`<button type="button" class="back" data-action="flight">← Today’s flight</button><h1>Hangar</h1><p class="subtitle">Each aircraft knows its type, school and equipment, so picking a tail is all it takes.</p>`;
  if(editingAircraft){
    const a=editingAircraft==='new'?{tail:'',model:'',operator:'',equipment:[]}:aircraftOf(editingAircraft)||{};
    const models=[...new Set(state.checklists.flatMap(c=>c.metadata?.aircraft_models||[]).filter(v=>!v.includes('*')))];
    const operators=[...new Set([...state.checklists.flatMap(c=>c.metadata?.operators||[]),...list.map(x=>x.operator)].filter(Boolean))];
    html+=`<div class="card form"><label for="a-tail">Tail number</label><input id="a-tail" value="${escape(a.tail)}" placeholder="N12345" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off"><label for="a-model">Aircraft type</label><input id="a-model" value="${escape(a.model)}" placeholder="C172S" list="models" autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off"><datalist id="models">${models.map(m=>`<option value="${escape(m)}"></option>`).join('')}</datalist><label for="a-operator">School / club / operator <span class="muted">(optional)</span></label><input id="a-operator" value="${escape(a.operator)}" placeholder="e.g. Blue Sky Aviation" list="operators" autocomplete="off"><datalist id="operators">${operators.map(m=>`<option value="${escape(m)}"></option>`).join('')}</datalist><label for="a-equipment">Equipment <span class="muted">(optional, comma separated)</span></label><input id="a-equipment" value="${escape((a.equipment||[]).join(', '))}" placeholder="e.g. G1000, Autopilot" autocorrect="off" autocomplete="off"><div class="row">${button('save-aircraft','Save aircraft','primary')}${button('cancel-aircraft','Cancel','outline')}</div>${editingAircraft!=='new'?(confirmAction==='delete-aircraft'?`<div class="banner warn">Delete ${escape(a.tail)} from the hangar? ${button('do-delete-aircraft','Delete','danger')}</div>`:button('delete-aircraft','Delete aircraft…','quiet danger-text')):''}</div>`;
  }else{
    html+=list.map(a=>button('edit-aircraft',`<span class="tail">${escape(a.tail)}</span><span>${escape([a.model,a.operator].filter(Boolean).join(' · '))}${a.demo?' · DEMO':''}</span>${a.equipment?.length?`<span class="muted">${escape(a.equipment.join(' · '))}</span>`:''}<span class="go">Edit</span>`,'aircraft-row',`data-id="${escape(a.id)}"`)).join('')||'<p class="help">No aircraft yet.</p>';
    html+=button('new-aircraft','＋ Add aircraft','primary full');
    html+=hasDemo(state)?button('demo-remove','Remove demo data','outline full'):button('demo-add','Add demo aircraft & changes','outline full');
  }
  return html;
}
function describe(metadata){
  const parts=DIMENSIONS.map(d=>{const v=metadata?.[d.key];return Array.isArray(v)&&v.length&&!v.every(x=>x==='*')?v.join('/'):null;}).filter(Boolean);
  return parts.join(' · ')||'Generic — any aircraft';
}
function whyNot(m){
  return [...m.conflicts.map(c=>`For ${c.values.join('/')} — this flight: ${Array.isArray(c.have)?c.have.join(', ')||'none':c.have}`),...m.missing.map(d=>`Needs ${d.label.toLowerCase()} set`)].join(' · ');
}
function versions(){
  const f=familyOf(versionsFor);if(!f){page='home';return home();}
  const res=resolveFamily(f);
  let html=`<button type="button" class="back" data-action="home">← Checklists</button><h1>${escape(f.title)}</h1><p class="subtitle">${escape(flightLabel(flight())||'No flight set')}</p>`;
  if(res.status==='needs')html+=`<div class="banner warn"><strong>Not enough flight info to choose.</strong> Set ${escape(res.missing.map(d=>d.label.toLowerCase()).join(' and '))} and FliteChek picks the version automatically.${button('flight','Set up the flight →','primary full')}</div>`;
  if(res.status==='ambiguous')html+=`<div class="banner warn"><strong>${res.candidates.length} versions fit this flight equally.</strong> Choose the one to use. FliteChek remembers it until the next new flight. To remove the ambiguity, make one version more specific in the catalog.</div>`;
  if(res.status==='none')html+=`<div class="banner bad"><strong>No version of this checklist is for this flight.</strong> ${escape(flightLabel(flight())||'')}</div>`;
  for(const v of f.versions){
    const m=match(v.metadata,flight()),isPick=res.version?.checklist.id===v.id;
    html+=`<div class="card version ${m.applies?'fits':'nofit'}"><div class="row between"><strong>${escape(describe(v.metadata))}</strong>${isPick?'<span class="chip">In use</span>':''}</div><p class="help">${escape(v.sourceName||v.variant||'')}</p><p class="${m.applies?'ok':'bad'}">${m.applies?'✓ Fits this flight':'✕ '+escape(whyNot(m))}</p>`;
    if(m.applies)html+=button('open-version','Use this version','primary full',`data-id="${escape(v.id)}" data-key="${escape(f.key)}"`);
    else html+=confirmAction==='force:'+v.id?`<div class="banner bad">This version is <strong>not for this flight</strong>. Open it anyway?<div class="row">${button('force-version','Open anyway','danger',`data-id="${escape(v.id)}" data-key="${escape(f.key)}"`)}${button('cancel','Cancel','outline')}</div></div>`:button('ask-force','Open anyway…','quiet',`data-id="${escape(v.id)}"`);
    html+='</div>';
  }
  if(f.overlays.length){html+=`<h2>Changes files</h2><p class="help">Layered onto the base version when they match the flight.</p>`;for(const o of f.overlays){const m=match(o.metadata,flight());html+=`<div class="card version ${m.applies?'fits':'nofit'}"><strong>${escape(o.title)}</strong><p class="help">${escape(describe(o.metadata))}</p><p class="${m.applies?'ok':'muted'}">${m.applies?'✓ Applied for this flight':'Not applied — '+escape(whyNot(m))}</p></div>`;}}
  return html;
}

// ---------- the run ----------
function headingHTML(b){
  const level=Math.min(6,Math.max(2,b.level));
  return `<h${level} data-line="${b.line}" id="line-${b.line}" class="source-heading level-${b.level}">${renderInline(/checklist complete/i.test(b.text)?'Completion':b.text)}</h${level}>`;
}
function blockHTML(b,r,memory){
  const origin=r.origins?.[b.line];
  const tag=origin?`<span class="origin" title="Added by changes for ${escape(origin)}">${escape(origin)}</span>`:'';
  if(b.kind==='task'){
    const status=r.states[b.line],now=current(r)===b.line;
    const calculator=b.text.includes(FUEL_LINK);
    const text=fuelText(b.text.replace(FUEL_LINK,'Calculate fuel endurance'),r.calculators?.fuel);
    return `<div class="task ${status==='done'?'done':''} ${status==='pending'?'pending':''} ${now?'current':''} ${memory?'memory':''} ${origin?'added':''}" id="line-${b.line}" data-line="${b.line}" style="--depth:${Math.min(b.depth,8)}"><button type="button" class="check" data-action="check" data-line="${b.line}" aria-pressed="${status==='done'}"><span class="box" aria-hidden="true">${status==='done'?'✓':status==='pending'?'◷':''}</span><span class="item-copy">${now&&b.sectionPath.length?`<span class="item-context">${escape(b.sectionPath.join(' › '))}</span>`:''}${tag}${renderInline(text,{links:false})}</span></button><button type="button" class="pending-button" data-action="pending" data-line="${b.line}" aria-label="${status==='pending'?'Return item to checklist':'Do later'}">${status==='pending'?'↩':'◷'}</button>${webLinks(text).map(link=>`<a class="external-link task-reference" data-web-link href="${escape(link.url)}" target="_blank" rel="noopener noreferrer">${escape(link.label)} ↗</a>`).join('')}${calculator?button('fuel-open',r.calculators?.fuel?'Recalculate fuel endurance →':'Calculate fuel endurance →','outline full calculator-link',`data-line="${b.line}"`):''}</div>`;
  }
  if(b.kind==='heading')return headingHTML(b);
  if(b.callout)return `<aside data-line="${b.line}" id="line-${b.line}" class="note callout ${b.callout} ${origin?'added':''}"><strong class="callout-label">${['caution','warning'].includes(b.callout)?'⚠':'ⓘ'} ${b.callout.toUpperCase()}</strong>${tag}<div>${renderInline(b.body)}</div></aside>`;
  if(b.kind==='note')return `<aside data-line="${b.line}" id="line-${b.line}" class="note ${origin?'added':''}">${tag}${renderInline(b.text)}</aside>`;
  if(b.kind==='table'){
    const rows=b.text.split('\n').filter(l=>!/^\s*\|[\s:|\-]+\|?\s*$/.test(l));
    return `<div data-line="${b.line}" id="line-${b.line}" class="table-wrap"><table>${rows.map((l,i)=>`<tr>${l.trim().replace(/^\||\|$/g,'').split('|').map(c=>`<${i?'td':'th'}>${renderInline(c.trim())}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</table></div>`;
  }
  if(b.kind==='code')return `<pre data-line="${b.line}" id="line-${b.line}">${escape(b.text)}</pre>`;
  return `<div data-line="${b.line}" id="line-${b.line}" class="source-text">${renderInline(b.text)}</div>`;
}
function runner(){
  const c=active(),r=run();
  let html='';
  const mismatch=runMismatch();
  if(r.offFlight)html+=`<div class="banner bad"><strong>Not the version for this flight.</strong> You opened it anyway.${button('versions-active','Choose the right version','outline full')}</div>`;
  else if(mismatch)html+=`<div class="banner bad"><strong>Today’s flight changed since you started this.</strong> Started for: ${escape(r.forLabel||'—')}. Now: ${escape(flightLabel(flight())||'—')}. ${mismatch.now?button('restart-run','Restart with the right version','danger full'):button('versions-active','See versions','outline full')}${button('keep-version','Keep using this one','quiet full')}</div>`;
  if(r.errors?.length)html+=`<div class="banner bad"><strong>${r.errors.length} change${r.errors.length===1?'':'s'} could not be applied.</strong> These items are missing from this run:<ul>${r.errors.map(e=>`<li>${escape(e)}</li>`).join('')}</ul></div>`;
  if(r.revision!==latest(c).id&&!mismatch)html+=`<div class="banner info">A newer version of this checklist is installed. You’re still using the one you started.${button('restart-run','Restart with the newer version','outline full')}</div>`;
  if(c.emergency&&state.returnTo)html+=button('return-normal','↩ Back to '+escape(state.checklists.find(x=>x.id===state.returnTo)?.title||'previous checklist'),'outline full');
  if(detailsOpen){
    html+=`<div class="card details"><h3>Why this version</h3><p><strong>${escape(r.versionLabel||'')}</strong></p><p class="help">Resolved for ${escape(r.forLabel||'no flight set')}.<br>${escape(c.sourceName||'')}</p>`;
    if(r.changes?.length)html+=`<h3>Changes layered on</h3><ul class="help">${r.changes.map(ch=>`<li><strong>${escape(ch.label)}</strong>: ${escape(ch.kind)} “${escape(ch.target)}”</li>`).join('')}</ul>`;
    html+=`<div class="stack">${button('versions-active','Other versions','outline full')}${button('history','Revision history','outline full')}${button('export','Export Markdown','outline full')}${confirmAction==='restart'?`<div class="banner warn">Restart this checklist? Progress is cleared.<div class="row">${button('restart-run','Restart','danger')}${button('cancel','Cancel','outline')}</div></div>`:button('restart','Restart checklist…','quiet')}</div></div>`;
  }
  const blocks=parse(r.markdown,{plainLists:r.plainLists!==false});
  let memoryLevel=null;
  for(const b of blocks){
    if(b.kind==='heading'){memoryLevel=/memory items|immediate action/i.test(b.text)?b.level:(memoryLevel!==null&&b.level>memoryLevel?memoryLevel:null);}
    if(b.kind==='heading'&&b.level===1&&b.text.trim()===c.title)continue;
    html+=blockHTML(b,r,memoryLevel!==null&&b.kind==='task');
  }
  const t=tasks(r);
  if(complete(r)){
    const next=nextFamily();
    html+=`<div class="card completion"><span class="success">✓</span><h2>All items checked.</h2><p class="help">Review any notes or conditional text before continuing.</p>${next?button('open-family',`Next: ${escape(next.title)} →`,'primary full',`data-key="${escape(next.key)}"`):button('home','Back to checklists','primary full')}</div>`;
  }else if(!t.length)html+='<div class="card"><h3>No items to check.</h3><p class="help">This document has no list items.</p></div>';
  return html;
}
function nextFamily(){
  const c=active();if(!c||c.emergency)return null;
  const fams=allFamilies().filter(f=>!f.emergency),i=fams.findIndex(f=>f.versions.some(v=>v.id===c.id));
  return fams.slice(i+1).find(f=>resolveFamily(f).status==='resolved')||null;
}
function emergency(){
  let html=`<h1 class="emergency-title">Emergency</h1><p class="subtitle">${escape(flightLabel(flight())||'No flight set — showing generic versions')}</p><input id="symptom" type="search" placeholder="Find by symptom…" autocomplete="off" enterkeyhint="search" aria-label="Find emergency procedure by symptom">`;
  const fams=allFamilies().filter(f=>f.emergency);
  html+='<div class="emergency-grid" id="emergency-grid">';
  for(const f of fams){
    const res=resolveFamily(f);
    const words=[f.title,...f.versions.map(v=>v.metadata?.description||'')].join(' ');
    html+=`<button type="button" class="emergency-button ${res.status}" data-action="open-family" data-key="${escape(f.key)}" data-search="${escape(words)}"><strong>${escape(f.title)}</strong><small>${statusHTML(res)}</small></button>`;
  }
  html+='</div><p id="no-results" class="help" hidden>No matching procedure. Clear the search to see all.</p>';
  if(!fams.length)html+='<p class="help">No emergency procedures installed.</p>';
  return html;
}
function settings(){
  const t=window.fliteTheme;
  return `<h1>Settings</h1><div class="card"><h3>Display</h3><div class="segmented">${[['auto','Auto'],['day','Day'],['night','Night'],['sun','Sun']].map(([v,l])=>button('set-theme',l,t.preference===v?'selected':'',`data-value="${v}" aria-pressed="${t.preference===v}"`)).join('')}</div><p class="help">Auto: Day 06:00–18:00, Night otherwise. Night is red on black to protect night vision. Sun is maximum contrast for direct sunlight.</p><h3>Text size</h3><div class="segmented">${[['m','Standard'],['l','Large'],['xl','Extra large']].map(([v,l])=>button('set-size',l,t.size===v?'selected':'',`data-value="${v}" aria-pressed="${t.size===v}"`)).join('')}</div></div>
  <div class="card stack"><h3>Aircraft & flight</h3>${button('hangar','Hangar','outline full')}${button('flight','Today’s flight','outline full')}</div>
  <div class="card stack"><h3>Checklists</h3>${button('library-import','Import / update checklists','outline full')}${button('setup','Offline, app updates & backup','outline full')}</div>
  <p class="help">FliteChek Lab · Build ${BUILD} · experimental rethink branch</p>`;
}

// ---------- header & action bar ----------
const THEME_ICON={day:'☀',night:'☾',sun:'◉'};
function renderHeader(){
  const header=$('#header'),c=active();
  const theme=document.documentElement.dataset.theme;
  const cycle=button('cycle-theme',THEME_ICON[theme]||'☀','icon-button',`aria-label="Display: ${theme}. Tap to change." title="Display mode"`);
  header.classList.toggle('running',page==='run'&&!!c);
  if(page!=='run'||!c){
    const f=state.flight;
    header.innerHTML=`<div class="brand-row"><span class="brand-icon" aria-hidden="true">✓</span><strong>FliteChek</strong><span class="lab-tag">LAB</span><span class="spacer"></span>${f?button('flight',escape(f.tail||'Flight'),'flight-chip','aria-label="Today’s flight"'):''}${cycle}</div>`;return;
  }
  const r=run(),t=tasks(r),done=t.filter(b=>r.states[b.line]==='done').length,pending=t.filter(b=>r.states[b.line]==='pending').length;
  const mismatch=runMismatch()||r.offFlight;
  header.innerHTML=`<div class="run-title-row"><h1>${escape(c.title)}</h1>${cycle}${button('details',detailsOpen?'✕':'•••','icon-button',`aria-label="${detailsOpen?'Close details':'Version details and options'}" aria-expanded="${detailsOpen}"`)}</div><button type="button" class="for-strip ${mismatch?'bad':''} ${c.emergency?'emergency':''}" data-action="details"><span class="for-label">FOR</span><span class="for-value">${escape(r.forLabel||'No flight set')}</span><span class="for-version">${escape(r.versionLabel||'')}${r.changes?.length?` · +${r.changes.length} changes`:''}</span></button><div class="progress" role="progressbar" aria-label="Checklist progress" aria-valuemin="0" aria-valuemax="${t.length||1}" aria-valuenow="${done}"><div style="width:${t.length?done/t.length*100:0}%"></div></div><div class="stat">${done} of ${t.length} checked${pending?` · ${pending} for later`:''}</div>`;
}
function renderBottom(){
  const nav=$('#bottom'),c=active();
  if(page==='run'&&c&&run()){
    const r=run(),line=current(r),finished=complete(r),wrong=!!runMismatch()||r.offFlight;
    const emergencyButton=c.emergency?'':button('emergency','<span aria-hidden="true">△</span><span>EMER</span>','nav-emergency','aria-label="Emergency procedures"');
    nav.innerHTML=`${button('home','<span aria-hidden="true">☰</span><span>List</span>','nav-small','aria-label="Checklists"')}${button('pending-current','<span aria-hidden="true">◷</span><span>Later</span>','nav-small',line===null||finished||r.states[line]==='pending'?'disabled aria-label="Do current item later"':'aria-label="Do current item later"')}${wrong?button('show-mismatch','<span aria-hidden="true">⚠</span><span>CHECK VERSION</span>','nav-check wrong'):finished?button('home','Done ✓','nav-check'):button('check-current','<span aria-hidden="true">✓</span><span>CHECK</span>','nav-check',line===null?'disabled':'aria-label="Check current item"')}${emergencyButton}`;
    nav.classList.add('run-bar');nav.classList.toggle('emergency-run',c.emergency);return;
  }
  nav.classList.remove('run-bar','emergency-run');
  const item=(action,icon,label,cls='')=>button(action,`<span aria-hidden="true">${icon}</span><span>${label}</span>`,cls,`aria-current="${page===action?'page':'false'}"`);
  nav.innerHTML=item('home','☰','Checklists')+(active()&&!active().emergency?item('resume','↩','Resume'):item('flight','✈','Flight'))+item('settings','⚙','Settings')+button('emergency','<span aria-hidden="true">△</span><span>EMERGENCY</span>','nav-emergency',`aria-current="${page==='emergency'?'page':'false'}"`);
}
function updateReturn(){
  const bar=$('#return-bar');
  const showUndo=page==='run'&&undo&&undo.id===state.active;
  bar.hidden=page!=='run'||!run()||(current(run())===null&&!showUndo);
  if(bar.hidden)return;
  const r=run(),pending=tasks(r).find(t=>r.states[t.line]==='pending');
  bar.innerHTML=`<div class="row between">${current(r)!==null?button('current','↑ Current item','','id="current-button"'):'<span></span>'}${pending?button('jump-pending','◷ Later item','','data-line="'+pending.line+'"'):''}${showUndo?button('undo','↶ Undo','undo-button'):''}</div>`;
}

// ---------- check / undo ----------
function setTask(line,action){
  const r=run(),prev=r.states[line];
  if(!change(s=>setItem(s.runs[s.active],line,action)))return;
  undo={id:state.active,line,prev};clearTimeout(undoTimer);undoTimer=setTimeout(()=>{undo=null;updateReturn();},8000);
  if(action==='done'&&run().states[line]==='done'){const row=document.getElementById(`line-${line}`);row?.classList.add('just-checked');}
  if(!active().emergency&&current(run())!==null)jump(automaticTarget(run()));
  else if(complete(run()))main.scrollTo({top:main.scrollHeight,behavior:'instant'});
  updateReturn();
}

// ---------- screen wake lock (runs only) ----------
async function updateWakeLock(){
  try{
    const want=page==='run'&&!document.hidden&&'wakeLock' in navigator;
    if(want&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}
    else if(!want&&wakeLock){await wakeLock.release();wakeLock=null;}
  }catch{wakeLock=null;}
}

// ---------- carried over from FliteChek: fuel, library, history, setup ----------
function fuelDraft(){return run().fuelDraft??{fuel:'',burn:'',unit:'US gal'};}
function fuelCalculator(){
 const d=fuelDraft(),field=fuelStep===0?'fuel':'burn',unit=d.unit==='L'?'L':'US gal';
 let result='';
 if(fuelStep===2){
  try{const value=fuelEndurance(d.fuel,d.burn);result=`<div class="fuel-result"><span>Estimated endurance</span><strong>${duration(value.minutes)}</strong><p>${value.fuel} ${unit} ÷ ${value.burn} ${unit}/hr</p></div><p class="help">Constant burn, no reserve deducted. Rounded down to whole minutes. This is a mock calculation, not a diversion recommendation.</p>${button('fuel-apply','Use in checklist →','primary full fuel-next')}${button('fuel-edit','Edit values','outline full')}`;}catch(e){fuelError=e.message;fuelStep=1;return fuelCalculator();}
 }else{
  result=`<p class="stat">${fuelStep+1} of 2 · ${fuelStep===0?'Usable fuel':'Fuel burn'}</p>${fuelStep===0?`<label for="fuel-unit">Fuel units</label><select id="fuel-unit"><option ${unit==='US gal'?'selected':''}>US gal</option><option ${unit==='L'?'selected':''}>L</option></select>`:`<p class="help">Usable fuel: ${escape(d.fuel)} ${unit}</p>`}<label for="fuel-number">${fuelStep===0?'Usable fuel remaining':'Fuel burn per hour'} (${unit}${fuelStep===1?'/hr':''})</label><input id="fuel-number" class="fuel-number" type="text" inputmode="none" readonly value="${escape(d[field])}" placeholder="0" aria-describedby="fuel-error"><p id="fuel-error" class="fuel-error" role="status">${escape(fuelError)}</p><div class="fuel-keypad">${['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(key=>button('fuel-key',key,'',`data-key="${key}" aria-label="${key==='⌫'?'Delete last digit':key==='.'?'Decimal point':key}"`)).join('')}</div>${button('fuel-next',fuelStep===0?'Next: fuel burn →':'Calculate & return →','primary full fuel-next')}${fuelStep===1?button('fuel-edit','← Back to fuel amount','outline full'):''}`;
 }
 return `<section class="fuel-calculator"><div class="eyebrow">MOCK TEST · FUEL ENDURANCE</div><h1>${fuelStep===2?'Review result':'Enter '+(fuelStep===0?'usable fuel':'fuel burn')}</h1>${result}${button('fuel-back','Return without applying','quiet full')}</section>`;
}
function fuelReturn(){page='run';render();jump(fuelLine??current(run()),false);}
function libraryImport(){
 let html=`<button type="button" class="back" data-action="settings">← Settings</button><h1>Checklist library</h1><p class="help">Author in Flight-Checklists on your computer and push to GitHub. Hidden IDs connect Markdown to the YAML catalog.</p><div class="card stack">${button('library-file','Import ZIP or library file','primary full',libraryBusy?'disabled':'')}<label for="library-source">Update source (optional)</label><input id="library-source" type="url" value="${escape(librarySource)}" placeholder="Raw GitHub library.flitechek.json URL" autocapitalize="none" autocorrect="off" spellcheck="false">${button('library-download',libraryBusy?'Downloading…':'Check for library updates','outline full',libraryBusy?'disabled':'')}</div><p role="status">${escape(libraryMessage)}</p>`;
 if(libraryCandidate){
  const count=libraryCandidate.filter(c=>c.status!=='Unchanged').length;
  html+=`<h2>Review ${libraryCandidate.length} checklists</h2><p class="help">${count} new or changed. Existing checklists omitted from this package are retained. No current run is restarted.</p>`;
  for(const c of libraryCandidate){const m=c.metadata;html+=`<div class="card"><span class="chip">${escape(c.status==='Rename'?'File location changed':c.status)}</span><h3>${escape(c.title)}</h3><p class="help">ID ${c.catalogId} · Revision ${m.revision} · ${escape(m.category)}${m.extends?` · changes for ${escape(m.extends)}`:''}<br>${escape(c.sourceName)}</p><p>${escape(describe(m))}</p>${m.description?`<p class="help">${escape(m.description)}</p>`:''}</div>`;}
  html+=button('library-install',`Install ${count} changes`,'primary full',count?'':'disabled');
 }
 return html;
}
async function readLimited(response){
 const reader=response.body.getReader(),parts=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000){await reader.cancel();throw Error('Package exceeds 8 MB.');}parts.push(value);}
 const data=new Uint8Array(size);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}return data;
}
async function downloadLibrary(){
 if(libraryBusy)return;
 const input=$('#library-source').value.trim()||DEFAULT_LIBRARY;libraryCandidate=null;libraryMessage='';librarySource=input;libraryBusy=true;render();
 try{
  const url=new URL(input||DEFAULT_LIBRARY,location.href);
  if(url.origin!==location.origin&&(url.protocol!=='https:'||url.username||url.password))throw Error('Use an HTTPS package URL without credentials.');
  if(url.hostname==='github.com')throw Error('Use the Raw URL of library.flitechek.json, or import a downloaded ZIP.');
  url.searchParams.set('flitechek-update',Date.now());
  const response=await fetch(url,{cache:'no-store',credentials:url.origin===location.origin?'same-origin':'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(response.status===404?'The GitHub library has not been published yet.':'Download failed ('+response.status+'). Previous library is intact.');
  libraryCandidate=planImport(state,readPackage(await readLimited(response)));libraryMessage='Download validated. Review before installing.';
 }catch(error){libraryMessage='Not installed: '+error.message;}
 libraryBusy=false;if(page==='library-import')render();
}
async function checkLibraryInBackground(){
 if(checkedLibraryThisSession||libraryBusy||!navigator.onLine)return;
 checkedLibraryThisSession=true;
 try{
  const url=new URL(state.librarySource||DEFAULT_LIBRARY);url.searchParams.set('flitechek-update',Date.now());
  const response=await fetch(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
  if(!response.ok)return;
  const candidate=planImport(state,readPackage(await readLimited(response)));
  if(page==='home'&&!libraryBusy&&candidate.some(c=>c.status!=='Unchanged')){libraryCandidate=candidate;libraryMessage='GitHub update downloaded and validated. Review before installing.';render();}
 }catch{/* Network or validation failure never disturbs the installed library. */}
}
function history(){
  const c=active();if(!c)return '<p>Open a checklist first.</p>';
  return `<button type="button" class="back" data-action="resume">← Back to checklist</button><h1>Revision history</h1><p class="subtitle">${escape(c.title)} · ${escape(describe(c.metadata))}</p><p class="help">Restore creates a new revision. Restart the checklist to use it.</p>${c.revisions.map((r,i)=>({r,i})).reverse().map(({r,i})=>`<details><summary>Revision ${i+1} · ${escape(new Date(r.date).toLocaleString())}</summary><pre>${escape(r.markdown)}</pre>${r.id!==latest(c).id?button('restore','Restore as new revision','primary',`data-id="${escape(r.id)}"`):'<span class="chip">Current saved version</span>'}</details>`).join('')}`;
}
function setup(){return `<button type="button" class="back" data-action="settings">← Settings</button><h1>Offline & backup</h1><div class="card"><h3>This device</h3><p class="help" id="app-build">FliteChek Lab · Build ${BUILD}</p><p id="offline-status">${offlineReady?'✓ App files are saved for offline use.':'App files have not been verified offline yet.'}</p><p id="persistent-status" class="help">${persistence?'Persistent storage granted.':'Persistent storage has not been granted. Keep a backup of your changes.'}</p>${button('offline-check','Check offline readiness','outline full')}${button('app-update','Update app & checklists','outline full')}</div><div class="card stack"><h3>Your files stay yours.</h3>${button('backup','Download full backup','primary')}${button('import-backup','Restore from backup…','outline')}${backupCandidate?`<div class="banner warn"><strong>Replace this device’s data?</strong> The backup contains ${backupCandidate.checklists.length} checklists. Download a backup of your current data first.<div class="row">${button('restore-backup','Replace','danger')}${button('cancel','Cancel','outline')}</div></div>`:''}<p class="help">A full backup includes your hangar, flight, revisions and progress.</p></div>`;}

// ---------- scrolling ----------
function jump(line,smooth=true){
  const el=document.getElementById(`line-${line}`);if(!el)return;
  // Leave a sliver of the previous item visible, so you can see what you just checked.
  main.scrollTo({top:main.scrollTop+el.getBoundingClientRect().top-main.getBoundingClientRect().top-56,behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});lastTouch=Date.now();
}
function restorePosition(){requestAnimationFrame(()=>{if(page!=='run'||!run())return;if(runMismatch()||run().offFlight){main.scrollTop=0;return;}jump(run().position??automaticTarget(run()),false);});}
function savePosition(){
  if(page!=='run'||!run()||locked)return;
  const top=main.getBoundingClientRect().top;
  const row=[...main.querySelectorAll('[data-line][id]')].find(el=>el.getBoundingClientRect().bottom>top+8);
  if(row&&run().position!==Number(row.dataset.line))change(s=>{s.runs[s.active].position=Number(row.dataset.line);},false);
}
function download(name,text,type='text/plain'){
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}

// ---------- events ----------
document.addEventListener('click',async e=>{
  const link=e.target.closest('a[data-web-link]');if(link){e.stopPropagation();if(!navigator.onLine){e.preventDefault();notice('This link needs internet. Your checklist is still available offline.');}else savePosition();return;}
  const b=e.target.closest('[data-action]');if(!b||b.disabled||!state)return;
  const action=b.dataset.action;lastTouch=Date.now();
  switch(action){
    case 'home':case 'settings':case 'hangar':case 'setup':case 'history':return go(action);
    case 'emergency':return go('emergency');
    case 'flight':flightDraft=null;editingAircraft=null;return go('flight');
    case 'resume':go('run');restorePosition();return;
    case 'open-family':return openFamily(b.dataset.key);
    case 'open-version':return openFamily(b.dataset.key,{versionId:b.dataset.id});
    case 'ask-force':confirmAction='force:'+b.dataset.id;return render();
    case 'force-version':return openFamily(b.dataset.key,{versionId:b.dataset.id,force:true});
    case 'versions-active':{const f=familyOfChecklist(active());if(f){versionsFor=f.key;go('versions');}return;}
    case 'details':detailsOpen=!detailsOpen;confirmAction=null;render();if(detailsOpen)main.scrollTop=0;return;
    case 'restart':confirmAction='restart';return render();
    case 'restart-run':return restartActive();
    case 'show-mismatch':main.scrollTo({top:0,behavior:'instant'});return;
    case 'keep-version':{const m=runMismatch();if(m)change(s=>{s.runs[s.active].acknowledged=m.sig;});return;}
    case 'cycle-theme':{const order=['day','night','sun'],cur=document.documentElement.dataset.theme;window.fliteTheme.set(order[(order.indexOf(cur)+1)%order.length]);renderHeader();if(page==='settings')render();return;}
    case 'set-theme':window.fliteTheme.set(b.dataset.value);return render();
    case 'set-size':window.fliteTheme.setSize(b.dataset.value);return render();
    // flight setup
    case 'pick-aircraft':flightDraft.aircraftId=b.dataset.id;return render();
    case 'pick-rules':flightDraft.rules=flightDraft.rules===b.dataset.value?null:b.dataset.value;return render();
    case 'toggle-condition':{const v=b.dataset.value,list=flightDraft.conditions;flightDraft.conditions=list.includes(v)?list.filter(x=>x!==v):[...list,v];return render();}
    case 'confirm-new-flight':confirmAction='new-flight';render();main.scrollTop=main.scrollHeight;return;
    case 'start-flight':case 'update-flight':{
      const a=aircraftOf(flightDraft.aircraftId);if(!a)return;
      const airfield=($('#flight-airfield')?.value||'').trim().toUpperCase();
      const f={...flightFrom(a,{...flightDraft,airfield}),startedAt:action==='start-flight'?new Date().toISOString():state.flight?.startedAt??new Date().toISOString()};
      if(change(s=>{
        s.flight=f;s.lastChoices={rules:f.rules,airfield:f.airfield};
        if(airfield)s.recentAirfields=[airfield,...(s.recentAirfields||[]).filter(x=>x!==airfield)].slice(0,8);
        if(action==='start-flight'){s.runs={};s.active=null;s.returnTo=null;s.choices={};}
      },false)){flightDraft=null;go('home');}
      return;
    }
    // hangar
    case 'new-aircraft':editingAircraft='new';confirmAction=null;return render();
    case 'edit-aircraft':editingAircraft=b.dataset.id;confirmAction=null;return render();
    case 'cancel-aircraft':editingAircraft=null;confirmAction=null;return render();
    case 'delete-aircraft':confirmAction='delete-aircraft';return render();
    case 'do-delete-aircraft':{const id=editingAircraft;if(change(s=>{s.hangar=s.hangar.filter(a=>a.id!==id);if(s.flight?.aircraftId===id)s.flight=null;},false)){editingAircraft=null;confirmAction=null;render();}return;}
    case 'save-aircraft':{
      const tail=$('#a-tail').value.trim().toUpperCase(),model=$('#a-model').value.trim().toUpperCase(),operator=$('#a-operator').value.trim(),equipment=$('#a-equipment').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
      if(!tail||!model){notice('Enter at least the tail number and aircraft type.');return;}
      const id=editingAircraft==='new'?uid():editingAircraft;
      if((state.hangar||[]).some(a=>a.tail===tail&&a.id!==id)){notice(`${tail} is already in your hangar.`);return;}
      if(change(s=>{s.hangar??=[];const existing=s.hangar.find(a=>a.id===id);const data={id,tail,model,operator,equipment};if(existing)Object.assign(existing,data,{demo:false});else s.hangar.push(data);
        // Keep today's flight in step with an edited aircraft (versions re-resolve; runs flag the change).
        if(s.flight?.aircraftId===id)s.flight={...s.flight,...flightFrom(data,{rules:s.flight.rules,airfield:s.flight.airfield,conditions:s.flight.conditions})};
      },false)){editingAircraft=null;render();}
      return;
    }
    case 'demo-add':if(change(s=>addDemo(s),false)){flightDraft=null;render();}return;
    case 'demo-remove':if(change(s=>removeDemo(s),false)){flightDraft=null;render();}return;
    // running
    case 'check':case 'pending':return setTask(Number(b.dataset.line),action==='check'?'done':'pending');
    case 'check-current':{const line=current(run());if(line!==null)setTask(line,'done');return;}
    case 'pending-current':{const line=current(run());if(line!==null&&run().states[line]!=='pending')setTask(line,'pending');return;}
    case 'undo':{if(!undo||undo.id!==state.active)return;const {line,prev}=undo;undo=null;change(s=>{const r=s.runs[s.active];if(prev)r.states[line]=prev;else delete r.states[line];r.position=current(r);});jump(line);return;}
    case 'current':return jump(current(run()));
    case 'jump-pending':return jump(Number(b.dataset.line));
    case 'return-normal':{const back=state.checklists.find(c=>c.id===state.returnTo);if(back&&change(s=>{s.active=s.returnTo;s.returnTo=null;},false)){page='run';render();restorePosition();}return;}
    case 'restore':return change(s=>restore(s,s.active,b.dataset.id));
    case 'export':return download(active().sourceName?.split(/[\\/]/).at(-1)||`${active().title}.md`.replaceAll('/','-'),run().markdown,'text/markdown');
    case 'cancel':confirmAction=null;backupCandidate=null;return render();
    // fuel (carried over)
    case 'fuel-open':
      fuelLine=Number(b.dataset.line);fuelStep=0;fuelError='';
      if(change(s=>{const r=s.runs[s.active];r.fuelDraft??={fuel:r.calculators?.fuel?String(r.calculators.fuel.fuel):'',burn:r.calculators?.fuel?String(r.calculators.fuel.burn):'',unit:r.calculators?.fuel?.unit??'US gal'};},false))go('fuel');return;
    case 'fuel-key':{
      const field=fuelStep===0?'fuel':'burn',key=b.dataset.key;let value=fuelDraft()[field];
      if(key==='⌫')value=value.slice(0,-1);else if(key==='.'&&!value.includes('.'))value=(value||'0')+'.';else if(/^\d$/.test(key)&&value.length<10)value+=key;
      fuelError='';change(s=>{s.runs[s.active].fuelDraft[field]=value;},false);$('#fuel-number').value=fuelDraft()[field];$('#fuel-error').textContent='';return;
    }
    case 'fuel-next':{
      const d=fuelDraft();try{
        fuelEndurance(d.fuel,fuelStep===0?'1':d.burn);
        if(fuelStep===1){if(change(s=>applyFuel(s.runs[s.active],s.runs[s.active].fuelDraft),false))fuelReturn();return;}
        fuelStep++;fuelError='';
      }catch(err){fuelError=err.message;}render();main.scrollTop=0;return;
    }
    case 'fuel-edit':fuelStep=0;fuelError='';return render();
    case 'fuel-apply':if(change(s=>applyFuel(s.runs[s.active],s.runs[s.active].fuelDraft),false))fuelReturn();return;
    case 'fuel-back':return fuelReturn();
    // library & device (carried over)
    case 'library-import':librarySource=state.librarySource||DEFAULT_LIBRARY;return go('library-import');
    case 'library-file':$('#library-file').value='';$('#library-file').click();return;
    case 'library-download':return downloadLibrary();
    case 'library-install':if(libraryCandidate&&change(s=>{installLibrary(s,libraryCandidate);if(librarySource)s.librarySource=librarySource;},false)){libraryCandidate=null;libraryMessage='Library installed. Active runs keep their existing version.';render();}return;
    case 'update-checklists':{if(locked||libraryBusy)return;libraryBusy=true;render();notice('Checking GitHub for your latest checklists…');try{const result=await updateChecklists();state=validateState(JSON.parse(localStorage.getItem(KEY)));notice(result.count+' checklists up to date. Active runs keep their existing version.');}catch(err){notice(err.message);}finally{libraryBusy=false;render();}return;}
    case 'app-update':return updateApp();
    case 'offline-check':return checkOffline(true);
    case 'backup':return download('FliteChek-backup.json',JSON.stringify(state,null,2),'application/json');
    case 'import-backup':$('#backup-import').value='';$('#backup-import').click();return;
    case 'restore-backup':if(backupCandidate&&change(s=>{for(const key of Object.keys(s))delete s[key];Object.assign(s,backupCandidate);},false)){backupCandidate=null;go('home');}return;
  }
});
main.addEventListener('input',e=>{
  if(e.target.id==='symptom'){
    const words=e.target.value.toLowerCase().split(/\s+/).filter(Boolean);let count=0;
    main.querySelectorAll('[data-search]').forEach(el=>{const text=el.dataset.search.toLowerCase();el.hidden=!words.every(w=>text.includes(w));if(!el.hidden)count++;});
    $('#no-results').hidden=!!count;
  }
});
main.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='flight-airfield'){e.preventDefault();e.target.blur();}});
document.addEventListener('change',e=>{
  if(e.target.id==='fuel-unit'){const unit=e.target.value;change(s=>{s.runs[s.active].fuelDraft={fuel:'',burn:'',unit};});}
  if(e.target.id==='flight-airfield'&&flightDraft)flightDraft.airfield=e.target.value.trim().toUpperCase();
});
$('#library-file').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 librarySource='';libraryCandidate=null;
 try{if(file.size>8_000_000)throw Error('Package exceeds 8 MB.');libraryCandidate=planImport(state,readPackage(new Uint8Array(await file.arrayBuffer())));libraryMessage='Review the library before installing.';}catch(error){libraryMessage='Not installed: '+error.message;}render();
});
$('#backup-import').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>10_000_000)throw new Error('Backup is too large.');backupCandidate=validateState(JSON.parse(await file.text()));render();main.scrollTop=main.scrollHeight;}
  catch(err){notice(`Backup was not loaded: ${err.message}`);}
});
main.addEventListener('pointerdown',()=>{dragging=true;lastTouch=Date.now();});
document.addEventListener('pointerup',()=>{dragging=false;lastTouch=Date.now();});
document.addEventListener('pointercancel',()=>{dragging=false;lastTouch=Date.now();});
main.addEventListener('scroll',()=>{lastTouch=Date.now();clearTimeout(scrollTimer);scrollTimer=setTimeout(savePosition,180);},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)savePosition();else lastTouch=Date.now();updateWakeLock();});
window.addEventListener('pagehide',savePosition);
window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{state=validateState(JSON.parse(e.newValue));render();}catch{notice('Another window changed saved data. Close extra windows before editing.');}}});
// Normal checklists: after reading ahead, a countdown returns you to the current item.
// Emergency checklists scroll freely.
setInterval(()=>{
  if(page!=='run'||!run()||document.hidden||active().emergency||dragging)return;
  if(run().offFlight||runMismatch())return; // never scroll away from a version warning
  const line=automaticTarget(run()),el=document.getElementById(`line-${line}`),b=$('#current-button');if(!el||!b)return;
  const rect=el.getBoundingClientRect(),view=main.getBoundingClientRect(),outside=rect.bottom<view.top+20||rect.top>view.bottom-25;
  const elapsed=(Date.now()-lastTouch)/1000;
  b.textContent=outside&&elapsed>=3?`↑ Back in ${Math.max(1,Math.ceil(6-elapsed))}s · Go now`:(line!==current(run())?'↑ Note before current item':'↑ Current item');
  if(outside&&elapsed>=6)jump(line);
},250);

// Hosted builds (GitHub Pages) update in place: fetch the new service worker, switch to it, reload.
// The Mac launcher keeps its own /install update page.
async function updateApp(){
  if(!location.hostname.endsWith('github.io')){location.href=updateURL(location.href);return;}
  if(page==='run'&&run()&&!complete(run())&&confirmAction!=='app-update'){confirmAction='app-update';notice('A checklist is in progress. Tap Update app again to update now — your progress is kept.');return;}
  try{
    const reg=await navigator.serviceWorker.getRegistration();if(!reg)throw new Error('Offline support is not set up yet. Open Settings → Offline & backup first.');
    notice('Checking for a new version…');await reg.update();
    const worker=reg.waiting||reg.installing;
    if(!worker){notice('You have the latest version (build '+BUILD+').');return;}
    navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});
    const apply=()=>reg.waiting?.postMessage({type:'APPLY_UPDATE'});
    if(reg.waiting)apply();else worker.addEventListener('statechange',()=>{if(worker.state==='installed')apply();});
  }catch(err){notice('Update failed: '+err.message);}
}
async function checkOffline(requestPersistence=false){
  try{
    if(!isSecureContext||!('serviceWorker' in navigator))throw new Error('Open the HTTPS address from the setup guide to install offline support.');
    await navigator.serviceWorker.register('./sw.js');
    await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Offline setup timed out. Check the connection and try again.')),10000))]);
    if(requestPersistence&&navigator.storage?.persist)persistence=await navigator.storage.persist();
    else persistence=await navigator.storage?.persisted?.()??false;
    const files=['./','./index.html','./style.css','./app.js','./core.js','./resolver.js','./overlay.js','./demo.js','./checklists.json'];
    offlineReady=(await Promise.all(files.map(f=>caches.match(new URL(f,location.href).href)))).every(Boolean);
    if(!offlineReady)throw new Error('Offline files are not complete. Keep this app open while connected, then check again.');
    if(page==='setup')render();
  }catch(err){if(requestPersistence)notice(err.message);}
}
async function init(){
  try{
    const saved=localStorage.getItem(KEY);
    if(saved){
      state=loadSavedState();
      for(const [id,r] of Object.entries(state.runs))r.plainLists ??= !state.checklists.find(c=>c.id===id)?.emergency;
      try{const response=await fetch('./checklists.json');if(response.ok){const migrated=attachCatalogIdentity(state,await response.json());if(migrated.changed){localStorage.setItem(KEY,JSON.stringify(migrated.state));state=migrated.state;}}}catch{/* offline: saved data stays usable */}
    }
    else{const response=await fetch('./checklists.json');if(!response.ok)throw new Error('The starter checklists could not load.');state=newState(await response.json());localStorage.setItem(KEY,JSON.stringify(state));}
    state.hangar??=[];state.choices??={};
    page=active()?'run':'home';render();if(page==='run')restorePosition();checkOffline();if(page==='home')checkLibraryInBackground();
  }catch(e){
    locked=true;notice(`Could not open saved data. Nothing was overwritten. ${e.message}`);
    main.innerHTML='<h1>Let’s preserve your data.</h1><p class="help">Your saved data is still on this device. Download a copy below, or apply the latest app repair.</p><button id="recover">Download saved data</button><a class="button" id="repair-update">Update / repair app</a>';
    $('#repair-update').href=updateURL(location.href);
    $('#recover').onclick=()=>{try{download('FliteChek-recovery.txt',localStorage.getItem(KEY)??'No saved data found.');}catch(err){notice(err.message);}};
  }
}
init();
