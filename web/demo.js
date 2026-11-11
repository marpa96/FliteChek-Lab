// Try-out data for the rethink branch: two hangar aircraft and two "changes" files that layer
// onto your real C172S Pre-Flight Inspection. Every demo line is tagged [DEMO] and contains no
// procedural content. "Remove demo data" in the Hangar deletes all of it.
const now=new Date().toISOString();
const doc=(id,title,metadata,markdown)=>({id,title,variant:'Demo',emergency:metadata.category==='emergency',demo:true,metadata:{demo:true,aircraft_models:['*'],flight_rules:['*'],tail_numbers:['*'],airfields:['*'],sequence:null,...metadata},revisions:[{id:id+'-r1',date:now,markdown}]});

export const DEMO_AIRCRAFT=[
  {id:'demo-n123dm',tail:'N123DM',model:'C172S',operator:'Demo Flight School',equipment:['G1000'],demo:true},
  {id:'demo-n456dm',tail:'N456DM',model:'C172R',operator:'Demo Flight School',equipment:[],demo:true},
];

export const DEMO_CHECKLISTS=[
  doc('demo-school-preflight','Pre-Flight Inspection — Demo Flight School changes',
    {procedure:'demo-school-preflight',extends:'pre-flight-inspection',operators:['Demo Flight School'],aircraft_models:['C172S'],category:'normal'},
`# Demo Flight School changes
## After: Fuel Selector Valve
- [ ] [DEMO] School-added item appears right after Fuel Selector Valve — placeholder, not a procedure
## End of: CABIN
> [!NOTE]
> [DEMO] A school note added at the end of CABIN. Placeholder text only.
`),
  doc('demo-tail-preflight','Pre-Flight Inspection — N123DM changes',
    {procedure:'demo-tail-preflight',extends:'pre-flight-inspection',tail_numbers:['N123DM'],category:'normal'},
`# N123DM changes
## Before: Pitot Tube Cover
- [ ] [DEMO] Only shown when flying N123DM — placeholder, not a procedure
`),
  doc('demo-memory-layout','Memory-item layout demo',
    {procedure:'demo-memory-layout',category:'emergency',description:'Shows how memory items are displayed. Placeholder text only.'},
`# Memory-item layout demo

> [!CAUTION]
> [DEMO] Placeholder only. Not an emergency procedure.

## Memory items
- [ ] [DEMO] FIRST MEMORY ITEM — placeholder
- [ ] [DEMO] SECOND MEMORY ITEM — placeholder
- [ ] [DEMO] THIRD MEMORY ITEM — placeholder

## Follow-up
- [ ] [DEMO] Follow-up item shown at normal size — placeholder
- [ ] [DEMO] Another follow-up item — placeholder
`),
];

export function addDemo(state){
  state.hangar??=[];
  for(const a of DEMO_AIRCRAFT)if(!state.hangar.some(h=>h.id===a.id))state.hangar.push(structuredClone(a));
  for(const c of DEMO_CHECKLISTS)if(!state.checklists.some(x=>x.id===c.id))state.checklists.push(structuredClone(c));
}
export function removeDemo(state){
  const demoIds=new Set(state.checklists.filter(c=>c.demo).map(c=>c.id));
  state.checklists=state.checklists.filter(c=>!c.demo);
  for(const id of demoIds){delete state.runs[id];if(state.active===id)state.active=null;if(state.returnTo===id)state.returnTo=null;}
  state.hangar=(state.hangar||[]).filter(a=>!a.demo);
  if(state.flight&&!state.hangar.some(a=>a.id===state.flight.aircraftId))state.flight=null;
}
export const hasDemo=state=>state.checklists.some(c=>c.demo)||(state.hangar||[]).some(a=>a.demo);
