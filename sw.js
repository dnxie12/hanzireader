const CACHE_NAME = 'hanzi-reader-v53';
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
  './js/sync.js',
  './js/home.js',
  './js/read.js',
  './js/study.js',
  './js/browse.js',
  './js/stats.js',
  './js/placement.js',
  './js/sw-register.js',
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
  const url = new URL(e.request.url);
  // Don't cache Firebase/Google API requests
  if (url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname === 'accounts.google.com' ||
    url.hostname.endsWith('.firebaseapp.com')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
