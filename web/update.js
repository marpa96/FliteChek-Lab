const returnLink=document.querySelector('#return-app');if(returnLink){const url=new URL('./install',location.href);const access=new URL(location.href).searchParams.get('access');if(access)url.searchParams.set('access',access);returnLink.href=url.href;}
const button=document.querySelector('#apply'),status=document.querySelector('#status');
button.onclick=async()=>{
 button.disabled=true;status.textContent='Downloading and checking the update…';
 try{
  const releaseResponse=await fetch('./release.json?t='+Date.now(),{cache:'no-store'});
  if(!releaseResponse.ok)throw new Error('Cannot check the available update. Check your connection to the Mac.');
  const expected=(await releaseResponse.json()).build;
  const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
  await registration.update();
  const end=Date.now()+20000;
  while(registration.installing&&Date.now()<end)await new Promise(r=>setTimeout(r,200));
  if(registration.installing)throw new Error('Download is taking too long. Try again while connected.');
  if(registration.waiting){
   const waiting=registration.waiting;
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Update did not activate. Try again.')),15000);
    waiting.addEventListener('statechange',()=>{if(waiting.state==='activated'){clearTimeout(timer);resolve();}else if(waiting.state==='redundant'){clearTimeout(timer);reject(new Error('Update failed. Your existing data is intact.'));}});
    waiting.postMessage({type:'APPLY_UPDATE'});
   });
  }
  const installed=await new Promise((resolve,reject)=>{
    const channel=new MessageChannel();
    const timer=setTimeout(()=>reject(new Error('Could not confirm the new version. Your saved checklists are unchanged. Try applying again.')),5000);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data.build);};
    registration.active?.postMessage({type:'GET_BUILD'},[channel.port2]);
  });
  if(installed!==expected)throw new Error('The update did not activate. Expected build '+expected+', found '+installed+'. Try again.');
  const {loadSavedState}=await import('./recovery.js?build='+expected);
  loadSavedState();
  status.textContent='App updated. Downloading your latest GitHub checklists…';
  const {updateChecklists}=await import('./library-update.js?build='+expected);
  await updateChecklists();
  status.textContent='App and checklists updated. Opening FliteChek…';
  const url=new URL('./install',location.href);const access=new URL(location.href).searchParams.get('access');if(access)url.searchParams.set('access',access);
  location.replace(url.href);
 }catch(error){status.textContent=error.message;button.disabled=false;}
};
