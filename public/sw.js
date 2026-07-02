const CACHE = 'sharetto-v3';
const PRECACHE = [
  '/',
  '/index.html',
  '/upload.html',
  '/join.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

// アプリのコード（js/html/css）は常に最新を取りに行く（network-first）。
// それ以外（画像・アイコン等）はキャッシュ優先で高速化。
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isAppCode = url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css')
    || url.pathname.endsWith('.html')
    || url.pathname === '/';

  if (isAppCode) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, clone));
      }
      return response;
    })),
  );
});
