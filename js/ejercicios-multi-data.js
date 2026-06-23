/**
 * Code4Code — js/ejercicios-multi-data.js
 * =========================================
 * Carga y consulta el sistema multi-lenguaje de ejercicios:
 *
 *   • json/multi/mapa.json      — índice de equivalencias por IDs (legado)
 *   • json/multi/ejercicios.json — esquema unificado (un enunciado, N soluciones)
 *
 * Expone window.EjerciciosMulti con la API:
 *   cargarDesdeJson()                   → Promise<void>
 *   buscarPorId(id, lenguaje)           → mapa | null   (en mapa.json)
 *   listarPorModulo(modulo)             → Array<mapa>
 *   porConcepto(concepto)               → mapa | null
 *   MAPAS                               → Array<mapa>
 *   ejercicioUnificadoPorId(id, lang)   → ejercicioUnificado | null
 *   ejerciciosUnificadosPorModulo(mod)  → Array<ejercicioUnificado>
 *   EJERCICIOS_UNIFICADOS               → Array<ejercicioUnificado>
 */
(function (raiz) {
  'use strict';

  var URL_MAPA = 'json/multi/mapa.json';
  var URL_UNIFICADOS = 'json/multi/ejercicios.json';

  var mapas = [];
  var unificados = [];
  var _unificadosPorIdOriginal = null;   // índice lazy: idOriginal → ejercicio unif.
  var cargado = false;

  // ── Mapa (legado) ──────────────────────────────────────────────────────────

  function cargarDesdeJson() {
    if (cargado) return Promise.resolve();
    var promesaMapa = fetch(URL_MAPA)
      .then(function (r) {
        if (!r.ok) throw new Error('Error cargando ' + URL_MAPA + ': ' + r.status);
        return r.json();
      })
      .then(function (data) {
        mapas = Array.isArray(data.mapas) ? data.mapas : [];
      });

    var promesaUnif = fetch(URL_UNIFICADOS)
      .then(function (r) {
        if (!r.ok) return null;   // opcional: si no existe, ok
        return r.json();
      })
      .then(function (data) {
        if (data && Array.isArray(data.ejercicios)) {
          unificados = data.ejercicios;
        }
      })
      .catch(function () { /* silencioso si el archivo no existe todavía */ });

    return Promise.all([promesaMapa, promesaUnif]).then(function () {
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

  // ── Ejercicios unificados ──────────────────────────────────────────────────

  /** Construye (lazy) el índice idOriginal → ejercicio unificado. */
  function indiceUnificados() {
    if (_unificadosPorIdOriginal) return _unificadosPorIdOriginal;
    _unificadosPorIdOriginal = Object.create(null);
    unificados.forEach(function (eu) {
      var langs = eu.lenguajes || {};
      Object.keys(langs).forEach(function (lang) {
        var idOrig = (langs[lang].idOriginal || '').toLowerCase();
        if (idOrig) _unificadosPorIdOriginal[idOrig] = eu;
      });
    });
    return _unificadosPorIdOriginal;
  }

  /**
   * Devuelve el ejercicio unificado que tiene el idOriginal indicado
   * (en cualquier lenguaje, o en el lenguaje especificado).
   *
   * @param {string} id          - ID del ejercicio en el banco original (e.g. "n1-001")
   * @param {string} [lenguaje]  - lenguaje del banco donde buscar el id
   * @returns {object|null}
   */
  function ejercicioUnificadoPorId(id, lenguaje) {
    if (!id) return null;
    var idNorm = id.toLowerCase();
    var eu = indiceUnificados()[idNorm] || null;
    if (!eu || !lenguaje) return eu;
    // Verificar que ese ID pertenece al lenguaje indicado
    var langs = eu.lenguajes || {};
    if (langs[lenguaje] && (langs[lenguaje].idOriginal || '').toLowerCase() === idNorm) {
      return eu;
    }
    return null;
  }

  /**
   * Lista ejercicios unificados de un módulo dado (e.g. "N3").
   * @param {string} modulo
   * @returns {Array<object>}
   */
  function ejerciciosUnificadosPorModulo(modulo) {
    return unificados.filter(function (e) { return e.modulo === modulo; });
  }

  // ── Exposición ─────────────────────────────────────────────────────────────

  raiz.EjerciciosMulti = {
    // Legado (mapa.json)
    cargarDesdeJson: cargarDesdeJson,
    buscarPorId: buscarPorId,
    listarPorModulo: listarPorModulo,
    porConcepto: porConcepto,
    get MAPAS() { return mapas.slice(); },
    // Unificados
    ejercicioUnificadoPorId: ejercicioUnificadoPorId,
    ejerciciosUnificadosPorModulo: ejerciciosUnificadosPorModulo,
    get EJERCICIOS_UNIFICADOS() { return unificados.slice(); },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = raiz.EjerciciosMulti;
  }
})(typeof window !== 'undefined' ? window : globalThis);
