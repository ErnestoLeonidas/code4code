/**
 * Code4Code — tests/pseint-builtins-tests.js
 * ===========================================
 * Pruebas de las funciones nativas de PSeInt (core/pseint/builtins.js)
 * y de la tabla de símbolos PSeInt (core/pseint/symbol-table.js).
 *
 * Uso: node tests/pseint-builtins-tests.js
 */
'use strict';

const path = require('path');

const BUILTINS = require(path.join(__dirname, '..', 'core', 'pseint', 'builtins.js'));
const { TablaPSeInt, ScopeChainPSeInt, TIPOS_PSEINT, coercionarValor } =
  require(path.join(__dirname, '..', 'core', 'pseint', 'symbol-table.js'));

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

function igual(real, esperado, mensaje) {
  const r = JSON.stringify(real);
  const e = JSON.stringify(esperado);
  if (r !== e) {
    throw new Error((mensaje || 'valores distintos') +
      '\n    real:     ' + r +
      '\n    esperado: ' + e);
  }
}

function asegurar(cond, msg) {
  if (!cond) throw new Error(msg || 'aserción fallida');
}

function lanzaError(fn, patron, msg) {
  try {
    fn();
    throw new Error((msg || 'se esperaba un error') + ' — pero no se lanzó ninguno');
  } catch (e) {
    if (patron && !patron.test(e.message)) {
      throw new Error((msg || 'error inesperado') + '\n    mensaje real: ' + e.message);
    }
  }
}

// ============================================================
// BUILTINS — funciones matemáticas
// ============================================================
console.log('\nPruebas de BUILTINS_PSEINT — matemáticas');

prueba('RC(9) devuelve 3', () => {
  igual(BUILTINS.RC.fn(9), 3);
});

prueba('RAIZ(4) devuelve 2', () => {
  igual(BUILTINS.RAIZ.fn(4), 2);
});

prueba('RAIZ(-1) lanza error', () => {
  lanzaError(() => BUILTINS.RAIZ.fn(-1), /negativo/i, 'RAIZ(-1)');
});

prueba('RC(-1) lanza error', () => {
  lanzaError(() => BUILTINS.RC.fn(-1), /negativo/i, 'RC(-1)');
});

prueba('ABS(-5) devuelve 5', () => {
  igual(BUILTINS.ABS.fn(-5), 5);
});

prueba('ABS(3) devuelve 3', () => {
  igual(BUILTINS.ABS.fn(3), 3);
});

prueba('REDON(3.7) devuelve 4', () => {
  igual(BUILTINS.REDON.fn(3.7), 4);
});

prueba('REDON(3.2) devuelve 3', () => {
  igual(BUILTINS.REDON.fn(3.2), 3);
});

prueba('TRUNC(3.9) devuelve 3', () => {
  igual(BUILTINS.TRUNC.fn(3.9), 3);
});

prueba('TRUNC(-3.9) devuelve -3', () => {
  igual(BUILTINS.TRUNC.fn(-3.9), -3);
});

prueba('LN(1) devuelve 0', () => {
  igual(BUILTINS.LN.fn(1), 0);
});

prueba('LN(0) lanza error', () => {
  lanzaError(() => BUILTINS.LN.fn(0), /mayor que cero/i, 'LN(0)');
});

prueba('EXP(0) devuelve 1', () => {
  igual(BUILTINS.EXP.fn(0), 1);
});

prueba('SEN argumento no numérico lanza error', () => {
  lanzaError(() => BUILTINS.SEN.fn('x'), /numérico/i, 'SEN("x")');
});

prueba('COS(0) devuelve 1', () => {
  igual(BUILTINS.COS.fn(0), 1);
});

prueba('ATAN(0) devuelve 0', () => {
  igual(BUILTINS.ATAN.fn(0), 0);
});

prueba('AZAR(10) devuelve entero entre 0 y 9', () => {
  const r = BUILTINS.AZAR.fn(10);
  asegurar(Number.isInteger(r) && r >= 0 && r < 10,
    'AZAR(10) fuera de rango: ' + r);
});

prueba('AZAR(1) siempre devuelve 0', () => {
  igual(BUILTINS.AZAR.fn(1), 0);
});

prueba('AZAR(0) lanza error', () => {
  lanzaError(() => BUILTINS.AZAR.fn(0), /mayor que cero/i, 'AZAR(0)');
});

prueba('AZAR(-3) lanza error', () => {
  lanzaError(() => BUILTINS.AZAR.fn(-3), /mayor que cero/i, 'AZAR(-3)');
});

prueba('ALEATORIO(3, 7) devuelve entero entre 3 y 7', () => {
  for (let i = 0; i < 50; i++) {
    const r = BUILTINS.ALEATORIO.fn(3, 7);
    asegurar(Number.isInteger(r) && r >= 3 && r <= 7,
      'ALEATORIO(3,7) fuera de rango: ' + r);
  }
});

prueba('ALEATORIO(5, 5) siempre devuelve 5', () => {
  igual(BUILTINS.ALEATORIO.fn(5, 5), 5);
});

prueba('ALEATORIO(b < a) lanza error', () => {
  lanzaError(() => BUILTINS.ALEATORIO.fn(10, 3), /mayor que el segundo/i, 'ALEATORIO(10,3)');
});

// ============================================================
// BUILTINS — funciones de cadena
// ============================================================
console.log('\nPruebas de BUILTINS_PSEINT — cadenas');

prueba('LONGITUD("hola") devuelve 4', () => {
  igual(BUILTINS.LONGITUD.fn('hola'), 4);
});

prueba('LONGITUD("") devuelve 0', () => {
  igual(BUILTINS.LONGITUD.fn(''), 0);
});

prueba('SUBCADENA("abcdef", 2, 4) devuelve "bcd"', () => {
  igual(BUILTINS.SUBCADENA.fn('abcdef', 2, 4), 'bcd');
});

prueba('SUBCADENA("hola", 1, 4) devuelve "hola"', () => {
  igual(BUILTINS.SUBCADENA.fn('hola', 1, 4), 'hola');
});

prueba('SUBCADENA i > j devuelve ""', () => {
  igual(BUILTINS.SUBCADENA.fn('abc', 4, 2), '');
});

prueba('SUBCADENA fuera de rango devuelve ""', () => {
  igual(BUILTINS.SUBCADENA.fn('abc', 10, 12), '');
});

prueba('MAYUSCULAS("hola") devuelve "HOLA"', () => {
  igual(BUILTINS.MAYUSCULAS.fn('hola'), 'HOLA');
});

prueba('MINUSCULAS("MUNDO") devuelve "mundo"', () => {
  igual(BUILTINS.MINUSCULAS.fn('MUNDO'), 'mundo');
});

prueba('CONVERTIRANUMERO("42") devuelve 42', () => {
  igual(BUILTINS.CONVERTIRANUMERO.fn('42'), 42);
});

prueba('CONVERTIRANUMERO("3.14") devuelve 3.14', () => {
  igual(BUILTINS.CONVERTIRANUMERO.fn('3.14'), 3.14);
});

prueba('CONVERTIRANUMERO("abc") lanza error', () => {
  lanzaError(() => BUILTINS.CONVERTIRANUMERO.fn('abc'), /no se puede convertir/i);
});

prueba('CONVERTIRATEXTO(3.14) devuelve "3.14"', () => {
  igual(BUILTINS.CONVERTIRATEXTO.fn(3.14), '3.14');
});

prueba('CONVERTIRATEXTO(0) devuelve "0"', () => {
  igual(BUILTINS.CONVERTIRATEXTO.fn(0), '0');
});

prueba('CONCATENAR("a", "b", "c") devuelve "abc"', () => {
  igual(BUILTINS.CONCATENAR.fn('a', 'b', 'c'), 'abc');
});

prueba('CONCATENAR("hola", " ", "mundo") devuelve "hola mundo"', () => {
  igual(BUILTINS.CONCATENAR.fn('hola', ' ', 'mundo'), 'hola mundo');
});

prueba('CONCATENAR con un solo argumento devuelve el mismo valor', () => {
  igual(BUILTINS.CONCATENAR.fn('x'), 'x');
});

// ============================================================
// TablaPSeInt
// ============================================================
console.log('\nPruebas de TablaPSeInt');

prueba('definir y buscar variable', () => {
  const t = new TablaPSeInt();
  t.definir('Contador', TIPOS_PSEINT.ENTERO, 0);
  const sim = t.buscar('contador'); // normalización a minúsculas
  asegurar(sim !== null, 'debe encontrar la variable');
  igual(sim.tipo, TIPOS_PSEINT.ENTERO);
  igual(sim.inicializada, false);
  igual(sim.nombreOriginal, 'Contador');
});

prueba('buscar variable inexistente devuelve null', () => {
  const t = new TablaPSeInt();
  igual(t.buscar('x'), null);
});

prueba('inicializar marca la variable', () => {
  const t = new TablaPSeInt();
  t.definir('X', TIPOS_PSEINT.REAL, 1);
  t.inicializar('X');
  asegurar(t.buscar('x').inicializada === true);
});

prueba('listar devuelve todas las entradas', () => {
  const t = new TablaPSeInt();
  t.definir('A', TIPOS_PSEINT.ENTERO, 0);
  t.definir('B', TIPOS_PSEINT.CADENA, 1);
  igual(t.listar().length, 2);
});

prueba('clonar devuelve copia independiente', () => {
  const t = new TablaPSeInt();
  t.definir('N', TIPOS_PSEINT.LOGICO, 0);
  const c = t.clonar();
  c.inicializar('N');
  asegurar(t.buscar('n').inicializada === false, 'el original no debe verse afectado');
  asegurar(c.buscar('n').inicializada === true, 'el clon debe reflejar el cambio');
});

prueba('redefinir variable con tipo null completa los datos', () => {
  const t = new TablaPSeInt();
  // Simula pre-registro sin tipo
  t.variables.set('x', { tipo: null, inicializada: false, lineaDefinicion: -1, nombreOriginal: 'x' });
  t.definir('X', TIPOS_PSEINT.CARACTER, 5);
  const sim = t.buscar('x');
  igual(sim.tipo, TIPOS_PSEINT.CARACTER);
  igual(sim.lineaDefinicion, 5);
});

// ============================================================
// ScopeChainPSeInt
// ============================================================
console.log('\nPruebas de ScopeChainPSeInt');

prueba('scope global disponible desde el inicio', () => {
  const sc = new ScopeChainPSeInt();
  asegurar(sc.global() === sc.actual());
  igual(sc.profundidad(), 1);
});

prueba('push crea nuevo scope; pop lo elimina', () => {
  const sc = new ScopeChainPSeInt();
  sc.push();
  igual(sc.profundidad(), 2);
  asegurar(sc.global() !== sc.actual());
  sc.pop();
  igual(sc.profundidad(), 1);
  asegurar(sc.global() === sc.actual());
});

prueba('pop en scope global no reduce la pila', () => {
  const sc = new ScopeChainPSeInt();
  sc.pop(); // no debe lanzar error ni reducir
  igual(sc.profundidad(), 1);
});

prueba('lookup encuentra variable en scope superior', () => {
  const sc = new ScopeChainPSeInt();
  sc.definir('Total', TIPOS_PSEINT.REAL, 0);
  sc.push();
  const sim = sc.lookup('Total');
  asegurar(sim !== null);
  igual(sim.tipo, TIPOS_PSEINT.REAL);
});

prueba('variable local oculta la global en lookup', () => {
  const sc = new ScopeChainPSeInt();
  sc.definir('X', TIPOS_PSEINT.ENTERO, 0);
  sc.push();
  sc.definir('X', TIPOS_PSEINT.CADENA, 5);
  const sim = sc.lookup('X');
  igual(sim.tipo, TIPOS_PSEINT.CADENA, 'debe devolver la variable del scope local');
});

prueba('lookup devuelve null si no existe', () => {
  const sc = new ScopeChainPSeInt();
  igual(sc.lookup('inexistente'), null);
});

prueba('inicializar a través de ScopeChain actualiza el scope correcto', () => {
  const sc = new ScopeChainPSeInt();
  sc.definir('N', TIPOS_PSEINT.ENTERO, 0);
  sc.push();
  sc.inicializar('N'); // vive en el scope global
  sc.pop();
  asegurar(sc.global().buscar('n').inicializada === true);
});

// ============================================================
// coercionarValor
// ============================================================
console.log('\nPruebas de coercionarValor');

prueba('Entero: trunca el decimal', () => {
  igual(coercionarValor(3.9, TIPOS_PSEINT.ENTERO), 3);
});

prueba('Entero: valor negativo', () => {
  igual(coercionarValor(-2.7, TIPOS_PSEINT.ENTERO), -2);
});

prueba('Real: convierte cadena numérica', () => {
  igual(coercionarValor('2.5', TIPOS_PSEINT.REAL), 2.5);
});

prueba('Cadena: convierte número a texto', () => {
  igual(coercionarValor(42, TIPOS_PSEINT.CADENA), '42');
});

prueba('Caracter: toma el primer carácter', () => {
  igual(coercionarValor('hola', TIPOS_PSEINT.CARACTER), 'h');
});

prueba('Caracter: cadena vacía devuelve ""', () => {
  igual(coercionarValor('', TIPOS_PSEINT.CARACTER), '');
});

prueba('Logico: valor truthy da true', () => {
  igual(coercionarValor(1, TIPOS_PSEINT.LOGICO), true);
});

prueba('Logico: valor falsy da false', () => {
  igual(coercionarValor(0, TIPOS_PSEINT.LOGICO), false);
});

prueba('tipo desconocido lanza error', () => {
  lanzaError(() => coercionarValor(1, 'Desconocido'), /tipo desconocido/i);
});

// ============================================================
// Resumen
// ============================================================
console.log('\n' + (fallas === 0
  ? 'Todas las pruebas pasaron (' + total + '/' + total + ')'
  : (total - fallas) + '/' + total + ' pruebas pasaron; ' + fallas + ' fallaron.'));

if (fallas > 0) process.exit(1);
