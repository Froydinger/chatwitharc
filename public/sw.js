// ArcAI service worker — push notifications only (no caching)
// We deliberately do NOT cache navigations or assets to avoid stale builds in PWAs.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Don't intercept fetches — let the network handle everything.
// (No fetch handler = no service-worker caching.)

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'ArcAI', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'ArcAI';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon.png',
    badge: payload.badge || '/icon.png',
    image: payload.image,
    tag: payload.tag,
    data: {
      url: payload.url || '/',
      ...(payload.data || {}),
    },
    requireInteraction: payload.requireInteraction || false,
    silent: payload.silent || false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Focus existing tab if one exists
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) {
            try { await client.navigate(targetUrl); } catch (_) {}
          }
          return;
        }
      } catch (_) {}
    }
    // Otherwise open new window
    await self.clients.openWindow(targetUrl);
  })());
});
