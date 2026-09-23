/* KUDO Service Worker — offline-first shell, network-first data */

var CACHE = 'kudo-v1.2';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './products.txt',
  './images.txt'
];

/* ---------- INSTALL: pre-cache the shell ---------- */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      /* Add individually so a single 404 doesn't kill the whole cache */
      return Promise.all(SHELL.map(function(url) {
        return c.add(url).catch(function() { /* ignore missing */ });
      }));
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ---------- ACTIVATE: clean up old caches ---------- */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ---------- FETCH: routing ---------- */
self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* Only handle same-origin + GitHub raw content */
  var isSameOrigin = url.origin === self.location.origin;
  var isGitHubRaw = url.hostname === 'raw.githubusercontent.com' ||
                    url.hostname === 'githubusercontent.com';
  if (!isSameOrigin && !isGitHubRaw) return;

  /* Data files → network first, cache fallback */
  if (url.pathname.endsWith('/products.txt') ||
      url.pathname.endsWith('/images.txt')) {
    e.respondWith(networkFirst(req));
    return;
  }

  /* Images → cache first, network fallback */
  if (req.destination === 'image' || isGitHubRaw) {
    e.respondWith(cacheFirst(req));
    return;
  }

  /* Everything else → cache first, network fallback */
  e.respondWith(cacheFirst(req));
});

/* ---------- Strategies ---------- */
function cacheFirst(req) {
  return caches.match(req).then(function(hit) {
    if (hit) return hit;
    return fetch(req).then(function(res) {
      /* Cache only successful basic / cors responses */
      if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
        var clone = res.clone();
        caches.open(CACHE).then(function(c) { c.put(req, clone); });
      }
      return res;
    }).catch(function() {
      /* Offline and not cached */
      return new Response('', { status: 504, statusText: 'Offline' });
    });
  });
}

function networkFirst(req) {
  return fetch(req).then(function(res) {
    if (res && res.status === 200) {
      var clone = res.clone();
      caches.open(CACHE).then(function(c) { c.put(req, clone); });
    }
    return res;
  }).catch(function() {
    return caches.match(req).then(function(hit) {
      return hit || new Response('', { status: 504, statusText: 'Offline' });
    });
  });
}
