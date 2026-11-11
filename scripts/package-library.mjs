import fs from 'node:fs';import path from 'node:path';import {zipSync,strToU8} from 'fflate';import {validatePackage,checklistIDs} from '../src/catalog.js';
const root=path.resolve(import.meta.dirname,'..'),source=path.resolve(process.argv[2]||path.join(root,'../Flight-Checklists')),out=path.resolve(process.argv[3]||root+'/web/library.flitechek.json');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):d.isFile()?[path.join(dir,d.name)]:[]);}
const documents=walk(source).filter(f=>f.endsWith('.md')||!path.basename(f).includes('.')).map(f=>({name:path.relative(source,f),markdown:fs.readFileSync(f,'utf8')}));
const tagged=documents.filter(d=>checklistIDs(d.markdown).length>0);
const pkg={format:'flitechek-library-v1',catalog:fs.readFileSync(source+'/catalog.yaml','utf8'),documents:tagged};
validatePackage(pkg);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(pkg,null,2)+'\n');
const archive=Object.fromEntries([['catalog.yaml',strToU8(pkg.catalog)],...tagged.map(d=>[d.name,strToU8(d.markdown)])]);
fs.writeFileSync(out.replace(/\.json$/,'.zip'),zipSync(archive));console.log('Validated and packaged '+tagged.length+' checklists: '+out);
