// Offline: apenas o shell visual. Gravação e consulta exigem internet.
const CACHE = 'hidrocondo-shell-v0.4.0';
const STATIC = ['./','./index.html','./styles.css','./app.js','./math.js','./analysis.js','./historical.js','./permissions.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // Nunca guardar login, API, fotos privadas nem URLs assinadas.
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
