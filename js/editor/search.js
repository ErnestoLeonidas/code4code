/**
 * Code4Code — js/editor/search.js
 * ===============================
 * Búsqueda y reemplazo del editor propio (Fase 2). Módulo puro, sin DOM:
 * trabaja sobre el texto del editor y posiciones absolutas. El cableado
 * con la barra de búsqueda y la capa de resaltado vive en js/app.js.
 */
(function (raiz) {
  'use strict';

  /**
   * Busca todas las coincidencias literales de `consulta` en `texto`.
   * Insensible a mayúsculas por defecto (opciones.sensible para distinguir).
   * @returns {Array<{inicio: number, fin: number}>} ordenadas por posición.
   */
  function buscar(texto, consulta, opciones) {
    texto = String(texto);
    consulta = String(consulta || '');
    if (consulta.length === 0) return [];
    var sensible = !!(opciones && opciones.sensible);
    var pajar = sensible ? texto : texto.toLowerCase();
    var aguja = sensible ? consulta : consulta.toLowerCase();

    var coincidencias = [];
    var desde = 0;
    for (;;) {
      var idx = pajar.indexOf(aguja, desde);
      if (idx === -1) break;
      coincidencias.push({ inicio: idx, fin: idx + aguja.length });
      desde = idx + aguja.length;
    }
    return coincidencias;
  }

  /**
   * Índice de la primera coincidencia que empieza en o después del caret,
   * con envoltura circular. -1 si no hay coincidencias.
   */
  function indiceSiguiente(coincidencias, posCaret) {
    if (!coincidencias || coincidencias.length === 0) return -1;
    for (var i = 0; i < coincidencias.length; i++) {
      if (coincidencias[i].inicio >= posCaret) return i;
    }
    return 0;
  }

  /**
   * Índice de la última coincidencia que empieza antes del caret, con
   * envoltura circular. -1 si no hay coincidencias.
   */
  function indiceAnterior(coincidencias, posCaret) {
    if (!coincidencias || coincidencias.length === 0) return -1;
    for (var i = coincidencias.length - 1; i >= 0; i--) {
      if (coincidencias[i].inicio < posCaret) return i;
    }
    return coincidencias.length - 1;
  }

  /**
   * Reemplaza una coincidencia.
   * @returns {{texto: string, delta: number}} delta = cambio de longitud.
   */
  function reemplazar(texto, coincidencia, reemplazo) {
    texto = String(texto);
    reemplazo = String(reemplazo);
    return {
      texto: texto.substring(0, coincidencia.inicio) + reemplazo +
        texto.substring(coincidencia.fin),
      delta: reemplazo.length - (coincidencia.fin - coincidencia.inicio)
    };
  }

  /**
   * Reemplaza todas las coincidencias dadas (se aplican de atrás hacia
   * adelante para no invalidar los offsets anteriores).
   * @returns {{texto: string, cantidad: number}}
   */
  function reemplazarTodas(texto, coincidencias, reemplazo) {
    texto = String(texto);
    var cantidad = 0;
    for (var i = coincidencias.length - 1; i >= 0; i--) {
      texto = reemplazar(texto, coincidencias[i], reemplazo).texto;
      cantidad += 1;
    }
    return { texto: texto, cantidad: cantidad };
  }

  /**
   * HTML para la capa espejo de coincidencias: el texto completo escapado
   * (la capa lo pinta transparente) con cada coincidencia envuelta en
   * <span class="search-match"> y la activa además con search-match-active.
   * @param {function} escapeHtml - escapador provisto por el editor.
   */
  function resaltarHtml(texto, coincidencias, indiceActivo, escapeHtml) {
    texto = String(texto);
    if (!coincidencias || coincidencias.length === 0) return escapeHtml(texto);

    var html = '';
    var pos = 0;
    for (var i = 0; i < coincidencias.length; i++) {
      var c = coincidencias[i];
      html += escapeHtml(texto.substring(pos, c.inicio));
      var clase = i === indiceActivo ? 'search-match search-match-active' : 'search-match';
      html += '<span class="' + clase + '">' +
        escapeHtml(texto.substring(c.inicio, c.fin)) + '</span>';
      pos = c.fin;
    }
    html += escapeHtml(texto.substring(pos));
    return html;
  }

  var Code4CodeSearch = {
    buscar: buscar,
    indiceSiguiente: indiceSiguiente,
    indiceAnterior: indiceAnterior,
    reemplazar: reemplazar,
    reemplazarTodas: reemplazarTodas,
    resaltarHtml: resaltarHtml
  };

  raiz.Code4CodeSearch = Code4CodeSearch;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code4CodeSearch;
  }
})(typeof window !== 'undefined' ? window : globalThis);
