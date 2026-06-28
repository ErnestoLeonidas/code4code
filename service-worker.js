/**
 * Code4Code — service-worker.js
 * ================================
 * PWA Service Worker con estrategias de caché diferenciadas:
 *   - Shell de la app (recursos locales): Cache-First (precaché al instalar)
 *   - CDN de Pyodide y CodeMirror: Network-First con fallback a caché
 *   - Otros CDN (Bootstrap, jQuery, fuentes): Cache-First
 *   - Fetch general: Network-First → caché → sin respuesta
 */

'use strict';

var SW_VERSION = 'c4c-v2.4.3';
var CACHE_SHELL = SW_VERSION + '-shell';
var CACHE_CDN   = SW_VERSION + '-cdn';

/* Recursos locales precacheados al instalar -------------------------------- */
var SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/css/styles.css',

  /* Editor */
  '/js/app.js',
  '/js/diagram.js',
  '/js/ejercicios-data.js',
  '/js/ejercicios-pseint-data.js',
  '/js/ejercicios-python-data.js',
  '/js/ejercicios-multi-data.js',

  /* Editor propio */
  '/js/editor/ayudas.js',
  '/js/editor/highlight.js',
  '/js/editor/autocomplete.js',
  '/js/editor/pairs.js',
  '/js/editor/search.js',
  '/js/editor/history.js',
  '/js/editor/folding.js',
  '/js/editor/gutter.js',
  '/js/editor/codemirror-python.js',

  /* Núcleos */
  '/core/language-provider.js',
  '/core/language-registry.js',
  '/core/runtime-host.js',

  /* LiteSeInt */
  '/core/liteseint/tokenizer.js',
  '/core/liteseint/parser.js',
  '/core/liteseint/validator.js',
  '/core/liteseint/ast.js',
  '/core/liteseint/runtime.js',
  '/core/liteseint/expression-evaluator.js',
  '/core/liteseint/symbol-table.js',
  '/core/liteseint/doc_errores.js',
  '/core/liteseint/diagram-mapper.js',
  '/core/liteseint/ayudas-data.js',
  '/core/liteseint/provider.js',

  /* PSeInt */
  '/core/pseint/tokenizer.js',
  '/core/pseint/parser.js',
  '/core/pseint/validator.js',
  '/core/pseint/ast.js',
  '/core/pseint/runtime.js',
  '/core/pseint/expression-evaluator.js',
  '/core/pseint/symbol-table.js',
  '/core/pseint/builtins.js',
  '/core/pseint/ayudas-data.js',
  '/core/pseint/provider.js',

  /* Python */
  '/core/python/tokenizer.js',
  '/core/python/bridge.js',
  '/core/python/provider.js',
  '/core/python/worker.js',
  '/core/python/ayudas-data.js',

  /* Bancos de ejercicios */
  '/json/liteseint/N1.json',
  '/json/liteseint/N2.json',
  '/json/liteseint/N3.json',
  '/json/liteseint/N4.json',
  '/json/liteseint/N5.json',
  '/json/liteseint/N6.json',
  '/json/liteseint/N7.json',
  '/json/pseint/N1.json',
  '/json/pseint/N2.json',
  '/json/pseint/N3.json',
  '/json/pseint/N4.json',
  '/json/pseint/N5.json',
  '/json/pseint/N6.json',
  '/json/pseint/N7.json',
  '/json/python/N1.json',
  '/json/python/N2.json',
  '/json/python/N3.json',
  '/json/python/N4.json',
  '/json/python/N5.json',
  '/json/python/N6.json',
  '/json/python/N7.json',
  '/json/multi/mapa.json',
  '/json/multi/ejercicios.json',
];

/* CDN pesados (Pyodide, CodeMirror): Network-First para obtener versiones
   actualizadas, pero con caché como respaldo cuando no hay red. ----------- */
var CDN_NETWORK_FIRST = [
  'cdn.jsdelivr.net/pyodide',
  'cdnjs.cloudflare.com/ajax/libs/codemirror',
];

/* ── Instalar: precachear el shell ---------------------------------------- */
self.addEventListener('install', function (evento) {
  self.skipWaiting();
  evento.waitUntil(
    caches.open(CACHE_SHELL).then(function (cache) {
      return cache.addAll(SHELL_ASSETS).catch(function (err) {
        console.warn('[SW] Error al precachear shell:', err);
      });
    })
  );
});

/* ── Activar: limpiar cachés antiguas ------------------------------------- */
self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(
        claves
          .filter(function (c) { return c !== CACHE_SHELL && c !== CACHE_CDN; })
          .map(function (c) { return caches.delete(c); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ── Fetch: estrategia según origen --------------------------------------- */
self.addEventListener('fetch', function (evento) {
  var url = evento.request.url;

  /* Ignorar extensiones de navegador */
  if (url.startsWith('chrome-extension://') || url.startsWith('moz-extension://')) {
    return;
  }

  /* Sólo interceptar GET */
  if (evento.request.method !== 'GET') return;

  /* CDN pesados → Network-First con respaldo en caché */
  var esRedPrimero = CDN_NETWORK_FIRST.some(function (patron) {
    return url.includes(patron);
  });

  if (esRedPrimero) {
    evento.respondWith(_networkFirst(evento.request, CACHE_CDN));
    return;
  }

  /* Shell local y otros CDN → Cache-First */
  evento.respondWith(_cacheFirst(evento.request, CACHE_SHELL));
});

/* ── Estrategia Cache-First ----------------------------------------------- */
function _cacheFirst(request, nombreCache) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (respuesta) {
      if (respuesta && respuesta.status === 200) {
        var copia = respuesta.clone();
        caches.open(nombreCache).then(function (cache) {
          cache.put(request, copia);
        });
      }
      return respuesta;
    });
  });
}

/* ── Estrategia Network-First ---------------------------------------------- */
function _networkFirst(request, nombreCache) {
  return fetch(request).then(function (respuesta) {
    if (respuesta && respuesta.status === 200) {
      var copia = respuesta.clone();
      caches.open(nombreCache).then(function (cache) {
        cache.put(request, copia);
      });
    }
    return respuesta;
  }).catch(function () {
    return caches.match(request);
  });
}
