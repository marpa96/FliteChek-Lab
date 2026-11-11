// Base + changes. A variant file says only what differs from the base procedure:
//
//   ## After: Fuel Selector Valve        ← add the lines below after that item
//   - [ ] New item
//   ## Before: Master Switch             ← add before
//   ## Replace: Avionics Cooling Fan     ← replace that item with the lines below
//   ## Remove: Static Pressure Alternate ← remove that item (and its sub-items)
//   ## End of: CABIN                     ← add at the end of that section
//
// Targets match the start of an item's text in whole words (bold and punctuation ignored) and must match
// exactly one item — never zero, never two — or the change is rejected with a clear error.
// Every added line is tagged with where it came from, so the pilot can see it in the run.

const OP=/^##\s+(After|Before|Replace|Remove|End of)\s*:\s*(.+?)\s*$/i;
const TASK=/^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;
const HEADING=/^(#{1,6})\s+(.*)$/;
export const clean=s=>String(s).replace(/\*\*|__|`/g,'').replace(/[—–-]+/g,' ').replace(/[^\p{L}\p{N}\s/]/gu,' ').replace(/\s+/g,' ').trim().toLowerCase();

/** Parse an overlay's Markdown into operations. */
export function parseOverlay(markdown){
  const ops=[];let op=null;
  for(const line of markdown.split('\n')){
    const m=line.match(OP);
    if(m){op={kind:m[1].toLowerCase(),target:m[2],lines:[]};ops.push(op);continue;}
    if(/^#\s/.test(line)||/<!--.*-->/.test(line))continue; // title and hidden IDs
    if(op)op.lines.push(line);
  }
  for(const o of ops){while(o.lines.length&&!o.lines.at(-1).trim())o.lines.pop();while(o.lines.length&&!o.lines[0].trim())o.lines.shift();}
  return ops;
}

function findItem(lines,target){
  // Whole words only: "Fuel Selector" matches "Fuel Selector Valve — BOTH", but "R" matches nothing.
  const want=clean(target),hits=[];if(!want)return hits;
  lines.forEach((l,i)=>{const t=l.text.match(TASK);const text=t&&clean(t[2]);if(text&&(text===want||text.startsWith(want+' ')))hits.push(i);});
  return hits;
}
function findSection(lines,target){
  const want=clean(target),hits=[];
  lines.forEach((l,i)=>{const h=l.text.match(HEADING);if(h&&clean(h[2])===want)hits.push(i);});
  return hits;
}
// An item plus any deeper-indented lines right after it (its sub-items / wrapped text).
function itemEnd(lines,i){
  const indent=(lines[i].text.match(/^\s*/)[0]).length;let j=i+1;
  while(j<lines.length){
    const t=lines[j].text;if(!t.trim())break;
    if(HEADING.test(t))break;
    const m=t.match(TASK);if(m&&m[1].length<=indent)break;
    if(!m&&/^\s*>/.test(t))break;
    j++;
  }
  return j;
}

/**
 * Apply overlays (most general first) to a base document.
 * Returns {markdown, origins:{line:label}, changes:[{label,kind,target}], errors:[...]}.
 */
export function compose(baseMarkdown,overlays=[]){
  let lines=baseMarkdown.split('\n').map(text=>({text,origin:null}));
  const changes=[],errors=[];
  for(const {markdown,label} of overlays){
    for(const op of parseOverlay(markdown)){
      const added=op.lines.map(text=>({text,origin:label}));
      if(op.kind==='end of'){
        const hits=findSection(lines,op.target);
        if(hits.length!==1){errors.push(`${label}: “End of: ${op.target}” matches ${hits.length} sections (needs exactly 1).`);continue;}
        let j=hits[0]+1;const level=lines[hits[0]].text.match(HEADING)[1].length;
        while(j<lines.length){const h=lines[j].text.match(HEADING);if(h&&h[1].length<=level)break;j++;}
        while(j>hits[0]+1&&!lines[j-1].text.trim())j--;
        lines.splice(j,0,...added);changes.push({label,kind:op.kind,target:op.target});continue;
      }
      const hits=findItem(lines,op.target);
      if(hits.length!==1){errors.push(`${label}: “${op.kind[0].toUpperCase()+op.kind.slice(1)}: ${op.target}” matches ${hits.length} items (needs exactly 1).`);continue;}
      const i=hits[0],end=itemEnd(lines,i);
      if(op.kind==='after')lines.splice(end,0,...added);
      else if(op.kind==='before')lines.splice(i,0,...added);
      else if(op.kind==='replace')lines.splice(i,end-i,...added);
      else if(op.kind==='remove')lines.splice(i,end-i);
      if(op.kind!=='remove'&&!added.length){errors.push(`${label}: “${op.kind}: ${op.target}” has no lines to add.`);}
      changes.push({label,kind:op.kind,target:op.target});
    }
  }
  const origins={};lines.forEach((l,i)=>{if(l.origin)origins[i]=l.origin;});
  return {markdown:lines.map(l=>l.text).join('\n'),origins,changes,errors};
}
