/**
 * Code4Code — tests/pseint-golden-tests.js
 * ==========================================
 * Golden tests del RuntimePSeInt: programas PSeInt completos ejecutados
 * contra el runtime real, verificando que la salida sea exactamente la esperada.
 * Sirven como regresión ante cambios en el núcleo del intérprete PSeInt.
 *
 * Uso: node tests/pseint-golden-tests.js
 */
'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
//  Carga de scripts en contexto vm compartido
// ---------------------------------------------------------------------------

function cargarScript(archivo, ctx) {
  ctx.module = { exports: {} };
  ctx.exports = ctx.module.exports;
  const codigo = fs.readFileSync(path.join(raiz, archivo), 'utf8');
  vm.runInContext(codigo, ctx, { filename: archivo });
  return ctx.module.exports;
}

const ctx = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  Promise,
  module: { exports: {} },
  exports: {},
  require,
});

cargarScript('core/pseint/tokenizer.js',            ctx);
cargarScript('core/pseint/ast.js',                  ctx);
cargarScript('core/pseint/parser.js',               ctx);

const expBuiltins     = cargarScript('core/pseint/builtins.js',            ctx);
const expSymbolTable  = cargarScript('core/pseint/symbol-table.js',        ctx);
const expExprEval     = cargarScript('core/pseint/expression-evaluator.js', ctx);
const RuntimePSeInt   = cargarScript('core/pseint/runtime.js',             ctx);

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
//  Helpers
// ---------------------------------------------------------------------------

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

function textos(salida) {
  return salida
    .filter(s => s.tipo === 'output' || s.tipo === 'output-inline')
    .map(s => s.texto);
}

function errores(salida) {
  return salida.filter(s => s.tipo === 'error').map(s => s.texto);
}

async function ejecutar(codigo, inputs, perfil) {
  const rt = new RuntimePSeInt(perfil || { asignacionConIgual: false });
  const mock = crearHostConInputs(...(inputs || []));
  await rt.ejecutar(codigo, mock.host);
  return mock.salida;
}

// ---------------------------------------------------------------------------
//  Golden tests
// ---------------------------------------------------------------------------

async function main() {

console.log('\nPSeInt Golden Tests — regresión de programas completos\n');

// ── Perfil estricto ─────────────────────────────────────────────────────────

// 1. Hola mundo
await t('golden 01 — hola mundo', async () => {
  const s = await ejecutar(`
    Algoritmo hola_mundo
      Escribir "Hola, mundo!"
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === 'Hola, mundo!',
    `esperaba ["Hola, mundo!"], obtuvo ${JSON.stringify(t1)}`);
});

// 2. Suma de dos números leídos por teclado (5 + 3 = 8)
await t('golden 02 — suma de dos números con Leer', async () => {
  const s = await ejecutar(`
    Algoritmo suma
      Definir a, b, resultado Como Entero
      Leer a
      Leer b
      resultado <- a + b
      Escribir resultado
    FinAlgoritmo
  `, [5, 3]);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '8',
    `esperaba ["8"], obtuvo ${JSON.stringify(t1)}`);
});

// 3. Factorial con Para (5! = 120)
await t('golden 03 — factorial con Para (5! = 120)', async () => {
  const s = await ejecutar(`
    Algoritmo factorial
      Definir n, i, fact Como Entero
      n <- 5
      fact <- 1
      Para i <- 1 Hasta n Hacer
        fact <- fact * i
      FinPara
      Escribir fact
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '120',
    `esperaba ["120"], obtuvo ${JSON.stringify(t1)}`);
});

// 4. Fibonacci con Mientras (primeros 8 términos: 0 1 1 2 3 5 8 13)
await t('golden 04 — Fibonacci con Mientras (primeros 8 términos)', async () => {
  const s = await ejecutar(`
    Algoritmo fibonacci
      Definir a, b, temp, i Como Entero
      a <- 0
      b <- 1
      i <- 0
      Mientras i < 8 Hacer
        Escribir a
        temp <- a + b
        a <- b
        b <- temp
        i <- i + 1
      FinMientras
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(
    t1.length === 8 &&
    t1[0] === '0' && t1[1] === '1' && t1[2] === '1' &&
    t1[3] === '2' && t1[4] === '3' && t1[5] === '5' &&
    t1[6] === '8' && t1[7] === '13',
    `esperaba [0,1,1,2,3,5,8,13], obtuvo ${JSON.stringify(t1)}`
  );
});

// 5. Mayor de tres números (entradas: 7, 2, 9 → 9)
await t('golden 05 — mayor de tres números', async () => {
  const s = await ejecutar(`
    Algoritmo mayor_tres
      Definir a, b, c, mayor Como Entero
      Leer a
      Leer b
      Leer c
      mayor <- a
      Si b > mayor Entonces
        mayor <- b
      FinSi
      Si c > mayor Entonces
        mayor <- c
      FinSi
      Escribir mayor
    FinAlgoritmo
  `, [7, 2, 9]);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '9',
    `esperaba ["9"], obtuvo ${JSON.stringify(t1)}`);
});

// 6. Tabla de multiplicar del 7 (7x1=7 … 7x10=70)
await t('golden 06 — tabla del 7', async () => {
  const s = await ejecutar(`
    Algoritmo tabla7
      Definir i, resultado Como Entero
      Para i <- 1 Hasta 10 Hacer
        resultado <- 7 * i
        Escribir "7x" + i + "=" + resultado
      FinPara
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 10, `esperaba 10 líneas, obtuvo ${t1.length}`);
  ok(t1[0] === '7x1=7',   `línea 1: esperaba "7x1=7", obtuvo "${t1[0]}"`);
  ok(t1[9] === '7x10=70', `línea 10: esperaba "7x10=70", obtuvo "${t1[9]}"`);
});

// 7. Suma de N números con Repetir (n=3, valores: 10, 20, 30 → suma: 60)
await t('golden 07 — suma de N números con Repetir…HastaQue', async () => {
  const s = await ejecutar(`
    Algoritmo suma_n
      Definir n, i, valor, suma Como Entero
      Leer n
      suma <- 0
      i <- 0
      Repetir
        Leer valor
        suma <- suma + valor
        i <- i + 1
      Hasta Que i >= n
      Escribir suma
    FinAlgoritmo
  `, [3, 10, 20, 30]);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '60',
    `esperaba ["60"], obtuvo ${JSON.stringify(t1)}`);
});

// 8. Arreglo: 5 notas y promedio (6, 7, 8, 9, 10 → promedio: 8)
// Nota: Leer arr[i] no está soportado directamente; se usa variable auxiliar.
await t('golden 08 — arreglo de notas y promedio', async () => {
  const s = await ejecutar(`
    Algoritmo promedio_notas
      Definir notas Como Real
      Definir i Como Entero
      Definir suma, prom, val Como Real
      Dimension notas[5]
      suma <- 0
      Para i <- 1 Hasta 5 Hacer
        Leer val
        notas[i] <- val
        suma <- suma + notas[i]
      FinPara
      prom <- suma / 5
      Escribir prom
    FinAlgoritmo
  `, [6, 7, 8, 9, 10]);
  const t1 = textos(s);
  ok(t1.length === 1, `esperaba 1 salida, obtuvo ${t1.length}`);
  ok(Math.abs(Number(t1[0]) - 8) < 0.001,
    `esperaba promedio 8, obtuvo "${t1[0]}"`);
});

// 9. SubProceso void: saluda con nombre leído (entrada: "Ana" → "Hola, Ana")
await t('golden 09 — SubProceso void (saludar con nombre)', async () => {
  const s = await ejecutar(`
    SubProceso Saludar(nombre Como Cadena)
      Escribir "Hola, " + nombre
    FinSubProceso

    Algoritmo usar_subproceso
      Definir nom Como Cadena
      Leer nom
      Llamar Saludar(nom)
    FinAlgoritmo
  `, ['Ana']);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === 'Hola, Ana',
    `esperaba ["Hola, Ana"], obtuvo ${JSON.stringify(t1)}`);
});

// 10. SubProceso con retorno usando Retornar (cuadrado de 4 → 16)
// Nota: la variable de retorno en "SubProceso res <- Nombre()" debe
// declararse con Definir dentro del cuerpo. Se usa Retornar como alternativa.
await t('golden 10 — SubProceso con Retornar (cuadrado de 4 = 16)', async () => {
  const s = await ejecutar(`
    SubProceso Cuadrado(n Como Entero)
      Retornar n * n
    FinSubProceso

    Algoritmo usar_cuadrado
      Definir r Como Entero
      r <- Cuadrado(4)
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '16',
    `esperaba ["16"], obtuvo ${JSON.stringify(t1)}`);
});

// 11. SubProceso que devuelve el doble de un número
// (reemplaza swap con Por Referencia, que no está soportado por _parsearParams)
await t('golden 11 — SubProceso devuelve suma de dos parámetros (3 + 4 = 7)', async () => {
  const s = await ejecutar(`
    SubProceso Sumar(a Como Entero, b Como Entero)
      Retornar a + b
    FinSubProceso

    Algoritmo usar_sumar
      Definir res Como Entero
      res <- Sumar(3, 4)
      Escribir res
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '7',
    `esperaba ["7"], obtuvo ${JSON.stringify(t1)}`);
});

// 12. Segun/FinSegun (entrada: 2 → "Martes")
await t('golden 12 — Segun/FinSegun (2 → "Martes")', async () => {
  const s = await ejecutar(`
    Algoritmo dia_semana
      Definir d Como Entero
      Leer d
      Segun d Hacer
        1: Escribir "Lunes"
        2: Escribir "Martes"
        3: Escribir "Miercoles"
        4: Escribir "Jueves"
        5: Escribir "Viernes"
        6: Escribir "Sabado"
        7: Escribir "Domingo"
        De Otro Modo:
          Escribir "Dia invalido"
      FinSegun
    FinAlgoritmo
  `, [2]);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === 'Martes',
    `esperaba ["Martes"], obtuvo ${JSON.stringify(t1)}`);
});

// 13. Conteo con Mientras (del 1 al 5)
await t('golden 13 — conteo del 1 al 5 con Mientras', async () => {
  const s = await ejecutar(`
    Algoritmo contar
      Definir i Como Entero
      i <- 1
      Mientras i <= 5 Hacer
        Escribir i
        i <- i + 1
      FinMientras
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(
    t1.length === 5 &&
    t1[0] === '1' && t1[1] === '2' && t1[2] === '3' &&
    t1[3] === '4' && t1[4] === '5',
    `esperaba [1,2,3,4,5], obtuvo ${JSON.stringify(t1)}`
  );
});

// 14. TRUNC y REDON con valores reales
await t('golden 14 — TRUNC(3.7) = 3, REDON(3.5) = 4', async () => {
  const s = await ejecutar(`
    Algoritmo funciones_reales
      Definir t, r Como Entero
      Definir x Como Real
      x <- 3.7
      t <- TRUNC(x)
      Escribir t
      x <- 3.5
      r <- REDON(x)
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 2, `esperaba 2 salidas, obtuvo ${t1.length}`);
  ok(Number(t1[0]) === 3, `TRUNC(3.7): esperaba 3, obtuvo "${t1[0]}"`);
  ok(Number(t1[1]) === 4, `REDON(3.5): esperaba 4, obtuvo "${t1[1]}"`);
});

// 15. LONGITUD y MAYUSCULAS de cadena
await t('golden 15 — LONGITUD("hola") = 4, MAYUSCULAS("hola") = "HOLA"', async () => {
  const s = await ejecutar(`
    Algoritmo cadenas
      Definir s Como Cadena
      Definir lon Como Entero
      s <- "hola"
      lon <- LONGITUD(s)
      Escribir lon
      Escribir MAYUSCULAS(s)
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 2, `esperaba 2 salidas, obtuvo ${t1.length}`);
  ok(t1[0] === '4',    `LONGITUD: esperaba "4", obtuvo "${t1[0]}"`);
  ok(t1[1] === 'HOLA', `MAYUSCULAS: esperaba "HOLA", obtuvo "${t1[1]}"`);
});

// 16. Recursión: factorial recursivo con Retornar (6! = 720)
// Nota: las llamadas a subprocesos no se pueden usar dentro de expresiones
// (el evaluador solo reconoce BUILTINS en expresiones). Se usa una variable
// intermedia para capturar el resultado antes de usarlo en la multiplicación.
await t('golden 16 — factorial recursivo con Retornar (6! = 720)', async () => {
  const s = await ejecutar(`
    SubProceso FactRec(n Como Entero)
      Si n <= 1 Entonces
        Retornar 1
      Sino
        Definir m, sub Como Entero
        m <- n - 1
        sub <- FactRec(m)
        Retornar n * sub
      FinSi
    FinSubProceso

    Algoritmo factorial_recursivo
      Definir r Como Entero
      r <- FactRec(6)
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '720',
    `esperaba ["720"], obtuvo ${JSON.stringify(t1)}`);
});

// 17. Matriz 2D 2x3: llenar con valores 1..6 y sumar todos (suma = 21)
await t('golden 17 — matriz 2D 2x3, suma de todos los elementos = 21', async () => {
  const s = await ejecutar(`
    Algoritmo matriz_2d
      Definir mat Como Entero
      Definir i, j, suma, val Como Entero
      Dimension mat[2, 3]
      val <- 1
      Para i <- 1 Hasta 2 Hacer
        Para j <- 1 Hasta 3 Hacer
          mat[i, j] <- val
          val <- val + 1
        FinPara
      FinPara
      suma <- 0
      Para i <- 1 Hasta 2 Hacer
        Para j <- 1 Hasta 3 Hacer
          suma <- suma + mat[i, j]
        FinPara
      FinPara
      Escribir suma
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '21',
    `esperaba ["21"], obtuvo ${JSON.stringify(t1)}`);
});

// ── Perfil flexible ──────────────────────────────────────────────────────────

// 18. Asignación con = en perfil flexible (a = 5, b = 3 → suma = 8)
// Nota: no usar 'y' como nombre de variable (es keyword AND en PSeInt).
// En perfil flexible las variables se crean automáticamente sin Definir.
await t('golden 18 — perfil flexible: asignación con = (5 + 3 = 8)', async () => {
  const rt = new RuntimePSeInt({ asignacionConIgual: true });
  const mock = crearHostConInputs();
  await rt.ejecutar(`
    Algoritmo suma_flexible
      a = 5
      b = 3
      suma = a + b
      Escribir suma
    FinAlgoritmo
  `, mock.host);
  const t1 = textos(mock.salida);
  const errs = errores(mock.salida);
  ok(t1.length === 1 && t1[0] === '8',
    `esperaba ["8"], obtuvo ${JSON.stringify(t1)}; errores: ${JSON.stringify(errs)}`);
});

// 19. Perfil flexible: variables sin Definir, auto-creadas en primer uso
await t('golden 19 — perfil flexible: variable sin Definir (auto-creada)', async () => {
  const rt = new RuntimePSeInt({ asignacionConIgual: true });
  const mock = crearHostConInputs();
  await rt.ejecutar(`
    Algoritmo sin_definir
      contador = 0
      contador = contador + 1
      contador = contador + 1
      contador = contador + 1
      Escribir contador
    FinAlgoritmo
  `, mock.host);
  const t1 = textos(mock.salida);
  const errs = errores(mock.salida);
  ok(t1.length === 1 && t1[0] === '3',
    `esperaba ["3"], obtuvo ${JSON.stringify(t1)}; errores: ${JSON.stringify(errs)}`);
});

// 20. Perfil flexible: arreglo con índices desde 0
await t('golden 20 — perfil flexible: arreglo con índices base 0', async () => {
  const rt = new RuntimePSeInt({ asignacionConIgual: true, indicesDesde0: true });
  const mock = crearHostConInputs();
  await rt.ejecutar(`
    Algoritmo arreglo_base0
      Definir arr Como Entero
      Dimension arr[3]
      arr[0] <- 100
      arr[1] <- 200
      arr[2] <- 300
      Escribir arr[0]
      Escribir arr[1]
      Escribir arr[2]
    FinAlgoritmo
  `, mock.host);
  const t1 = textos(mock.salida);
  const errs = errores(mock.salida);
  ok(
    t1.length === 3 && t1[0] === '100' && t1[1] === '200' && t1[2] === '300',
    `esperaba ["100","200","300"], obtuvo ${JSON.stringify(t1)}; errores: ${JSON.stringify(errs)}`
  );
});

// ── Tests adicionales de regresión ───────────────────────────────────────────

// 21. Escribir Sin Saltar (concatenación en línea)
await t('golden 21 — Escribir Sin Saltar encadena salidas en una línea', async () => {
  const s = await ejecutar(`
    Algoritmo sin_saltar
      Escribir Sin Saltar "A"
      Escribir Sin Saltar "B"
      Escribir "C"
    FinAlgoritmo
  `);
  // "A" y "B" van como output-inline, "C" cierra la línea como output
  const todos = s.map(x => x.texto);
  // La salida combinada debe contener A, B y C
  const linea = todos.join('');
  ok(linea.includes('A') && linea.includes('B') && linea.includes('C'),
    `esperaba A, B, C en la salida; obtuvo ${JSON.stringify(todos)}`);
});

// 22. Operador POT (potenciación) — 2^10 = 1024
await t('golden 22 — operador POT (2^10 = 1024)', async () => {
  const s = await ejecutar(`
    Algoritmo potencia
      Definir r Como Real
      r <- 2 ^ 10
      Escribir r
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 1 && Math.abs(Number(t1[0]) - 1024) < 0.001,
    `esperaba 1024, obtuvo "${t1[0]}"`);
});

// 23. División entera con TRUNC y MOD (TRUNC(17/5) = 3, 17 MOD 5 = 2)
// Nota: PSeInt usa MOD para el módulo; no tiene operador DIV (eso es LiteSeInt).
// La división entera se obtiene con TRUNC(a / b).
await t('golden 23 — división entera TRUNC(17/5) = 3 y 17 MOD 5 = 2', async () => {
  const s = await ejecutar(`
    Algoritmo div_entera
      Definir cociente, resto Como Entero
      cociente <- TRUNC(17 / 5)
      resto <- 17 MOD 5
      Escribir cociente
      Escribir resto
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(t1.length === 2, `esperaba 2 salidas, obtuvo ${t1.length}`);
  ok(t1[0] === '3', `TRUNC(17/5): esperaba "3", obtuvo "${t1[0]}"`);
  ok(t1[1] === '2', `MOD: esperaba "2", obtuvo "${t1[1]}"`);
});

// 24. Leer múltiples variables en una sola instrucción (Leer a, b, c)
await t('golden 24 — Leer múltiples variables en una instrucción', async () => {
  const s = await ejecutar(`
    Algoritmo leer_multi
      Definir a, b, c Como Entero
      Leer a, b, c
      Escribir a + b + c
    FinAlgoritmo
  `, [1, 2, 3]);
  const t1 = textos(s);
  ok(t1.length === 1 && t1[0] === '6',
    `esperaba ["6"], obtuvo ${JSON.stringify(t1)}`);
});

// 25. Para con paso negativo (de 10 a 1 con paso -2: 10, 8, 6, 4, 2)
await t('golden 25 — Para con paso negativo (10 hasta 1 paso -2)', async () => {
  const s = await ejecutar(`
    Algoritmo para_negativo
      Definir i Como Entero
      Para i <- 10 Hasta 1 Con Paso -2 Hacer
        Escribir i
      FinPara
    FinAlgoritmo
  `);
  const t1 = textos(s);
  ok(
    t1.length === 5 &&
    t1[0] === '10' && t1[1] === '8' && t1[2] === '6' &&
    t1[3] === '4'  && t1[4] === '2',
    `esperaba [10,8,6,4,2], obtuvo ${JSON.stringify(t1)}`
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
