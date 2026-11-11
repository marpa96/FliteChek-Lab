import {validateState} from './core.js';
export const STATE_KEY='flitechek.state.v1';
export const REPAIR_BACKUP_KEY='flitechek.before-catalog-repair.v1';
export function repairCatalogIdentity(input){
 const state=structuredClone(input);if(!Array.isArray(state?.checklists))return {state:validateState(state),changed:false};
 let changed=false;
 // Correct only catalog associations. Internal IDs, revisions, runs and preferences stay intact.
 for(const c of state.checklists){
  if(c.catalogId===undefined)continue;
  const original=c.catalogId;
  if(Number.isSafeInteger(original)&&original>=0&&original<=999999){c.catalogId=String(original).padStart(6,'0');changed=true;}
  if(typeof c.catalogId!=='string'||!/^\d{6}$/.test(c.catalogId)){c.preservedCatalogId=original;delete c.catalogId;changed=true;}
 }
 const groups=new Map();for(const c of state.checklists){if(c.catalogId===undefined)continue;const group=groups.get(c.catalogId)||[];group.push(c);groups.set(c.catalogId,group);}
 for(const [id,group] of groups){if(group.length<2)continue;
  const owner=group.find(c=>c.id===state.active)||group.find(c=>c.id==='catalog-'+id)||group[0];
  for(const c of group){if(c===owner)continue;c.preservedCatalogId=id;delete c.catalogId;changed=true;}
 }
 return {state:validateState(state),changed};
}
export function loadSavedState(storage=localStorage){
 const raw=storage.getItem(STATE_KEY);if(raw===null)return null;
 const result=repairCatalogIdentity(JSON.parse(raw));
 if(result.changed){
  // Backup must succeed before replacing the saved state. Never overwrite the first backup.
  if(storage.getItem(REPAIR_BACKUP_KEY)===null)storage.setItem(REPAIR_BACKUP_KEY,raw);
  storage.setItem(STATE_KEY,JSON.stringify(result.state));
 }
 return result.state;
}
export function attachCatalogIdentity(state,bundled){
 const next=structuredClone(state),used=new Set(next.checklists.map(c=>c.catalogId).filter(Boolean));let changed=false;
 for(const seed of bundled){const c=next.checklists.find(c=>c.id===seed.id);if(c&&c.catalogId===undefined&&c.preservedCatalogId===undefined&&seed.catalogId&&!used.has(seed.catalogId)){c.catalogId=seed.catalogId;c.metadata=seed.metadata;c.sourceName=seed.sourceName;used.add(seed.catalogId);changed=true;}}
 return {state:validateState(next),changed};
}
