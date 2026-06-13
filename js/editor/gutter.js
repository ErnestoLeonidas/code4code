/**
 * Code4Code — js/editor/gutter.js
 * =================================
 * Gutter del editor propio (Fase 2): números de línea (#lineNumbers) y
 * overlays de estado (#lineOverlays).
 *
 * A diferencia de los módulos puros (history.js, folding.js…), este módulo
 * manipula el DOM, pero mantiene el mismo patrón IIFE + export global para
 * que pueda cargarse tanto en el navegador (script clásico) como en Node
 * (tests con mock DOM).
 *
 * Render incremental: el módulo mantiene sus propios arrays `_filasGutter` y
 * `_filasOverlay` con referencias a los elementos DOM de cada fila, junto con
 * `_filaAnterior` que guarda el estado lógico de cada fila. En cada
 * `renderizar()` se compara fila a fila y solo se toca el DOM donde el estado
 * cambió. Si el número de filas crece, se crean y agregan elementos nuevos;
 * si decrece, se eliminan los sobrantes.
 *
 * API pública:
 *   Code4CodeGutter.init({ gutter, overlays })
 *   Code4CodeGutter.renderizar({ lineas, erroresMapa, lineaEjecutando,
 *                                 plegables, plegados })
 *   Code4CodeGutter.marcarLineaEjecutando(idx)
 *   Code4CodeGutter.limpiarEjecucion()
 *   Code4CodeGutter.limpiar()
 *
 * El cableado con jQuery, la lógica de errores (errorVisualState) y los
 * overlays de subrayado (renderizarSubrayados) siguen en js/app.js.
 */
(function (raiz) {
  'use strict';

  /* ---- Elementos DOM contenedores ---- */
  var _gutter   = null;   // #lineNumbers
  var _overlays = null;   // #lineOverlays

  /**
   * Arrays paralelos de referencias a los elementos DOM de cada fila.
   * El índice es el índice de línea (0-based).
   */
  var _filasGutter  = [];   // Array<HTMLElement>  — div.line-num-row
  var _filasOverlay = [];   // Array<HTMLElement>  — div.line-overlay

  /**
   * Estado de la última renderización de cada fila.
   * Cada entrada: { numText, tieneError, msgError, esPlegable, estaPlegado,
   *                 estaEjecutando }
   */
  var _filaAnterior = [];

  /* ---- Helpers DOM ---- */

  /**
   * Crea y devuelve un div.line-num-row con todos sus hijos internos.
   *
   * @param {number} idx    Índice de línea (0-based).
   * @param {object} estado { numText, tieneError, msgError, esPlegable,
   *                          estaPlegado, estaEjecutando }
   * @returns {HTMLElement}
   */
  function _crearFilaGutter(idx, estado) {
    var row = document.createElement('div');
    row.classList.add('line-num-row');
    if (estado.tieneError)     row.classList.add('has-error');
    if (estado.estaEjecutando) row.classList.add('executing');
    row.setAttribute('data-line', idx);

    var arrow = document.createElement('span');
    arrow.classList.add('exec-arrow');
    arrow.textContent = '>';
    row.appendChild(arrow);

    if (estado.esPlegable) {
      var toggle = document.createElement('span');
      toggle.classList.add('fold-toggle');
      toggle.setAttribute('data-line', idx);
      toggle.textContent = estado.estaPlegado ? '▶' : '▼'; // ▶ / ▼
      row.appendChild(toggle);
    }

    var num = document.createElement('span');
    num.classList.add('num-text');
    num.textContent = estado.numText;
    row.appendChild(num);

    return row;
  }

  /**
   * Crea y devuelve un div.line-overlay para la fila idx.
   *
   * @param {number} idx
   * @param {object} estado
   * @returns {HTMLElement}
   */
  function _crearFilaOverlay(idx, estado) {
    var ov = document.createElement('div');
    ov.classList.add('line-overlay');
    if (estado.tieneError)     ov.classList.add('has-error');
    if (estado.estaEjecutando) ov.classList.add('executing');
    ov.setAttribute('data-line', idx);
    if (estado.tieneError && estado.msgError) {
      ov.setAttribute('title', estado.msgError);
    }
    return ov;
  }

  /**
   * Actualiza las clases CSS y el ícono de plegado de una fila del gutter
   * existente (sin recrearla completa).
   *
   * @param {HTMLElement} rowEl       div.line-num-row existente.
   * @param {number}      idx         Índice de línea.
   * @param {object}      estadoNuevo Estado deseado.
   */
  function _actualizarFilaGutter(rowEl, idx, estadoNuevo) {
    _setClase(rowEl, 'has-error',  estadoNuevo.tieneError);
    _setClase(rowEl, 'executing',  estadoNuevo.estaEjecutando);

    /* Ícono de plegado: puede aparecer, desaparecer o cambiar icono */
    var toggleEl = _querySelector(rowEl, '.fold-toggle');
    if (estadoNuevo.esPlegable) {
      var icono = estadoNuevo.estaPlegado ? '▶' : '▼';
      if (toggleEl) {
        if (toggleEl.textContent !== icono) toggleEl.textContent = icono;
      } else {
        var toggle = document.createElement('span');
        toggle.classList.add('fold-toggle');
        toggle.setAttribute('data-line', idx);
        toggle.textContent = icono;
        var numEl = _querySelector(rowEl, '.num-text');
        rowEl.insertBefore(toggle, numEl);
      }
    } else if (toggleEl) {
      rowEl.removeChild(toggleEl);
    }

    /* Número de línea */
    var numEl2 = _querySelector(rowEl, '.num-text');
    if (numEl2 && numEl2.textContent !== estadoNuevo.numText) {
      numEl2.textContent = estadoNuevo.numText;
    }
  }

  /**
   * Actualiza las clases CSS de un overlay existente.
   *
   * @param {HTMLElement} ovEl
   * @param {object}      estadoNuevo
   */
  function _actualizarFilaOverlay(ovEl, estadoNuevo) {
    _setClase(ovEl, 'has-error',  estadoNuevo.tieneError);
    _setClase(ovEl, 'executing',  estadoNuevo.estaEjecutando);
    if (estadoNuevo.tieneError && estadoNuevo.msgError) {
      ovEl.setAttribute('title', estadoNuevo.msgError);
    } else {
      ovEl.removeAttribute('title');
    }
  }

  /* ---- Utilidades ---- */

  function _setClase(el, cls, activo) {
    if (activo) {
      if (!el.classList.contains(cls)) el.classList.add(cls);
    } else {
      if (el.classList.contains(cls)) el.classList.remove(cls);
    }
  }

  /**
   * querySelector mínimo: busca entre los hijos directos un elemento cuya
   * classList contiene `cls`. Soporta el subset '.clase' que usa este módulo.
   */
  function _querySelector(parent, sel) {
    var clsMatch = sel.match(/\.([a-zA-Z0-9_-]+)$/);
    if (!clsMatch) return null;
    var cls = clsMatch[1];
    var children = parent.childNodes || [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child && child.classList && child.classList.contains(cls)) return child;
    }
    return null;
  }

  /**
   * Compara dos estados de fila para decidir si hay que actualizar el DOM.
   *
   * @param {object|null} a
   * @param {object|null} b
   * @returns {boolean} true si los estados son idénticos
   */
  function _estadosIguales(a, b) {
    if (!a || !b) return false;
    return a.numText        === b.numText        &&
           a.tieneError     === b.tieneError     &&
           a.msgError       === b.msgError       &&
           a.esPlegable     === b.esPlegable     &&
           a.estaPlegado    === b.estaPlegado    &&
           a.estaEjecutando === b.estaEjecutando;
  }

  /* ---- API pública ---- */

  /**
   * Inicializa el módulo con las referencias a los elementos DOM contenedores.
   * Debe llamarse una sola vez en $(document).ready.
   *
   * @param {{ gutter: Element, overlays: Element }} elementos
   */
  function init(elementos) {
    _gutter       = elementos.gutter;
    _overlays     = elementos.overlays;
    _filasGutter  = [];
    _filasOverlay = [];
    _filaAnterior = [];
  }

  /**
   * Renderiza el gutter de forma incremental.
   *
   * Solo actualiza (o crea/elimina) las filas del DOM que cambiaron desde
   * la última llamada. Las filas sin cambio no se tocan.
   *
   * @param {object}   opciones
   * @param {string[]} opciones.lineas           Líneas del editor.
   * @param {Object}   opciones.erroresMapa       { [lineaIdx]: mensajeString }
   * @param {number}   opciones.lineaEjecutando   Índice de línea en ejecución
   *                                              (-1 si ninguna).
   * @param {Map}      opciones.plegables         Map<idx,{fin,nivel}> de folding.
   * @param {Set}      opciones.plegados          Set<idx> con bloques plegados.
   */
  function renderizar(opciones) {
    if (!_gutter || !_overlays) return;

    var lineas          = opciones.lineas          || [];
    var erroresMapa     = opciones.erroresMapa     || {};
    var lineaEjecutando = (typeof opciones.lineaEjecutando === 'number')
                          ? opciones.lineaEjecutando : -1;
    var plegables       = opciones.plegables instanceof Map
                          ? opciones.plegables : new Map();
    var plegados        = opciones.plegados  instanceof Set
                          ? opciones.plegados  : new Set();

    var total = Math.max(lineas.length, 10);

    /* Calcular estado nuevo de cada fila y aplicar el diff */
    for (var i = 0; i < total; i++) {
      var esPlegable  = plegables.has(i);
      var estaPlegado = plegados.has(i);
      var tieneError  = Object.prototype.hasOwnProperty.call(erroresMapa, i) &&
                        erroresMapa[i] != null;
      var msgError    = tieneError ? String(erroresMapa[i]) : '';
      var estaEjecutando = (i === lineaEjecutando);

      var estadoNuevo = {
        numText:        String(i + 1),
        tieneError:     tieneError,
        msgError:       msgError,
        esPlegable:     esPlegable,
        estaPlegado:    estaPlegado,
        estaEjecutando: estaEjecutando
      };

      if (i < _filasGutter.length) {
        /* La fila ya existe: actualizar solo si el estado cambió */
        if (!_estadosIguales(_filaAnterior[i], estadoNuevo)) {
          _actualizarFilaGutter(_filasGutter[i], i, estadoNuevo);
          _actualizarFilaOverlay(_filasOverlay[i], estadoNuevo);
        }
      } else {
        /* Fila nueva: crear y añadir al contenedor */
        var rowEl = _crearFilaGutter(i, estadoNuevo);
        var ovEl  = _crearFilaOverlay(i, estadoNuevo);
        _gutter.appendChild(rowEl);
        _overlays.appendChild(ovEl);
        _filasGutter.push(rowEl);
        _filasOverlay.push(ovEl);
      }

      _filaAnterior[i] = estadoNuevo;
    }

    /* Si el número de filas decreció, eliminar las sobrantes del DOM y arrays */
    while (_filasGutter.length > total) {
      var lastRow = _filasGutter.pop();
      var lastOv  = _filasOverlay.pop();
      _gutter.removeChild(lastRow);
      _overlays.removeChild(lastOv);
    }
    if (_filaAnterior.length > total) {
      _filaAnterior.length = total;
    }
  }

  /**
   * Marca la línea `idx` como "en ejecución" (añade clase `executing`).
   * Quita la clase de cualquier otra fila que la tuviera.
   *
   * @param {number} idx
   */
  function marcarLineaEjecutando(idx) {
    for (var i = 0; i < _filasGutter.length; i++) {
      var esActiva = (i === idx);
      _setClase(_filasGutter[i],  'executing', esActiva);
      _setClase(_filasOverlay[i], 'executing', esActiva);
      if (_filaAnterior[i]) _filaAnterior[i].estaEjecutando = esActiva;
    }
  }

  /**
   * Elimina la marca de ejecución de todas las filas.
   */
  function limpiarEjecucion() {
    for (var i = 0; i < _filasGutter.length; i++) {
      if (_filasGutter[i].classList.contains('executing')) {
        _filasGutter[i].classList.remove('executing');
      }
      if (_filasOverlay[i] && _filasOverlay[i].classList.contains('executing')) {
        _filasOverlay[i].classList.remove('executing');
      }
      if (_filaAnterior[i]) _filaAnterior[i].estaEjecutando = false;
    }
  }

  /**
   * Elimina marcas de error y de ejecución de todas las filas (no vacía
   * el gutter: los números siguen ahí).
   */
  function limpiar() {
    for (var i = 0; i < _filasGutter.length; i++) {
      _filasGutter[i].classList.remove('has-error', 'executing');
      if (_filasOverlay[i]) {
        _filasOverlay[i].classList.remove('has-error', 'executing');
        _filasOverlay[i].removeAttribute('title');
      }
      if (_filaAnterior[i]) {
        _filaAnterior[i].tieneError     = false;
        _filaAnterior[i].msgError       = '';
        _filaAnterior[i].estaEjecutando = false;
      }
    }
  }

  /* ---- Export ---- */

  var Code4CodeGutter = {
    init:                  init,
    renderizar:            renderizar,
    marcarLineaEjecutando: marcarLineaEjecutando,
    limpiarEjecucion:      limpiarEjecucion,
    limpiar:               limpiar,

    /* Solo para tests: acceso al estado interno */
    _estadosIguales:       _estadosIguales,
    _crearFilaGutter:      _crearFilaGutter,
    _crearFilaOverlay:     _crearFilaOverlay,
    get _filaAnterior()    { return _filaAnterior; },
    get _filasGutter()     { return _filasGutter;  },
    get _filasOverlay()    { return _filasOverlay; },
    _resetEstado: function () {
      _gutter       = null;
      _overlays     = null;
      _filasGutter  = [];
      _filasOverlay = [];
      _filaAnterior = [];
    }
  };

  raiz.Code4CodeGutter = Code4CodeGutter;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code4CodeGutter;
  }
})(typeof window !== 'undefined' ? window : globalThis);
