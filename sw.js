// Offline cache for the Trainer app shell. Bump VERSION whenever a file below changes.
const VERSION = 'trainer-v3.27';
const FILES = ['./', './index.html', './data.js', './app.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache so a new version never stores stale files.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('trainer-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first for the page (so updates arrive), cache first for everything else.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Council, MASSA, Life RPG, Shredded System, Shredded Trainer and Gym & Fuel live in their own folders with their own workers; never cache their pages as Trainer's.
  const path = new URL(req.url).pathname;
  if (path.includes('/council/') || path.includes('/massa/') || path.includes('/liferpg/') || path.includes('/shredded-system/') || path.includes('/shredded-trainer/') || path.includes('/gym-fuel/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
