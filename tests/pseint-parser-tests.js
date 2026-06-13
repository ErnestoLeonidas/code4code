/**
 * Code4Code — tests/pseint-parser-tests.js
 * =========================================
 * Pruebas del parser PSeInt (Fase 3).
 * Verifica que parsearPSeInt() produce el AST correcto para los
 * constructos principales del lenguaje PSeInt (perfil estricto).
 *
 * Uso: node tests/pseint-parser-tests.js
 */
'use strict';

const assert = require('assert');
const vm     = require('vm');
const fs     = require('fs');
const path   = require('path');

// ─────────────────────────────────────────────────────────────────────────────
//  Carga de scripts clásicos en contexto Node
// ─────────────────────────────────────────────────────────────────────────────

const raiz = path.join(__dirname, '..');

/**
 * Carga un script clásico en un contexto vm aislado y devuelve ese contexto.
 */
function cargarEnContexto(archivo, contextoBase) {
  const codigo = fs.readFileSync(path.join(raiz, archivo), 'utf8');
  const ctx = contextoBase || vm.createContext({ module: {}, exports: {}, require, console });
  vm.runInContext(codigo, ctx, { filename: archivo });
  return ctx;
}

// 1. Cargar tokenizador PSeInt → expone DocErroresPSeInt en su contexto
const ctxTK = cargarEnContexto('core/pseint/tokenizer.js');

// 2. Cargar AST PSeInt → expone las funciones nodo* en su contexto
const ctxAST = cargarEnContexto('core/pseint/ast.js');

// 3. Cargar parser en un contexto que combina ambos
const ctxParser = vm.createContext(Object.assign(
  {},
  ctxAST,                              // nodo*, locDeLinea, AST_VERSION_PSEINT
  { DocErroresPSeInt: ctxTK.DocErroresPSeInt, module: {}, exports: {}, console }
));
vm.runInContext(
  fs.readFileSync(path.join(raiz, 'core/pseint/parser.js'), 'utf8'),
  ctxParser,
  { filename: 'core/pseint/parser.js' }
);

const parsearPSeInt = ctxParser.parsearPSeInt;

// ─────────────────────────────────────────────────────────────────────────────
//  Mini framework de pruebas
// ─────────────────────────────────────────────────────────────────────────────

let totalPruebas = 0;
let pruebas_fallidas = 0;

function t(nombre, fn) {
  totalPruebas++;
  try {
    fn();
    console.log('  ✔ ' + nombre);
  } catch (e) {
    pruebas_fallidas++;
    console.error('  ✘ ' + nombre + ' → ' + e.message);
  }
}

function ok(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'aserción fallida');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pruebas
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nParser PSeInt — pruebas\n');

// ── 1. Algoritmo mínimo ────────────────────────────────────────────────────
t('Algoritmo mínimo parsea sin errores', function() {
  const resultado = parsearPSeInt(
    'Algoritmo hola\n  Escribir "hola"\nFinAlgoritmo'
  );
  ok(resultado.errores.length === 0, 'No debe haber errores: ' + JSON.stringify(resultado.errores));
  ok(resultado.ast.tipo === 'Programa', 'El AST debe ser Programa');
  ok(resultado.ast.nombreAlgoritmo === 'hola', 'El nombre debe ser "hola"');
  ok(resultado.ast.cuerpo.length === 1, 'Debe haber 1 instrucción en el cuerpo');
  ok(resultado.ast.cuerpo[0].tipo === 'Escribir', 'Debe ser nodo Escribir');
});

// ── 2. Proceso / FinProceso (alias) ────────────────────────────────────────
t('Proceso/FinProceso produce nodo Asignar', function() {
  const resultado = parsearPSeInt(
    'Proceso test\n  x <- 5\nFinProceso'
  );
  ok(resultado.errores.length === 0, 'Sin errores');
  ok(resultado.ast.cuerpo.length === 1, 'Un nodo en cuerpo');
  ok(resultado.ast.cuerpo[0].tipo === 'Asignar', 'Debe ser Asignar');
});

// ── 3. Si sin Sino ────────────────────────────────────────────────────────
t('Si sin Sino produce nodo Si con sino=null', function() {
  const codigo = [
    'Algoritmo test',
    '  Si x = 5 Entonces',
    '    Escribir x',
    '  FinSi',
    'FinAlgoritmo'
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length === 0, 'Sin errores: ' + JSON.stringify(resultado.errores));
  const nodo = resultado.ast.cuerpo[0];
  ok(nodo.tipo === 'Si', 'Tipo Si');
  ok(nodo.entonces.length === 1, 'Un nodo en entonces');
  ok(nodo.sino === null, 'sino debe ser null');
});

// ── 4. Si con Sino ────────────────────────────────────────────────────────
t('Si con Sino produce nodo Si con sino poblado', function() {
  const codigo = [
    'Algoritmo test',
    '  Si x > 0 Entonces',
    '    Escribir "ok"',
    '  Sino',
    '    Escribir "no"',
    '  FinSi',
    'FinAlgoritmo'
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length === 0, 'Sin errores');
  const nodo = resultado.ast.cuerpo[0];
  ok(nodo.tipo === 'Si', 'Tipo Si');
  ok(Array.isArray(nodo.sino), 'sino debe ser array');
  ok(nodo.sino.length === 1, 'Un nodo en sino');
});

// ── 5. Mientras ───────────────────────────────────────────────────────────
t('Mientras parsea condicion y cuerpo correctamente', function() {
  const codigo = [
    'Algoritmo test',
    '  Mientras i < 10 Hacer',
    '    i <- i + 1',
    '  FinMientras',
    'FinAlgoritmo'
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length === 0, 'Sin errores');
  const nodo = resultado.ast.cuerpo[0];
  ok(nodo.tipo === 'Mientras', 'Tipo Mientras');
  ok(nodo.condicion.indexOf('i') >= 0, 'Condición contiene "i"');
  ok(nodo.cuerpo.length === 1, 'Un nodo en cuerpo');
  ok(nodo.cuerpo[0].tipo === 'Asignar', 'Asignar dentro de Mientras');
});

// ── 6. Para ───────────────────────────────────────────────────────────────
t('Para parsea el bloque y el cuerpo', function() {
  const codigo = [
    'Algoritmo test',
    '  Para i <- 1 Hasta 5 Hacer',
    '    Escribir i',
    '  FinPara',
    'FinAlgoritmo'
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length === 0, 'Sin errores');
  const nodo = resultado.ast.cuerpo[0];
  ok(nodo.tipo === 'Para', 'Tipo Para');
  ok(nodo.cuerpo.length === 1, 'Un nodo en cuerpo');
  ok(nodo.cuerpo[0].tipo === 'Escribir', 'Escribir dentro de Para');
  // El texto del Para debe contener la variable y el rango
  ok(nodo.texto.toLowerCase().indexOf('hasta') >= 0, 'Texto contiene "hasta"');
});

// ── 7. Repetir / Hasta Que ────────────────────────────────────────────────
t('Repetir/Hasta Que produce nodo Repetir con condicion', function() {
  const codigo = [
    'Algoritmo test',
    '  Repetir',
    '    x <- x + 1',
    '  Hasta Que x > 10',
    'FinAlgoritmo'
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length === 0, 'Sin errores: ' + JSON.stringify(resultado.errores));
  const nodo = resultado.ast.cuerpo[0];
  ok(nodo.tipo === 'Repetir', 'Tipo Repetir');
  ok(nodo.cuerpo.length === 1, 'Un nodo en cuerpo');
  ok(nodo.condicion !== '', 'Condicion no vacía');
  ok(nodo.condicion.indexOf('10') >= 0, 'Condicion contiene "10"');
});

// ── 8. Definir ────────────────────────────────────────────────────────────
t('Definir produce nodo Definir con texto completo', function() {
  const codigo = [
    'Algoritmo test',
    '  Definir x Como Entero',
    '  Escribir x',
    'FinAlgoritmo'
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length === 0, 'Sin errores');
  const nodo = resultado.ast.cuerpo[0];
  ok(nodo.tipo === 'Definir', 'Tipo Definir');
  ok(nodo.texto.toLowerCase().indexOf('entero') >= 0, 'Texto contiene "entero"');
});

// ── 9. Leer ───────────────────────────────────────────────────────────────
t('Leer produce nodo Leer con texto completo', function() {
  const codigo = [
    'Algoritmo test',
    '  Leer x, y',
    'FinAlgoritmo'
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length === 0, 'Sin errores');
  const nodo = resultado.ast.cuerpo[0];
  ok(nodo.tipo === 'Leer', 'Tipo Leer');
  ok(nodo.texto.indexOf('x') >= 0, 'Texto contiene x');
  ok(nodo.texto.indexOf('y') >= 0, 'Texto contiene y');
});

// ── 10. Escribir ──────────────────────────────────────────────────────────
t('Escribir produce nodo Escribir con texto completo', function() {
  const codigo = [
    'Algoritmo test',
    '  Escribir "hola", x, y',
    'FinAlgoritmo'
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length === 0, 'Sin errores');
  const nodo = resultado.ast.cuerpo[0];
  ok(nodo.tipo === 'Escribir', 'Tipo Escribir');
  ok(nodo.texto.indexOf('"hola"') >= 0, 'Texto contiene "hola"');
});

// ── 11. Sin FinAlgoritmo → error de parseo ──────────────────────────────
t('Algoritmo sin FinAlgoritmo devuelve error de parseo', function() {
  const codigo = [
    'Algoritmo incompleto',
    '  Escribir "falta cierre"'
    // No hay FinAlgoritmo
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length > 0, 'Debe haber al menos un error de parseo');
  // El ast igual debe existir (tolerante)
  ok(resultado.ast !== null && resultado.ast !== undefined, 'El AST no debe ser null');
  ok(resultado.ast.tipo === 'Programa', 'El AST es Programa aunque haya error');
});

// ── 12. SubProceso a nivel top ────────────────────────────────────────────
t('Programa con SubProceso produce entrada en subprocesos', function() {
  const codigo = [
    'SubProceso Saludar(nombre)',
    '  Escribir "Hola ", nombre',
    'FinSubProceso',
    '',
    'Algoritmo test',
    '  Llamar Saludar("Mundo")',
    'FinAlgoritmo'
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length === 0, 'Sin errores: ' + JSON.stringify(resultado.errores));
  ok(resultado.ast.subprocesos['saludar'] !== undefined, 'SubProceso "saludar" registrado');
  ok(resultado.ast.subprocesos['saludar'].tipo === 'SubProceso', 'Tipo SubProceso');
  ok(resultado.ast.subprocesos['saludar'].cuerpo.length === 1, 'Cuerpo con 1 instrucción');
});

// ── 13. Segun con casos ───────────────────────────────────────────────────
t('Segun produce nodo Segun con casos y De Otro Modo', function() {
  const codigo = [
    'Algoritmo test',
    '  Segun opcion Hacer',
    '    1: Escribir "uno"',
    '    2, 3: Escribir "dos o tres"',
    '    De Otro Modo: Escribir "otro"',
    '  FinSegun',
    'FinAlgoritmo'
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length === 0, 'Sin errores: ' + JSON.stringify(resultado.errores));
  const nodo = resultado.ast.cuerpo[0];
  ok(nodo.tipo === 'Segun', 'Tipo Segun');
  ok(nodo.casos.length === 2, 'Dos casos');
  ok(Array.isArray(nodo.otro), 'De Otro Modo presente como array');
});

// ── 14. Comentarios ignorados ─────────────────────────────────────────────
t('Líneas de comentario no generan nodos en el cuerpo', function() {
  const codigo = [
    'Algoritmo test',
    '  // Este es un comentario',
    '  x <- 1  // comentario inline',
    '  // Otro comentario',
    'FinAlgoritmo'
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length === 0, 'Sin errores');
  // Solo debe haber un nodo Asignar; los comentarios no generan nodos
  ok(resultado.ast.cuerpo.length === 1, 'Solo 1 nodo (la asignación), comentarios ignorados');
});

// ── 15. Bloques anidados ──────────────────────────────────────────────────
t('Si dentro de Mientras (bloques anidados)', function() {
  const codigo = [
    'Algoritmo test',
    '  Mientras i < 10 Hacer',
    '    Si i = 5 Entonces',
    '      Escribir "cinco"',
    '    FinSi',
    '    i <- i + 1',
    '  FinMientras',
    'FinAlgoritmo'
  ].join('\n');
  const resultado = parsearPSeInt(codigo);
  ok(resultado.errores.length === 0, 'Sin errores: ' + JSON.stringify(resultado.errores));
  const nodoMientras = resultado.ast.cuerpo[0];
  ok(nodoMientras.tipo === 'Mientras', 'Mientras externo');
  ok(nodoMientras.cuerpo.length === 2, 'Dos nodos en cuerpo de Mientras');
  ok(nodoMientras.cuerpo[0].tipo === 'Si', 'Primer nodo es Si');
  ok(nodoMientras.cuerpo[1].tipo === 'Asignar', 'Segundo nodo es Asignar');
});

// ─────────────────────────────────────────────────────────────────────────────
//  Resumen
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n─────────────────────────────');
console.log('Pruebas: ' + totalPruebas + '  Fallidas: ' + pruebas_fallidas);
if (pruebas_fallidas > 0) {
  process.exit(1);
} else {
  console.log('Todas las pruebas pasaron.\n');
}
