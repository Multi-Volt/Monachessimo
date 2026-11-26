/* global self, caches, fetch, Headers, Response, URL */
// Makes the page cross-origin isolated, which lets the coach model use every
// CPU core: GitHub Pages cannot send the headers, so the service worker adds
// them to the pages and workers it serves. Loaded by the generated service
// worker with importScripts, so its listener runs before Workbox's routes.
//
// A page is served from the precache when it is there, like Workbox's
// navigation fallback, else from the network. Every resource the app loads
// is from its own origin, or fetched from Lichess and chess.com with CORS,
// so require-corp blocks nothing.
const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

function isolated(res) {
  if (!res || res.type === 'opaque' || res.status === 0) return res;
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(ISOLATION)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function serve(request) {
  const index = new URL('index.html', self.registration.scope).href;
  const cached =
    (await caches.match(request, { ignoreSearch: true })) ??
    (request.mode === 'navigate' ? await caches.match(index, { ignoreSearch: true }) : undefined);
  return isolated(cached ?? (await fetch(request)));
}

self.addEventListener('fetch', (event) => {
  const r = event.request;
  if (new URL(r.url).origin !== self.location.origin) return;
  if (r.mode !== 'navigate' && r.destination !== 'worker') return;
  event.respondWith(serve(r));
  // Workbox would answer the same request otherwise.
  event.stopImmediatePropagation();
});
