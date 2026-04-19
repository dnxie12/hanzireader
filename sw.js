const CACHE_NAME = 'hanzi-reader-v107';
const AUDIO_CACHE = 'hanzi-audio-v1';
const ASSETS = [
  './',
  './index.html',
  './privacy.html',
  './css/styles.css',
  './js/app.js',
  './js/storage.js',
  './js/data.js',
  './js/ui.js',
  './js/audio.js',
  './js/vendor/fsrs.umd.js',
  './js/srs.js',
  './js/analytics.js',
  './js/sync.js',
  './js/badges.js',
  './js/home.js',
  './js/read.js',
  './js/study.js',
  './js/browse.js',
  './js/stats.js',
  './js/placement.js',
  './js/theme-init.js',
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
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== AUDIO_CACHE)
        .map(k => caches.delete(k))
      )
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
    url.hostname === 'cloud.umami.is' ||
    url.hostname === 'api-gateway.umami.dev' ||
    url.hostname.endsWith('.firebaseapp.com')) {
    return;
  }
  // Runtime-cache audio files in a persistent cache (survives app updates)
  if (url.pathname.match(/\/audio\/.*\.mp3$/)) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(resp => {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          });
        })
      )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
