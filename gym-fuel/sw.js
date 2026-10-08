// Offline cache for the Gym & Fuel app shell. Bump VERSION whenever a file below changes.
// Network first for every same-origin file, so a deploy is picked up on the next online load; the cache is
// only the offline fallback. Open Food Facts lookups (another origin) are never touched.
const VERSION = 'gymfuel-v1.9';
const FILES = ['./', './index.html', './data.js', './scan.js', './photos.js', './foodai.js', './share.js', './app.js', './exercises.json', './bg.jpg', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gymfuel-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The barcode scanner for browsers without one (barcode-detector + zxing-wasm on jsDelivr, pinned versions):
// cache first, so scanning works offline once it has loaded.
const SCANNER = /^https:\/\/(cdn|fastly)\.jsdelivr\.net\/npm\/(barcode-detector|zxing-wasm)@/;
// Exercise pictures (free-exercise-db on GitHub): cache first too, so a how-to you've opened works offline.
const EX_IMAGES = /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\//;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method === 'GET' && (SCANNER.test(req.url) || EX_IMAGES.test(req.url))) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })));
    return;
  }
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
