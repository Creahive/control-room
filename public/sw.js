/* CMD service worker. Only for installability and an offline notice:
   - caches ONLY the public, data-free files below (icons, favicon, manifest, offline page);
   - page loads go to the network every time; the cached offline page shows only when the network fails;
   - everything else (/api/, the live stream, the terminal, the app's own code behind sign-in) is never
     touched here: no respondWith, so the browser fetches it normally with no cache. */
const CACHE = 'cmd-shell-v1';
const SHELL = ['/offline.html', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).catch(() => caches.match('/offline.html')));
    return;
  }
  if (SHELL.includes(u.pathname)) e.respondWith(fetch(r).catch(() => caches.match(u.pathname)));
});
