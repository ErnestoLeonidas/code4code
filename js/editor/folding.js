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
   * Devuelve el nivel de sangría (número de espacios; tabs expandidos a 4)
   * de una línea. Una línea vacía o en blanco devuelve Infinity para que
   * nunca "cierre" un bloque abierto.
   */
  function nivelSangria(linea) {
    var expandida = linea.replace(/\t/g, '    ');
    if (expandida.trim() === '') return Infinity;
    var espacios = 0;
    while (espacios < expandida.length && expandida[espacios] === ' ') espacios++;
    return espacios;
  }

  /**
   * Modo indentación (Python): sin palabras clave de cierre; el fin del
   * bloque se detecta cuando la sangría vuelve al nivel de la apertura o
   * por debajo.  Solo se registra si hay al menos dos líneas de contenido
   * dentro del bloque (fin > apertura + 1).
   */
  function calcularPlegablesIndentacion(lineas, reglas) {
    var plegables = new Map();

    for (var i = 0; i < lineas.length; i++) {
      var linea = lineas[i];
      var lineaTrimmed = linea.replace(/^\s+/, ''); // sin sangría inicial

      // ¿Es una línea de apertura?
      // Usamos startsWith (insensible a mayúsculas) porque las keywords Python
      // pueden llevar espacios finales (ej. 'def ', 'for ') y coincideKeyword
      // no las maneja bien al dividirlas en palabras.
      var esApertura = false;
      for (var a = 0; a < reglas.aperturas.length; a++) {
        var kw = reglas.aperturas[a].trim().toLowerCase();
        var prefijo = lineaTrimmed.toLowerCase();
        // Coincide si la línea empieza con la keyword seguida de espacio,
        // paréntesis, o dos puntos (para 'else:' / 'try:' etc.)
        if (prefijo === kw || prefijo.indexOf(kw + ' ') === 0 ||
            prefijo.indexOf(kw + '(') === 0 || prefijo.indexOf(kw + ':') === 0) {
          esApertura = true;
          break;
        }
      }
      if (!esApertura) continue;

      // Las aperturas Python terminan en ':' (ignorando espacios finales)
      if (linea.trimRight().slice(-1) !== ':') continue;

      var sangriaApertura = nivelSangria(linea);
      var ultimaLinea = i; // rastrea la última línea perteneciente al bloque

      for (var j = i + 1; j < lineas.length; j++) {
        var sangria = nivelSangria(lineas[j]);
        if (sangria <= sangriaApertura) break; // salida del bloque
        ultimaLinea = j;
      }

      // Solo plegable si hay al menos una línea de contenido (no solo una)
      if (ultimaLinea > i + 1) {
        plegables.set(i, { fin: ultimaLinea, nivel: sangriaApertura });
      }
    }

    return plegables;
  }

  /**
   * Analiza las líneas y devuelve un Map<lineaApertura, { fin, nivel }>
   * para todos los bloques que tienen apertura Y cierre con al menos una
   * línea de contenido entre ellos.
   *
   * Cuando `reglas.cierres` está vacío y `reglas.aperturas` tiene entradas,
   * usa modo indentación (Python): detecta el fin del bloque por sangría.
   *
   * @param {string[]} lineas - Líneas del editor.
   * @param {{ aperturas: string[], cierres: string[] }} reglas
   * @returns {Map}
   */
  function calcularPlegables(lineas, reglas) {
    // Modo indentación: sin cierres pero con aperturas (ej. Python)
    if (reglas.cierres.length === 0 && reglas.aperturas.length > 0) {
      return calcularPlegablesIndentacion(lineas, reglas);
    }

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
