const CACHE_NAME = 'weather-static-v1';
const OFFLINE_URL = '/';
const assets = ['/', '/static/app.js', '/templates/index.html'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(assets)));
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(resp => resp || fetch(event.request)));
});
