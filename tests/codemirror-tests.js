/**
 * Code4Code — tests/codemirror-tests.js
 * =======================================
 * Pruebas del módulo Code4CodeCM: gutter de errores y resaltado
 * de línea activa. Ejecutables en Node sin navegador real.
 *
 * Uso: node tests/codemirror-tests.js
 */
'use strict';

const path = require('path');

// ─── Mock mínimo de document ──────────────────────────────────────────────────

function crearElMock(tag) {
  return { tagName: (tag || 'div').toUpperCase(), textContent: '', title: '', className: '' };
}

global.document = {
  getElementById: function (id) {
    if (id === 'editor') return { value: 'print("hola")' };
    return null;
  },
  querySelector: function (sel) {
    if (sel === '.editor-panel') return { classList: { add: function () {}, remove: function () {} } };
    return null;
  },
  createElement: function (tag) { return crearElMock(tag); },
};

global.requestAnimationFrame = function (cb) { cb(); };

// ─── Fábrica del mock de CodeMirror ──────────────────────────────────────────

function crearCMMock() {
  var gutterMarkers = {};
  var lineClasses = {};
  var valor = 'print("hola")';

  return {
    _gutterMarkers: gutterMarkers,
    _lineClasses: lineClasses,
    on: function () {},
    save: function () {},
    refresh: function () {},
    getValue: function () { return valor; },
    setValue: function (v) { valor = v; },
    toTextArea: function () {},
    clearGutter: function (gutterId) { gutterMarkers[gutterId] = {}; },
    setGutterMarker: function (lineIdx, gutterId, el) {
      if (!gutterMarkers[gutterId]) gutterMarkers[gutterId] = {};
      gutterMarkers[gutterId][lineIdx] = el;
    },
    addLineClass: function (lineIdx, where, cls) {
      if (!lineClasses[lineIdx]) lineClasses[lineIdx] = {};
      if (!lineClasses[lineIdx][where]) lineClasses[lineIdx][where] = new Set();
      lineClasses[lineIdx][where].add(cls);
    },
    removeLineClass: function (lineIdx, where, cls) {
      if (lineClasses[lineIdx] && lineClasses[lineIdx][where]) {
        lineClasses[lineIdx][where].delete(cls);
      }
    },
    getCursor: function () { return { line: 0, ch: 0 }; },
    getSelection: function () { return ''; },
    replaceSelection: function () {},
    setCursor: function () {},
    focus: function () {},
  };
}

// ─── Cargar módulo ────────────────────────────────────────────────────────────

const modPath = path.join(__dirname, '..', 'js', 'editor', 'codemirror-python.js');
delete require.cache[require.resolve(modPath)];
const Code4CodeCM = require(modPath);

// ─── Mini framework ───────────────────────────────────────────────────────────

let total = 0, fallas = 0;
function prueba(nombre, fn) {
  total++;
  try { fn(); console.log('  ✔ ' + nombre); }
  catch (e) { fallas++; console.error('  ✘ ' + nombre + '\n    ' + (e.message || e)); }
}
function igual(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg ? msg + ': ' : '') + 'esperado ' + B + ', obtenido ' + A);
}
function ok(val, msg) {
  if (!val) throw new Error(msg || 'se esperaba verdadero');
}

// ─── Auxiliar: activar CM con un mock ────────────────────────────────────────

function activarConMock() {
  var cmMock = crearCMMock();
  global.CodeMirror = { fromTextArea: function () { return cmMock; } };
  Code4CodeCM.desactivar();
  Code4CodeCM.activar();
  return cmMock;
}

// ─── Pruebas ──────────────────────────────────────────────────────────────────

console.log('\nCodeMirror Python — gutter de errores y línea activa\n');

prueba('limpiarErrores() no explota si CM no está activo', function () {
  Code4CodeCM.desactivar();
  Code4CodeCM.limpiarErrores();
  igual(Code4CodeCM.activo(), false, 'CM debe seguir inactivo');
});

prueba('mostrarErrores([]) limpia marcadores sin lanzar', function () {
  var cm = activarConMock();
  cm.setGutterMarker(0, 'cm-c4c-errors', crearElMock('span'));
  Code4CodeCM.mostrarErrores([]);
  var marcadores = cm._gutterMarkers['cm-c4c-errors'] || {};
  igual(Object.keys(marcadores).length, 0, 'gutter debe quedar vacío');
});

prueba('mostrarErrores([{linea:1}]) coloca badge en índice 0', function () {
  var cm = activarConMock();
  Code4CodeCM.mostrarErrores([{ linea: 1, mensaje: 'SyntaxError: prueba' }]);
  var marcadores = cm._gutterMarkers['cm-c4c-errors'] || {};
  ok(marcadores[0], 'debe haber marcador en índice 0');
  igual(marcadores[0].title, 'SyntaxError: prueba', 'title debe tener el mensaje');
});

prueba('marcarLineaActiva(3) llama addLineClass en índice 2', function () {
  var cm = activarConMock();
  Code4CodeCM.marcarLineaActiva(3);
  var clases = (cm._lineClasses[2] || {})['background'];
  ok(clases && clases.has('cm-c4c-linea-activa'),
    'addLineClass debe haberse llamado con índice 2');
});

prueba('limpiarLineaActiva() remueve la clase de la línea activa', function () {
  var cm = activarConMock();
  Code4CodeCM.marcarLineaActiva(2);
  Code4CodeCM.limpiarLineaActiva();
  var clases = (cm._lineClasses[1] || {})['background'];
  ok(!clases || !clases.has('cm-c4c-linea-activa'),
    'removeLineClass debe haber quitado la clase del índice 1');
});

prueba('sincronizarDesdeTextarea() no actúa si CM no está activo', function () {
  Code4CodeCM.desactivar();
  Code4CodeCM.sincronizarDesdeTextarea();
  igual(Code4CodeCM.activo(), false, 'CM debe seguir inactivo');
});

prueba('mostrarErrores con linea<=0 no coloca marcador', function () {
  var cm = activarConMock();
  Code4CodeCM.mostrarErrores([{ linea: 0, mensaje: 'err cero' }]);
  var marcadores = cm._gutterMarkers['cm-c4c-errors'] || {};
  igual(Object.keys(marcadores).length, 0, 'línea 0 debe ignorarse');
});

prueba('marcarLineaActiva(0) quita resaltado sin añadir uno nuevo', function () {
  var cm = activarConMock();
  Code4CodeCM.marcarLineaActiva(5);
  Code4CodeCM.marcarLineaActiva(0);
  var clases = (cm._lineClasses[4] || {})['background'];
  ok(!clases || !clases.has('cm-c4c-linea-activa'),
    'clase debe haberse removido del índice 4');
});

// ─── Resultado ────────────────────────────────────────────────────────────────

console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
if (fallas > 0) process.exit(1);
