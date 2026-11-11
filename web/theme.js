// Run before styles load to avoid a light first frame when reopening at night.
(() => {
  const key='flitechek.theme.v1';
  let preference='auto';
  try { preference=localStorage.getItem(key)||'auto'; } catch {}
  if(!['auto','day','night'].includes(preference))preference='auto';
  function apply(){
    const hour=new Date().getHours();
    const night=preference==='night'||(preference==='auto'&&(hour>=18||hour<6));
    document.documentElement.dataset.theme=night?'night':'day';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',night?'#080303':'#f6f8f7');
  }
  window.fliteTheme={get preference(){return preference;},set(value){
    if(!['auto','day','night'].includes(value))return;
    localStorage.setItem(key,value);preference=value;apply();
  }};
  // Follow local time on launch/resume, without timed changes while using a checklist.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&preference==='auto')apply();});
  apply();
})();
