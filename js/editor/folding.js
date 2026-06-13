/**
 * Code4Code — js/editor/folding.js
 * =================================
 * Plegado de bloques del editor propio (Fase 2). Módulo puro, sin DOM:
 * opera sobre arrays de líneas y conjuntos de índices plegados.
 *
 * Detecta pares apertura/cierre usando las reglas del provider activo
 * (`reglasIndentacion()`), construye un mapa de bloques plegables y
 * expone funciones inmutables para gestionar el estado de plegado.
 *
 * El cableado con el gutter (#lineNumbers) y los iconos ▼/▶ vive en
 * js/app.js, donde se mantiene la instancia `editorFolding`.
 */
(function (raiz) {
  'use strict';

  /**
   * Devuelve las primeras `n` palabras de una línea (ignorando sangría).
   */
  function primerasPalabras(linea, n) {
    var limpio = linea.replace(/^\s+/, '');
    var partes = limpio.split(/\s+/);
    return partes.slice(0, n).join(' ');
  }

  /**
   * ¿El inicio de `linea` coincide con `keyword` (insensible a mayúsculas)?
   * Soporta keywords multi-palabra como 'Hasta Que'.
   */
  function coincideKeyword(linea, keyword) {
    var palabras = keyword.split(/\s+/);
    var primeras = primerasPalabras(linea, palabras.length);
    return primeras.toLowerCase() === keyword.toLowerCase();
  }

  /**
   * Analiza las líneas y devuelve un Map<lineaApertura, { fin, nivel }>
   * para todos los bloques que tienen apertura Y cierre con al menos una
   * línea de contenido entre ellos.
   *
   * @param {string[]} lineas - Líneas del editor.
   * @param {{ aperturas: string[], cierres: string[] }} reglas
   * @returns {Map}
   */
  function calcularPlegables(lineas, reglas) {
    var plegables = new Map();
    var pila = [];

    for (var i = 0; i < lineas.length; i++) {
      var linea = lineas[i];

      // Comprobar aperturas
      for (var a = 0; a < reglas.aperturas.length; a++) {
        if (coincideKeyword(linea, reglas.aperturas[a])) {
          pila.push({ idx: i, nivel: pila.length });
          break;
        }
      }

      // Comprobar cierres
      for (var c = 0; c < reglas.cierres.length; c++) {
        if (coincideKeyword(linea, reglas.cierres[c])) {
          if (pila.length > 0) {
            var apertura = pila.pop();
            // Solo plegable si hay al menos una línea de contenido entre apertura y cierre
            if (i > apertura.idx + 1) {
              plegables.set(apertura.idx, { fin: i, nivel: apertura.nivel });
            }
          }
          break;
        }
      }
    }

    return plegables;
  }

  /** ¿La línea `idx` tiene un bloque plegable? */
  function esPlegable(plegables, idx) {
    return plegables.has(idx);
  }

  /** ¿La línea `idx` está actualmente plegada? */
  function esPlegado(plegados, idx) {
    return plegados.has(idx);
  }

  /** Devuelve un nuevo Set con `idx` añadido (inmutable). */
  function plegar(plegados, idx) {
    var nuevo = new Set(plegados);
    nuevo.add(idx);
    return nuevo;
  }

  /** Devuelve un nuevo Set con `idx` eliminado (inmutable). */
  function desplegar(plegados, idx) {
    var nuevo = new Set(plegados);
    nuevo.delete(idx);
    return nuevo;
  }

  /**
   * Alterna el plegado de la línea `idx`. Si no es plegable, devuelve
   * una copia del set sin cambios.
   */
  function togglePlegar(plegados, plegables, idx) {
    if (!plegables.has(idx)) return new Set(plegados);
    if (plegados.has(idx)) return desplegar(plegados, idx);
    return plegar(plegados, idx);
  }

  /**
   * Devuelve un array con los índices de líneas que deben mostrarse.
   * Las líneas interiores de un bloque plegado se omiten; la línea de
   * cierre sí se muestra (para mantener la estructura visible).
   *
   * @param {string[]} lineas
   * @param {Set} plegados
   * @param {Map} plegables
   * @returns {number[]}
   */
  function lineasVisibles(lineas, plegados, plegables) {
    var visibles = [];
    var ocultarHasta = -1;

    for (var i = 0; i < lineas.length; i++) {
      if (i <= ocultarHasta) continue;
      visibles.push(i);
      if (plegados.has(i) && plegables.has(i)) {
        // Ocultar el interior; el cierre (plegables.get(i).fin) sí se ve
        ocultarHasta = plegables.get(i).fin - 1;
      }
    }

    return visibles;
  }

  /** Crea una instancia de estado de plegado. */
  function crear() {
    return {
      plegados: new Set(),
      plegables: new Map()
    };
  }

  var Code4CodeFolding = {
    calcularPlegables: calcularPlegables,
    esPlegable: esPlegable,
    esPlegado: esPlegado,
    plegar: plegar,
    desplegar: desplegar,
    togglePlegar: togglePlegar,
    lineasVisibles: lineasVisibles,
    crear: crear
  };

  raiz.Code4CodeFolding = Code4CodeFolding;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code4CodeFolding;
  }
})(typeof window !== 'undefined' ? window : globalThis);
