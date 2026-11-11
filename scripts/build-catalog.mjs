import {build} from 'esbuild';import fs from 'node:fs';
await build({entryPoints:['src/catalog.js'],bundle:true,format:'esm',platform:'browser',target:'safari15',outfile:'web/catalog.js',minify:true,legalComments:'eof'});
fs.writeFileSync('web/THIRD-PARTY-LICENSES.txt',['yaml','fflate'].map(name=>name+'\n'+fs.readFileSync('node_modules/'+name+'/LICENSE','utf8')).join('\n\n'));
