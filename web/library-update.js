import {loadSavedState} from './recovery.js';
import {validatePackage,installLibrary} from './catalog.js';
import {validateState} from './core.js';
const KEY='flitechek.state.v1';
export const LIBRARY='https://raw.githubusercontent.com/marpa96/Flight-Checklists/flitechek-library/library.flitechek.json';
const HEAD='https://api.github.com/repos/marpa96/Flight-Checklists/commits/main';
async function json(url,fetcher){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetcher(url+(url.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store',credentials:'omit',signal:controller.signal});
  if(!response.ok)throw new Error(response.status===404?'The checklist library has not been published yet. Commit and push the setup files, then wait for GitHub to finish.':'Could not check GitHub ('+response.status+'). Your offline library is unchanged.');
  const reader=response.body.getReader();let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8000000){await reader.cancel();throw new Error('Checklist download is too large.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
 }finally{clearTimeout(timer);}
}
export async function updateChecklists({storage=localStorage,fetcher=fetch}={}){
 // Read the branch before AND after downloading to detect a concurrent push.
 const head=await json(HEAD,fetcher);let pkg=await json(LIBRARY,fetcher);
 // Raw GitHub URLs can lag a successful publication. Retry through the contents
 // API, then still require an exact source-commit match before installing.
 if(pkg.source_commit!==head.sha){try{
  const file=await json('https://api.github.com/repos/marpa96/Flight-Checklists/contents/library.flitechek.json?ref=flitechek-library',fetcher);
  if(file.encoding==='base64'&&typeof file.content==='string'){
   const bytes=Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
   if(bytes.length<=8000000)pkg=JSON.parse(new TextDecoder().decode(bytes));
  }
 }catch{/* Keep the exact-commit check below if publication is still unavailable. */}}
 const after=await json(HEAD,fetcher);
 if(!/^[a-f0-9]{40}$/.test(head.sha)||head.sha!==after.sha||pkg.source_commit!==head.sha){
  let failed=false;
  if(/^[a-f0-9]{40}$/.test(after.sha))try{const runs=await json('https://api.github.com/repos/marpa96/Flight-Checklists/actions/workflows/flitechek-library.yml/runs?head_sha='+after.sha+'&per_page=1',fetcher);const latest=runs.workflow_runs?.[0];failed=latest?.status==='completed'&&latest.conclusion!=='success';}catch{}
  throw new Error(failed?'Your push reached GitHub, but checklist publication failed. Check the Publish FliteChek library run for YAML or checklist ID errors. Waiting will not fix a failed build. Your offline library is unchanged.':'GitHub has not published your latest commit yet. Wait for “Publish FliteChek library” to finish, then retry. Your offline library is unchanged.');
 }
 const items=validatePackage(pkg);
 // Read saved progress after the network work, and write once only after validation.
 const saved=storage.getItem(KEY);if(!saved)throw new Error('Open FliteChek once to initialize this device, then retry.');
 const state=loadSavedState(storage);
 const plan=installLibrary(state,items);
 if(Array.isArray(pkg.folders)&&pkg.folders.every(f=>typeof f==='string'&&f.length<100))state.libraryFolders=pkg.folders;
 state.librarySource=LIBRARY;state.libraryCommit=head.sha;
 storage.setItem(KEY,JSON.stringify(validateState(state)));
 return {count:items.length,changed:plan.filter(p=>p.status!=='Unchanged').length};
}
