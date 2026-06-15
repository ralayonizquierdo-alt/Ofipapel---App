const CACHE = 'ofipapel-v10';
const ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    // Limpiar cachés viejas
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()).then(() => {
      // Forzar recarga de todas las pestañas abiertas para que carguen HTML fresco
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        return Promise.all(clients.map(client => {
          try { return client.navigate(client.url); } catch(e) {
            client.postMessage({ type: 'SW_RELOAD' });
          }
        }));
      });
    })
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // HTML siempre desde la red (network-first) — nunca queda atrapado en caché
  if (e.request.destination === 'document' ||
      url.endsWith('/') || url.endsWith('.html') || url.includes('falcontrol')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/Index.html'))
    );
    return;
  }

  // CDN libs: caché primero
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
