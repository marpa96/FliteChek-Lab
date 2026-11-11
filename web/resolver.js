// Picks the one right version of a procedure for today's flight — or says clearly why it can't.
//
// A flight is {tail, model, operator, equipment[], airfield, rules, conditions[]}.
// Each checklist's catalog metadata lists where it applies. A missing list, [] or "*" means
// "any". A specific value only matches when the flight has that value set: a checklist written
// for KSEE never applies to a flight with no airport chosen.
//
// Versions compete by specificity (tail beats operator beats type beats airport beats rules).
// Overlays — small "changes" files that extend a base procedure — don't compete: every overlay
// that applies is layered on, most general first.

export const DIMENSIONS=[
  {key:'tail_numbers',field:'tail',weight:32,label:'Tail number'},
  {key:'operators',field:'operator',weight:16,label:'School / operator'},
  {key:'equipment',field:'equipment',weight:8,label:'Equipment',set:true},
  {key:'aircraft_models',field:'model',weight:4,label:'Aircraft type'},
  {key:'airfields',field:'airfield',weight:2,label:'Airport'},
  {key:'flight_rules',field:'rules',weight:1,label:'Flight rules'},
  {key:'conditions',field:'conditions',weight:1,label:'Conditions',set:true},
];

const norm=v=>String(v??'').trim().toUpperCase();
const isAny=values=>!Array.isArray(values)||!values.length||values.every(v=>norm(v)==='*');
function glob(pattern,value){
  const p=norm(pattern),v=norm(value);
  if(!p.includes('*'))return p===v;
  return new RegExp('^'+p.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(v);
}

/** How one checklist relates to a flight: applies?, score, what matched, what's missing. */
export function match(metadata={},flight={}){
  let score=0;const matched=[],missing=[],conflicts=[];
  for(const d of DIMENSIONS){
    const values=metadata[d.key];
    if(isAny(values))continue;
    const have=flight[d.field];
    if(d.set){
      // Equipment / conditions: every listed value must be present on this flight.
      const list=(Array.isArray(have)?have:[]).map(norm);
      const needed=values.filter(v=>norm(v)!=='*');
      if(needed.every(v=>list.some(h=>glob(v,h)))){score+=d.weight;matched.push({...d,values:needed});}
      else if(!list.length)missing.push(d);else conflicts.push({...d,values:needed,have:list});
      continue;
    }
    if(!norm(have)){missing.push(d);continue;}
    const hit=values.find(v=>glob(v,have));
    if(hit){score+=hit.includes('*')?d.weight/2:d.weight;matched.push({...d,values:[norm(have)]});}
    else conflicts.push({...d,values,have:norm(have)});
  }
  return {applies:!missing.length&&!conflicts.length,score,matched,missing,conflicts};
}

export const familyKey=c=>c.metadata?.procedure||c.title;
export const isOverlay=c=>!!c.metadata?.extends;

/** Group checklists into procedure families: {key, title, emergency, group, versions[], overlays[]}. */
export function families(checklists,groupOf=()=> 'Other'){
  const map=new Map();
  for(const c of checklists){
    if(c.retired||isOverlay(c))continue;
    const key=familyKey(c);
    if(!map.has(key))map.set(key,{key,title:c.title,emergency:c.emergency,group:groupOf(c),sequence:c.metadata?.sequence??1e9,versions:[],overlays:[]});
    const f=map.get(key);f.versions.push(c);f.sequence=Math.min(f.sequence,c.metadata?.sequence??1e9);
  }
  for(const c of checklists){
    if(c.retired||!isOverlay(c))continue;
    map.get(c.metadata.extends)?.overlays.push(c);
  }
  return [...map.values()].sort((a,b)=>a.sequence-b.sequence||a.title.localeCompare(b.title));
}

/**
 * Resolve a family for a flight.
 * status: 'resolved' | 'ambiguous' (two equally specific versions — pilot must choose) |
 *         'needs' (set more of the flight to decide) | 'none' (no version for this flight)
 */
export function resolve(family,flight={},chosenId=null){
  const ranked=family.versions.map(c=>({checklist:c,...match(c.metadata,flight)}));
  const applicable=ranked.filter(r=>r.applies).sort((a,b)=>b.score-a.score);
  const overlays=family.overlays.map(c=>({checklist:c,...match(c.metadata,flight)})).filter(r=>r.applies).sort((a,b)=>a.score-b.score);
  const chosen=chosenId&&applicable.find(r=>r.checklist.id===chosenId);
  if(chosen)return {status:'resolved',version:chosen,overlays,alternatives:applicable.filter(r=>r!==chosen),pilotChoice:true};
  if(!applicable.length){
    // Would filling in part of the flight make a version apply?
    const close=ranked.filter(r=>!r.conflicts.length&&r.missing.length);
    if(close.length){const dims=[...new Map(close.flatMap(r=>r.missing).map(d=>[d.key,d])).values()];return {status:'needs',missing:dims,candidates:close,overlays:[]};}
    return {status:'none',candidates:ranked,overlays:[]};
  }
  const [top,next]=applicable;
  if(next&&next.score===top.score&&next.checklist.revisions?.at(-1)?.markdown!==top.checklist.revisions?.at(-1)?.markdown)
    return {status:'ambiguous',candidates:applicable.filter(r=>r.score===top.score),overlays};
  return {status:'resolved',version:top,overlays,alternatives:applicable.slice(1)};
}

/** Short human reason a version was picked: "C172S · VFR" or "Generic — any aircraft". */
export function reason(result){
  if(!result?.matched?.length)return 'Generic — any aircraft';
  return result.matched.map(m=>m.values.join(', ')).join(' · ');
}

/** The most specific thing a changes file is for, e.g. "N123DM" or "DEMO FLIGHT SCHOOL". */
export function shortLabel(result){return result?.matched?.[0]?.values.join('/')||'All aircraft';}

export function flightLabel(flight={}){
  return [flight.tail,flight.model,flight.operator,flight.airfield,flight.rules,...(flight.conditions||[])].filter(Boolean).join(' · ');
}

/** A stable fingerprint of what a run was resolved for, to catch flight changes mid-run. */
export function signature(flight={},version,overlays=[]){
  return [flightLabel(flight),(flight.equipment||[]).join(','),version?.checklist.id,version?.checklist.revisions?.at(-1)?.id,...overlays.map(o=>o.checklist.id+'@'+o.checklist.revisions?.at(-1)?.id)].join('|');
}

/** Build the flight context from a hangar aircraft plus today's choices. */
export function flightFrom(aircraft,choices={}){
  return {
    aircraftId:aircraft?.id??null,
    tail:norm(aircraft?.tail)||null,model:norm(aircraft?.model)||null,operator:norm(aircraft?.operator)||null,
    equipment:(aircraft?.equipment||[]).map(norm).filter(Boolean),
    airfield:norm(choices.airfield)||null,rules:norm(choices.rules)||null,
    conditions:(choices.conditions||[]).map(norm).filter(Boolean),
  };
}
