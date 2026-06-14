/**
 * Code4Code — tests/pseint-validator-tests.js
 * ============================================
 * Pruebas del validador estático PSeInt (Fase 3).
 * Verifica que validarPSeInt() detecta errores semánticos y estructurales.
 *
 * Uso: node tests/pseint-validator-tests.js
 */
'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
//  Carga de scripts clásicos en contexto Node
// ─────────────────────────────────────────────────────────────────────────────

const raiz = path.join(__dirname, '..');

function cargarEnCtx(ctx, archivo) {
  const codigo = fs.readFileSync(path.join(raiz, archivo), 'utf8');
  vm.runInContext(codigo, ctx, { filename: archivo });
}

// Contexto compartido con todos los módulos necesarios
const ctx = vm.createContext({ console, module: {}, exports: {}, require });
cargarEnCtx(ctx, 'core/pseint/tokenizer.js');
cargarEnCtx(ctx, 'core/pseint/ast.js');
cargarEnCtx(ctx, 'core/pseint/builtins.js');
cargarEnCtx(ctx, 'core/pseint/symbol-table.js');
// El parser necesita DocErroresPSeInt en su scope
ctx.DocErroresPSeInt = ctx.DocErroresPSeInt;
cargarEnCtx(ctx, 'core/pseint/parser.js');
cargarEnCtx(ctx, 'core/pseint/validator.js');

const validarPSeInt = ctx.validarPSeInt;

// ─────────────────────────────────────────────────────────────────────────────
//  Mini framework de pruebas
// ─────────────────────────────────────────────────────────────────────────────

let totalPruebas = 0;
let pruebasFallidas = 0;

function t(nombre, fn) {
  totalPruebas++;
  try {
    fn();
    console.log('  ✔ ' + nombre);
  } catch (e) {
    pruebasFallidas++;
    console.error('  ✘ ' + nombre + ' → ' + e.message);
  }
}

function ok(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'aserción fallida');
}

function hayError(errores, fragmento) {
  return errores.some(function(e) {
    return e.mensaje.toLowerCase().indexOf(fragmento.toLowerCase()) >= 0;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pruebas
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nValidador PSeInt — pruebas\n');

// 1. Programa simple correcto → sin errores
t('programa correcto sin errores', function() {
  const codigo = [
    'Algoritmo saludo',
    '  Escribir "Hola mundo"',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length === 0, 'Se esperaban 0 errores, se obtuvieron: ' + JSON.stringify(errores));
});

// 2. Escribir sin Algoritmo → error en línea 1
t('código sin Algoritmo genera error', function() {
  const codigo = 'Escribir "hola"';
  const errores = validarPSeInt(codigo);
  ok(errores.length > 0, 'Se esperaba al menos un error por falta de Algoritmo');
  ok(errores[0].linea === 1, 'El error debería estar en línea 1, está en: ' + errores[0].linea);
});

// 3. Si sin FinSi → error detectado
t('Si sin FinSi genera error', function() {
  const codigo = [
    'Algoritmo test',
    '  Definir x Como Entero',
    '  x <- 5',
    '  Si x > 0 Entonces',
    '    Escribir x',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  // El parser debería emitir un error o el validator detecta el bloque sin cerrar
  ok(errores.length > 0, 'Se esperaba error por Si sin FinSi');
});

// 4. Variable usada sin Definir cuando sí hay otras definidas → error
t('variable usada sin definir con Definir activo genera error', function() {
  const codigo = [
    'Algoritmo test',
    '  Definir x Como Entero',
    '  x <- 5',
    '  y <- 10',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length > 0, 'Se esperaba error por "y" sin definir');
  ok(hayError(errores, 'y'), 'El error debería mencionar la variable "y"');
});

// 5. Variable definida dos veces → error
t('variable definida dos veces genera error', function() {
  const codigo = [
    'Algoritmo test',
    '  Definir x Como Entero',
    '  Definir x Como Real',
    '  x <- 5',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length > 0, 'Se esperaba error por "x" definida dos veces');
  ok(hayError(errores, 'duplicad'), 'El error debería mencionar duplicado');
});

// 6. Llamada a función inexistente → error
t('llamada a función inexistente genera error', function() {
  const codigo = [
    'Algoritmo test',
    '  Definir resultado Como Real',
    '  resultado <- funcionInventada(5)',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length > 0, 'Se esperaba error por función no definida');
  ok(hayError(errores, 'funcioninventada'), 'El error debería mencionar el nombre de la función');
});

// 7. Programa con Definir y uso correcto → sin errores semánticos
t('Definir x y uso correcto es válido', function() {
  const codigo = [
    'Algoritmo test',
    '  Definir x Como Entero',
    '  x <- 5',
    '  Escribir x',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length === 0, 'Se esperaban 0 errores: ' + JSON.stringify(errores));
});

// 8. Dimension + acceso con índice → válido
t('Dimension arr[5] y arr[1] <- 10 es válido', function() {
  const codigo = [
    'Algoritmo test',
    '  Dimension arr[5]',
    '  arr[1] <- 10',
    '  Escribir arr[1]',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length === 0, 'Se esperaban 0 errores: ' + JSON.stringify(errores));
});

// 9. Asignación con índice sin Dimension → error
t('asignación con índice sin Dimension genera error', function() {
  const codigo = [
    'Algoritmo test',
    '  Definir arr Como Entero',
    '  arr[1] <- 10',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length > 0, 'Se esperaba error por arr usada como arreglo sin Dimension');
  ok(hayError(errores, 'dimension'), 'El error debería mencionar Dimension');
});

// 10. SubProceso llamado que existe → válido
t('Llamar subproceso definido es válido', function() {
  const codigo = [
    'SubProceso Saludar()',
    '  Escribir "Hola"',
    'FinSubProceso',
    'Algoritmo test',
    '  Llamar Saludar()',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length === 0, 'Se esperaban 0 errores: ' + JSON.stringify(errores));
});

// 11. Llamar subproceso que NO existe → error
t('Llamar subproceso inexistente genera error', function() {
  const codigo = [
    'Algoritmo test',
    '  Llamar SubProcesoInventado()',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length > 0, 'Se esperaba error por subproceso no definido');
  ok(hayError(errores, 'subprocesoinventado'), 'El error debería mencionar el nombre del subproceso');
});

// 12. Función builtin usada correctamente → sin errores
t('función builtin Raiz usada correctamente es válida', function() {
  const codigo = [
    'Algoritmo test',
    '  Definir resultado Como Real',
    '  resultado <- Raiz(16)',
    '  Escribir resultado',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length === 0, 'Se esperaban 0 errores: ' + JSON.stringify(errores));
});

// 13. Programa con FinAlgoritmo faltante → error detectado
t('programa sin FinAlgoritmo genera error', function() {
  const codigo = [
    'Algoritmo test',
    '  Escribir "hola"',
    // Sin FinAlgoritmo
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length > 0, 'Se esperaba error por falta de FinAlgoritmo');
});

// 14. Código limpio solo con Escribir y variables definidas → válido
t('código completo con Leer y Escribir es válido', function() {
  const codigo = [
    'Algoritmo suma',
    '  Definir a, b, resultado Como Entero',
    '  Leer a',
    '  Leer b',
    '  resultado <- a + b',
    '  Escribir "La suma es: ", resultado',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length === 0, 'Se esperaban 0 errores: ' + JSON.stringify(errores));
});

// 15. Llamada a función builtin Azar válida
t('función builtin Azar es reconocida', function() {
  const codigo = [
    'Algoritmo azar',
    '  Definir n Como Entero',
    '  n <- Azar(10)',
    '  Escribir n',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo);
  ok(errores.length === 0, 'Se esperaban 0 errores: ' + JSON.stringify(errores));
});

// 16. Aviso de migración: usar = para asignar en perfil estricto
t('aviso de migración: = como asignación en perfil estricto genera error', function() {
  const codigo = [
    'Algoritmo test',
    '  Definir x Como Entero',
    '  x = 5',
    '  Escribir x',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo, { asignacionConIgual: false });
  ok(hayError(errores, '<-'), 'Debe mencionar "<-" en el error de migración');
  const errL3 = errores.filter(function(e) { return e.linea === 3; });
  ok(errL3.length > 0, 'El error debe estar en línea 3');
});

// 17. Asignación con <- en perfil estricto → sin error de migración
t('asignación con <- en perfil estricto no genera aviso', function() {
  const codigo = [
    'Algoritmo test',
    '  Definir x Como Entero',
    '  x <- 5',
    '  Escribir x',
    'FinAlgoritmo',
  ].join('\n');
  const errores = validarPSeInt(codigo, { asignacionConIgual: false });
  const avisoMigracion = errores.filter(function(e) {
    return e.mensaje.indexOf('asignaci') >= 0 && e.mensaje.indexOf('<-') >= 0;
  });
  ok(avisoMigracion.length === 0, 'No debe haber aviso de migración con <-');
});

// ─────────────────────────────────────────────────────────────────────────────
//  Resumen
// ─────────────────────────────────────────────────────────────────────────────

console.log('');
if (pruebasFallidas === 0) {
  console.log('Todas las pruebas pasaron (' + totalPruebas + '/' + totalPruebas + ').');
} else {
  console.error(pruebasFallidas + ' de ' + totalPruebas + ' pruebas fallaron.');
  process.exit(1);
}
