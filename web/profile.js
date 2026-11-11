export const GROUPS=['In-Flight','Pre-Flight','Ground Ops','Post-Flight','Planning'];
export function matchesValue(values,selected){
 if(!selected)return true;
 if(!Array.isArray(values))return false;
 const target=selected.trim().toUpperCase();
 return values.some(value=>{const pattern=value.trim().toUpperCase();const parts=pattern.split('*').map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));return new RegExp('^'+parts.join('.*')+'$').test(target);});
}
export function applies(checklist,profile={}){
 return !checklist.retired&&['aircraft_models','flight_rules','tail_numbers','airfields'].every(key=>matchesValue(checklist.metadata?.[key],profile[key]));
}
export function profileLabel(profile={}){return ['aircraft_models','flight_rules','tail_numbers','airfields'].map(key=>profile[key]).filter(Boolean).join(' · ')||'All checklists';}
export function checklistGroup(c){
 if(c.emergency)return 'Emergency';
 const folder=c.sourceName?.split('/')[0];
 return folder&&/^\d+\.\s+/.test(folder)?folder.replace(/^\d+\.\s+/,''):c.metadata?.group||'Unassigned';
}
export function grouped(checklists,profile={},emergency=false,{includeEmpty=false,folders=[]}={}){
 const matching=checklists.filter(c=>c.emergency===emergency&&applies(c,profile));
 const names=emergency?['Emergency']:[...new Set([...GROUPS,...folders,...checklists.filter(c=>!c.emergency).map(checklistGroup)])].filter(g=>g!=='Emergency');
 return names.map(group=>({group,items:matching.filter(c=>checklistGroup(c)===group)})).filter(g=>g.items.length||(includeEmpty&&g.group!=='Unassigned'));
}
