const CACHE_VERSION = 'v3';
const ASSET_CACHE = `meu-treino-assets-${CACHE_VERSION}`;
const RUNTIME_CACHE = `meu-treino-runtime-${CACHE_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './treino.html',
  './manifest.webmanifest',
  './icon.svg',
  './sw.js'
];

function isCacheableResponse(response) {
  return Boolean(response) && response.status === 200 && (response.type === 'basic' || response.type === 'cors');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const validCaches = new Set([ASSET_CACHE, RUNTIME_CACHE]);

  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('meu-treino-') && !validCaches.has(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

async function networkFirstForNavigation(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);

  try {
    const networkResponse = await fetch(request);
    if (isCacheableResponse(networkResponse)) {
      runtimeCache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cachedPage = await runtimeCache.match(request);
    if (cachedPage) return cachedPage;

    const appShellCache = await caches.open(ASSET_CACHE);
    const fallback = await appShellCache.match('./index.html');
    if (fallback) return fallback;

    return Response.error();
  }
}

async function staleWhileRevalidate(request, event) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  const cached = await runtimeCache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) {
        runtimeCache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(networkFetch);
    return cached;
  }

  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  return Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstForNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, event));
});

self.addEventListener('message', async (event) => {
  if (event.data?.type !== 'GET_CACHE_STATUS') return;

  const hasAssetCache = (await caches.keys()).includes(ASSET_CACHE);
  event.ports[0]?.postMessage({
    type: 'CACHE_STATUS',
    ready: hasAssetCache
  });
});
