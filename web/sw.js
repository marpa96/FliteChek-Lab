const CACHE='flitechek-lab-1';
const FILES=['./resolver.js','./overlay.js','./demo.js','./smart.js','./diff.js','./navigation.js','./recovery.js','./links.js','./profile.js','./library-update.js','./catalog.js','./fuel.js','./startup.js','./update-entry.js','./theme.js','./','./index.html','./style.css','./app.js','./core.js','./checklists.json','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
FILES.push(...["./launch/320-568-2-portrait.png", "./launch/320-568-2-landscape.png", "./launch/375-667-2-portrait.png", "./launch/375-667-2-landscape.png", "./launch/414-736-3-portrait.png", "./launch/414-736-3-landscape.png", "./launch/375-812-3-portrait.png", "./launch/375-812-3-landscape.png", "./launch/390-844-3-portrait.png", "./launch/390-844-3-landscape.png", "./launch/393-852-3-portrait.png", "./launch/393-852-3-landscape.png", "./launch/402-874-3-portrait.png", "./launch/402-874-3-landscape.png", "./launch/414-896-2-portrait.png", "./launch/414-896-2-landscape.png", "./launch/414-896-3-portrait.png", "./launch/414-896-3-landscape.png", "./launch/428-926-3-portrait.png", "./launch/428-926-3-landscape.png", "./launch/430-932-3-portrait.png", "./launch/430-932-3-landscape.png", "./launch/440-956-3-portrait.png", "./launch/440-956-3-landscape.png", "./launch/420-912-3-portrait.png", "./launch/420-912-3-landscape.png"]);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(f=>new Request(f,{cache:'reload'}))))));
// New versions wait until all app windows close; never reload a running checklist.
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys()) if(key.startsWith('flitechek-')&&key!==CACHE) await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    // The installed launch URL contains an access query. Serve its local shell
    // immediately instead of waiting for an unreachable Mac to fail first.
    const url=new URL(event.request.url),base=new URL(self.registration.scope);
    const relative=url.pathname.slice(base.pathname.length);
    if(event.request.mode==='navigate' && ['','index.html','install'].includes(relative) && !url.searchParams.has('update')){
      const shell=await caches.match(new URL('./index.html',base).href);
      if(shell)return shell;
    }
    const cached=await caches.match(event.request);if(cached)return cached;try{return await fetch(event.request);}catch(error){if(event.request.mode==='navigate')return await caches.match('./index.html');throw error;}})());
});

// Activated only from the dedicated update page after an explicit tap.
self.addEventListener('message',event=>{if(event.data?.type==='APPLY_UPDATE')self.skipWaiting();});

self.addEventListener('message',event=>{if(event.data?.type==='GET_BUILD')event.ports[0]?.postMessage({build:'lab-1'});});
