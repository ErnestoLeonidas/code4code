/**
 * Code4Code — tests/ayudas-tests.js
 * =================================
 * Pruebas del módulo de ayudas de código (js/editor/ayudas.js).
 *
 * Uso: node tests/ayudas-tests.js
 */
'use strict';

const path = require('path');
const Ayudas = require(path.join(__dirname, '..', 'js', 'editor', 'ayudas.js'));

let total = 0, fallas = 0;
function prueba(nombre, fn) {
  total++;
  try { fn(); console.log('  ✔ ' + nombre); }
  catch (e) { fallas++; console.error('  ✘ ' + nombre + ' → ' + e.message); }
}
function igual(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg || '') + ' esperado ' + B + ', obtenido ' + A);
}
function ok(c, msg) { if (!c) throw new Error(msg || 'aserción fallida'); }

console.log('\nAyudas de código — pruebas\n');

const SIMBOLOS = [
  { nombre: 'print', tipo: 'función', firma: 'print(*valores, sep=" ", end="\\n")',
    descripcion: 'Muestra valores en la consola.',
    params: [{ nombre: 'valores', descripcion: 'Valores a mostrar.' },
             { nombre: 'sep', descripcion: 'Separador.' }],
    retorno: 'None', ejemplo: 'print("Hola")' },
  { nombre: 'len', tipo: 'función', firma: 'len(coleccion)',
    descripcion: 'Cantidad de elementos.', params: [{ nombre: 'coleccion', descripcion: 'Secuencia.' }] },
  { nombre: 'range', tipo: 'función', firma: 'range(inicio, fin, paso)' },
  { nombre: 'lista', tipo: 'tipo', firma: 'list()' },
];

// ---- crearCatalogo / buscar ----
prueba('crearCatalogo indexa por nombre (case-insensitive)', () => {
  const cat = Ayudas.crearCatalogo(SIMBOLOS);
  igual(cat.lista.length, 4);
  ok(Ayudas.buscar(cat, 'PRINT'), 'debe encontrar PRINT sin importar mayúsculas');
  igual(Ayudas.buscar(cat, 'print').firma, 'print(*valores, sep=" ", end="\\n")');
});

prueba('buscar devuelve null para símbolo inexistente o entradas nulas', () => {
  const cat = Ayudas.crearCatalogo(SIMBOLOS);
  igual(Ayudas.buscar(cat, 'noexiste'), null);
  igual(Ayudas.buscar(cat, ''), null);
  igual(Ayudas.buscar(null, 'print'), null);
});

prueba('crearCatalogo ignora entradas sin nombre', () => {
  const cat = Ayudas.crearCatalogo([{ tipo: 'x' }, null, { nombre: 'ok' }]);
  igual(cat.lista.length, 1);
});

// ---- completar ----
prueba('completar filtra por prefijo y enriquece con firma/descripcion', () => {
  const cat = Ayudas.crearCatalogo(SIMBOLOS);
  const r = Ayudas.completar(cat, 'l');
  igual(r.map((x) => x.texto), ['len', 'lista']);
  igual(r[0].detalle, 'len(coleccion)');
  igual(r[0].descripcion, 'Cantidad de elementos.');
});

prueba('completar excluye coincidencia exacta y respeta el límite', () => {
  const cat = Ayudas.crearCatalogo(SIMBOLOS);
  igual(Ayudas.completar(cat, 'print').length, 0, 'prefijo == nombre no se sugiere');
  igual(Ayudas.completar(cat, 'l', 1).length, 1, 'debe respetar el límite');
});

prueba('completar con prefijo vacío devuelve []', () => {
  const cat = Ayudas.crearCatalogo(SIMBOLOS);
  igual(Ayudas.completar(cat, ''), []);
});

// ---- palabraEn ----
prueba('palabraEn identifica la palabra bajo el offset', () => {
  const t = 'x = print(y)';
  const r = Ayudas.palabraEn(t, 6); // dentro de "print"
  igual(r.palabra, 'print');
  igual([r.inicio, r.fin], [4, 9]);
});

prueba('palabraEn resuelve la palabra desde cualquier carácter interno', () => {
  const t = 'len';
  igual(Ayudas.palabraEn(t, 0).palabra, 'len'); // sobre la "l"
  igual(Ayudas.palabraEn(t, 2).palabra, 'len'); // sobre la "n"
});

prueba('palabraEn devuelve null sobre espacios u offset fuera de rango', () => {
  igual(Ayudas.palabraEn('a + b', 1), null); // sobre el espacio
  igual(Ayudas.palabraEn('len', 3), null);   // offset == longitud (fuera)
});

// ---- contextoLlamada ----
prueba('contextoLlamada detecta la función y el argumento 0', () => {
  const t = 'print(';
  igual(Ayudas.contextoLlamada(t, t.length), { nombre: 'print', argIndice: 0 });
});

prueba('contextoLlamada cuenta comas de nivel superior', () => {
  const t = 'print(a, b, ';
  igual(Ayudas.contextoLlamada(t, t.length), { nombre: 'print', argIndice: 2 });
});

prueba('contextoLlamada ignora comas dentro de paréntesis anidados', () => {
  const t = 'print(max(a, b), ';
  igual(Ayudas.contextoLlamada(t, t.length), { nombre: 'print', argIndice: 1 });
});

prueba('contextoLlamada ignora comas dentro de cadenas', () => {
  const t = 'print("a, b, c", ';
  igual(Ayudas.contextoLlamada(t, t.length), { nombre: 'print', argIndice: 1 });
});

prueba('contextoLlamada devuelve la función interna cuando el cursor está dentro', () => {
  const t = 'print(max(a, ';
  igual(Ayudas.contextoLlamada(t, t.length), { nombre: 'max', argIndice: 1 });
});

prueba('contextoLlamada devuelve null sin llamada abierta', () => {
  igual(Ayudas.contextoLlamada('x = 1 + 2', 9), null);
});

prueba('contextoLlamada devuelve null dentro de lista/dict', () => {
  igual(Ayudas.contextoLlamada('[a, b, ', 7), null);
});

console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
if (fallas > 0) process.exit(1);
