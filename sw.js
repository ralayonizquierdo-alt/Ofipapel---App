const CACHE = 'ofipapel-v4.1';
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
    // Limpiar cachés viejas. No se fuerza la recarga de las pestañas
    // abiertas: el HTML ya se sirve siempre fresco desde la red (ver
    // fetch handler), así que no hace falta — y ese forzado (client.navigate
    // en cada pestaña abierta) podía disparar justo cuando el usuario
    // acababa de tocar un enlace, chocando con esa navegación en curso.
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // HTML siempre desde la red (network-first) — nunca queda atrapado en caché.
  // Antes, si el fetch fallaba, caía a caches.match('/Index.html') (ruta
  // absoluta rota en GitHub Pages, que sirve bajo /Ofipapel---App/, y sin
  // sentido además para el resto de páginas — vacaciones.html, fichaje.html,
  // etc. no deberían caer nunca en Index.html). Se deja que el fetch fallido
  // se propague tal cual: el navegador muestra su página de sin-conexión en
  // vez de servir en silencio contenido de otra página o un error opaco.
  if (e.request.destination === 'document' ||
      url.endsWith('/') || url.endsWith('.html') || url.includes('falcontrol')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Vídeo/audio directo a la red, sin pasar por el Service Worker: el
  // <video> del hub pide el .mp4 por rangos de bytes (Range) para ir
  // reproduciendo/buscando, y un SW de por medio (incluso solo reenviando
  // el fetch) es una causa conocida de que esas peticiones por rangos se
  // queden colgadas en según qué navegador — el vídeo se congela sin
  // avisar y hace falta recargar la página entera para que vuelva a ir.
  if (e.request.destination === 'video' || e.request.destination === 'audio' ||
      /\.(mp4|webm|mp3|wav|ogg)$/i.test(url)) {
    return; // sin respondWith(): el navegador hace la petición directa, tal cual
  }

  // CDN libs: caché primero
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
