// Runs before styles load so reopening at night never flashes a bright frame.
// Display modes: Day, Night (true red on black, preserves night vision), Sun (maximum
// contrast for direct sunlight). Auto = Day 06:00–18:00, Night otherwise.
// Text size is separate and applies to every mode.
(() => {
  const key='flitechek.theme.v1',sizeKey='flitechek.textsize.v1';
  const modes=['auto','day','night','sun'],sizes=['m','l','xl'];
  let preference='auto',size='m';
  try { preference=localStorage.getItem(key)||'auto'; size=localStorage.getItem(sizeKey)||'m'; } catch {}
  if(!modes.includes(preference))preference='auto';
  if(!sizes.includes(size))size='m';
  const colors={day:'#f4f6f8',night:'#000000',sun:'#ffffff'};
  function apply(){
    const hour=new Date().getHours();
    const theme=preference==='auto'?(hour>=18||hour<6?'night':'day'):preference;
    document.documentElement.dataset.theme=theme;
    document.documentElement.dataset.size=size;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',colors[theme]);
  }
  window.fliteTheme={
    get preference(){return preference;},get size(){return size;},
    set(value){if(!modes.includes(value))return;localStorage.setItem(key,value);preference=value;apply();},
    setSize(value){if(!sizes.includes(value))return;localStorage.setItem(sizeKey,value);size=value;apply();},
  };
  // Follow local time on launch/resume, never mid-checklist.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&preference==='auto')apply();});
  apply();
})();
