/* Service worker: o app abre offline. Sempre tenta a rede primeiro (para receber
   atualizações) e usa a cópia guardada quando estiver sem internet.
   Os dados pessoais não passam por aqui: ficam no localStorage do navegador. */
const CACHE = 'stepbystep-v6';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'app.js', 'applications-core.js', 'clareza-core.js', 'study-core.js', 'studies.js',
  'applications.js', 'clareza.js', 'focus-dock.js', 'daily-journal.js', 'settings.js', 'reminders-core.js', 'notify.js', 'sync-core.js', 'sync.js',
  'fonts/manrope.woff2', 'fonts/fraunces.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});

// Tocar no aviso abre (ou traz para frente) o app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => 'focus' in c);
    return open ? open.focus() : self.clients.openWindow('./');
  }));
});
