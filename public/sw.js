// Service Worker: macht TECHNO//VIZ installierbar und offline nutzbar.
// Gehashte Build-Dateien und Schriften kommen aus dem Cache, alles andere zuerst aus dem Netz.
const CACHE = 'tvm-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') return;
  const immutable = url.pathname.includes('/assets/') || url.hostname.startsWith('fonts.g');
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (immutable) {
        const hit = await cache.match(req);
        if (hit) return hit;
      }
      try {
        const res = await fetch(req);
        // ponytail: alte gehashte Assets bleiben im Cache liegen; bei Bedarf CACHE-Version hochzählen
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = (await cache.match(req)) || (req.mode === 'navigate' ? await cache.match('./') : undefined);
        if (hit) return hit;
        throw err;
      }
    })(),
  );
});
