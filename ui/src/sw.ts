/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute } from 'workbox-precaching';

// Let Workbox handle precaching of build assets (auto-generated manifest)
precacheAndRoute(self.__WB_MANIFEST);

// Dynamic cache for runtime requests
const DYNAMIC_CACHE = 'vaporforge-dynamic';
const MAX_DYNAMIC_ITEMS = 50;

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
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, responseToCache));
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match('/app') ?? await caches.match(request);
          return cached ?? new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // All other requests: cache-first with network fallback
  // (Workbox precache handles hashed build assets; this covers runtime requests)
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
            statusText: 'Request Timeout',
          });
        });
    })
  );
});

// Helper: Limit cache size (batch delete for efficiency)
function limitCacheSize(cacheName: string, maxItems: number) {
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
