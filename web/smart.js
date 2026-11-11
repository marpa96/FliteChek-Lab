// "Smart items": FliteChek reads how an item is written and picks the clearest display for it.
// Nothing here changes the checklist text — it only decides how to show it.
//
//   "Master Switch -- OFF."                 → challenge / response:  Master Switch ······ OFF
//   "**Transponder - SET 7600**"             → challenge / response + a big 7600 code
//   "Power - 2100 - 2700 RPM"                → the value is set in a monospace badge
//   "…warm to touch within 30 seconds"      → a 0:30 timer you can start
//   "Record the value: `_____`"              → a field to write the value in

const SEPARATORS=[' -- ',' — ',' → ',' - ',' – '];
const bold=s=>(s.match(/\*\*/g)||[]).length;
const tidy=s=>s.trim().replace(/[.;,]$/,'').trim();
// Strip unbalanced bold markers that a split can leave behind.
const balance=s=>bold(s)%2?s.replace(/\*\*/g,''):s;

/** Split "Control -- ACTION" into {challenge, response}. Returns null when it isn't that shape. */
export function challengeResponse(text){
  let t=String(text).trim();
  // "**Transponder - SET 7600**": the whole item is bold — split inside it.
  const whole=t.match(/^\*\*([^*]+)\*\*$/);
  if(whole)t=whole[1];
  for(const sep of SEPARATORS){
    const i=t.indexOf(sep);
    if(i<1)continue;
    const left=t.slice(0,i),right=t.slice(i+sep.length);
    const plainLeft=left.replace(/\*\*/g,'');
    // A dash between numbers is a range, not a separator ("2100 - 2700").
    if(sep===' - '&&/\d$/.test(plainLeft.trim())&&/^\s*\d/.test(right))continue;
    if(!/[A-Za-z]/.test(plainLeft)||plainLeft.length>60||!tidy(right))continue;
    return {challenge:balance(tidy(left)),response:balance(tidy(right))};
  }
  return null;
}

/** Seconds of a wait mentioned in the item ("within 30 seconds", "3 to 5 seconds", "2 minutes"). */
export function waitSeconds(text){
  const m=String(text).match(/(\d+(?:\.\d+)?)\s*(?:(?:to|-|–)\s*(\d+(?:\.\d+)?)\s*)?(seconds?|secs?|minutes?|mins?)\b/i);
  if(!m)return null;
  const n=Number(m[2]??m[1]),unit=/^m/i.test(m[3])?60:1,s=Math.round(n*unit);
  return s>=3&&s<=1800?s:null;
}

/** A transponder code the item asks for, e.g. 7600. */
export function squawk(text){
  const t=String(text).replace(/\*\*/g,'');
  if(!/transponder|squawk|xpdr/i.test(t))return null;
  return t.match(/\b([0-7]{4})\b/)?.[1]??null;
}

export const hasBlank=text=>/_{3,}/.test(String(text));

const UNIT='(?:RPM|KIAS|KTAS|KCAS|KTS|kts|knots|ft|FT|feet|psi|PSI|gal|GAL|gph|GPH|inHg|in\\.?\\s?Hg|MHz|mb|hPa|°[CF]?|%)';
const VALUE=new RegExp(`(\\b\\d[\\d,.]*(?:\\s?(?:-|–|to)\\s?\\d[\\d,.]*)?\\s?${UNIT}(?![A-Za-z]))`,'g');
const FREQ=/(\b1[1-3]\d\.\d{1,3}\b)(?!\s?MHz)/g;
const CODE=/(\b[0-7]{4}\b)/g;

/**
 * Wrap values, frequencies and codes in already-rendered (escaped) HTML.
 * Only text between tags is touched, so links and markup stay intact.
 */
export function highlight(html,{code=null}={}){
  return html.split(/(<[^>]+>)/).map(part=>{
    if(part.startsWith('<'))return part;
    let out=part.replace(VALUE,'<span class="val">$1</span>').replace(FREQ,'<span class="val">$1</span>');
    if(code)out=out.replace(CODE,m=>m===code?`<span class="code">${m}</span>`:m);
    return out;
  }).join('');
}

// A document's own "Applies to:" line vs. the aircraft its catalog entry says it's for.
// e.g. a file catalogued as the C172S version whose text says "Applies to: C172R".
const MODEL=/\b([A-Z]{1,4}-?\d{2,4}[A-Z]{0,2})\b/g;
export function appliesToConflict(markdown,metadata={}){
  const line=String(markdown).match(/^\s*\**\s*Applies to\s*:?\s*\**\s*:?\s*(.+)$/im);
  const filed=(metadata.aircraft_models||[]).filter(m=>m&&m.trim()!=='*');
  if(!line||!filed.length)return null;
  const says=[...new Set([...line[1].replace(/\*\*/g,'').matchAll(MODEL)].map(m=>m[1]))];
  if(!says.length)return null;
  const glob=(p,v)=>new RegExp('^'+p.toUpperCase().split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(v);
  if(says.some(s=>filed.some(f=>glob(f,s))))return null;
  return {says,filed};
}

/** Document header lines like "**Owner:** …" / "**Revision:** 0.1" — shown folded in the cockpit. */
export const isFrontMatter=text=>/^\s*\*\*[^*]{1,32}:\*\*/.test(text)||/^\s*\*\*[^*]{1,32}\*\*\s*:/.test(text)||/^\s*-{3,}\s*$/.test(text);
