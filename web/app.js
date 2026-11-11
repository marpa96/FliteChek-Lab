import {updateURL} from './navigation.js';
import {loadSavedState,attachCatalogIdentity} from './recovery.js';
import {renderInline,webLinks} from './links.js';
import {applies,grouped,profileLabel} from './profile.js';
import {updateChecklists} from './library-update.js';
import {readPackage,planImport,installLibrary} from './catalog.js';
import {FUEL_LINK,fuelEndurance,duration,fuelText,applyFuel} from './fuel.js';
import {parse,replaceBlock,moveTask,revision,latest,newState,openChecklist,tasks,current,complete,setItem,saveDraft,restore,restart,nextChecklist,validateState,syncBundled,automaticTarget} from './core.js';

const BUILD='23';
const DEFAULT_LIBRARY='https://raw.githubusercontent.com/marpa96/Flight-Checklists/flitechek-library/library.flitechek.json';
let checkedLibraryThisSession=false;
let selectedGroup=null,extraFiltersOpen=false;
const KEY='flitechek.state.v1', $=s=>document.querySelector(s), main=$('#main');
let state, page='menu', editorMode='visual', error='', locked=false, confirmAction=null, backupCandidate=null;
let libraryCandidate=null,librarySource='',libraryMessage='',libraryBusy=false;
let fuelStep=0,fuelLine=null,fuelError='';
let lastTouch=Date.now(), dragging=false, scrollTimer, offlineReady=false, persistence=false;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active=()=>state?.checklists.find(c=>c.id===state.active), run=()=>state?.runs[state.active];
const button=(action,text,cls='',extra='')=>`<button data-action="${action}" class="${cls}" ${extra}>${text}</button>`;

function inline(text){return renderInline(text);}
function notice(message){error=message;$('#error').textContent=message;$('#error').hidden=!message;}
function change(action,redraw=true){
  if(locked){notice('Saved data needs recovery. Export it from the recovery screen before replacing anything.');return false;}
  try{const next=structuredClone(state);action(next);localStorage.setItem(KEY,JSON.stringify(next));state=next;notice('');if(redraw)render();return true;}
  catch(e){notice(`Change not saved. Previous data is intact. ${e.message}`);return false;}
}
function go(where){clearTimeout(scrollTimer);savePosition();page=where;confirmAction=null;lastTouch=Date.now();render();main.scrollTop=0;if(where==='menu')checkLibraryInBackground();}
function open(id){savePosition();if(change(s=>openChecklist(s,id),false)){page='run';render();restorePosition();}}
function render(){
  if(!state)return;
  const oldScroll=main.scrollTop;
  main.innerHTML=page==='library-import'?libraryImport():page==='fuel'?fuelCalculator():page==='run'&&active()?runner():page==='history'?history():page==='setup'?setup():library(page==='emergency');
  main.scrollTop=oldScroll;
  $('#resume').hidden=!active()||page==='run';
  document.querySelectorAll('.bottom [data-action]').forEach(b=>b.setAttribute('aria-current',b.dataset.action===page?'page':'false'));
  renderHeader();
  updateReturn();
}
function variantLabel(c){if(c.preservedCatalogId!==undefined)return 'Preserved copy · '+c.variant;const parts=(c.variant||'').split(' · ').filter(v=>v!=='*');return parts.join(' · ')||'All aircraft · all rules';}
function themeControl(){return `<label for="theme-choice">Display</label><select id="theme-choice" aria-label="Display theme">${[['auto','Auto · local time'],['day','Day'],['night','Night · dim red']].map(([value,label])=>`<option value="${value}" ${window.fliteTheme.preference===value?'selected':''}>${label}</option>`).join('')}</select><p class="help">Auto uses night colors from 6 pm to 6 am in your device’s local time. It rechecks when you return to the app; your phone’s dark appearance does not force night mode. Lower your iPhone brightness to a comfortable readable level.</p>`;}
function profileCard(){
 const profile=state.flightProfile||{};
 return `<div class="card flight-profile"><h2>Today's flight</h2>${[['aircraft_models','Aircraft Type'],['flight_rules','Flight rules'],['tail_numbers','Tail number'],['airfields','Airfield']].map(([key,label])=>{
 const values=[...new Set(state.checklists.flatMap(c=>c.metadata?.[key]||[]).filter(v=>!v.includes('*')))];
 if(key==='flight_rules')values.push('VFR','IFR');
 if(profile[key])values.push(profile[key]);
 const options=[...new Set(values)].sort();
 return key==='flight_rules'?`<label>${label}<select data-profile="${key}"><option value="">All / no filter</option>${options.map(v=>`<option ${profile[key]===v?'selected':''}>${escape(v)}</option>`).join('')}</select></label>`:`<label>${label}<input data-profile="${key}" list="profile-${key}" value="${escape(profile[key]||'')}" placeholder="All / enter ${label.toLowerCase()}" autocomplete="off"><datalist id="profile-${key}">${options.map(v=>`<option value="${escape(v)}"></option>`).join('')}</datalist></label>`;
 }).map((field,index)=>index===2?`<details id="extra-filters" ${extraFiltersOpen?'open':''}><summary>Additional filters${profile.tail_numbers||profile.airfields?' · active':''}</summary>${field}`:index===3?field+'</details>':field).join('')}${button('clear-profile','Clear filters','quiet')}<p class="help">${escape(profileLabel(profile))}. Filters are saved on this device.</p></div>`;
}
function library(emergency){
 const home=page==='menu';
 const groups=grouped(state.checklists,state.flightProfile,emergency,{includeEmpty:home,folders:state.libraryFolders||[]}).filter(g=>page!=='category'||g.group===selectedGroup);
 let html=`<h1>${emergency?'Emergency procedures':page==='category'?escape(selectedGroup):page==='search'?'Search checklists':'Checklists'}</h1>`;
 if(home)html+=profileCard()+button('update-checklists',libraryBusy?'Updating…':'Update Checklists','primary full',libraryBusy?'disabled':'');
 else html+=`${button('menu','← Categories','outline')}<p class="subtitle">${escape(profileLabel(state.flightProfile))}</p>${button('menu','Change flight filters','outline')}`;
 if(home&&active()&&applies(active(),state.flightProfile))html+=`<div class="card"><h3>${escape(active().title)}</h3>${button('resume','Resume checklist →','outline full')}</div>`;
 if(home){html+='<div class="category-grid">';for(const {group,items} of groups)html+=button('category',`<strong>${escape(group)}</strong><span>${new Set(items.map(c=>c.title)).size} checklists ›</span>`,'category-button',`data-group-name="${escape(group)}"`);html+='</div>'+(groups.length?'':'<p class="help">No applicable checklists. Change or clear your flight filters.</p>')+button('search-all','Search all checklists','outline full');}
 else {
 html+=`<label for="search">Find a procedure</label><input id="search" placeholder="Search applicable checklists…" type="search"><div id="procedures">`;
 for(const {group,items} of groups){html+=`<section data-group><h2>${escape(group)}</h2>`;
 for(const title of [...new Set(items.map(c=>c.title))]){const variants=items.filter(c=>c.title===title),c=variants.find(c=>c.id===state.preferred[title])??variants[0];
 html+=`<button class="procedure" data-action="open" data-id="${escape(c.id)}" data-search="${escape(title+' '+variants.map(c=>c.variant).join(' '))}"><span class="symbol">${emergency?'△':'☷'}</span><span class="copy"><strong>${escape(title)}</strong><small>${escape(variantLabel(c))}${variants.length>1?` · ${variants.length} variants`:''}</small></span><span class="chevron">›</span></button>`;
 }html+='</section>';}
 html+=`</div><p id="no-results" class="help" ${groups.length?'hidden':''}>No applicable checklists. Change or clear your flight filters.</p>`;
 }
 if(home){html+=`<div class="section-label">Library & device · Build ${BUILD}</div><div class="card stack">${button('library-import','Import / review library','outline')}${button('setup','Setup, app updates & backup','outline')}${button('new-flight','New flight…','quiet')}</div><div class="card">${themeControl()}</div>`;if(confirmAction==='new-flight')html+=confirmation('Clear all checklist progress?','Your checklists and revisions stay saved.','reset-all');}
 return html;
}
function headingHTML(b){
  const level=Math.min(6,Math.max(2,b.level));
  return `<h${level} data-line="${b.line}" id="line-${b.line}" class="source-heading level-${b.level} ${b.level===1?'first':''}">${inline(/checklist complete/i.test(b.text)?'Completion':b.text)}</h${level}>`;
}
function blockHTML(b,r){
  if(b.kind==='task'){
    const status=r.states[b.line],now=current(r)===b.line;
    const calculator=b.text.includes(FUEL_LINK);
    const text=fuelText(b.text.replace(FUEL_LINK,'Calculate fuel endurance'),r.calculators?.fuel);
    return `<div class="task ${status==='done'?'done':''} ${now?'current':''}" id="line-${b.line}" data-line="${b.line}" style="margin-left:${Math.min(b.depth,8)*3}px"><button class="check" data-action="check" data-line="${b.line}" aria-pressed="${status==='done'}"><span class="box" aria-hidden="true">${status==='done'?'✓':status==='pending'?'◷':''}</span><span class="item-copy">${now?'<span class="item-status">Current item</span>':''}${now&&b.sectionPath.length?`<span class="item-context">${escape(b.sectionPath.join(' › '))}</span>`:''}${renderInline(text,{links:false})}</span></button><button class="pending-button" data-action="pending" data-line="${b.line}" aria-label="${status==='pending'?'Return item to checklist':'Mark item pending'}" title="${status==='pending'?'Return to checklist':'Mark pending'}">${status==='pending'?'↩':'◷'}</button>${webLinks(text).map(link=>`<a class="external-link task-reference" data-web-link href="${escape(link.url)}" target="_blank" rel="noopener noreferrer">${escape(link.label)} ↗</a>`).join('')}${calculator?button('fuel-open',r.calculators?.fuel?'Recalculate fuel endurance →':'Calculate fuel endurance →','outline full calculator-link',`data-line="${b.line}"`):''}</div>`;
  }
  if(b.kind==='heading')return headingHTML(b);
  if(b.callout)return `<aside data-line="${b.line}" id="line-${b.line}" class="note callout ${b.callout}" aria-label="${b.callout}"><strong class="callout-label">${['caution','warning'].includes(b.callout)?'⚠':'ⓘ'} ${b.callout.toUpperCase()}</strong><div>${inline(b.body)}</div></aside>`;
  if(b.kind==='note')return `<aside data-line="${b.line}" id="line-${b.line}" class="note">${inline(b.text)}</aside>`;
  if(b.kind==='table'){
    const rows=b.text.split('\n').filter(l=>!/^\s*\|[\s:|\-]+\|?\s*$/.test(l));
    return `<div data-line="${b.line}" id="line-${b.line}" class="table-wrap"><table>${rows.map((l,i)=>`<tr>${l.trim().replace(/^\||\|$/g,'').split('|').map(c=>`<${i?'td':'th'}>${inline(c.trim())}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</table></div>`;
  }
  if(b.kind==='code')return `<pre data-line="${b.line}" id="line-${b.line}">${escape(b.text)}</pre>`;
  return `<div data-line="${b.line}" id="line-${b.line}" class="source-text">${inline(b.text)}</div>`;
}
function renderHeader(){
  const header=$('.brand'),c=active();
  header.classList.toggle('running',page==='run'&&!!c);
  if(page==='fuel'){header.innerHTML='<div><strong>Fuel endurance</strong></div><span class="eyebrow">MOCK TEST</span>';return;}
  if(page!=='run'||!c){header.innerHTML=`<div><span class="brand-icon">✓</span><strong>FliteChek</strong></div><span id="connection" class="eyebrow">${escape(profileLabel(state.flightProfile))}</span>`;return;}
  const r=run(),t=tasks(r),done=t.filter(b=>r.states[b.line]==='done').length,pending=t.filter(b=>r.states[b.line]==='pending').length;
  header.innerHTML=`<div class="run-title-row"><h1>${escape(c.title)}</h1><select id="variant" aria-label="Aircraft / custom variant">${state.checklists.filter(n=>n.title===c.title&&n.emergency===c.emergency&&(n.id===c.id||applies(n,state.flightProfile))).map(n=>`<option value="${escape(n.id)}" ${n.id===c.id?'selected':''}>${escape(variantLabel(n))}</option>`).join('')}</select>${button('options','•••','small quiet','aria-label="Checklist options"')}</div><div class="progress" role="progressbar" aria-label="Checklist progress" aria-valuemin="0" aria-valuemax="${t.length||1}" aria-valuenow="${done}"><div style="width:${t.length?done/t.length*100:0}%"></div></div><div class="stat">${escape(profileLabel(state.flightProfile))} · ${done} out of ${t.length} items checked${pending?` · ${pending} pending`:''}${c.emergency?' · Emergency':''}</div>`;
}
function runner(){
  const c=active(),r=run(),t=tasks(r),done=Object.values(r.states).filter(v=>v==='done').length,pending=Object.values(r.states).filter(v=>v==='pending').length;
  let html=applies(c,state.flightProfile)?'':`<div class="note callout warning">This active checklist does not match today's flight filters. ${button('menu','Choose an applicable checklist','outline full')}</div>`;
  if(confirmAction==='options')html+=`<div class="card stack">${themeControl()}${button('history','Revision history')}${button('export','Export Markdown')}${button('restart','Restart procedure…','quiet')}</div>`;
  if(confirmAction==='restart')html+=confirmation('Restart this procedure?','Progress resets and the latest saved revision is loaded.','reset-one');
  if(r.markdown!==latest(c).markdown)html+=`<div class="note">An updated checklist is saved. Your current progress uses the earlier version.${button('restart','Use updated checklist…','outline full')}</div>`;
  if(c.emergency&&state.returnTo)html+=button('return-normal','↩ Return to previous checklist','outline full');
  html+=parse(r.markdown,{plainLists:r.plainLists!==false}).map(b=>blockHTML(b,r)).join('');
  if(complete(r)){const next=nextChecklist({...state,checklists:state.checklists.filter(c=>c.id===state.active||applies(c,state.flightProfile))});html+=`<div class="card completion"><span class="success">✓</span><h2>Checklist items complete.</h2><p class="help">Review any conditional instructions and reference text before continuing.</p>${next?button('open',`Next: ${escape(next.title)} →`,'primary full',`data-id="${escape(next.id)}"`):button('menu','Back to checklists','primary full')}</div>`;}
  else if(!t.length)html+='<div class="card"><h3>A draft, ready to build on.</h3><p class="help">This document has no actionable list items yet. Add items in the editor to make it interactive.</p></div>';
  return html;
}
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
 let html=`<h1>Checklist library</h1><p class="help">Create and revise on your computer. Filenames stay unchanged; hidden IDs connect Markdown to the YAML catalog.</p><div class="card stack">${button('library-file','Import ZIP or library file','primary full',libraryBusy?'disabled':'')}<label for="library-source">Update source (optional)</label><input id="library-source" type="url" value="${escape(librarySource)}" placeholder="Raw GitHub library.flitechek.json URL"><p class="help">Connected to your Flight-Checklists GitHub library. Updates download when online; installed checklists remain available offline. You can also import a ZIP from Files.</p>${button('library-download',libraryBusy?'Downloading…':'Check for library updates','outline full',libraryBusy?'disabled':'')}</div><p role="status">${escape(libraryMessage)}</p>`;
 if(libraryCandidate){
  const count=libraryCandidate.filter(c=>c.status!=='Unchanged').length;
  html+=`<h2>Review ${libraryCandidate.length} checklists</h2><p class="help">${count} new or changed. Existing checklists omitted from this package are retained. No current run is restarted.</p>`;
  for(const c of libraryCandidate){const m=c.metadata;html+=`<div class="card"><span class="chip">${escape(c.status==='Rename'?'File location changed':c.status)}</span><h3>${escape(c.title)}</h3><p class="help">ID ${c.catalogId} · Revision ${m.revision} · ${escape(m.category)}<br>${escape(c.sourceName)}</p><p>${escape(variantLabel(c))}</p>${!m.aircraft_models.length?'<p class="help">Aircraft: unassigned (empty catalog field).</p>':''}${!m.flight_rules.length?'<p class="help">Flight rules: unassigned (empty catalog field).</p>':''}${m.description?`<p class="help">${escape(m.description)}</p>`:''}</div>`;}
  html+=button('library-install',`Install ${count} changes`,'primary full',count?'':'disabled');
 }
 return html;
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
  if(!response.ok)throw Error(response.status===404?'The GitHub library has not been published yet. Push the workflow and source changes to main, then wait for Publish FliteChek library to finish.':'Download failed ('+response.status+'). Previous library is intact.');
  const reader=response.body.getReader(),parts=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000){await reader.cancel();throw Error('Package exceeds 8 MB.');}parts.push(value);}
  const data=new Uint8Array(size);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}
  libraryCandidate=planImport(state,readPackage(data));libraryMessage='Download validated. Review before installing.';
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
  const reader=response.body.getReader(),parts=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000){await reader.cancel();return;}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const candidate=planImport(state,readPackage(bytes));
  if(page==='menu'&&!libraryBusy&&candidate.some(c=>c.status!=='Unchanged')){libraryCandidate=candidate;libraryMessage='GitHub update downloaded and validated. Review before installing.';render();}
 }catch{/* Network or validation failure never disturbs the installed library. */}
}
function history(){
  const c=active();if(!c)return '<p>Open a checklist first.</p>';
  return `<div class="eyebrow">EVERY CHANGE, REVERSIBLE</div><h1>Revision history</h1><p class="subtitle">${escape(c.title)} · ${escape(variantLabel(c))}</p><p class="help">Restore creates a new revision. Restart the procedure to apply it to a fresh run.</p>${c.revisions.map((r,i)=>({r,i})).reverse().map(({r,i})=>`<details><summary>Revision ${i+1} · ${escape(new Date(r.date).toLocaleString())}</summary><pre>${escape(r.markdown)}</pre>${r.id!==latest(c).id?button('restore','Restore as new revision','primary',`data-id="${escape(r.id)}"`):'<span class="chip">Current saved version</span>'}</details>`).join('')}`;
}
function setup(){return `<div class="eyebrow">TAKE IT WITH YOU</div><h1>Ready offline.</h1><p class="subtitle">A Home Screen app. No account or subscription.</p><div class="card"><h3>This device</h3><p class="help" id="app-build">FliteChek · Build ${BUILD}</p><p id="offline-status">${offlineReady?'✓ App files are saved for offline use.':'App files have not been verified offline yet.'}</p><p id="persistent-status" class="help">${persistence?'Persistent storage granted.':'Persistent storage has not been granted. Keep a backup of your changes.'}</p>${button('offline-check','Check offline readiness','outline full')}${button('app-update','Update app & checklists','outline full')}<p class="help">App updates need your Mac awake on the same Wi-Fi. Checklist-only updates need internet, but not your Mac.</p></div><div class="card"><h3>Install on iPhone</h3><ol class="help"><li>Open this app’s HTTPS address in Safari.</li><li>Use Share → Add to Home Screen. Keep Open as Web App enabled if shown.</li><li>Open FliteChek from its new icon while connected. Check that offline files are saved here.</li><li>Turn on Airplane Mode, close and reopen the app, and confirm your checklists load.</li></ol><p class="help">Safari and the installed app may have separate data. Start your testing in the installed app, or transfer a backup.</p></div><div class="card stack"><h3>Your files stay yours.</h3>${button('backup','Download full backup','primary')}${button('import-backup','Restore from backup…','outline')}${backupCandidate?confirmation('Replace this device’s library?',`The backup contains ${backupCandidate.checklists.length} checklists. Download a backup of your current data first.`,'restore-backup'):''}<p class="help">A full backup includes revisions, progress and any editing draft. Markdown export is available in each checklist’s options. Clearing site data or removing the app can delete local content.</p></div><p class="help">No automatic cross-device sync yet. Emergency procedures and Markdown tables are displayed as supplied; conditional branches are not inferred.</p>`;}
function confirmation(title,description,action){return `<div class="card"><h3>${title}</h3><p class="help">${description}</p><div class="row">${button(action,'Confirm','danger')}${button('cancel','Cancel','outline')}</div></div>`;}
function updateReturn(){
  const bar=$('#return-bar');bar.hidden=page!=='run'||!run()||current(run())===null;
  if(bar.hidden)return;
  const pending=tasks(run()).find(t=>run().states[t.line]==='pending');
  bar.innerHTML=`<div class="row between">${button('current','↑ Current unfinished item','','id="current-button"')}${pending?button('jump-pending','Pending','','data-line="'+pending.line+'"'):''}</div>`;
}
function jump(line,smooth=true){
  const el=document.getElementById(`line-${line}`);if(!el)return;
  const header=headerHeight();
  main.scrollTo({top:main.scrollTop+el.getBoundingClientRect().top-main.getBoundingClientRect().top-header-14,behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});lastTouch=Date.now();
}
function restorePosition(){requestAnimationFrame(()=>{if(page==='run')jump(run().position??automaticTarget(run()),false);});}
function headerHeight(){return 0;}
function savePosition(){
  if(page!=='run'||!run()||locked)return;
  const top=main.getBoundingClientRect().top+headerHeight();
  const rows=[...main.querySelectorAll('[data-line][id]')];
  const row=rows.find(el=>el.getBoundingClientRect().bottom>top+8);
  if(row&&run().position!==Number(row.dataset.line))change(s=>{s.runs[s.active].position=Number(row.dataset.line);},false);
}
function download(name,text,type='text/plain'){
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}

document.addEventListener('click',async e=>{
  const link=e.target.closest('a[data-web-link]');if(link){e.stopPropagation();if(!navigator.onLine){e.preventDefault();notice('This link needs internet. Your checklist is still available offline.');}else{savePosition();}return;}
  const b=e.target.closest('[data-action]');if(!b||b.disabled||!state)return;
  const action=b.dataset.action;lastTouch=Date.now();
  if(action==='category'){selectedGroup=b.dataset.groupName;go('category');return;}
  if(action==='search-all'){selectedGroup=null;go('search');return;}
  if(action==='clear-profile'){change(s=>{s.flightProfile={};});return;}
  if(action==='fuel-open'){
    fuelLine=Number(b.dataset.line);fuelStep=0;fuelError='';
    if(change(s=>{const r=s.runs[s.active];r.fuelDraft??={fuel:r.calculators?.fuel?String(r.calculators.fuel.fuel):'',burn:r.calculators?.fuel?String(r.calculators.fuel.burn):'',unit:r.calculators?.fuel?.unit??'US gal'};},false))go('fuel');return;
  }
  if(action==='fuel-key'){
    const field=fuelStep===0?'fuel':'burn',key=b.dataset.key;let value=fuelDraft()[field];
    if(key==='⌫')value=value.slice(0,-1);else if(key==='.'&&!value.includes('.'))value=(value||'0')+'.';else if(/^\d$/.test(key)&&value.length<10)value+=key;
    fuelError='';change(s=>{s.runs[s.active].fuelDraft[field]=value;},false);$('#fuel-number').value=fuelDraft()[field];$('#fuel-error').textContent='';return;
  }
  if(action==='fuel-next'){
    const d=fuelDraft();try{
      fuelEndurance(d.fuel,fuelStep===0?'1':d.burn);
      if(fuelStep===1){if(change(s=>applyFuel(s.runs[s.active],s.runs[s.active].fuelDraft),false))fuelReturn();return;}
      fuelStep++;fuelError='';
    }catch(e){fuelError=e.message;}render();main.scrollTop=0;return;
  }
  if(action==='fuel-edit'){fuelStep=0;fuelError='';render();return;}
  if(action==='fuel-apply'){
    if(change(s=>applyFuel(s.runs[s.active],s.runs[s.active].fuelDraft),false))fuelReturn();return;
  }
  if(action==='fuel-back')return fuelReturn();
  if(action==='library-import'){librarySource=state.librarySource||DEFAULT_LIBRARY;return go('library-import');}
  if(action==='library-file'){$('#library-file').value='';$('#library-file').click();return;}
  if(action==='library-download'){downloadLibrary();return;}
  if(action==='library-install'){if(libraryCandidate&&change(s=>{installLibrary(s,libraryCandidate);if(librarySource)s.librarySource=librarySource;},false)){libraryCandidate=null;libraryMessage='Library installed. Active runs keep their existing revision.';render();}return;}
  if(action==='menu'||action==='emergency'||action==='setup'||action==='history')return go(action);
  if(action==='resume'){go('run');restorePosition();return;}
  if(action==='open')return open(b.dataset.id);
  if(action==='check'||action==='pending'){
    const old=main.scrollTop;
    if(change(s=>setItem(s.runs[s.active],Number(b.dataset.line),action==='check'?'done':'pending'))){
      // Animate only this successful check, never restored or previously checked items.
      if(action==='check' && run().states[b.dataset.line]==='done'){
        const row=document.getElementById(`line-${b.dataset.line}`);
        row?.classList.add('just-checked');
        row?.addEventListener('animationend',event=>{if(event.target===row)row.classList.remove('just-checked');});
      }
      if(!active().emergency&&current(run())!==null)jump(automaticTarget(run()));else main.scrollTop=old;
    }return;
  }
  if(action==='current')return jump(current(run()));
  if(action==='jump-pending')return jump(Number(b.dataset.line));
  if(action==='return-normal')return open(state.returnTo);
  if(action==='restore')return change(s=>restore(s,s.active,b.dataset.id));
  if(action==='export')return download(active().sourceName?.split(/[\\/]/).at(-1)||`${active().title}-${active().variant}.md`.replaceAll('/','-'),latest(active()).markdown,'text/markdown');
  if(action==='backup')return download('FliteChek-backup.json',JSON.stringify(state,null,2),'application/json');
  if(action==='import-backup'){$('#backup-import').value='';$('#backup-import').click();return;}
  if(action==='restore-backup'){
    if(backupCandidate&&change(s=>{for(const key of Object.keys(s))delete s[key];Object.assign(s,backupCandidate);},false)){backupCandidate=null;go('menu');}return;
  }
  if(action==='reset-all'||action==='reset-one'){if(change(s=>restart(s,action==='reset-all'),false)){go(active()?'run':'menu');restorePosition();}return;}
  if(action==='update-checklists'){if(locked||libraryBusy)return;libraryBusy=true;b.disabled=true;notice('Checking GitHub for your latest checklists…');try{const result=await updateChecklists();state=validateState(JSON.parse(localStorage.getItem(KEY)));render();notice(result.count+' checklists up to date. Active runs keep their existing revision.');}catch(e){notice(e.message);}finally{libraryBusy=false;const updateButton=main.querySelector('[data-action="update-checklists"]');if(updateButton){updateButton.disabled=false;updateButton.textContent='Update Checklists';}}return;}
  if(action==='app-update'){location.href=updateURL(location.href);return;}
  if(action==='offline-check'){checkOffline(true);return;}
  if(action==='cancel'){confirmAction=null;backupCandidate=null;render();return;}
  if(['options','restart','discard','new-flight'].includes(action)){confirmAction=confirmAction===action?null:action;render();if(action==='new-flight'||action==='discard')main.scrollTop=main.scrollHeight;}
});
main.addEventListener('input',e=>{
  if(e.target.id==='search'){
    const query=e.target.value.toLowerCase();let count=0;
    main.querySelectorAll('[data-search]').forEach(el=>{el.hidden=!el.dataset.search.toLowerCase().includes(query);if(!el.hidden)count++;});main.querySelectorAll('[data-group]').forEach(el=>{el.hidden=![...el.querySelectorAll('[data-search]')].some(b=>!b.hidden);});$('#no-results').hidden=!!count;return;
  }
});
main.addEventListener('toggle',e=>{if(e.target.id==='extra-filters')extraFiltersOpen=e.target.open;},true);
document.addEventListener('change',e=>{
  if(e.target.dataset.profile){const key=e.target.dataset.profile,value=e.target.value.trim().toUpperCase();if(value.includes('*')){notice('Choose a specific aircraft or value. Wildcards belong in the YAML.');return;}change(s=>{s.flightProfile??={};s.flightProfile[key]=value;});return;}
  if(e.target.id==='fuel-unit'){
    const unit=e.target.value;change(s=>{s.runs[s.active].fuelDraft={fuel:'',burn:'',unit};});return;
  }
  if(e.target.id==='variant')open(e.target.value);
  if(e.target.id==='theme-choice'){
    try{window.fliteTheme.set(e.target.value);}catch{e.target.value=window.fliteTheme.preference;notice('Display preference could not be saved.');}
  }
});
$('#library-file').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 librarySource='';libraryCandidate=null;
 try{if(file.size>8_000_000)throw Error('Package exceeds 8 MB.');libraryCandidate=planImport(state,readPackage(new Uint8Array(await file.arrayBuffer())));libraryMessage='Review the library before installing.';}catch(error){libraryMessage='Not installed: '+error.message;}render();
});
$('#backup-import').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>10_000_000)throw new Error('Backup is too large.');backupCandidate=validateState(JSON.parse(await file.text()));render();main.scrollTop=main.scrollHeight;}
  catch(e){notice(`Backup was not loaded: ${e.message}`);}
});
main.addEventListener('pointerdown',()=>{dragging=true;lastTouch=Date.now();});
document.addEventListener('pointerup',()=>{dragging=false;lastTouch=Date.now();});
document.addEventListener('pointercancel',()=>{dragging=false;lastTouch=Date.now();});
main.addEventListener('scroll',()=>{lastTouch=Date.now();clearTimeout(scrollTimer);scrollTimer=setTimeout(savePosition,180);},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)savePosition();else lastTouch=Date.now();});
window.addEventListener('pagehide',savePosition);
window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{state=validateState(JSON.parse(e.newValue));render();}catch{notice('Another window changed saved data. Close extra windows before editing.');}}});
setInterval(()=>{
  if(page!=='run'||!run()||document.hidden||active().emergency||dragging)return;
  const line=automaticTarget(run()),el=document.getElementById(`line-${line}`),b=$('#current-button');if(!el||!b)return;
  const rect=el.getBoundingClientRect(),view=main.getBoundingClientRect(),header=headerHeight(),outside=rect.bottom<view.top+header+20||rect.top>view.bottom-25;
  const elapsed=(Date.now()-lastTouch)/1000;
  b.textContent=outside&&elapsed>=3?`↑ Return in ${Math.max(1,Math.ceil(6-elapsed))}s · Go now`:(line!==current(run())?'↑ Notice before current item':'↑ Current unfinished item');
  if(outside&&elapsed>=6)jump(line);
},250);

async function checkOffline(requestPersistence=false){
  try{
    if(!isSecureContext||!('serviceWorker' in navigator))throw new Error('Open the HTTPS address from the setup guide. A file:// page or an ordinary Wi-Fi HTTP address cannot install offline support.');
    await navigator.serviceWorker.register('./sw.js');
    await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Offline setup timed out. Check the connection and try again.')),10000))]);
    if(requestPersistence&&navigator.storage?.persist)persistence=await navigator.storage.persist();
    else persistence=await navigator.storage?.persisted?.()??false;
    const files=['./catalog.js','./fuel.js','./startup.js','./theme.js','./','./index.html','./style.css','./app.js','./core.js','./checklists.json','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
    offlineReady=(await Promise.all(files.map(f=>caches.match(new URL(f,location.href).href)))).every(Boolean);
    if(!offlineReady)throw new Error('Offline files are not complete. Keep this app open while connected, then check again.');
    if(page==='setup')render();
  }catch(e){if(requestPersistence)notice(e.message);}
  if($('#connection'))$('#connection').textContent=offlineReady?'OFFLINE READY':'LOCAL FIRST';
}
async function init(){
  try{
    const saved=localStorage.getItem(KEY);
    if(saved){
      state=loadSavedState();
      for(const [id,r] of Object.entries(state.runs))r.plainLists ??= !state.checklists.find(c=>c.id===id)?.emergency;
      // Corrections are additive revisions; never replace personal edits or a run.
      try{const response=await fetch('./checklists.json');if(response.ok){const migrated=attachCatalogIdentity(state,await response.json());if(migrated.changed){localStorage.setItem(KEY,JSON.stringify(migrated.state));state=migrated.state;}}}catch{/* Saved offline data remains usable when the bundle is unavailable. */}
    }
    else{const response=await fetch('./checklists.json');if(!response.ok)throw new Error('The starter checklists could not load.');state=newState(await response.json());localStorage.setItem(KEY,JSON.stringify(state));}
    page=active()?'run':'menu';render();if(page==='run')restorePosition();checkOffline();if(page==='menu')checkLibraryInBackground();
  }catch(e){
    locked=true;notice(`Could not open saved data. Nothing was overwritten. ${e.message}`);
    main.innerHTML='<h1>Let’s preserve your data.</h1><p class="help">Your saved data is still on this device. Download a copy below, or apply the latest app repair.</p><button id="recover">Download saved data</button><a class="button" id="repair-update">Update / repair app</a>';
    $('#repair-update').href=updateURL(location.href);
    $('#recover').onclick=()=>{try{download('FliteChek-recovery.txt',localStorage.getItem(KEY)??'No saved data found.');}catch(e){notice(e.message);}};
  }
}
init();
