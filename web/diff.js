// "What's different?" — compare two versions of a checklist item by item.
// Used to show what a school/tail changes file does, and what changes when you switch aircraft.
import {parse} from './core.js';
import {clean} from './overlay.js';

/** The comparable rows of a document: section headings and items. */
export function rows(markdown){
  return parse(markdown).filter(b=>b.kind==='task'||(b.kind==='heading'&&b.level>1)||b.callout).map(b=>({
    kind:b.kind==='task'?'item':b.callout?'note':'heading',
    text:b.kind==='task'?b.text:b.callout?b.body:b.text,
  })).map(r=>({...r,key:r.kind+':'+clean(r.text)}));
}

/** Longest-common-subsequence diff. Returns [{type:'same'|'add'|'del', row}]. */
export function diff(aMarkdown,bMarkdown){
  const a=rows(aMarkdown),b=rows(bMarkdown),n=a.length,m=b.length;
  const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i].key===b[j].key?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const out=[];let i=0,j=0;
  while(i<n&&j<m){
    if(a[i].key===b[j].key){out.push({type:'same',row:b[j]});i++;j++;}
    else if(dp[i+1][j]>=dp[i][j+1])out.push({type:'del',row:a[i++]});
    else out.push({type:'add',row:b[j++]});
  }
  while(i<n)out.push({type:'del',row:a[i++]});
  while(j<m)out.push({type:'add',row:b[j++]});
  // An item that was removed in one place and added in another simply moved.
  const removed=new Map();
  for(const c of out)if(c.type==='del'&&c.row.kind==='item')removed.set(c.row.key,(removed.get(c.row.key)||0)+1);
  for(const c of out)if(c.type==='add'&&removed.get(c.row.key)){removed.set(c.row.key,removed.get(c.row.key)-1);c.type='move';c.moved=true;}
  const moved=new Map();for(const c of out)if(c.type==='move')moved.set(c.row.key,(moved.get(c.row.key)||0)+1);
  return out.filter(c=>{if(c.type==='del'&&moved.get(c.row.key)){moved.set(c.row.key,moved.get(c.row.key)-1);return false;}return true;});
}

/** Summary counts: {added, removed, moved, same}. */
export function summary(changes){
  const count=t=>changes.filter(c=>c.type===t&&c.row.kind!=='heading').length;
  return {added:count('add'),removed:count('del'),moved:count('move'),same:count('same')};
}
