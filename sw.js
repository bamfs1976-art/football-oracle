// Football Oracle — Service Worker v3
// Strategy:
//   App shell (HTML): cache-first for instant load, then update in background
//   manifest/sw: network-first to pick up updates
//   API calls (netlify functions): network-only, never cached
//   Offline fallback: served from cache when network unavailable

const CACHE_NAME    = 'football-oracle-v3';
const SHELL_ASSETS  = ['/', '/index.html', '/manifest.json'];

// ── Install: pre-cache app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(SHELL_ASSETS).catch(e => console.warn('[SW] Pre-cache partial:', e.message));
    })
  );
  self.skipWaiting();
});

// ── Activate: purge old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => {
        console.log('[SW] Removing old cache:', k);
        return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

// ── Fetch handler ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Netlify functions / external API calls — always network-only
  if (url.pathname.startsWith('/.netlify/') || url.hostname !== self.location.hostname) {
    return; // let browser handle — no caching
  }

  // 2. sw.js itself — always network-first (never serve stale SW)
  if (url.pathname === '/sw.js') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. App shell — cache-first then background update (stale-while-revalidate)
  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);

      // Kick off network fetch in background regardless
      const networkPromise = fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          cache.put(event.request, response.clone());
        }
        return response;
      }).catch(() => null);

      // Return cached version immediately if we have it
      if (cached) {
        // Background update already kicked off above
        return cached;
      }

      // No cache — wait for network
      const networkResponse = await networkPromise;
      if (networkResponse) return networkResponse;

      // Offline fallback
      return new Response(
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Football Oracle — Offline</title>
  <style>
    body { font-family: 'Barlow Condensed', sans-serif; background:#0d1a0f; color:#e8e8e0;
           display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    .box { text-align:center; padding:40px; max-width:400px; }
    h1 { color:#f5c842; font-size:2rem; margin-bottom:8px; }
    p  { color:#a8a89a; font-size:1rem; line-height:1.5; }
    button { margin-top:24px; padding:10px 24px; background:#f5c842; color:#111; border:none;
             border-radius:6px; font-size:1rem; font-weight:700; cursor:pointer; }
  </style>
</head>
<body>
  <div class="box">
    <div style="font-size:3rem;margin-bottom:16px;">⚽</div>
    <h1>You're offline</h1>
    <p>Football Oracle needs a connection to fetch live fixtures and data. Please reconnect and try again.</p>
    <button onclick="location.reload()">Try Again</button>
  </div>
</body>
</html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    })
  );
});

// ── Background sync: when network comes back, notify clients ──
self.addEventListener('sync', event => {
  if (event.tag === 'background-refresh') {
    // Tell the client to trigger a refresh
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(client => client.postMessage({ type: 'BACKGROUND_SYNC' }))
      )
    );
  }
});

// ── Push notification skeleton (for future use) ──
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Football Oracle', {
      body: data.body || 'New match results available',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'fo-update',
    })
  );
});
