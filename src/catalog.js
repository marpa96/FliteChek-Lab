import {parseDocument} from 'yaml';
import {unzipSync,strFromU8} from 'fflate';
const MAX=8_000_000;
const fields=['id','title','procedure','category','group','aircraft_models','flight_rules','tail_numbers','airfields','pilot','description','sequence','revision'];
const fail=message=>{throw new Error(message);};
export function checklistIDs(markdown){
 let fence=null,ids=[];
 for(const line of markdown.split(/\r?\n/)){
  const f=line.trim().match(/^(`{3,}|~{3,})/);if(f){if(!fence)fence=f[1];else if(f[1][0]===fence[0]&&f[1].length>=fence.length)fence=null;continue;}if(fence)continue;
  const m=line.match(/^\s*<!--\s*flitechek-id:\s*([0-9]{6})\s*-->\s*$/);if(m)ids.push(m[1]);
 }
 return ids;
}
export function checklistID(markdown){
 const ids=checklistIDs(markdown);
 if(ids.length!==1)fail('Each checklist needs exactly one <!-- flitechek-id: 000001 --> comment outside code blocks.');
 return ids[0];
}
export function parseCatalog(text){
 const doc=parseDocument(text,{version:'1.2',uniqueKeys:true});if(doc.errors.length||doc.warnings.length)fail('Invalid YAML: '+(doc.errors[0]||doc.warnings[0]).message);
 const value=doc.toJS({maxAliasCount:0});
 if(value?.schema_version!==1||!Array.isArray(value.checklists)||!value.checklists.length)fail('Expected schema_version: 1 and a nonempty checklists list.');
 if(Object.keys(value).some(k=>!['schema_version','checklists'].includes(k)))fail('Unknown catalog field.');
 const seen=new Set();
 for(const c of value.checklists){
  if(!c||typeof c!=='object'||Array.isArray(c))fail('Each catalog entry must be a mapping.');
  if(Object.keys(c).some(k=>!fields.includes(k))||fields.some(k=>k!=='group'&&!(k in c)))fail('Every entry must use all fields in the standard template, with no unknown fields.');
  if(typeof c.id!=='string'||!/^\d{6}$/.test(c.id))fail('Checklist IDs must be quoted six-digit strings, such as "000123".');
  if(seen.has(c.id))fail('Duplicate catalog ID '+c.id);seen.add(c.id);
  for(const key of ['title','procedure'])if(typeof c[key]!=='string'||!c[key].trim())fail(c.id+': '+key+' is required.');
  if(!['normal','emergency'].includes(c.category))fail(c.id+': category must be normal or emergency.');
  for(const key of ['aircraft_models','flight_rules','tail_numbers','airfields'])if(!Array.isArray(c[key])||c[key].some(v=>typeof v!=='string'||!v.trim()||/^\[.*\]$/.test(v)))fail(c.id+': '+key+' must be a list of values, or [].');
  if(c.group!==undefined&&(typeof c.group!=='string'||!c.group.trim()||c.group.length>100))fail(c.id+': invalid group.');
  if(c.group!==undefined&&((c.group==='Emergency')!==(c.category==='emergency')))fail(c.id+': Emergency group and category must agree.');
  if(c.flight_rules.some(v=>!['VFR','IFR','*'].includes(v)))fail(c.id+': flight_rules accepts VFR, IFR or *.');
  for(const key of ['pilot','description'])if(c[key]!==null&&(typeof c[key]!=='string'||!c[key].trim()))fail(c.id+': '+key+' must be text or null.');
  if(c.sequence!==null&&(!Number.isSafeInteger(c.sequence)||c.sequence<0))fail(c.id+': sequence must be a nonnegative integer or null.');
  if(!Number.isSafeInteger(c.revision)||c.revision<1)fail(c.id+': revision must be a positive integer.');
 }
 return value;
}
export function validatePackage(pkg){
 if(pkg?.format!=='flitechek-library-v1'||typeof pkg.catalog!=='string'||!Array.isArray(pkg.documents))fail('Not a FliteChek library package.');
 const catalog=parseCatalog(pkg.catalog),docs=new Map(),names=new Set();let bytes=pkg.catalog.length;
 for(const d of pkg.documents){
  if(typeof d.name!=='string'||typeof d.markdown!=='string')fail('Invalid document.');
  if(d.name.startsWith('/')||d.name.split(/[\\/]/).includes('..'))fail('Invalid document path.');
  if(names.has(d.name))fail('Duplicate document path '+d.name);names.add(d.name);
  bytes+=d.markdown.length;if(bytes>MAX)fail('Library exceeds 8 MB.');
  const id=checklistID(d.markdown);if(docs.has(id))fail('Duplicate Markdown ID '+id);docs.set(id,d);
 }
 if(docs.size!==catalog.checklists.length)fail('Every document must have exactly one catalog entry.');
 return catalog.checklists.map(c=>{
  const d=docs.get(c.id);if(!d)fail('Missing Markdown for ID '+c.id);
  return {catalogId:c.id,title:c.title,variant:[...c.aircraft_models,...c.flight_rules,...c.tail_numbers,...c.airfields,c.pilot].filter(Boolean).join(' · ')||'General',emergency:c.category==='emergency',metadata:c,sourceName:d.name,markdown:d.markdown};
 }).sort((a,b)=>(a.metadata.sequence??1e9)-(b.metadata.sequence??1e9)||a.catalogId.localeCompare(b.catalogId));
}
export function readPackage(bytes){
 if(bytes.byteLength>MAX)fail('Package exceeds 8 MB.');
 if(bytes[0]===0x50&&bytes[1]===0x4b){
  let total=0,count=0;
  const entries=unzipSync(bytes,{filter:file=>{if(++count>1000)fail('Too many ZIP entries.');total+=file.originalSize;if(total>MAX)fail('Expanded ZIP exceeds 8 MB.');return !file.name.endsWith('/');}});
  const names=Object.keys(entries),catalogs=names.filter(n=>/(^|\/)catalog\.ya?ml$/i.test(n));
  if(catalogs.length!==1)fail('ZIP must contain exactly one catalog.yaml.');
  const catalogPath=catalogs[0],prefix=catalogPath.slice(0,catalogPath.lastIndexOf('/')+1);
  const documents=names.filter(n=>n.startsWith(prefix)&&!n.includes('/__MACOSX/')&&(/\.md$/i.test(n)||!n.split('/').at(-1).includes('.'))).map(name=>({name:name.slice(prefix.length),markdown:strFromU8(entries[name])})).filter(d=>checklistIDs(d.markdown).length>0);
  return validatePackage({format:'flitechek-library-v1',catalog:strFromU8(entries[catalogPath]),documents});
 }
 return validatePackage(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
}
export function planImport(state,items){
 return items.map(item=>{
  const old=state.checklists.find(c=>c.catalogId===item.catalogId||(c.preservedCatalogId===undefined&&c.id==='catalog-'+item.catalogId)),last=old?.revisions.at(-1);
  const same=last?.markdown===item.markdown&&JSON.stringify(old.metadata)===JSON.stringify(item.metadata);
  if(old&&!same&&old.metadata&&item.metadata.revision<=old.metadata.revision)fail(item.catalogId+': increase revision above '+old.metadata.revision+' before installing changed content or metadata.');
  return {...item,status:!old?'New':same?(old.sourceName===item.sourceName?'Unchanged':'Rename'):'Update'};
 });
}
export function installLibrary(state,items){
 const plan=planImport(state,items);
 for(const item of plan){
  if(item.status==='Unchanged')continue;
  if(item.status==='Rename'){state.checklists.find(c=>c.catalogId===item.catalogId||(c.preservedCatalogId===undefined&&c.id==='catalog-'+item.catalogId)).sourceName=item.sourceName;continue;}
  let c=state.checklists.find(c=>c.catalogId===item.catalogId||(c.preservedCatalogId===undefined&&c.id==='catalog-'+item.catalogId));
  if(!c){const base='catalog-'+item.catalogId;c={id:state.checklists.some(old=>old.id===base)?base+'-'+crypto.randomUUID():base,revisions:[]};state.checklists.push(c);}
  Object.assign(c,{catalogId:item.catalogId,title:item.title,variant:item.variant,emergency:item.emergency,metadata:item.metadata,sourceName:item.sourceName});
  c.revisions.push({id:crypto.randomUUID(),date:new Date().toISOString(),markdown:item.markdown,title:item.title,variant:item.variant,emergency:item.emergency,metadata:item.metadata});
 }
 // Active snapshots, checked states and calculators are deliberately untouched.
 state.checklists.sort((a,b)=>(a.metadata?.sequence??1e9)-(b.metadata?.sequence??1e9));
 return plan;
}
