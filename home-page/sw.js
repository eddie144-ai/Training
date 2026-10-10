// Offline cache for the Shredded Trainer app shell. Bump VERSION whenever a file below changes.
// Network first for every same-origin file, so a deploy is picked up on the next online load and a missed
// VERSION bump can't leave anyone on an old shell; the cache is only the offline fallback.
// Open Food Facts lookups (another origin) are never touched; the background photo is cached.
const VERSION = 'v1.12';
// One origin, two copies (the site root and /Training/shredded-trainer/): each keeps its own cache.
const ROOT = !self.registration.scope.includes('/Training/');
const PREFIX = ROOT ? 'ironeggs-' : 'shtrainer-';
const CACHE = PREFIX + VERSION;
// The background photo lives on Wikimedia Commons; it's cached on first view so it works offline.
const PHOTO = 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Vince_Gironda_Tomorrows_Man_v1_n5_1953.jpg';
const FILES = ['./', './index.html', './data.js', './photos.js', './scan.js', './reminders.js', './app.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/logo-mark.png', './icons/logo.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ((k.startsWith(PREFIX) && k !== CACHE) || (ROOT && k.startsWith('hq-')))).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method === 'GET' && req.url === PHOTO) {
    e.respondWith(caches.match(PHOTO).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(PHOTO, copy)); return res; })));
    return;
  }
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Served at the site root (Iron & Eggs), this worker's scope covers /Training/ too: leave those apps to their own workers.
  if (ROOT && new URL(req.url).pathname.startsWith('/Training/')) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? './index.html' : req, copy)); }
        return res;
      })
      .catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req).then((hit) => hit || caches.match(req, { ignoreSearch: true }))),
  );
});
