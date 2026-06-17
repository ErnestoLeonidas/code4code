'use strict';
const Code4CodeFolding = require('../js/editor/folding.js');
const assert = require('assert');

console.log('Pruebas de plegado de bloques del editor');

let ok = 0, fail = 0;
function t(nombre, fn) {
  try { fn(); console.log('  ✔', nombre); ok++; }
  catch (e) { console.log('  ✘', nombre, '—', e.message); fail++; }
}

const reglas = {
  aperturas: ['Proceso', 'Si', 'Mientras', 'Para', 'Repetir', 'Segun', 'SubProceso', 'Funcion'],
  cierres: ['FinProceso', 'FinSi', 'FinMientras', 'FinPara', 'HastaQue', 'Hasta Que',
    'FinSegun', 'FinSubProceso', 'FinFuncion'],
  intermedios: ['Sino', 'De Otro Modo:']
};

t('calcularPlegables detecta Si/FinSi simple', () => {
  const lineas = ['Si x > 0 Entonces', '  Escribir "positivo"', 'FinSi'];
  const p = Code4CodeFolding.calcularPlegables(lineas, reglas);
  assert(p.has(0), 'apertura en línea 0');
  assert.equal(p.get(0).fin, 2, 'fin en línea 2');
  assert.equal(p.get(0).nivel, 0, 'nivel 0');
});

t('calcularPlegables detecta bloques anidados', () => {
  const lineas = [
    'Proceso principal',
    '  Si x > 0 Entonces',
    '    Escribir "ok"',
    '  FinSi',
    'FinProceso'
  ];
  const p = Code4CodeFolding.calcularPlegables(lineas, reglas);
  assert(p.has(0), 'Proceso en línea 0');
  assert.equal(p.get(0).fin, 4);
  assert(p.has(1), 'Si en línea 1');
  assert.equal(p.get(1).fin, 3);
  assert.equal(p.get(1).nivel, 1, 'nivel anidado 1');
});

t('calcularPlegables con texto plano devuelve mapa vacío', () => {
  const lineas = ['Escribir "hola"', 'Escribir "mundo"'];
  const p = Code4CodeFolding.calcularPlegables(lineas, reglas);
  assert.equal(p.size, 0);
});

t('bloque sin cierre no se registra como plegable', () => {
  const lineas = ['Si x > 0 Entonces', '  Escribir "ok"'];
  const p = Code4CodeFolding.calcularPlegables(lineas, reglas);
  assert.equal(p.size, 0, 'Si sin FinSi no debe registrarse');
});

t('apertura y cierre adyacentes (sin contenido) no son plegables', () => {
  const lineas = ['Si x > 0 Entonces', 'FinSi'];
  const p = Code4CodeFolding.calcularPlegables(lineas, reglas);
  assert.equal(p.size, 0, 'bloque sin contenido no debe ser plegable');
});

t('calcularPlegables detecta Para/FinPara', () => {
  const lineas = ['Para i <- 1 Hasta 10 Hacer', '  Escribir i', 'FinPara'];
  const p = Code4CodeFolding.calcularPlegables(lineas, reglas);
  assert(p.has(0));
  assert.equal(p.get(0).fin, 2);
});

t('calcularPlegables detecta Mientras/FinMientras', () => {
  const lineas = ['Mientras i < 10 Hacer', '  i <- i + 1', 'FinMientras'];
  const p = Code4CodeFolding.calcularPlegables(lineas, reglas);
  assert(p.has(0));
  assert.equal(p.get(0).fin, 2);
});

t('calcularPlegables es insensible a mayúsculas en aperturas', () => {
  const lineas = ['si x > 0 entonces', '  escribir "ok"', 'finsi'];
  const p = Code4CodeFolding.calcularPlegables(lineas, reglas);
  assert(p.has(0), 'debe detectar "si" en minúsculas');
  assert.equal(p.get(0).fin, 2);
});

t('togglePlegar pliega un bloque plegable', () => {
  const plegables = new Map([[0, { fin: 2, nivel: 0 }]]);
  const plegados = new Set();
  const nuevo = Code4CodeFolding.togglePlegar(plegados, plegables, 0);
  assert(nuevo.has(0), 'debe plegar línea 0');
  assert.equal(plegados.size, 0, 'el set original no se muta');
});

t('togglePlegar despliega un bloque ya plegado', () => {
  const plegables = new Map([[0, { fin: 2, nivel: 0 }]]);
  const plegados = new Set([0]);
  const nuevo = Code4CodeFolding.togglePlegar(plegados, plegables, 0);
  assert(!nuevo.has(0), 'debe desplegar línea 0');
});

t('togglePlegar sobre línea no plegable no cambia el set', () => {
  const plegables = new Map();
  const plegados = new Set();
  const nuevo = Code4CodeFolding.togglePlegar(plegados, plegables, 5);
  assert.equal(nuevo.size, 0);
});

t('lineasVisibles oculta interiores y muestra cierre del bloque plegado', () => {
  const lineas = ['Si x > 0 Entonces', '  Escribir "ok"', 'FinSi', 'Escribir "fin"'];
  const plegables = new Map([[0, { fin: 2, nivel: 0 }]]);
  const plegados = new Set([0]);
  const visibles = Code4CodeFolding.lineasVisibles(lineas, plegados, plegables);
  assert.deepEqual(visibles, [0, 2, 3], 'líneas 1 oculta; 0, 2 y 3 visibles');
});

t('lineasVisibles sin pliegues muestra todas las líneas', () => {
  const lineas = ['Si x > 0 Entonces', '  Escribir "ok"', 'FinSi'];
  const plegables = new Map([[0, { fin: 2, nivel: 0 }]]);
  const plegados = new Set();
  const visibles = Code4CodeFolding.lineasVisibles(lineas, plegados, plegables);
  assert.deepEqual(visibles, [0, 1, 2]);
});

t('esPlegable e esPlegado devuelven correctamente', () => {
  const plegables = new Map([[3, { fin: 7, nivel: 0 }]]);
  const plegados = new Set([3]);
  assert(Code4CodeFolding.esPlegable(plegables, 3));
  assert(!Code4CodeFolding.esPlegable(plegables, 4));
  assert(Code4CodeFolding.esPlegado(plegados, 3));
  assert(!Code4CodeFolding.esPlegado(plegados, 5));
});

t('crear devuelve instancia con plegados y plegables vacíos', () => {
  const inst = Code4CodeFolding.crear();
  assert(inst.plegados instanceof Set);
  assert(inst.plegables instanceof Map);
  assert.equal(inst.plegados.size, 0);
  assert.equal(inst.plegables.size, 0);
});

// ── Modo indentación (Python) ─────────────────────────────────────────────────

const reglasPython = {
  aperturas: ['def ', 'class ', 'if ', 'elif ', 'else:', 'for ', 'while ', 'try:', 'except', 'finally:', 'with '],
  cierres: []
};

t('Python: def detectado como plegable por indentación', () => {
  const lineas = [
    'def foo():',
    '    x = 1',
    '    y = 2',
    '    return x + y'
  ];
  const p = Code4CodeFolding.calcularPlegables(lineas, reglasPython);
  assert(p.has(0), 'def en línea 0 debe ser plegable');
  assert.equal(p.get(0).fin, 3, 'fin del bloque en línea 3');
});

t('Python: for detectado como plegable por indentación', () => {
  const lineas = [
    'for i in range(10):',
    '    print(i)',
    '    suma += i',
    'print("listo")'
  ];
  const p = Code4CodeFolding.calcularPlegables(lineas, reglasPython);
  assert(p.has(0), 'for en línea 0 debe ser plegable');
  assert.equal(p.get(0).fin, 2, 'fin del bloque en línea 2 (antes de print exterior)');
});

t('Python: bloque con una sola línea (pass) NO es plegable', () => {
  const lineas = [
    'def vacia():',
    '    pass'
  ];
  const p = Code4CodeFolding.calcularPlegables(lineas, reglasPython);
  assert.equal(p.size, 0, 'bloque de una línea no debe ser plegable');
});

t('Python: bloques anidados (def conteniendo for) detectados independientemente', () => {
  const lineas = [
    'def calcular(n):',
    '    total = 0',
    '    for i in range(n):',
    '        total += i',
    '        print(i)',
    '    return total'
  ];
  const p = Code4CodeFolding.calcularPlegables(lineas, reglasPython);
  assert(p.has(0), 'def en línea 0 debe ser plegable');
  assert.equal(p.get(0).fin, 5, 'def abarca hasta línea 5');
  assert(p.has(2), 'for en línea 2 debe ser plegable');
  assert.equal(p.get(2).fin, 4, 'for abarca hasta línea 4');
});

if (fail === 0) console.log(`\n${ok + fail > 0 ? ok : 0}/${ok + fail} pruebas OK`);
else { console.log(`\n${ok}/${ok + fail} pruebas OK — ${fail} FALLAS`); process.exit(1); }
