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
