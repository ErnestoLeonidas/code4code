/**
 * Code4Code — tests/gutter-tests.js
 * ===================================
 * Pruebas del módulo Code4CodeGutter (js/editor/gutter.js).
 *
 * El módulo mantiene internamente los arrays _filasGutter/_filasOverlay con
 * referencias a los elementos DOM. Los mocks solo necesitan soportar
 * appendChild y removeChild; el acceso a las filas se hace vía
 * Code4CodeGutter._filasGutter y Code4CodeGutter._filasOverlay.
 *
 * Las filas creadas por el módulo usan document.createElement, así que en
 * Node se necesita un mock de `document` mínimo.
 *
 * Uso: node tests/gutter-tests.js
 */
'use strict';

const path = require('path');

/* ------------------------------------------------------------------ *
 *  Mock de document.createElement mínimo                              *
 * ------------------------------------------------------------------ */

/**
 * Crea un objeto que se comporta como un HTMLElement básico:
 *   - classList con add/remove/contains
 *   - setAttribute/getAttribute/removeAttribute/hasAttribute
 *   - appendChild/removeChild/insertBefore
 *   - querySelector (busca entre hijos directos por '.clase')
 *   - childNodes (array de hijos)
 *   - textContent
 */
function crearEl(tag) {
  var _childNodes = [];
  var _classes    = new Set();
  var _attrs      = {};
  var el = {
    tagName: (tag || 'div').toUpperCase(),
    textContent: '',
    get childNodes() { return _childNodes; },
    classList: {
      add: function () {
        for (var i = 0; i < arguments.length; i++) _classes.add(arguments[i]);
      },
      remove: function () {
        for (var i = 0; i < arguments.length; i++) _classes.delete(arguments[i]);
      },
      contains: function (cls) { return _classes.has(cls); }
    },
    setAttribute: function (k, v) { _attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(_attrs, k) ? _attrs[k] : null; },
    removeAttribute: function (k) { delete _attrs[k]; },
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(_attrs, k); },
    appendChild: function (child) { _childNodes.push(child); return child; },
    removeChild: function (child) {
      var idx = _childNodes.indexOf(child);
      if (idx !== -1) _childNodes.splice(idx, 1);
      return child;
    },
    insertBefore: function (newNode, ref) {
      var idx = _childNodes.indexOf(ref);
      if (idx === -1) { _childNodes.push(newNode); }
      else { _childNodes.splice(idx, 0, newNode); }
      return newNode;
    },
    querySelector: function (sel) {
      var clsMatch = sel.match(/\.([a-zA-Z0-9_-]+)$/);
      if (!clsMatch) return null;
      var cls = clsMatch[1];
      for (var i = 0; i < _childNodes.length; i++) {
        var c = _childNodes[i];
        if (c && c.classList && c.classList.contains(cls)) return c;
        if (c && c.querySelector) {
          var found = c.querySelector(sel);
          if (found) return found;
        }
      }
      return null;
    },
    // Exposición de internos para verificación en tests
    get _classes() { return _classes; },
    get _attrs()   { return _attrs; },
    get _childNodes() { return _childNodes; }
  };
  return el;
}

/** Mock de document para que el módulo pueda llamar document.createElement */
var mockDocument = {
  createElement: function (tag) { return crearEl(tag); }
};

/* Instalar el mock ANTES de requerir el módulo */
if (typeof global !== 'undefined' && typeof global.document === 'undefined') {
  global.document = mockDocument;
}

/* ------------------------------------------------------------------ *
 *  Cargar el módulo                                                    *
 * ------------------------------------------------------------------ */
const Gutter = require(path.join(__dirname, '..', 'js', 'editor', 'gutter.js'));

/* ------------------------------------------------------------------ *
 *  Utilidades de test                                                  *
 * ------------------------------------------------------------------ */
let total = 0;
let fallas = 0;

function prueba(nombre, fn) {
  total += 1;
  try {
    fn();
    console.log('  ✔ ' + nombre);
  } catch (e) {
    fallas += 1;
    console.error('  ✘ ' + nombre + ' → ' + e.message);
    if (process.env.VERBOSE) console.error(e.stack);
  }
}

function asegurar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'aserción fallida');
}

function igual(real, esperado, mensaje) {
  if (real !== esperado) {
    throw new Error(
      (mensaje || 'valores distintos') +
      '\n    real:     ' + JSON.stringify(real) +
      '\n    esperado: ' + JSON.stringify(esperado)
    );
  }
}

/** Crea un par de contenedores mock para init() */
function crearMocks() {
  return { gutter: crearEl('div'), overlays: crearEl('div') };
}

/* ------------------------------------------------------------------ *
 *  Pruebas                                                             *
 * ------------------------------------------------------------------ */

console.log('Pruebas de gutter incremental del editor');

// 1. Render inicial crea el mínimo de 10 filas
prueba('render inicial con 3 líneas crea 10 filas (mínimo)', function () {
  Gutter._resetEstado();
  var mocks = crearMocks();
  Gutter.init(mocks);
  Gutter.renderizar({ lineas: ['a', 'b', 'c'], erroresMapa: {}, lineaEjecutando: -1,
                      plegables: new Map(), plegados: new Set() });
  igual(Gutter._filasGutter.length,  10, '_filasGutter debe tener 10 filas');
  igual(Gutter._filasOverlay.length, 10, '_filasOverlay debe tener 10 filas');
  // También confirmar que se añadieron al contenedor mock
  igual(mocks.gutter._childNodes.length,   10, 'gutter contenedor: 10 hijos');
  igual(mocks.overlays._childNodes.length, 10, 'overlays contenedor: 10 hijos');
});

// 2. Render inicial con más de 10 líneas crea exactamente N filas
prueba('render inicial con 12 líneas crea 12 filas', function () {
  Gutter._resetEstado();
  var mocks = crearMocks();
  var lineas = [];
  for (var i = 0; i < 12; i++) lineas.push('linea ' + i);
  Gutter.init(mocks);
  Gutter.renderizar({ lineas: lineas, erroresMapa: {}, lineaEjecutando: -1,
                      plegables: new Map(), plegados: new Set() });
  igual(Gutter._filasGutter.length,  12, '_filasGutter debe tener 12 filas');
  igual(Gutter._filasOverlay.length, 12, '_filasOverlay debe tener 12 filas');
});

// 3. Render incremental no recrea filas si el estado no cambia
prueba('render incremental conserva la referencia DOM si el estado no cambia', function () {
  Gutter._resetEstado();
  var mocks = crearMocks();
  var lineas = ['a', 'b', 'c'];
  Gutter.init(mocks);
  Gutter.renderizar({ lineas: lineas, erroresMapa: {}, lineaEjecutando: -1,
                      plegables: new Map(), plegados: new Set() });
  var filaRef = Gutter._filasGutter[0];

  // Segunda llamada idéntica
  Gutter.renderizar({ lineas: lineas, erroresMapa: {}, lineaEjecutando: -1,
                      plegables: new Map(), plegados: new Set() });
  igual(Gutter._filasGutter.length, 10, 'sigue en 10 filas');
  asegurar(Gutter._filasGutter[0] === filaRef, 'la referencia a la fila 0 no debe cambiar');
});

// 4. Render incremental agrega has-error solo a la fila con error
prueba('render incremental agrega has-error solo a la fila con error', function () {
  Gutter._resetEstado();
  var mocks = crearMocks();
  var lineas = ['linea0', 'linea1', 'linea2'];
  Gutter.init(mocks);
  Gutter.renderizar({ lineas: lineas, erroresMapa: {}, lineaEjecutando: -1,
                      plegables: new Map(), plegados: new Set() });
  asegurar(!Gutter._filasGutter[1].classList.contains('has-error'), 'fila 1 sin error al inicio');

  Gutter.renderizar({ lineas: lineas, erroresMapa: { 1: 'error en línea 1' },
                      lineaEjecutando: -1, plegables: new Map(), plegados: new Set() });
  asegurar( Gutter._filasGutter[1].classList.contains('has-error'),  'fila 1 debe tener has-error');
  asegurar(!Gutter._filasGutter[0].classList.contains('has-error'),  'fila 0 no debe tener has-error');
  asegurar(!Gutter._filasGutter[2].classList.contains('has-error'),  'fila 2 no debe tener has-error');
  asegurar( Gutter._filasOverlay[1].classList.contains('has-error'), 'overlay 1 debe tener has-error');
});

// 5. Crecimiento de líneas añade filas al final
prueba('crecimiento de líneas añade filas al final', function () {
  Gutter._resetEstado();
  var mocks = crearMocks();
  Gutter.init(mocks);
  Gutter.renderizar({ lineas: ['a', 'b'], erroresMapa: {}, lineaEjecutando: -1,
                      plegables: new Map(), plegados: new Set() });
  igual(Gutter._filasGutter.length, 10, '10 filas iniciales');

  var muchas = [];
  for (var i = 0; i < 15; i++) muchas.push('linea' + i);
  Gutter.renderizar({ lineas: muchas, erroresMapa: {}, lineaEjecutando: -1,
                      plegables: new Map(), plegados: new Set() });
  igual(Gutter._filasGutter.length,  15, 'debe tener 15 filas tras crecer');
  igual(Gutter._filasOverlay.length, 15, 'overlays también 15');
  igual(mocks.gutter._childNodes.length,   15, 'contenedor gutter: 15 hijos');
  igual(mocks.overlays._childNodes.length, 15, 'contenedor overlays: 15 hijos');
});

// 6. Encogimiento de líneas elimina filas sobrantes
prueba('encogimiento de líneas elimina filas del final', function () {
  Gutter._resetEstado();
  var mocks = crearMocks();
  var muchas = [];
  for (var i = 0; i < 15; i++) muchas.push('l' + i);
  Gutter.init(mocks);
  Gutter.renderizar({ lineas: muchas, erroresMapa: {}, lineaEjecutando: -1,
                      plegables: new Map(), plegados: new Set() });
  igual(Gutter._filasGutter.length, 15, '15 filas al inicio');

  // Reducir a 3 líneas → mínimo de 10
  Gutter.renderizar({ lineas: ['x', 'y', 'z'], erroresMapa: {}, lineaEjecutando: -1,
                      plegables: new Map(), plegados: new Set() });
  igual(Gutter._filasGutter.length,  10, 'debe volver a 10 filas (mínimo)');
  igual(Gutter._filasOverlay.length, 10, 'overlays también 10');
  igual(mocks.gutter._childNodes.length,   10, 'contenedor gutter: 10 hijos');
  igual(mocks.overlays._childNodes.length, 10, 'contenedor overlays: 10 hijos');
});

// 7. marcarLineaEjecutando marca solo la fila indicada
prueba('marcarLineaEjecutando marca solo la fila indicada', function () {
  Gutter._resetEstado();
  var mocks = crearMocks();
  Gutter.init(mocks);
  Gutter.renderizar({ lineas: ['a', 'b', 'c'], erroresMapa: {}, lineaEjecutando: -1,
                      plegables: new Map(), plegados: new Set() });

  Gutter.marcarLineaEjecutando(2);
  asegurar( Gutter._filasGutter[2].classList.contains('executing'),  'fila 2 debe tener executing');
  asegurar(!Gutter._filasGutter[0].classList.contains('executing'),  'fila 0 no debe tener executing');
  asegurar( Gutter._filasOverlay[2].classList.contains('executing'), 'overlay 2 debe tener executing');
  asegurar(!Gutter._filasOverlay[0].classList.contains('executing'), 'overlay 0 no debe tener executing');
});

// 8. limpiarEjecucion quita la clase executing de todas las filas
prueba('limpiarEjecucion elimina la clase executing de todas las filas', function () {
  Gutter._resetEstado();
  var mocks = crearMocks();
  Gutter.init(mocks);
  Gutter.renderizar({ lineas: ['a', 'b', 'c'], erroresMapa: {}, lineaEjecutando: -1,
                      plegables: new Map(), plegados: new Set() });

  Gutter.marcarLineaEjecutando(1);
  asegurar(Gutter._filasGutter[1].classList.contains('executing'), 'fila 1 tiene executing antes de limpiar');

  Gutter.limpiarEjecucion();
  for (var i = 0; i < Gutter._filasGutter.length; i++) {
    asegurar(!Gutter._filasGutter[i].classList.contains('executing'),
      'fila ' + i + ' no debe tener executing tras limpiarEjecucion');
  }
});

// 9. limpiar elimina has-error y executing de todas las filas
prueba('limpiar elimina has-error y executing de todas las filas', function () {
  Gutter._resetEstado();
  var mocks = crearMocks();
  Gutter.init(mocks);
  Gutter.renderizar({ lineas: ['a', 'b', 'c'], erroresMapa: { 0: 'error' },
                      lineaEjecutando: 2, plegables: new Map(), plegados: new Set() });

  asegurar(Gutter._filasGutter[0].classList.contains('has-error'), 'fila 0 tiene has-error');
  asegurar(Gutter._filasGutter[2].classList.contains('executing'), 'fila 2 tiene executing');

  Gutter.limpiar();
  for (var i = 0; i < Gutter._filasGutter.length; i++) {
    asegurar(!Gutter._filasGutter[i].classList.contains('has-error'),
      'fila ' + i + ' no debe tener has-error tras limpiar');
    asegurar(!Gutter._filasGutter[i].classList.contains('executing'),
      'fila ' + i + ' no debe tener executing tras limpiar');
  }
});

// 10. _estadosIguales detecta diferencias en cada campo
prueba('_estadosIguales detecta diferencias en cada campo', function () {
  var base = { numText: '1', tieneError: false, msgError: '', esPlegable: false,
               estaPlegado: false, estaEjecutando: false };

  asegurar(Gutter._estadosIguales(base, Object.assign({}, base)), 'estados iguales → true');
  asegurar(!Gutter._estadosIguales(base, Object.assign({}, base, { numText: '2' })),       'numText distinto');
  asegurar(!Gutter._estadosIguales(base, Object.assign({}, base, { tieneError: true })),   'tieneError distinto');
  asegurar(!Gutter._estadosIguales(base, Object.assign({}, base, { msgError: 'x' })),      'msgError distinto');
  asegurar(!Gutter._estadosIguales(base, Object.assign({}, base, { esPlegable: true })),   'esPlegable distinto');
  asegurar(!Gutter._estadosIguales(base, Object.assign({}, base, { estaPlegado: true })),  'estaPlegado distinto');
  asegurar(!Gutter._estadosIguales(base, Object.assign({}, base, { estaEjecutando: true })), 'estaEjecutando distinto');
  asegurar(!Gutter._estadosIguales(base, null), 'null derecho → false');
  asegurar(!Gutter._estadosIguales(null, base), 'null izquierdo → false');
});

// 11. El ícono fold-toggle aparece en la fila plegable y desaparece si deja de serlo
prueba('fold-toggle aparece y desaparece según plegables', function () {
  Gutter._resetEstado();
  var mocks = crearMocks();
  var lineas = ['Proceso main', '  Escribir "hola"', 'FinProceso'];
  Gutter.init(mocks);
  // Primera pasada: sin plegables
  Gutter.renderizar({ lineas: lineas, erroresMapa: {}, lineaEjecutando: -1,
                      plegables: new Map(), plegados: new Set() });
  asegurar(!Gutter._filasGutter[0].querySelector('.fold-toggle'),
    'sin plegables: fila 0 no debe tener fold-toggle');

  // Segunda pasada: línea 0 es plegable y el bloque está plegado
  var plegables = new Map([[0, { fin: 2, nivel: 0 }]]);
  var plegados  = new Set([0]);
  Gutter.renderizar({ lineas: lineas, erroresMapa: {}, lineaEjecutando: -1,
                      plegables: plegables, plegados: plegados });
  var toggle = Gutter._filasGutter[0].querySelector('.fold-toggle');
  asegurar(toggle !== null, 'fila 0 debe tener fold-toggle cuando es plegable');
  igual(toggle.textContent, '▶', 'ícono debe ser ▶ cuando el bloque está plegado');

  // Tercera pasada: bloque desplegado
  Gutter.renderizar({ lineas: lineas, erroresMapa: {}, lineaEjecutando: -1,
                      plegables: plegables, plegados: new Set() });
  var toggle2 = Gutter._filasGutter[0].querySelector('.fold-toggle');
  asegurar(toggle2 !== null, 'fila 0 sigue siendo plegable');
  igual(toggle2.textContent, '▼', 'ícono debe ser ▼ cuando el bloque está desplegado');
});

// 12. _filaAnterior refleja el estado nuevo tras cada render
prueba('_filaAnterior se actualiza correctamente tras render', function () {
  Gutter._resetEstado();
  var mocks = crearMocks();
  Gutter.init(mocks);
  Gutter.renderizar({ lineas: ['a', 'b'], erroresMapa: { 0: 'fallo' },
                      lineaEjecutando: 1, plegables: new Map(), plegados: new Set() });

  var fa = Gutter._filaAnterior;
  igual(fa[0].tieneError,     true,    '_filaAnterior[0].tieneError debe ser true');
  igual(fa[0].msgError,       'fallo', '_filaAnterior[0].msgError debe ser el mensaje');
  igual(fa[1].estaEjecutando, true,    '_filaAnterior[1].estaEjecutando debe ser true');
  igual(fa[0].estaEjecutando, false,   '_filaAnterior[0].estaEjecutando debe ser false');

  // Limpiar y verificar sincronización
  Gutter.limpiar();
  igual(fa[0].tieneError,     false, 'tras limpiar: tieneError debe ser false');
  igual(fa[0].msgError,       '',    'tras limpiar: msgError debe ser vacío');
  igual(fa[1].estaEjecutando, false, 'tras limpiar: estaEjecutando debe ser false');
});

/* ---- Resumen ---- */
if (fallas === 0) {
  console.log('\n' + total + '/' + total + ' pruebas OK');
} else {
  console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK — ' + fallas + ' FALLAS');
  process.exit(1);
}
