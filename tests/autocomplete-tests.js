/**
 * Code4Code — tests/autocomplete-tests.js
 * =======================================
 * Pruebas del autocompletado del editor (Fase 2): el módulo de datos
 * js/editor/autocomplete.js alimentado por la función opcional del
 * contrato `autocompletar(contexto)` del provider LiteSeInt real.
 *
 * Carga los scripts reales en un contexto vm, CADA archivo como script
 * separado y en el mismo orden que index.html, igual que el navegador
 * con scripts clásicos: las declaraciones léxicas del núcleo
 * (const DocErrores, class LiteSeInt) se comparten entre scripts por el
 * entorno léxico global, sin pasar por globalThis.
 *
 * Uso: node tests/autocomplete-tests.js
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

let total = 0;
let fallas = 0;

function prueba(nombre, fn) {
  total += 1;
  return Promise.resolve()
    .then(fn)
    .then(() => console.log('  ✔ ' + nombre))
    .catch((e) => {
      fallas += 1;
      console.error('  ✘ ' + nombre + ' → ' + e.message);
    });
}

function asegurar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'aserción fallida');
}

/**
 * Carga la capa multi-lenguaje + el núcleo LiteSeInt + el provider real +
 * el módulo de autocompletado en un contexto aislado y devuelve el
 * contexto con Code4Code.registro y Code4CodeAutocomplete ya disponibles.
 */
function cargarAppEnContexto() {
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
    'core/liteseint/provider.js',
    'js/editor/autocomplete.js'
  ].forEach((rel) => {
    const fuente = fs.readFileSync(path.join(raizRepo, rel), 'utf8');
    new vm.Script(fuente, { filename: rel }).runInContext(ctx);
  });
  return ctx;
}

/**
 * Atajo: candidatos para un código con el cursor justo después de la
 * primera aparición de `marcador` (posición absoluta en el texto).
 */
function candidatosTras(ctx, codigo, marcador) {
  const pos = codigo.indexOf(marcador);
  if (pos === -1) throw new Error('marcador no encontrado: ' + marcador);
  const cursor = pos + marcador.length;
  const contexto = ctx.Code4CodeAutocomplete.contextoDesdePosicion(codigo, cursor);
  return ctx.Code4CodeAutocomplete.obtenerCandidatos(
    ctx.Code4Code.registro.activo(), contexto);
}

async function main() {
  console.log('Pruebas de autocompletado (js/editor/autocomplete.js + provider LiteSeInt)');

  const ctx = cargarAppEnContexto();

  await prueba('el contexto carga provider y módulo sin tocar globalThis a mano', () => {
    asegurar(ctx.Code4Code && ctx.Code4Code.registro, 'falta Code4Code.registro');
    asegurar(ctx.Code4Code.registro.activo().id === 'liteseint');
    asegurar(typeof ctx.Code4CodeAutocomplete === 'object', 'falta Code4CodeAutocomplete');
    asegurar(typeof ctx.Code4Code.registro.activo().autocompletar === 'function',
      'el provider LiteSeInt debe implementar autocompletar()');
  });

  await prueba('contextoDesdePosicion calcula línea completa y columna 0-based', () => {
    const codigo = 'Proceso p\n  Escr y mas\nFinProceso';
    const cursor = codigo.indexOf('Escr') + 4; // tras "Escr"
    const contexto = ctx.Code4CodeAutocomplete.contextoDesdePosicion(codigo, cursor);
    asegurar(contexto.linea === '  Escr y mas', 'línea: "' + contexto.linea + '"');
    asegurar(contexto.columna === 6, 'columna: ' + contexto.columna);
    asegurar(contexto.codigo === codigo, 'debe conservar el código completo');
  });

  await prueba('sugiere palabras reservadas por prefijo (insensible a mayúsculas)', () => {
    const c = candidatosTras(ctx, 'Proceso p\n  escr\nFinProceso', 'escr');
    asegurar(c.length === 1, 'esperaba 1 candidato, hubo ' + c.length);
    asegurar(c[0].texto === 'Escribir', 'texto: ' + c[0].texto);
    asegurar(c[0].tipo === 'palabra-clave', 'tipo: ' + c[0].tipo);
    asegurar(c[0].detalle === 'instrucción', 'detalle: ' + c[0].detalle);
  });

  await prueba('incluye variables del usuario extraídas del código completo', () => {
    const codigo = 'Proceso p\n' +
      '  Definir contador Como Entero\n' +
      '  cont\n' +
      'FinProceso';
    const c = candidatosTras(ctx, codigo, '  cont');
    const variable = c.filter((x) => x.texto === 'contador');
    asegurar(variable.length === 1, 'candidatos: ' + JSON.stringify(c));
    asegurar(variable[0].tipo === 'variable', 'tipo: ' + variable[0].tipo);
  });

  await prueba('no sugiere dentro de una cadena', () => {
    const c = candidatosTras(ctx,
      'Proceso p\n  Escribir "Escr\nFinProceso', '"Escr');
    asegurar(c.length === 0, 'candidatos: ' + JSON.stringify(c));
  });

  await prueba('no sugiere dentro de un comentario', () => {
    const c = candidatosTras(ctx,
      'Proceso p\n  // Escr\nFinProceso', '// Escr');
    asegurar(c.length === 0, 'candidatos: ' + JSON.stringify(c));
  });

  await prueba('orden estable: palabras reservadas primero, variables después', () => {
    const codigo = 'Proceso p\n' +
      '  Definir pares Como Entero\n' +
      '  pa\n' +
      'FinProceso';
    const c = candidatosTras(ctx, codigo, '  pa');
    const textos = c.map((x) => x.texto);
    asegurar(JSON.stringify(textos) === JSON.stringify(['Para', 'Paso', 'pares']),
      'orden: ' + textos.join(', '));
  });

  await prueba('la palabra ya completa no se sugiere a sí misma', () => {
    const c = candidatosTras(ctx, 'Proceso p\n  Definir\nFinProceso', 'Definir');
    asegurar(c.every((x) => x.texto.toLowerCase() !== 'definir'),
      'candidatos: ' + JSON.stringify(c));
  });

  await prueba('prefijos de menos de 2 caracteres no producen candidatos', () => {
    const c = candidatosTras(ctx, 'Proceso p\n  E\nFinProceso', '  E');
    asegurar(c.length === 0, 'candidatos: ' + JSON.stringify(c));
  });

  await prueba('obtenerCandidatos tolera providers sin autocompletar()', () => {
    const Autocomplete = require(path.join(__dirname, '..', 'js', 'editor', 'autocomplete.js'));
    const contexto = { linea: '  Escr', columna: 6, codigo: '  Escr' };
    asegurar(Autocomplete.obtenerCandidatos(null, contexto).length === 0);
    asegurar(Autocomplete.obtenerCandidatos({}, contexto).length === 0);
    asegurar(Autocomplete.obtenerCandidatos(
      { autocompletar: () => 'no-es-arreglo' }, contexto).length === 0,
      'un retorno inválido debe tratarse como sin sugerencias');
  });

  console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
  if (fallas > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
