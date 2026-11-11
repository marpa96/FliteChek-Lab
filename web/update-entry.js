// Expose the updater even while an older app.js is still serving from cache.
const main=document.querySelector('#main');
function addUpdater(){
 const status=main.querySelector('#offline-status');
 if(!status||main.querySelector('[data-action="app-update"],#manual-app-update'))return;
 const button=document.createElement('button');button.id='manual-app-update';button.className='outline full';button.textContent='Check for app update';
 button.onclick=()=>{if(location.hostname.endsWith('github.io')){main.querySelector('[data-action="app-update"]')?.click();return;}const url=new URL('./install',location.href);url.search=location.search;url.searchParams.set('update','1');location.href=url.href;};
 status.parentElement.append(button);
}
new MutationObserver(addUpdater).observe(main,{childList:true,subtree:true});addUpdater();
