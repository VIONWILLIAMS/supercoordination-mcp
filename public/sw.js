const CACHE_NAME = 'supercoordination-pwa-v4';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/dashboard.html',
  '/projects.html',
  '/project-detail.html',
  '/my-tasks.html',
  '/members.html',
  '/shortmail-login.html',
  '/shortmail-app.html',
  '/css/common.css',
  '/css/variables.css',
  '/css/theme.css',
  '/js/auth.js',
  '/js/toast.js',
  '/js/modal.js',
  '/js/websocket-client.js',
  '/js/pwa.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET or cross-origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Skip API and MCP calls
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/mcp')) {
    return;
  }

  // Cache-first for static assets, network-first for HTML
  const isHtml = request.headers.get('accept')?.includes('text/html');

  if (isHtml) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
