/* Only the app shell is cached. Personal records stay in local storage. */
const PREFIX = 'housekeeping-pwa-' + encodeURIComponent(new URL(self.registration.scope).pathname) + '-';
const CACHE = PREFIX + '__PWA_VERSION__';
const SHELL = ['./', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './icon.png'];
self.addEventListener('install', event => {
  // A failed download must leave the previous version intact.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(url => new Request(new URL(url, self.registration.scope), { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'APPLY_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') return (await cache.match(new URL('./index.html', self.registration.scope))) || fetch(event.request);
    return (await cache.match(event.request)) || fetch(event.request);
  })());
});
