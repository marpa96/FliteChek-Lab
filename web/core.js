export const uid = () => globalThis.crypto.randomUUID();
export function parse(md,{plainLists=true}={}) {
  const lines = md.split('\n'), blocks = [];
  for (let i = 0; i < lines.length;) {
    const start = i, raw = lines[i], trimmed = raw.trim();
    if (!trimmed) { i++; continue; }
    if(trimmed.startsWith('<!--')){i++;if(!trimmed.includes('-->'))while(i<lines.length&&!lines[i++].includes('-->')){}continue;}
    const fence = trimmed.match(/^(`{3,}|~{3,})/);
    if (fence) {
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) i++;
      if (i < lines.length) i++;
      blocks.push({line:start,end:i,kind:'code',text:lines.slice(start,i).join('\n')}); continue;
    }
    const task = raw.match(/^(\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+)(.*)$/);
    if (task) { blocks.push({line:i,end:++i,kind:'task',text:task[2],prefix:task[1],depth:raw.match(/^\s*/)[0].length}); continue; }
    const plain=raw.match(/^(\s*(?:[-*+]|\d+[.)])\s+)(\S.*)$/);
    if(plainLists && plain && !/^\s*(?:[-*_]\s*){3,}$/.test(raw)){
      blocks.push({line:i,end:++i,kind:'task',text:plain[2],prefix:plain[1],depth:raw.match(/^\s*/)[0].length,implicit:true});continue;
    }
    if (/^\s*\|/.test(raw)) {
      i++; while (i < lines.length && /^\s*\|/.test(lines[i])) i++;
      blocks.push({line:start,end:i,kind:'table',text:lines.slice(start,i).join('\n')}); continue;
    }
    if (/^\s*>/.test(raw)) {
      i++; while (i < lines.length && /^\s*>/.test(lines[i])) i++;
      blocks.push({line:start,end:i,kind:'note',text:lines.slice(start,i).map(l=>l.replace(/^\s*>\s?/, '')).join('\n')}); continue;
    }
    const heading = raw.match(/^(#{1,6})\s+(.*)$/);
    blocks.push({line:i,end:++i,kind:heading?'heading':'text',text:heading?heading[2]:raw,level:heading?.[1].length});
  }
  // Recognize GitHub/Obsidian callouts while keeping the original Markdown intact.
  for(const b of blocks){
    if(b.kind!=='note' && b.kind!=='text')continue;
    const marker=b.text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][+-]?[ \t]*(?:\n)?([\s\S]*)$/i);
    if(marker){b.kind='note';b.callout=marker[1].toLowerCase();b.body=marker[2];}
  }
  let sectionPath=[];
  for(const block of blocks){
    if(block.kind==='heading'){
      if(block.level===1)sectionPath=[];
      else{sectionPath.length=block.level-2;sectionPath[block.level-2]=block.text;}
    }
    if(block.kind==='task')block.sectionPath=sectionPath.filter(Boolean);
  }
  return blocks;
}

// Adopt bundled corrections only when the saved content still matches a known
// bundled revision. Personal edits, drafts and active-run snapshots stay intact.
export function syncBundled(state,bundled){
  let updated=0;
  for(const seed of bundled){
    const saved=state.checklists.find(c=>c.id===seed.id);
    if(!saved){state.checklists.push(structuredClone(seed));updated++;continue;}
    if(seed.catalogId&&!saved.catalogId){saved.catalogId=seed.catalogId;saved.metadata=structuredClone(seed.metadata);saved.sourceName=seed.sourceName;updated++;}
    const newest=latest(seed),existing=latest(saved);
    if(existing.markdown===newest.markdown)continue;
    if(!seed.revisions.some(r=>r.markdown===existing.markdown))continue;
    saved.revisions.push({...structuredClone(newest),id:uid(),date:new Date().toISOString(),title:saved.title,variant:saved.variant,emergency:saved.emergency});
    const run=state.runs[seed.id];
    if(newest.revertsFormattingEdit && run && run.markdown===seed.revisions.at(-2)?.markdown){
      // Undo only our exact formatting rewrite; line identity and saved checks do not change.
      run.markdown=newest.markdown;run.revision=latest(saved).id;
    }
    updated++;
  }
  return updated;
}
export function replaceBlock(md, block, text) {
  const lines = md.split('\n');
  lines.splice(block.line, block.end-block.line, (block.prefix || '') + text);
  return lines.join('\n');
}
export function moveTask(md, line, direction) {
  const blocks = parse(md), lines = md.split('\n'), index = blocks.findIndex(b=>b.line===line && b.kind==='task');
  if (index < 0) return md;
  const item = blocks[index];
  const boundary = index => { let j=index+1; while(j<blocks.length && blocks[j].kind==='task' && blocks[j].depth>blocks[index].depth) j++; return j; };
  let other = direction>0 ? boundary(index) : index-1;
  if(direction<0) while(other>=0 && blocks[other].kind==='task' && blocks[other].depth>item.depth) other--;
  if(other<0 || other>=blocks.length || blocks[other].kind!=='task' || blocks[other].depth!==item.depth) return md;
  const first=Math.min(index,other), second=Math.max(index,other), end=boundary(second);
  const a=blocks[first].line,b=blocks[second].line,c=blocks[end]?.line ?? lines.length;
  return [...lines.slice(0,a),...lines.slice(b,c),...lines.slice(a,b),...lines.slice(c)].join('\n');
}
export function revision(markdown) { return {id:uid(),date:new Date().toISOString(),markdown}; }
export const latest = c => c.revisions.at(-1);
export function newState(checklists) { return {schema:1,checklists:structuredClone(checklists),runs:{},active:null,returnTo:null,preferred:{},draft:null}; }
export function openChecklist(state,id) {
  const c=state.checklists.find(c=>c.id===id); if(!c) return;
  const previous=state.checklists.find(c=>c.id===state.active);
  if(c.emergency && previous && !previous.emergency) state.returnTo=previous.id;
  if(!c.emergency) state.returnTo=null;
  state.active=id; state.preferred[c.title]=id;
  state.runs[id] ??= {revision:latest(c).id,markdown:latest(c).markdown,states:{},position:null,plainLists:!c.emergency};
  state.runs[id].plainLists ??= !c.emergency;
}
export const tasks = run => parse(run.markdown,{plainLists:run.plainLists!==false}).filter(b=>b.kind==='task');
export function current(run) { return tasks(run).find(b=>!run.states[b.line])?.line ?? tasks(run).find(b=>run.states[b.line]==='pending')?.line ?? null; }
export function complete(run) { const t=tasks(run); return t.length>0 && t.every(b=>run.states[b.line]==='done'); }
export function setItem(run,line,action) {
  if(!tasks(run).some(t=>t.line===line)) return;
  if(run.states[line]===action) delete run.states[line]; else run.states[line]=action;
  run.position=current(run);
}
export function saveDraft(state) {
  const d=state.draft;
  if(!d?.title.trim() || !d.variant.trim()) throw new Error('Give the procedure and variant a name.');
  let c=state.checklists.find(c=>c.id===d.checklistID);
  if(c) {
    // Revisions include metadata, so name and category changes are reversible too.
    if(latest(c).markdown!==d.markdown || c.title!==d.title || c.variant!==d.variant || c.emergency!==d.emergency) {
      c.revisions.push({...revision(d.markdown),title:d.title,variant:d.variant,emergency:d.emergency});
    }
    Object.assign(c,{title:d.title.trim(),variant:d.variant.trim(),emergency:d.emergency});
  } else {
    c={id:uid(),title:d.title.trim(),variant:d.variant.trim(),emergency:d.emergency,revisions:[{...revision(d.markdown),title:d.title.trim(),variant:d.variant.trim(),emergency:d.emergency}]};
    state.checklists.push(c);
  }
  state.draft=null;
  return c.id;
}
export function restore(state,id,revisionID) {
  const c=state.checklists.find(c=>c.id===id), r=c?.revisions.find(r=>r.id===revisionID); if(!r) return;
  c.revisions.push({...r,id:uid(),date:new Date().toISOString()});
  for(const field of ['title','variant','emergency','metadata']) if(r[field]!==undefined) c[field]=r[field];
}
export function restart(state,all=false) {
  if(all) { state.runs={};state.returnTo=null; }
  if(state.active) { delete state.runs[state.active]; openChecklist(state,state.active); }
}
export function nextChecklist(state) {
  const c=state.checklists.find(c=>c.id===state.active); if(!c || c.emergency) return null;
  const normal=state.checklists.filter(c=>!c.emergency), titles=[...new Set(normal.map(c=>c.title))];
  const title=titles[titles.indexOf(c.title)+1], candidates=normal.filter(c=>c.title===title);
  return candidates.find(n=>n.id===state.preferred[title]) ?? candidates.find(n=>n.variant===c.variant) ?? candidates[0] ?? null;
}
export function validateState(s) {
  const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const safeID=id=>typeof id==='string'&&/^[A-Za-z0-9_-]+$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
  if(s?.schema!==1 || !Array.isArray(s.checklists) || !record(s.runs) || !record(s.preferred)) throw new Error('Unsupported or damaged backup.');
  const ids=new Set(),catalogIDs=new Set();
  for(const c of s.checklists) {
    if(!safeID(c.id) || ids.has(c.id) || typeof c.title!=='string' || typeof c.variant!=='string' || typeof c.emergency!=='boolean' || !Array.isArray(c.revisions) || !c.revisions.length) throw new Error('Invalid checklist data.');
    ids.add(c.id);
    if(c.catalogId!==undefined){if(typeof c.catalogId!=='string'||!/^\d{6}$/.test(c.catalogId)||catalogIDs.has(c.catalogId))throw new Error('Invalid or duplicate catalog ID.');catalogIDs.add(c.catalogId);}
    for(const r of c.revisions) if(typeof r.id!=='string' || typeof r.markdown!=='string' || !Number.isFinite(Date.parse(r.date))) throw new Error('Invalid revision data.');
  }
  for(const [id,r] of Object.entries(s.runs)) {
    if(!ids.has(id) || typeof r.markdown!=='string' || typeof r.revision!=='string' || !record(r.states) || Object.values(r.states).some(v=>!['done','pending'].includes(v))) throw new Error('Invalid saved progress.');
    const lines=new Set(parse(r.markdown).filter(b=>b.kind==='task').map(b=>String(b.line)));
    if(Object.keys(r.states).some(line=>!lines.has(line)))throw new Error('Saved progress references missing items.');
  }
  if(s.active!==null && !ids.has(s.active)) throw new Error('Invalid active checklist.');
  if(s.active!==null && !s.runs[s.active])throw new Error('Active checklist has no saved run.');
  if(s.returnTo!==null && !ids.has(s.returnTo))throw new Error('Invalid emergency return checklist.');
  if(s.draft && (typeof s.draft.markdown!=='string' || typeof s.draft.title!=='string' || typeof s.draft.variant!=='string' || typeof s.draft.emergency!=='boolean')) throw new Error('Invalid editing draft.');
  return s;
}

// Automatic movement lands on the first notice before the current step.
// Notices need no checkmark; the pilot can scroll through them freely.
export function automaticTarget(run){
  const line=current(run);if(line===null)return null;
  const blocks=parse(run.markdown,{plainLists:run.plainLists!==false});
  const index=blocks.findIndex(b=>b.line===line);
  let start=index-1;
  while(start>=0 && blocks[start].kind!=='task')start--;
  return blocks.slice(start+1,index).find(b=>b.callout)?.line ?? line;
}
