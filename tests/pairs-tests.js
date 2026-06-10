/**
 * Code4Code — tests/pairs-tests.js
 * ================================
 * Pruebas del módulo puro de pares y auto-indentación del editor
 * (js/editor/pairs.js). Sin DOM: solo texto y posiciones de selección.
 *
 * Uso: node tests/pairs-tests.js
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const Pairs = require(path.join(__dirname, '..', 'js', 'editor', 'pairs.js'));

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
  }
}

function asegurar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'aserción fallida');
}

function igual(real, esperado, mensaje) {
  const r = JSON.stringify(real);
  const e = JSON.stringify(esperado);
  if (r !== e) {
    throw new Error((mensaje || 'valores distintos') + '\n    real:     ' + r +
      '\n    esperado: ' + e);
  }
}

/** Reglas mínimas equivalentes a las del provider LiteSeInt. */
const REGLAS = {
  aperturas: ['Proceso', 'Si', 'Mientras', 'Para', 'Repetir', 'Segun',
    'SubProceso', 'Funcion'],
  cierres: ['FinProceso', 'FinSi', 'FinMientras', 'FinPara', 'HastaQue',
    'Hasta Que', 'FinSegun', 'FinSubProceso', 'FinFuncion'],
  intermedios: ['Sino', 'De Otro Modo:']
};

console.log('Pruebas de pares y auto-indentación del editor');

// ---- alTeclearApertura ----
prueba('paréntesis sin selección inserta el par y deja el caret en medio', () => {
  igual(Pairs.alTeclearApertura('x = ', 4, 4, '('),
    { valor: 'x = ()', selStart: 5, selEnd: 5 });
});

prueba('comillas sin selección insertan el par', () => {
  igual(Pairs.alTeclearApertura('Escribir ', 9, 9, '"'),
    { valor: 'Escribir ""', selStart: 10, selEnd: 10 });
});

prueba('apertura con selección envuelve y conserva la selección', () => {
  igual(Pairs.alTeclearApertura('a + b', 0, 5, '('),
    { valor: '(a + b)', selStart: 1, selEnd: 6 });
});

prueba('comilla junto a otra comilla salta en vez de insertar', () => {
  igual(Pairs.alTeclearApertura('Escribir "hola"', 14, 14, '"'),
    { valor: 'Escribir "hola"', selStart: 15, selEnd: 15 });
});

prueba('carácter que no es apertura devuelve null', () => {
  asegurar(Pairs.alTeclearApertura('x', 1, 1, '[') === null);
});

// ---- alTeclearCierre ----
prueba('cierre junto al cierre autoinsertado salta sin duplicar', () => {
  igual(Pairs.alTeclearCierre('f()', 2, 2, ')'),
    { valor: 'f()', selStart: 3, selEnd: 3 });
});

prueba('cierre sin cierre adyacente devuelve null (conducta normal)', () => {
  asegurar(Pairs.alTeclearCierre('f(x', 3, 3, ')') === null);
});

prueba('cierre con selección activa devuelve null', () => {
  asegurar(Pairs.alTeclearCierre('f()', 1, 2, ')') === null);
});

// ---- alBorrarAtras ----
prueba('backspace entre par vacío elimina ambos caracteres', () => {
  igual(Pairs.alBorrarAtras('x = ()', 5, 5),
    { valor: 'x = ', selStart: 4, selEnd: 4 });
});

prueba('backspace entre comillas vacías elimina ambas', () => {
  igual(Pairs.alBorrarAtras('s = ""', 5, 5),
    { valor: 's = ', selStart: 4, selEnd: 4 });
});

prueba('backspace con contenido entre el par devuelve null', () => {
  asegurar(Pairs.alBorrarAtras('(x)', 2, 2) === null);
});

prueba('backspace al inicio del texto devuelve null', () => {
  asegurar(Pairs.alBorrarAtras('()', 0, 0) === null);
});

// ---- alNuevaLinea ----
prueba('enter conserva la indentación de la línea actual', () => {
  const v = 'Proceso p\n  x = 1';
  igual(Pairs.alNuevaLinea(v, v.length, v.length, REGLAS),
    { valor: 'Proceso p\n  x = 1\n  ', selStart: 20, selEnd: 20 });
});

prueba('enter tras apertura de bloque agrega un nivel de indentación', () => {
  const v = 'Proceso p\n  Si x > 1';
  igual(Pairs.alNuevaLinea(v, v.length, v.length, REGLAS),
    { valor: 'Proceso p\n  Si x > 1\n    ', selStart: 25, selEnd: 25 });
});

prueba('enter tras intermedio (Sino) agrega un nivel', () => {
  const v = '  Sino';
  const r = Pairs.alNuevaLinea(v, v.length, v.length, REGLAS);
  igual(r.valor, '  Sino\n    ');
});

prueba('la apertura se compara por palabra completa (Sinonimo no abre)', () => {
  const v = '  Sinonimo = 1';
  const r = Pairs.alNuevaLinea(v, v.length, v.length, REGLAS);
  igual(r.valor, '  Sinonimo = 1\n  ');
});

prueba('la comparación es insensible a mayúsculas (si / SI)', () => {
  const r = Pairs.alNuevaLinea('si x', 4, 4, REGLAS);
  igual(r.valor, 'si x\n  ');
});

prueba('un comentario no cuenta como apertura', () => {
  const v = '  // Si esto fuera código';
  const r = Pairs.alNuevaLinea(v, v.length, v.length, REGLAS);
  igual(r.valor, v + '\n  ');
});

prueba('enter en medio de la línea reemplaza la selección', () => {
  const r = Pairs.alNuevaLinea('  abcd', 4, 5, REGLAS);
  igual(r, { valor: '  ab\n  d', selStart: 7, selEnd: 7 });
});

// ---- integración con el provider LiteSeInt real ----
prueba('las reglas reales del provider LiteSeInt indentan Si y Sino', () => {
  // Carga fiel al navegador: cada archivo como script separado, en el
  // mismo orden que index.html, sin asignar léxicos a globalThis a mano.
  const raizRepo = path.join(__dirname, '..');
  const ctx = { console, setTimeout, clearTimeout, Promise };
  vm.createContext(ctx);
  [
    'core/language-provider.js',
    'core/language-registry.js',
    'core/runtime-host.js',
    'core/liteseint/tokenizer.js',
    'core/liteseint/symbol-table.js',
    'core/liteseint/validator.js',
    'core/liteseint/doc_errores.js',
    'core/liteseint/ast.js',
    'core/liteseint/parser.js',
    'core/liteseint/expression-evaluator.js',
    'core/liteseint/runtime.js',
    'core/liteseint/provider.js'
  ].forEach((rel) => {
    vm.runInContext(fs.readFileSync(path.join(raizRepo, rel), 'utf8'), ctx,
      { filename: rel });
  });
  const reglas = ctx.Code4Code.registro.activo().reglasIndentacion();
  igual(Pairs.alNuevaLinea('  Si x', 6, 6, reglas).valor, '  Si x\n    ');
  igual(Pairs.alNuevaLinea('  Sino', 6, 6, reglas).valor, '  Sino\n    ');
  igual(Pairs.alNuevaLinea('  x = 1', 7, 7, reglas).valor, '  x = 1\n  ');
});

console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
if (fallas > 0) process.exit(1);
