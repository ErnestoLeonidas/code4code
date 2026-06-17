/**
 * Code4Code — js/ejercicios-multi-data.js
 * =========================================
 * Carga y consulta el mapa de equivalencias multi-lenguaje:
 * json/multi/mapa.json asocia el mismo concepto en varios lenguajes.
 *
 * Expone window.EjerciciosMulti con la API:
 *   cargarDesdeJson()             → Promise<void>
 *   buscarPorId(id, lenguaje)     → mapa | null  (mapa que contiene ese id)
 *   listarPorModulo(modulo)       → Array<mapa>
 *   porConcepto(concepto)         → mapa | null
 *   MAPAS                         → Array<mapa> (todos los mapas cargados)
 */
(function (raiz) {
  'use strict';

  var BASE_URL = 'json/multi/mapa.json';
  var mapas = [];
  var cargado = false;

  function cargarDesdeJson() {
    if (cargado) return Promise.resolve();
    return fetch(BASE_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('Error cargando ' + BASE_URL + ': ' + r.status);
        return r.json();
      })
      .then(function (data) {
        mapas = Array.isArray(data.mapas) ? data.mapas : [];
        cargado = true;
      });
  }

  function buscarPorId(id, lenguaje) {
    if (!id) return null;
    var idNorm = id.toLowerCase();
    for (var i = 0; i < mapas.length; i++) {
      var m = mapas[i];
      var ids = m.ids || {};
      if (lenguaje) {
        if ((ids[lenguaje] || '').toLowerCase() === idNorm) return m;
      } else {
        var vals = Object.values(ids);
        for (var j = 0; j < vals.length; j++) {
          if ((vals[j] || '').toLowerCase() === idNorm) return m;
        }
      }
    }
    return null;
  }

  function listarPorModulo(modulo) {
    return mapas.filter(function (m) { return m.modulo === modulo; });
  }

  function porConcepto(concepto) {
    var norm = (concepto || '').toLowerCase().trim();
    return mapas.find(function (m) {
      return (m.concepto || '').toLowerCase().trim() === norm;
    }) || null;
  }

  raiz.EjerciciosMulti = {
    cargarDesdeJson: cargarDesdeJson,
    buscarPorId: buscarPorId,
    listarPorModulo: listarPorModulo,
    porConcepto: porConcepto,
    get MAPAS() { return mapas.slice(); },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = raiz.EjerciciosMulti;
  }
})(typeof window !== 'undefined' ? window : globalThis);
