// Service worker: cachea los archivos de la app para que funcione sin conexión.
const CACHE = 'gymonkey-v21';
const ASSETS = ['./', 'index.html', 'app.html', 'landing.js', 'landing.css', 'site.js', 'legal.html', 'legal.js', 'tokens.css', 'styles.css', 'app.js', 'plan.js', 'cloud.js', 'config.js', 'demo.js', 'progression.js', 'context.js', 'sessions.js', 'exercises.js', 'weekplan.js', 'week.js', 'loads.js', 'calendar.js', 'gcal.js', 'suggest.js', 'i18n.js', 'icons.js', 'fonts/rubik-latin.woff2', 'fonts/rubik-latin-ext.woff2', 'fonts/rubik-hebrew.woff2', 'fonts/heebo-latin.woff2', 'fonts/heebo-latin-ext.woff2', 'fonts/heebo-hebrew.woff2', 'fonts/jetbrains-mono-latin.woff2', 'lang/en.js', 'lang/he.js', 'lang/exercises.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

/** Sin conexión, las direcciones sin extensión (/app, /legal) se sirven desde su .html. */
const fallback = (path) => (path.endsWith('/app') ? 'app.html' : path.endsWith('/legal') ? 'legal.html' : 'index.html');

// Red primero, caché como respaldo: así siempre se usa la última versión si hay conexión.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Solo archivos de la propia app: nunca la IA (/api) ni Google/Firebase.
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match(fallback(url.pathname))))
  );
});

// Al tocar una notificación, volver a la app (o abrirla si estaba cerrada).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = list.find((c) => 'focus' in c);
      return client ? client.focus() : self.clients.openWindow('app');
    })
  );
});
