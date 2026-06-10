/**
 * Code4Code — tests/search-tests.js
 * =================================
 * Pruebas del módulo puro de búsqueda y reemplazo del editor
 * (js/editor/search.js). Sin DOM: texto y posiciones absolutas.
 *
 * Uso: node tests/search-tests.js
 */
'use strict';

const path = require('path');
const Search = require(path.join(__dirname, '..', 'js', 'editor', 'search.js'));

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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

console.log('Pruebas de búsqueda y reemplazo del editor');

// ---- buscar ----
prueba('búsqueda literal insensible a mayúsculas por defecto', () => {
  igual(Search.buscar('Escribir x\n  escribir y', 'escribir'),
    [{ inicio: 0, fin: 8 }, { inicio: 13, fin: 21 }]);
});

prueba('búsqueda sensible a mayúsculas con opciones.sensible', () => {
  igual(Search.buscar('Escribir x\n  escribir y', 'escribir', { sensible: true }),
    [{ inicio: 13, fin: 21 }]);
});

prueba('consulta vacía o sin coincidencias devuelve lista vacía', () => {
  igual(Search.buscar('abc', ''), []);
  igual(Search.buscar('abc', 'zzz'), []);
});

prueba('coincidencias contiguas no se solapan', () => {
  igual(Search.buscar('aaaa', 'aa'),
    [{ inicio: 0, fin: 2 }, { inicio: 2, fin: 4 }]);
});

// ---- navegación ----
const TRES = [
  { inicio: 2, fin: 4 },
  { inicio: 10, fin: 12 },
  { inicio: 20, fin: 22 },
];

prueba('indiceSiguiente desde el caret, con envoltura', () => {
  igual(Search.indiceSiguiente(TRES, 0), 0);
  igual(Search.indiceSiguiente(TRES, 5), 1);
  igual(Search.indiceSiguiente(TRES, 21), 0, 'tras la última envuelve al inicio');
  igual(Search.indiceSiguiente([], 0), -1);
});

prueba('indiceAnterior desde el caret, con envoltura', () => {
  igual(Search.indiceAnterior(TRES, 15), 1);
  igual(Search.indiceAnterior(TRES, 2), 2, 'antes de la primera envuelve al final');
  igual(Search.indiceAnterior([], 0), -1);
});

// ---- reemplazo ----
prueba('reemplazar una coincidencia informa el delta de longitud', () => {
  igual(Search.reemplazar('x = nota', { inicio: 4, fin: 8 }, 'promedio'),
    { texto: 'x = promedio', delta: 4 });
  igual(Search.reemplazar('x = promedio', { inicio: 4, fin: 12 }, 'n'),
    { texto: 'x = n', delta: -7 });
});

prueba('reemplazarTodas aplica de atrás hacia adelante sin invalidar offsets', () => {
  const texto = 'nota + nota + nota';
  const coincidencias = Search.buscar(texto, 'nota');
  igual(Search.reemplazarTodas(texto, coincidencias, 'promedio'),
    { texto: 'promedio + promedio + promedio', cantidad: 3 });
});

prueba('reemplazarTodas con reemplazo más corto', () => {
  const texto = 'abc abc abc';
  igual(Search.reemplazarTodas(texto, Search.buscar(texto, 'abc'), 'z'),
    { texto: 'z z z', cantidad: 3 });
});

prueba('reemplazarTodas con lista vacía no toca el texto', () => {
  igual(Search.reemplazarTodas('abc', [], 'z'), { texto: 'abc', cantidad: 0 });
});

// ---- resaltado HTML ----
prueba('resaltarHtml envuelve coincidencias y marca la activa', () => {
  const texto = 'si x\nsi y';
  const c = Search.buscar(texto, 'si');
  igual(Search.resaltarHtml(texto, c, 1, escapeHtml),
    '<span class="search-match">si</span> x\n' +
    '<span class="search-match search-match-active">si</span> y');
});

prueba('resaltarHtml escapa el HTML dentro y fuera de coincidencias', () => {
  const texto = 'a < "b" & c';
  const c = Search.buscar(texto, '"b"');
  igual(Search.resaltarHtml(texto, c, 0, escapeHtml),
    'a &lt; <span class="search-match search-match-active">&quot;b&quot;</span> &amp; c');
});

prueba('resaltarHtml sin coincidencias devuelve el texto escapado', () => {
  igual(Search.resaltarHtml('a < b', [], -1, escapeHtml), 'a &lt; b');
});

console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
if (fallas > 0) process.exit(1);
