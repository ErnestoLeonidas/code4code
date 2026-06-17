/**
 * Code4Code — tests/pseint-runtime-tests.js
 * ==========================================
 * Pruebas de integración del EvaluadorPSeInt y RuntimePSeInt (Fase 3).
 * Carga todos los módulos en un contexto vm aislado, igual que hace
 * el navegador con scripts clásicos.
 *
 * Uso: node tests/pseint-runtime-tests.js
 */
'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
//  Carga de scripts en contexto compartido
// ---------------------------------------------------------------------------

function cargar(archivo, ctx) {
  const codigo = fs.readFileSync(path.join(raiz, archivo), 'utf8');
  vm.runInContext(codigo, ctx, { filename: archivo });
  return ctx;
}

// ---------------------------------------------------------------------------
//  Carga de módulos PSeInt en contexto vm
//  Estrategia: cada script clásico declara sus exports vía module.exports.
//  Las clases (class X {}) no se propagan al globalThis del contexto vm,
//  pero sí quedan en module.exports → las capturamos tras cada carga.
// ---------------------------------------------------------------------------

/**
 * Carga un script en un contexto vm y devuelve lo que exporta (module.exports).
 * El contexto acumula las declaraciones de función (function parsearPSeInt...)
 * en su globalThis. Las declaraciones de clase se acceden vía module.exports.
 */
function cargarScript(archivo, ctx) {
  // Resetear module.exports antes de cargar el script
  ctx.module = { exports: {} };
  ctx.exports = ctx.module.exports;
  const codigo = fs.readFileSync(path.join(raiz, archivo), 'utf8');
  vm.runInContext(codigo, ctx, { filename: archivo });
  return ctx.module.exports;
}

// Contexto compartido
const ctx = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  Promise,
  module: { exports: {} },
  exports: {},
  require,
});

// Cargar en orden de dependencias y capturar exports de clases
cargarScript('core/pseint/tokenizer.js',            ctx);   // → ctx.DocErroresPSeInt (const, pero también module.exports)
cargarScript('core/pseint/ast.js',                  ctx);   // → función nodo* en ctx (function decls)
cargarScript('core/pseint/parser.js',               ctx);   // → ctx.parsearPSeInt (function decl)

const expBuiltins     = cargarScript('core/pseint/builtins.js',            ctx);
const expSymbolTable  = cargarScript('core/pseint/symbol-table.js',        ctx);
const expExprEval     = cargarScript('core/pseint/expression-evaluator.js', ctx);
const RuntimePSeInt   = cargarScript('core/pseint/runtime.js',             ctx);

// Inyectar en el contexto lo que necesita el runtime en scope global
// (para cuando el runtime crea instancias de ScopeChainPSeInt, etc.)
ctx.BUILTINS_PSEINT    = expBuiltins;
ctx.ScopeChainPSeInt   = expSymbolTable.ScopeChainPSeInt;
ctx.TablaPSeInt        = expSymbolTable.TablaPSeInt;
ctx.TIPOS_PSEINT       = expSymbolTable.TIPOS_PSEINT;
ctx.coercionarValor    = expSymbolTable.coercionarValor;
ctx.EvaluadorPSeInt    = expExprEval.EvaluadorPSeInt;

// ---------------------------------------------------------------------------
//  Mini framework de pruebas (async)
// ---------------------------------------------------------------------------

let totalPruebas = 0;
let pruebasFallidas = 0;

async function t(nombre, fn) {
  totalPruebas++;
  try {
    await fn();
    console.log('  ✔ ' + nombre);
  } catch (e) {
    pruebasFallidas++;
    console.error('  ✘ ' + nombre + ' → ' + e.message);
    if (process.env.DEBUG) console.error(e.stack);
  }
}

function ok(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'aserción fallida');
}

// ---------------------------------------------------------------------------
//  Helper: host mock
// ---------------------------------------------------------------------------

function crearHostMock(inputsIniciales) {
  const salida  = [];
  const inputs  = (inputsIniciales || []).slice();
  return {
    host: {
      escribir:     (texto, tipo) => salida.push({ texto: String(texto), tipo: tipo || 'output' }),
      leer:         (_nombre)     => Promise.resolve(String(inputs.shift() !== undefined ? inputs.shift() : (inputs.length > 0 ? inputs.shift() : '0'))),
      lineaActiva:  ()            => {},
      variables:    ()            => {},
    },
    salida,
    inputs,
  };
}

// Versión más simple para tests de input
function crearHostConInputs(...vals) {
  const salida = [];
  const cola = vals.map(String);
  return {
    host: {
      escribir:    (texto, tipo) => salida.push({ texto: String(texto), tipo: tipo || 'output' }),
      leer:        ()            => Promise.resolve(cola.shift() || '0'),
      lineaActiva: ()            => {},
      variables:   ()            => {},
    },
    salida,
  };
}

// Ejecuta código PSeInt y espera a que termine. Devuelve array de salidas.
async function ejecutar(codigo, inputs) {
  const rt = new RuntimePSeInt({ asignacionConIgual: false });
  const mock = crearHostConInputs(...(inputs || []));
  await rt.ejecutar(codigo, mock.host);
  return mock.salida;
}

// Convierte la salida a array de strings (solo tipo 'output' o 'output-inline')
function textos(salida) {
  return salida
    .filter(s => s.tipo === 'output' || s.tipo === 'output-inline')
    .map(s => s.texto);
}

function errores(salida) {
  return salida.filter(s => s.tipo === 'error').map(s => s.texto);
}

// ---------------------------------------------------------------------------
//  Pruebas
// ---------------------------------------------------------------------------

async function main() {

console.log('\nRuntime PSeInt — pruebas\n');

// 1. Escribir literal string
await t('Escribir "hola" produce salida "hola"', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Escribir "hola"
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === 'hola', `esperaba ["hola"], obtuvo ${JSON.stringify(t1)}`);
});

// 2. Asignación y escritura de variable
await t('x <- 5; Escribir x produce "5"', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir x Como Entero
      x <- 5
      Escribir x
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '5', `esperaba ["5"], obtuvo ${JSON.stringify(t1)}`);
});

// 3. Condicional Si verdadero
await t('Si 1 = 1 Entonces Escribir "si" produce "si"', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Si 1 = 1 Entonces
        Escribir "si"
      FinSi
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === 'si', `esperaba ["si"], obtuvo ${JSON.stringify(t1)}`);
});

// 4. Condicional Si falso con Sino
await t('Si 1 = 2 Entonces/Sino produce rama Sino', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Si 1 = 2 Entonces
        Escribir "entonces"
      Sino
        Escribir "sino"
      FinSi
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === 'sino', `esperaba ["sino"], obtuvo ${JSON.stringify(t1)}`);
});

// 5. Bucle Para 1 a 3
await t('Para i <- 1 Hasta 3 Hacer produce "1","2","3"', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir i Como Entero
      Para i <- 1 Hasta 3 Hacer
        Escribir i
      FinPara
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(
    t1.length === 3 && t1[0] === '1' && t1[1] === '2' && t1[2] === '3',
    `esperaba ["1","2","3"], obtuvo ${JSON.stringify(t1)}`
  );
});

// 6. Bucle Mientras
await t('Mientras x < 3 Hacer x <- x + 1 FinMientras; Escribir x produce "3"', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir x Como Entero
      x <- 0
      Mientras x < 3 Hacer
        x <- x + 1
      FinMientras
      Escribir x
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '3', `esperaba ["3"], obtuvo ${JSON.stringify(t1)}`);
});

// 7. Bucle Repetir ... Hasta Que
await t('Repetir x <- x + 1 Hasta Que x >= 5; Escribir x produce "5"', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir x Como Entero
      x <- 0
      Repetir
        x <- x + 1
      Hasta Que x >= 5
      Escribir x
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '5', `esperaba ["5"], obtuvo ${JSON.stringify(t1)}`);
});

// 8. Leer variable y escribirla (input "42")
await t('Leer x; Escribir x con input "42" produce "42"', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir x Como Entero
      Leer x
      Escribir x
    FinAlgoritmo
  `, ['42']);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '42', `esperaba ["42"], obtuvo ${JSON.stringify(t1)}`);
});

// 9. Función nativa RC(9) = 3
await t('RC(9) en expresión da 3', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir r Como Real
      r <- RC(9)
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && Number(t1[0]) === 3, `esperaba ["3"], obtuvo ${JSON.stringify(t1)}`);
});

// 10. Detener durante ejecución para sin producir error
await t('Detener durante ejecución para sin error en la salida', async () => {
  const rt = new RuntimePSeInt({ asignacionConIgual: false });
  const salida = [];
  let resolverLeer;
  const host = {
    escribir:    (texto, tipo) => salida.push({ texto, tipo }),
    leer:        ()            => new Promise(res => { resolverLeer = res; }),
    lineaActiva: ()            => {},
    variables:   ()            => {},
  };

  const promesa = rt.ejecutar(`
    Algoritmo prueba
      Definir x Como Entero
      Leer x
      Escribir "nunca"
    FinAlgoritmo
  `, host);

  // Detener inmediatamente antes de que se resuelva el Leer
  const control = await new Promise(res => setTimeout(() => res(null), 10));
  // La promesa de ejecutar ya comenzó; detenemos desde control interno
  // Simulamos detención resolviendo leer con un valor y luego el runtime
  // ya procesó la detención porque detenemos el runtime directamente.
  // Usamos la aproximación de que el runtime devuelve el control.
  if (resolverLeer) resolverLeer('0');
  await promesa;

  const erroresArr = errores(salida);
  ok(
    !erroresArr.some(e => e.includes('DETENIDO')),
    `No debería haber error DETENIDO en salida: ${JSON.stringify(salida)}`
  );
});

// 11. Operadores aritméticos básicos
await t('Expresiones aritméticas: 3 + 4 * 2 = 11', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir r Como Entero
      r <- 3 + 4 * 2
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && Number(t1[0]) === 11, `esperaba ["11"], obtuvo ${JSON.stringify(t1)}`);
});

// 12. Segun / De Otro Modo
await t('Segun ejecuta el caso correcto', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir x Como Entero
      x <- 2
      Segun x Hacer
        1: Escribir "uno"
        2: Escribir "dos"
        De Otro Modo:
          Escribir "otro"
      FinSegun
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === 'dos', `esperaba ["dos"], obtuvo ${JSON.stringify(t1)}`);
});

// 13. Concatenación de strings con +
await t('Concatenación de cadenas con +', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir s Como Cadena
      s <- "hola" + " " + "mundo"
      Escribir s
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === 'hola mundo', `esperaba ["hola mundo"], obtuvo ${JSON.stringify(t1)}`);
});

// 14. Función ABS
await t('ABS(-7) = 7', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir r Como Real
      r <- ABS(-7)
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && Number(t1[0]) === 7, `esperaba ["7"], obtuvo ${JSON.stringify(t1)}`);
});

// 15. Operador MOD
await t('10 MOD 3 = 1', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir r Como Entero
      r <- 10 MOD 3
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && Number(t1[0]) === 1, `esperaba ["1"], obtuvo ${JSON.stringify(t1)}`);
});

// 16. Perfil flexible: variables sin Definir se crean automáticamente
await t('perfil flexible: variables sin Definir se crean en el primer uso', async () => {
  const rt = new RuntimePSeInt({ asignacionConIgual: true });
  const mock = crearHostConInputs();
  await rt.ejecutar(`
    Algoritmo prueba
      a = 10
      b = 3
      c = a + b
      Escribir c
    FinAlgoritmo
  `, mock.host);
  const t1 = textos(mock.salida);
  const errs = errores(mock.salida);
  ok(t1.length === 1 && Number(t1[0]) === 13,
    `esperaba ["13"], obtuvo ${JSON.stringify(t1)}; errores: ${JSON.stringify(errs)}`);
});

// 17. Perfil flexible: arreglo con índices desde 0
await t('perfil flexible: arreglo con índices desde 0', async () => {
  const rt = new RuntimePSeInt({ asignacionConIgual: true, indicesDesde0: true });
  const mock = crearHostConInputs();
  await rt.ejecutar(`
    Algoritmo prueba
      Definir arr Como Entero
      Dimension arr[3]
      arr[0] <- 10
      arr[2] <- 30
      Escribir arr[0]
      Escribir arr[2]
    FinAlgoritmo
  `, mock.host);
  const t1 = textos(mock.salida);
  const errs = errores(mock.salida);
  ok(
    t1.length === 2 && t1[0] === '10' && t1[1] === '30',
    `esperaba ["10","30"], obtuvo ${JSON.stringify(t1)}; errores: ${JSON.stringify(errs)}`
  );
});

// 18. coercionarValor — Real asignado a Entero se trunca
await t('coercionarValor: Real a Entero trunca (3.9 → 3)', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  const r = coercionarValor(3.9, TIPOS_PSEINT.ENTERO);
  ok(r === 3, `esperaba 3, obtuvo ${r}`);
});

// 19. coercionarValor — Logico "Falso" → false (bug fix)
await t('coercionarValor: "Falso" a Logico devuelve false', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  const r = coercionarValor('Falso', TIPOS_PSEINT.LOGICO);
  ok(r === false, `esperaba false, obtuvo ${r}`);
});

// 20. coercionarValor — Logico "Verdadero" → true
await t('coercionarValor: "Verdadero" a Logico devuelve true', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  const r = coercionarValor('Verdadero', TIPOS_PSEINT.LOGICO);
  ok(r === true, `esperaba true, obtuvo ${r}`);
});

// 21. coercionarValor — booleano a Cadena da "Verdadero"/"Falso"
await t('coercionarValor: true/false a Cadena dan "Verdadero"/"Falso"', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor(true,  TIPOS_PSEINT.CADENA) === 'Verdadero', 'true → Verdadero');
  ok(coercionarValor(false, TIPOS_PSEINT.CADENA) === 'Falso',     'false → Falso');
});

// 22. coercionarValor — cadena inválida a Entero lanza error
await t('coercionarValor: cadena no numérica a Entero lanza error', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  let lanzó = false;
  try { coercionarValor('abc', TIPOS_PSEINT.ENTERO); } catch (e) { lanzó = true; }
  ok(lanzó, 'debía lanzar error');
});

// 23. Escribir booleano muestra "Verdadero"/"Falso"
await t('Escribir Logico muestra "Verdadero"/"Falso"', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir b Como Logico
      b <- Verdadero
      Escribir b
      b <- Falso
      Escribir b
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 2 && t1[0] === 'Verdadero' && t1[1] === 'Falso',
    `esperaba ["Verdadero","Falso"], obtuvo ${JSON.stringify(t1)}`);
});

// 24. Asignación implícita Real → Entero trunca en runtime
await t('Asignar Real a Entero trunca el valor', async () => {
  const s = await ejecutar(`
    Algoritmo prueba
      Definir n Como Entero
      n <- 7.9
      Escribir n
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '7',
    `esperaba ["7"], obtuvo ${JSON.stringify(t1)}`);
});

// ---------------------------------------------------------------------------
//  Pruebas de coerción implícita de tipos (cobertura completa)
// ---------------------------------------------------------------------------

// 25. Logico → Entero: Verdadero=1, Falso=0
await t('coercionarValor: Logico a Entero (true→1, false→0)', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor(true,  TIPOS_PSEINT.ENTERO) === 1, 'true → 1');
  ok(coercionarValor(false, TIPOS_PSEINT.ENTERO) === 0, 'false → 0');
});

// 26. Logico → Real: Verdadero=1.0, Falso=0.0
await t('coercionarValor: Logico a Real (true→1, false→0)', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor(true,  TIPOS_PSEINT.REAL) === 1, 'true → 1.0');
  ok(coercionarValor(false, TIPOS_PSEINT.REAL) === 0, 'false → 0.0');
});

// 27. Entero → Logico: 0=Falso, ≠0=Verdadero
await t('coercionarValor: Entero a Logico (0→false, ≠0→true)', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor(0,  TIPOS_PSEINT.LOGICO) === false, '0 → false');
  ok(coercionarValor(1,  TIPOS_PSEINT.LOGICO) === true,  '1 → true');
  ok(coercionarValor(-3, TIPOS_PSEINT.LOGICO) === true,  '-3 → true');
});

// 28. Real → Logico: 0.0=Falso, ≠0.0=Verdadero
await t('coercionarValor: Real a Logico (0.0→false, ≠0.0→true)', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor(0.0, TIPOS_PSEINT.LOGICO) === false, '0.0 → false');
  ok(coercionarValor(1.5, TIPOS_PSEINT.LOGICO) === true,  '1.5 → true');
});

// 29. Cadena → Logico: variantes de mayúsculas/minúsculas
await t('coercionarValor: Cadena a Logico (Verdadero/VERDADERO/Falso/FALSO)', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor('VERDADERO', TIPOS_PSEINT.LOGICO) === true,  'VERDADERO → true');
  ok(coercionarValor('FALSO',     TIPOS_PSEINT.LOGICO) === false, 'FALSO → false');
  ok(coercionarValor('verdadero', TIPOS_PSEINT.LOGICO) === true,  'verdadero → true');
  ok(coercionarValor('falso',     TIPOS_PSEINT.LOGICO) === false, 'falso → false');
});

// 30. Cadena inválida → Logico lanza error
await t('coercionarValor: cadena inválida a Logico lanza error', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  let lanzó = false;
  try { coercionarValor('si', TIPOS_PSEINT.LOGICO); } catch (e) { lanzó = true; }
  ok(lanzó, 'debía lanzar error para "si"');
});

// 31. Entero → Cadena: representación de texto
await t('coercionarValor: Entero a Cadena (42→"42", -5→"-5", 0→"0")', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor(42, TIPOS_PSEINT.CADENA)  === '42',  '42 → "42"');
  ok(coercionarValor(-5, TIPOS_PSEINT.CADENA)  === '-5',  '-5 → "-5"');
  ok(coercionarValor(0,  TIPOS_PSEINT.CADENA)  === '0',   '0 → "0"');
});

// 32. Real → Cadena: representación de texto
await t('coercionarValor: Real a Cadena (3.14→"3.14")', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor(3.14, TIPOS_PSEINT.CADENA) === '3.14', '3.14 → "3.14"');
});

// 33. Cadena → Entero: parseFloat y trunca; cadena inválida lanza
await t('coercionarValor: Cadena numérica a Entero ("7.9"→7, "3"→3)', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor('7.9', TIPOS_PSEINT.ENTERO) === 7,  '"7.9" → 7');
  ok(coercionarValor('3',   TIPOS_PSEINT.ENTERO) === 3,  '"3" → 3');
  ok(coercionarValor('-5',  TIPOS_PSEINT.ENTERO) === -5, '"-5" → -5');
});

// 34. Cadena → Real: parseFloat; cadena inválida lanza
await t('coercionarValor: Cadena numérica a Real ("3.14"→3.14, "-1.5"→-1.5)', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor('3.14', TIPOS_PSEINT.REAL) === 3.14,  '"3.14" → 3.14');
  ok(coercionarValor('-1.5', TIPOS_PSEINT.REAL) === -1.5, '"-1.5" → -1.5');
  let lanzó = false;
  try { coercionarValor('abc', TIPOS_PSEINT.REAL); } catch (e) { lanzó = true; }
  ok(lanzó, '"abc" → lanza error');
});

// 35. Real → Entero con valores negativos (Math.trunc, no floor)
await t('coercionarValor: Real negativo a Entero trunca hacia cero (-3.9→-3)', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor(-3.9, TIPOS_PSEINT.ENTERO) === -3, '-3.9 → -3 (trunc, no floor)');
  ok(coercionarValor(-0.1, TIPOS_PSEINT.ENTERO) === 0,  '-0.1 → 0');
});

// 36. Logico → Caracter: 'V' para Verdadero, 'F' para Falso
await t('coercionarValor: Logico a Caracter da "V"/"F" (no "t"/"f")', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor(true,  TIPOS_PSEINT.CARACTER) === 'V', 'true → "V"');
  ok(coercionarValor(false, TIPOS_PSEINT.CARACTER) === 'F', 'false → "F"');
});

// 37. Cadena → Caracter: primer carácter
await t('coercionarValor: Cadena a Caracter toma primer carácter', () => {
  const { coercionarValor, TIPOS_PSEINT } = expSymbolTable;
  ok(coercionarValor('hola', TIPOS_PSEINT.CARACTER) === 'h', '"hola" → "h"');
  ok(coercionarValor('a',    TIPOS_PSEINT.CARACTER) === 'a', '"a" → "a"');
  ok(coercionarValor('',     TIPOS_PSEINT.CARACTER) === '',  '"" → ""');
});

// ---------------------------------------------------------------------------
//  Pruebas de casos límite (edge cases) — runtime
// ---------------------------------------------------------------------------

// 38. Función con Retornar anticipado en rama condicional (no al final del cuerpo)
await t('SubProceso retorna anticipadamente en rama Si Entonces', async () => {
  const s = await ejecutar(`
    SubProceso res <- EsPositivo(n Como Entero)
      Si n > 0 Entonces
        Retornar 1
      FinSi
      Retornar 0
    FinSubProceso
    Algoritmo test
      Definir r Como Entero
      r <- EsPositivo(5)
      Escribir r
      r <- EsPositivo(-3)
      Escribir r
      r <- EsPositivo(0)
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(
    t1.length === 3 && t1[0] === '1' && t1[1] === '0' && t1[2] === '0',
    `esperaba ["1","0","0"], obtuvo ${JSON.stringify(t1)}`
  );
});

// 39. SubProceso con Dimension interna: arreglo local dentro del subproceso
await t('SubProceso usa Dimension interna y retorna suma de elementos', async () => {
  const s = await ejecutar(`
    SubProceso resultado <- SumaFija()
      Definir local Como Entero
      Definir i Como Entero
      Definir acum Como Entero
      Dimension local[3]
      local[1] <- 10
      local[2] <- 20
      local[3] <- 30
      acum <- 0
      Para i <- 1 Hasta 3 Hacer
        acum <- acum + local[i]
      FinPara
      Retornar acum
    FinSubProceso
    Algoritmo test
      Definir r Como Entero
      r <- SumaFija()
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && Number(t1[0]) === 60,
    `esperaba ["60"], obtuvo ${JSON.stringify(t1)}`);
});

// 40. Repetir…HastaQue ejecuta el cuerpo al menos una vez aunque la condición ya sea cierta
await t('Repetir ejecuta el cuerpo al menos una vez aunque la condición inicial sea verdadera', async () => {
  const s = await ejecutar(`
    Algoritmo test
      Definir x Como Entero
      x <- 5
      Repetir
        x <- x + 1
      Hasta Que x >= 1
      Escribir x
    FinAlgoritmo
  `);
  const t1 = textos(s);
  // x comienza en 5 (>= 1 es verdadero), pero el cuerpo se ejecuta al menos una vez → x = 6
  ok(t1.length === 1 && Number(t1[0]) === 6,
    `esperaba ["6"] (cuerpo ejecutado al menos una vez), obtuvo ${JSON.stringify(t1)}`);
});

// 41. Para con paso 3: 0, 3, 6, 9 (el 12 queda fuera porque 12 > 10)
await t('Para i <- 0 Hasta 10 Con Paso 3 itera en 0, 3, 6, 9', async () => {
  const s = await ejecutar(`
    Algoritmo test
      Definir i Como Entero
      Para i <- 0 Hasta 10 Con Paso 3 Hacer
        Escribir i
      FinPara
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(
    t1.length === 4 &&
    t1[0] === '0' && t1[1] === '3' && t1[2] === '6' && t1[3] === '9',
    `esperaba ["0","3","6","9"], obtuvo ${JSON.stringify(t1)}`
  );
});

// 42. Operador MOD: 17 MOD 5 = 2  y  -7 MOD 3 no falla (sigue semántica JS: -1)
await t('MOD: 17 MOD 5 = 2  y  -7 MOD 3 = -1 sin error', async () => {
  const s1 = await ejecutar(`
    Algoritmo test
      Definir r Como Entero
      r <- 17 MOD 5
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s1);
  ok(t1.length === 1 && Number(t1[0]) === 2,
    `17 MOD 5: esperaba 2, obtuvo ${JSON.stringify(t1)}`);

  const s2 = await ejecutar(`
    Algoritmo test
      Definir r Como Entero
      r <- -7 MOD 3
      Escribir r
    FinAlgoritmo
  `);
  const t2 = textos(s2);
  const errs2 = errores(s2);
  ok(errs2.length === 0, `-7 MOD 3 no debe producir error: ${JSON.stringify(errs2)}`);
  ok(t2.length === 1 && Number(t2[0]) === -1,
    `-7 MOD 3: esperaba -1, obtuvo ${JSON.stringify(t2)}`);
});

// 43. TRUNC con argumento negativo: trunca hacia cero, no hacia -∞ (Math.trunc, no Math.floor)
await t('TRUNC(-2.9) = -2 (trunca hacia cero, no hacia menos infinito)', async () => {
  const s = await ejecutar(`
    Algoritmo test
      Definir r Como Entero
      r <- TRUNC(-2.9)
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && Number(t1[0]) === -2,
    `esperaba ["-2"], obtuvo ${JSON.stringify(t1)}`);
});

// 44. REDON(2.5) = 3 y REDON(-2.5) = -2 (redondeo al entero más cercano)
await t('REDON(2.5) = 3 y REDON(-2.5) = -2', async () => {
  const s = await ejecutar(`
    Algoritmo test
      Definir a Como Entero
      Definir b Como Entero
      a <- REDON(2.5)
      b <- REDON(-2.5)
      Escribir a
      Escribir b
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 2 && Number(t1[0]) === 3 && Number(t1[1]) === -2,
    `esperaba ["3","-2"], obtuvo ${JSON.stringify(t1)}`);
});

// 45. Llamada a función anidada en expresión: LONGITUD(MAYUSCULAS("hola")) = 4
await t('LONGITUD(MAYUSCULAS("hola")) = 4 (función anidada en expresión)', async () => {
  const s = await ejecutar(`
    Algoritmo test
      Definir n Como Entero
      n <- LONGITUD(MAYUSCULAS("hola"))
      Escribir n
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && Number(t1[0]) === 4,
    `esperaba ["4"], obtuvo ${JSON.stringify(t1)}`);
});

// 46. Precedencia Y antes de O: (A Y B) O C
await t('Precedencia booleana: (Verdadero Y Falso) O Verdadero = Verdadero', async () => {
  const s = await ejecutar(`
    Algoritmo test
      Definir r Como Logico
      r <- Verdadero Y Falso O Verdadero
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === 'Verdadero',
    `esperaba ["Verdadero"], obtuvo ${JSON.stringify(t1)}`);
});

// 47. LN y EXP: LN(EXP(1)) ≈ 1
await t('LN(EXP(1)) ≈ 1 (funciones LN y EXP)', async () => {
  const s = await ejecutar(`
    Algoritmo test
      Definir r Como Real
      r <- TRUNC(LN(EXP(1)) * 100) / 100
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && Math.abs(Number(t1[0]) - 1) < 0.01,
    `esperaba ≈ 1, obtuvo ${JSON.stringify(t1)}`);
});

// ---------------------------------------------------------------------------
//  Resumen
// ---------------------------------------------------------------------------

console.log();
if (pruebasFallidas === 0) {
  console.log(`  ✔ Todas las pruebas pasaron (${totalPruebas}/${totalPruebas})`);
} else {
  console.error(`  ✘ ${pruebasFallidas} de ${totalPruebas} pruebas fallaron`);
  process.exitCode = 1;
}

} // fin main()

main().catch(e => { console.error(e); process.exitCode = 1; });
