const CACHE_NAME = 'hanzi-reader-v8';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/storage.js',
  './js/data.js',
  './js/ui.js',
  './js/vendor/fsrs.umd.js',
  './js/srs.js',
  './js/home.js',
  './js/read.js',
  './js/study.js',
  './js/browse.js',
  './js/stats.js',
  './js/placement.js',
  './data/char_data.js',
  './data/snippets.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
