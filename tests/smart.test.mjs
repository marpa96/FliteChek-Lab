import test from 'node:test';import assert from 'node:assert/strict';
import {challengeResponse as cr,waitSeconds,squawk,hasBlank,highlight} from '../web/smart.js';
import {diff,summary} from '../web/diff.js';

test('challenge / response is read from how items are written',()=>{
  assert.deepEqual(cr('Master Switch -- OFF.'),{challenge:'Master Switch',response:'OFF'});
  assert.deepEqual(cr('**Exterior Lights** — Set'),{challenge:'**Exterior Lights**',response:'Set'});
  assert.deepEqual(cr('Earplugs → In Pocket'),{challenge:'Earplugs',response:'In Pocket'});
  assert.deepEqual(cr('**Autopilot** - **OFF**'),{challenge:'**Autopilot**',response:'**OFF**'});
  assert.deepEqual(cr('**Transponder - SET 7600**'),{challenge:'Transponder',response:'SET 7600'});
  assert.deepEqual(cr('**Power** - **2100 - 2700 RPM**'),{challenge:'**Power**',response:'**2100 - 2700 RPM**'});
  assert.deepEqual(cr('Wing **Flaps** - AS DESIRED (**Vs1 - 110 KIAS**)'),{challenge:'Wing **Flaps**',response:'AS DESIRED (**Vs1 - 110 KIAS**)'});
  assert.equal(cr('Government ID'),null);
  assert.equal(cr('Ask for new frequency'),null);
  assert.equal(cr('Climb 2100 - 2700'),null,'a numeric range is not a separator');
});

test('waits, codes and blanks',()=>{
  assert.equal(waitSeconds('Pitot Heat -- ON. (check warm to touch within 30 seconds.)'),30);
  assert.equal(waitSeconds('until stable fuel flow (usually 3 to 5 seconds)'),5);
  assert.equal(waitSeconds('Let it run 2 minutes'),120);
  assert.equal(waitSeconds('Set Alarm 1 Hr Prior'),null);
  assert.equal(waitSeconds('Wait 1 second'),null,'too short to be worth a timer');
  assert.equal(squawk('**Transponder - SET 7600**'),'7600');
  assert.equal(squawk('Set 7600'),null,'only when the item is about the transponder');
  assert.equal(squawk('Transponder - SET 7800'),null,'not a valid octal code');
  assert.ok(hasBlank('Record the value: `_____`'));assert.ok(!hasBlank('Check'));
});

test('values, frequencies and codes are highlighted without breaking markup',()=>{
  assert.equal(highlight('Power 2100 - 2700 RPM'),'Power <span class="val">2100 - 2700 RPM</span>');
  assert.equal(highlight('GUARD (121.5 MHz) - call'),'GUARD (<span class="val">121.5 MHz</span>) - call');
  assert.equal(highlight('Set 118.3 active'),'Set <span class="val">118.3</span> active');
  assert.equal(highlight('<a href="x/120KIAS">at 65 KIAS</a>'),'<a href="x/120KIAS">at <span class="val">65 KIAS</span></a>');
  assert.equal(highlight('SET 7600',{code:'7600'}),'SET <span class="code">7600</span>');
  assert.equal(highlight('Pens x 3'),'Pens x 3');
});

test('diff shows what one version adds and removes',()=>{
  const a=`## CABIN\n- [ ] Master -- ON\n- [ ] Fuel -- BOTH\n- [ ] Lights -- ON`;
  const b=`## CABIN\n- [ ] School item\n- [ ] Master -- ON\n- [ ] Fuel -- BOTH\n- [ ] **Lights** -- ON.`;
  const d=diff(a,b);
  assert.deepEqual(d.map(x=>x.type),['same','add','same','same','same'],'formatting-only differences count as the same item');
  const c=diff(a,`## CABIN\n- [ ] Master -- ON\n- [ ] Lights -- ON\n- [ ] Extra`);
  assert.deepEqual(summary(c),{added:1,removed:1,moved:0,same:2});
  const moved=diff(a,`## CABIN\n- [ ] Fuel -- BOTH\n- [ ] Master -- ON\n- [ ] Lights -- ON`);
  assert.deepEqual(summary(moved),{added:0,removed:0,moved:1,same:2},'reordering is a move, not an add + remove');
});

import {appliesToConflict,isFrontMatter} from '../web/smart.js';
test('a document whose own "Applies to" disagrees with its catalog entry is caught',()=>{
  const doc='# Pre-Flight\n**Applies to:** C172R, VFR\n- [ ] x';
  assert.deepEqual(appliesToConflict(doc,{aircraft_models:['C172S']}),{says:['C172R'],filed:['C172S']});
  assert.equal(appliesToConflict(doc,{aircraft_models:['C172R','C172S']}),null);
  assert.equal(appliesToConflict(doc,{aircraft_models:['C172*']}),null,'wildcards match');
  assert.equal(appliesToConflict('**Applies to:** ASEL VFR',{aircraft_models:['C172S']}),null,'no model named → nothing to compare');
  assert.equal(appliesToConflict(doc,{aircraft_models:['*']}),null);
  assert.equal(appliesToConflict('- [ ] x',{aircraft_models:['C172S']}),null);
});
test('front matter lines are recognized',()=>{
  for(const t of ['**Owner:** Pablo','**Revision:** 0.1  ','**Source of truth:** [POH](x)','---'])assert.ok(isFrontMatter(t),t);
  for(const t of ['**Autopilot** - **OFF**','Normal text','**Transponder - SET 7600**'])assert.ok(!isFrontMatter(t),t);
});
