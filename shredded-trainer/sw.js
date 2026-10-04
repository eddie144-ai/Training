// Offline cache for the Shredded Trainer app shell. Bump VERSION whenever a file below changes.
// Network first for every same-origin file, so a deploy is picked up on the next online load and a missed
// VERSION bump can't leave anyone on an old shell; the cache is only the offline fallback.
// Open Food Facts lookups (another origin) are never touched.
const VERSION = 'shtrainer-v1.0';
const FILES = ['./', './index.html', './data.js', './photos.js', './scan.js', './reminders.js', './app.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shtrainer-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req.mode === 'navigate' ? './index.html' : req, copy)); }
        return res;
      })
      .catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req).then((hit) => hit || caches.match(req, { ignoreSearch: true }))),
  );
});
