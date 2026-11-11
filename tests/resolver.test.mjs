import test from 'node:test';import assert from 'node:assert/strict';
import {match,families,resolve,reason,flightFrom,signature} from '../web/resolver.js';
import {compose,parseOverlay} from '../web/overlay.js';

const any=['*'];
const meta=(m)=>({procedure:'pre-flight',aircraft_models:any,flight_rules:any,tail_numbers:any,airfields:any,...m});
let n=0;const cl=(m,md='- [ ] item '+(++n))=>({id:'c'+(++n),title:'Pre-Flight',emergency:false,metadata:meta(m),revisions:[{id:'r'+n,markdown:md}]});
const flight=flightFrom({id:'a1',tail:'n12345',model:'C172S',operator:'Blue Sky Aviation',equipment:['g1000']},{rules:'vfr',airfield:'ksee'});

test('the flight context is normalized from the hangar aircraft',()=>{
  assert.deepEqual(flight,{aircraftId:'a1',tail:'N12345',model:'C172S',operator:'BLUE SKY AVIATION',equipment:['G1000'],airfield:'KSEE',rules:'VFR',conditions:[]});
});

test('a type-specific version beats a generic one; a tail-specific beats both',()=>{
  const generic=cl({}),c172s=cl({aircraft_models:['C172S']}),c172r=cl({aircraft_models:['C172R']}),tail=cl({tail_numbers:['N12345']});
  let fam=families([generic,c172s,c172r])[0];
  let r=resolve(fam,flight);assert.equal(r.status,'resolved');assert.equal(r.version.checklist,c172s);assert.equal(reason(r.version),'C172S');
  fam=families([generic,c172s,tail])[0];
  assert.equal(resolve(fam,flight).version.checklist,tail);
  assert.equal(reason(resolve(families([generic])[0],flight).version),'Generic — any aircraft');
});

test('wildcard types like C172* match, but rank below an exact type',()=>{
  const wild=cl({aircraft_models:['C172*']}),exact=cl({aircraft_models:['C172S']});
  assert.equal(resolve(families([wild,exact])[0],flight).version.checklist,exact);
  assert.equal(resolve(families([wild])[0],flight).status,'resolved');
});

test('never guesses: unset rules → needs; nothing for this type → none',()=>{
  const vfr=cl({aircraft_models:['C172S'],flight_rules:['VFR']}),ifr=cl({aircraft_models:['C172S'],flight_rules:['IFR']});
  const noRules={...flight,rules:null};
  const r=resolve(families([vfr,ifr])[0],noRules);
  assert.equal(r.status,'needs');assert.deepEqual(r.missing.map(d=>d.key),['flight_rules']);
  const pa28=cl({aircraft_models:['PA-28']});
  assert.equal(resolve(families([pa28])[0],flight).status,'none');
  // An airport-specific version never applies when no airport is set.
  const ksee=cl({airfields:['KSEE']});
  assert.equal(resolve(families([ksee])[0],{...flight,airfield:null}).status,'needs');
});

test('two equally specific, different versions are flagged, and the pilot can choose',()=>{
  const a=cl({aircraft_models:['C172S']},'- [ ] a'),b=cl({aircraft_models:['C172S']},'- [ ] b');
  const fam=families([a,b])[0];
  const r=resolve(fam,flight);assert.equal(r.status,'ambiguous');assert.equal(r.candidates.length,2);
  const chosen=resolve(fam,flight,b.id);assert.equal(chosen.status,'resolved');assert.equal(chosen.version.checklist,b);assert.ok(chosen.pilotChoice);
});

test('equipment and conditions must all be present',()=>{
  const g1000=cl({equipment:['G1000']}),night=cl({conditions:['NIGHT']});
  assert.ok(match(g1000.metadata,flight).applies);
  assert.equal(match(night.metadata,flight).applies,false);
  assert.ok(match(night.metadata,{...flight,conditions:['NIGHT']}).applies);
});

test('overlays all apply, most general first, and only when they match',()=>{
  const base=cl({aircraft_models:['C172S']});
  const school={...cl({operators:['BLUE SKY AVIATION']}),metadata:{...meta({operators:['BLUE SKY AVIATION']}),extends:'pre-flight',procedure:'school'}};
  const tail={...cl({tail_numbers:['N12345']}),metadata:{...meta({tail_numbers:['N12345']}),extends:'pre-flight',procedure:'tail'}};
  const other={...cl({tail_numbers:['N999']}),metadata:{...meta({tail_numbers:['N999']}),extends:'pre-flight',procedure:'other'}};
  const fam=families([tail,base,school,other])[0];
  assert.equal(fam.overlays.length,3);
  const r=resolve(fam,flight);
  assert.deepEqual(r.overlays.map(o=>o.checklist),[school,tail]);
  assert.notEqual(signature(flight,r.version,r.overlays),signature({...flight,tail:'N999'},r.version,r.overlays));
});

const BASE=`# Pre-Flight
## CABIN
- [ ] **Pitot Tube Cover** -- REMOVE.
- [ ] Master Switch -- ON.
  - [ ] Sub-step under master
- [ ] Fuel Selector Valve -- SET BOTH.
## EMPENNAGE
- [ ] Rudder Gust Lock -- REMOVE.`;

test('overlay operations: after, before, replace, remove (with sub-items), end of section',()=>{
  const md=`# School changes
<!-- flitechek-id: 000900 -->
## After: Fuel Selector Valve
- [ ] School item A
## Before: pitot tube cover
- [ ] School item B
## Replace: Rudder Gust Lock
- [ ] Rudder Gust Lock -- REMOVE and STOW in bag.
## Remove: Master Switch
## End of: CABIN
> [!NOTE]
> School note`;
  assert.equal(parseOverlay(md).length,5);
  const r=compose(BASE,[{markdown:md,label:'Blue Sky'}]);
  assert.deepEqual(r.errors,[]);
  assert.equal(r.markdown,`# Pre-Flight
## CABIN
- [ ] School item B
- [ ] **Pitot Tube Cover** -- REMOVE.
- [ ] Fuel Selector Valve -- SET BOTH.
- [ ] School item A
> [!NOTE]
> School note
## EMPENNAGE
- [ ] Rudder Gust Lock -- REMOVE and STOW in bag.`);
  assert.deepEqual(Object.values(r.origins),['Blue Sky','Blue Sky','Blue Sky','Blue Sky','Blue Sky']);
  assert.equal(r.origins[2],'Blue Sky');assert.equal(r.origins[3],undefined);
  assert.equal(r.changes.length,5);
});

test('a later overlay can target an item an earlier overlay added',()=>{
  const r=compose(BASE,[{markdown:'## After: Fuel Selector\n- [ ] School fuel step',label:'School'},{markdown:'## After: School fuel step\n- [ ] Tail fuel step',label:'N12345'}]);
  assert.deepEqual(r.errors,[]);
  assert.match(r.markdown,/School fuel step\n- \[ \] Tail fuel step/);
});

test('a change whose target matches zero or several items is rejected, never guessed',()=>{
  const r=compose(BASE,[{markdown:'## After: Nonexistent thing\n- [ ] x\n## Remove: - [ ]\n## After: R\n- [ ] y',label:'Bad'}]);
  assert.equal(r.errors.length,3);
  assert.match(r.errors[0],/matches 0 items/);
  assert.equal(r.markdown,BASE,'nothing changes when every operation fails');
});

import {parseCatalog} from '../src/catalog.js';
test('the catalog accepts optional operators / equipment / conditions / extends, and checks extends',()=>{
  const entry=(id,extra='')=>`  - id: "${id}"\n    title: Pre-Flight\n    procedure: ${extra.includes('extends')?'pf-school':'pre-flight'}\n    category: normal\n    aircraft_models: ["*"]\n    flight_rules: ["*"]\n    tail_numbers: ["*"]\n    airfields: ["*"]\n    pilot: null\n    description: null\n    sequence: 1\n    revision: 1\n${extra}`;
  const ok=parseCatalog(`schema_version: 1\nchecklists:\n${entry('000001')}${entry('000002','    operators: ["Blue Sky"]\n    extends: pre-flight\n')}`);
  assert.equal(ok.checklists[1].extends,'pre-flight');
  assert.throws(()=>parseCatalog(`schema_version: 1\nchecklists:\n${entry('000002','    extends: missing\n')}`),/no base checklist/);
  assert.throws(()=>parseCatalog(`schema_version: 1\nchecklists:\n${entry('000001','    operators: Blue Sky\n')}`),/operators must be a list/);
});
