/* =============================================
   ZChess - Service Worker
   Strategy: Network-first (fresh files always load when online)
   Auto-reload when new version detected
   ============================================= */

const CACHE_VERSION = 'zchess-113293059522042';
const STATIC_CACHE = `zchess-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `zchess-dynamic-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/Zchess/',
  '/Zchess/index.html',
  '/Zchess/manifest.json',
  '/Zchess/css/main.css',
  '/Zchess/css/chess.css',
  '/Zchess/css/mobile.css',
  '/Zchess/css/game-setup.css',
  '/Zchess/css/arena-premium.css',
  '/Zchess/css/chess-decor.css',
  '/Zchess/css/theme-arena.css',
  '/Zchess/css/animations.css',
  '/Zchess/assets/icon.svg',
  '/Zchess/js/config.js',
  '/Zchess/js/i18n.js',
  '/Zchess/js/settings.js',
  '/Zchess/js/sound.js',
  '/Zchess/js/notifications.js',
  '/Zchess/js/particles.js',
  '/Zchess/js/auth.js',
  '/Zchess/js/chess-engine.js',
  '/Zchess/js/ai-engine.js',
  '/Zchess/js/chess-board.js',
  '/Zchess/js/achievements.js',
  '/Zchess/js/daily-tasks.js',
  '/Zchess/js/profile.js',
  '/Zchess/js/leaderboard.js',
  '/Zchess/js/multiplayer.js',
  '/Zchess/js/training.js',
  '/Zchess/js/pwa-install.js',
  '/Zchess/js/game-review.js',
  '/Zchess/js/game-replay.js',
  '/Zchess/js/user-display.js',
  '/Zchess/js/public-profile.js',
  '/Zchess/js/presence.js',
  '/Zchess/css/public-profile.css',
  '/Zchess/css/online-lounge.css',
  '/Zchess/css/game-replay.css',
  '/Zchess/js/game-setup-page.js',
  '/Zchess/js/app.js',
  '/Zchess/assets/og-image.svg',
  '/Zchess/assets/Image/background.png',
  '/Zchess/assets/Image/Bot_ai.png',
  '/Zchess/assets/Image/Swords.png',
  '/Zchess/assets/Image/Book.png',
  '/Zchess/assets/Image/Start_game.png',
  '/Zchess/data/i18n/en.json',
  '/Zchess/data/i18n/ru.json',
  '/Zchess/data/i18n/uk.json'
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(new Request(url, { cache: 'no-store' })))
      );
    }).then(() => {
      console.log('[SW] Static assets cached');
      return self.skipWaiting();
    }).catch((err) => {
      console.error('[SW] Cache install error:', err);
      return self.skipWaiting();
    })
  );
});

// Activate: remove old caches, claim clients, notify page to reload
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      // Notify all open pages: new version available - reload
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
        });
      });
    })
  );
});

// Fetch: NETWORK-FIRST strategy
// Always try to get fresh files from network.
// Fall back to cache only when offline.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Skip external requests (Firebase, CDN, etc.)
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // version.json and i18n - always network, never cache
  if (url.pathname.endsWith('version.json') || url.pathname.includes('/data/i18n/')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() =>
        caches.match(request)
      )
    );
    return;
  }

  // For all other requests: network-first, cache as fallback
  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then(cached => {
          if (cached) return cached;
          // For navigation, return cached index.html
          if (request.mode === 'navigate') {
            return caches.match('/Zchess/index.html');
          }
          return new Response('', { status: 503 });
        });
      })
  );
});

// Listen for SKIP_WAITING command from page
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log(`[SW] ZChess Service Worker loaded - cache: ${CACHE_VERSION}`);
