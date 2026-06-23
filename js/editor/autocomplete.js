/**
 * Code4Code — js/editor/autocomplete.js
 * =====================================
 * Datos del autocompletado del editor propio (Fase 2): construye el
 * contexto de cursor y obtiene los candidatos preguntando al provider
 * activo a través de la función opcional del contrato
 * `autocompletar(contexto)` (ver core/language-provider.js).
 *
 * Módulo de datos puro: sin DOM ni jQuery. El render del dropdown, la
 * navegación con teclado y la inserción siguen viviendo en js/app.js.
 *
 * Patrón de carga: script global en el navegador
 * (window.Code4CodeAutocomplete) y módulo CommonJS en Node para las
 * pruebas (tests/autocomplete-tests.js).
 */
(function (raiz) {
  'use strict';

  /**
   * Construye el contexto de autocompletado a partir del texto completo
   * del editor y la posición absoluta del cursor.
   *
   * @param {string} codigo - texto completo del editor.
   * @param {number} posicionCursor - índice absoluto del cursor en `codigo`.
   * @returns {{ linea: string, columna: number, codigo: string }}
   *          linea: línea completa bajo el cursor; columna: índice 0-based
   *          del cursor dentro de esa línea.
   */
  function contextoDesdePosicion(codigo, posicionCursor) {
    var texto = String(codigo == null ? '' : codigo);
    var pos = typeof posicionCursor === 'number' ? posicionCursor : texto.length;
    pos = Math.max(0, Math.min(pos, texto.length));
    var antes = texto.substring(0, pos);
    var ultimoSalto = antes.lastIndexOf('\n');
    var indiceLinea = antes.split('\n').length - 1;
    var linea = texto.split('\n')[indiceLinea] || '';
    var columna = pos - (ultimoSalto + 1);

    // Prefijo genérico: caracteres de identificador inmediatamente antes del cursor.
    var iniPref = columna - 1;
    while (iniPref >= 0 && /[\wáéíóúüñÁÉÍÓÚÜÑ]/.test(linea[iniPref])) iniPref--;
    iniPref++;
    var prefijo = linea.substring(iniPref, columna);

    return {
      linea: linea,
      columna: columna,
      codigo: texto,
      prefijo: prefijo
    };
  }

  /**
   * Pide los candidatos al provider. Si el provider no implementa la
   * función opcional `autocompletar` (o devuelve algo inválido), no hay
   * sugerencias: el editor simplemente no muestra el dropdown.
   *
   * @param {object} provider - provider activo (contrato Code4Code).
   * @param {{ linea, columna, codigo }} contexto
   * @returns {Array<{texto: string, tipo: string, detalle?: string}>}
   */
  function obtenerCandidatos(provider, contexto) {
    if (!provider || typeof provider.autocompletar !== 'function') return [];
    var candidatos = provider.autocompletar(contexto);
    return Array.isArray(candidatos) ? candidatos : [];
  }

  var Code4CodeAutocomplete = {
    contextoDesdePosicion: contextoDesdePosicion,
    obtenerCandidatos: obtenerCandidatos
  };

  raiz.Code4CodeAutocomplete = Code4CodeAutocomplete;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code4CodeAutocomplete;
  }
})(typeof window !== 'undefined' ? window : globalThis);
