const VERSION = Date.now(); // Dynamic version based on timestamp
const CACHE_NAME = `arcai-v${VERSION}`;
const urlsToCache = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // For HTML files, always check network first
        if (event.request.destination === 'document' || event.request.url.endsWith('.html')) {
          return fetch(event.request)
            .then((networkResponse) => {
              // Update cache with fresh content
              if (networkResponse.ok) {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, responseClone));
              }
              return networkResponse;
            })
            .catch(() => response); // Fallback to cache if network fails
        }
        
        // For other resources, use stale-while-revalidate
        if (response) {
          // Serve from cache immediately
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, responseClone));
              }
            })
            .catch(() => {}); // Ignore network errors for background updates
          return response;
        }
        
        // Not in cache, fetch from network
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete all old caches except current one
          if (cacheName.startsWith('arcai-v') && cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});