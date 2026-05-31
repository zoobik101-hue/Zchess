/* =============================================
   ZChess - Service Worker
   Provides offline support and caching
   ============================================= */

const CACHE_NAME = 'zchess-v1.0.0';
const STATIC_CACHE = 'zchess-static-v1';
const DYNAMIC_CACHE = 'zchess-dynamic-v1';

// Files to cache for offline use
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/main.css',
  '/css/chess.css',
  '/css/animations.css',
  '/js/config.js',
  '/js/i18n.js',
  '/js/settings.js',
  '/js/sound.js',
  '/js/notifications.js',
  '/js/particles.js',
  '/js/auth.js',
  '/js/chess-engine.js',
  '/js/ai-engine.js',
  '/js/chess-board.js',
  '/js/achievements.js',
  '/js/daily-tasks.js',
  '/js/profile.js',
  '/js/leaderboard.js',
  '/js/app.js',
  '/data/i18n/en.json',
  '/data/i18n/ru.json',
  '/data/i18n/uk.json'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    }).then(() => {
      console.log('[SW] All static assets cached');
      return self.skipWaiting();
    }).catch((err) => {
      console.error('[SW] Cache failed:', err);
    })
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Firebase and external requests
  if (url.origin !== self.location.origin) {
    // For external requests, just fetch from network
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // For navigation requests, serve index.html (SPA)
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(cached => {
        return cached || fetch('/index.html');
      }).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // Cache-first strategy for static assets
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset.split('/').pop()))) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 404 }));
      })
    );
    return;
  }

  // Network-first strategy for dynamic content
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then(cache => {
          cache.put(request, clone);
          // Keep dynamic cache bounded
          cache.keys().then(keys => {
            if (keys.length > 100) cache.delete(keys[0]);
          });
        });
      }
      return response;
    }).catch(() => {
      return caches.match(request).then(cached => {
        return cached || new Response(
          JSON.stringify({ error: 'offline', message: 'Content not available offline' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      });
    })
  );
});

// Background sync for game results
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-game-results') {
    event.waitUntil(syncGameResults());
  }
});

async function syncGameResults() {
  // Would sync pending game results to Firebase when online
  console.log('[SW] Syncing game results...');
}

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'You have a new notification from ZChess',
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-72.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open ZChess' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ZChess', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

console.log('[SW] Service Worker script loaded v1.0.0');
