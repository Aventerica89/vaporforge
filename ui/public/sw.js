// VaporForge Service Worker
// Offline-first PWA support with intelligent caching

const CACHE_VERSION = 'vaporforge-v25';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const MAX_DYNAMIC_ITEMS = 50;

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/app',
  '/app/index.html',
  '/app/manifest.json',
  '/app/icon.svg',
  '/app/icon-192.png',
  '/app/icon-512.png',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map((key) => {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim()) // Take control immediately
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip non-http(s) schemes (chrome-extension://, etc.)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Skip API calls and websockets
  if (url.pathname.startsWith('/api/') || url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Navigation requests (HTML): network-first so deploys take effect immediately
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const responseToCache = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, responseToCache));
          return networkResponse;
        })
        .catch(() => caches.match('/app') || caches.match(request))
    );
    return;
  }

  // Hashed assets (Vite fingerprinted): cache-first (immutable by hash)
  // All other requests: cache-first with network fallback
  event.respondWith(
    caches.match(request).then((cacheResponse) => {
      if (cacheResponse) {
        return cacheResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseToCache);
            limitCacheSize(DYNAMIC_CACHE, MAX_DYNAMIC_ITEMS);
          });

          return networkResponse;
        })
        .catch(() => {
          return new Response('Network error', {
            status: 408,
            statusText: 'Request Timeout'
          });
        });
    })
  );
});

// Helper: Limit cache size (batch delete for efficiency)
function limitCacheSize(cacheName, maxItems) {
  caches.open(cacheName).then((cache) => {
    cache.keys().then((keys) => {
      if (keys.length > maxItems) {
        const keysToDelete = keys.slice(0, keys.length - maxItems);
        Promise.all(keysToDelete.map((key) => cache.delete(key)));
      }
    });
  });
}

// Listen for messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => caches.delete(key)));
      })
    );
  }
});
