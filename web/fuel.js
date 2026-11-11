// Deliberately small calculator registry: Markdown cannot execute scripts.
export const FUEL_LINK='[Calculate fuel endurance](flitechek:calculator/fuel)';
export function fuelEndurance(fuel,burn){
 const number=value=>typeof value==='number'?value:typeof value==='string'&&/^\d+(?:\.\d*)?$/.test(value.trim())?Number(value):NaN;
 fuel=number(fuel);burn=number(burn);
 if(!Number.isFinite(fuel)||fuel<0)throw new Error('Enter usable fuel as zero or a positive number.');
 if(!Number.isFinite(burn)||burn<=0)throw new Error('Enter a fuel burn greater than zero.');
 const minutes=Math.floor((fuel/burn)*60+1e-9);
 if(!Number.isSafeInteger(minutes))throw new Error('These values are too large to calculate. Check the inputs.');
 return {fuel,burn,minutes};
}
export function duration(minutes){return `${Math.floor(minutes/60)} hr ${minutes%60} min`;}
export function fuelText(text,result){
 const empty={'fuel.amount':'usable fuel not entered','fuel.burn':'fuel burn not entered','fuel.endurance':'endurance not calculated'};
 let values=empty;
 if(result){try{const computed=fuelEndurance(result.fuel,result.burn);if(!['US gal','L'].includes(result.unit))throw Error();values={'fuel.amount':`${computed.fuel} ${result.unit}`,'fuel.burn':`${computed.burn} ${result.unit}/hr`,'fuel.endurance':duration(computed.minutes)};}catch{}}
 return text.replace(/\{\{(fuel\.(?:amount|burn|endurance))\}\}/g,(_,key)=>values[key]);
}
export function applyFuel(run,values){
 const result={...fuelEndurance(values.fuel,values.burn),unit:values.unit};
 if(!['US gal','L'].includes(result.unit))throw new Error('Choose US gallons or liters.');
 run.calculators??={};run.calculators.fuel={...result,calculatedAt:new Date().toISOString()};
 // Numerical changes require a fresh review of dependent checklist steps.
 run.markdown.split('\n').forEach((line,index)=>{if(line.includes('{{fuel.')||line.includes(FUEL_LINK))delete run.states[index];});
}
