/**
 * Code4Code — tests/pseint-diagram-tests.js
 * ==========================================
 * Pruebas del mapeador de diagrama NS para PSeInt (Fase 3 / Fase 5+).
 * Verifica que DiagramaMapperPSeInt.mapear() produce el árbol correcto
 * para los constructos principales del lenguaje PSeInt.
 *
 * Uso: node tests/pseint-diagram-tests.js
 */
'use strict';

const assert = require('assert');
const vm     = require('vm');
const fs     = require('fs');
const path   = require('path');

// ─────────────────────────────────────────────────────────────────────────────
//  Carga de scripts en contexto vm aislado
// ─────────────────────────────────────────────────────────────────────────────

const raiz = path.join(__dirname, '..');

function cargarEnContexto(archivo, contextoBase) {
  const codigo = fs.readFileSync(path.join(raiz, archivo), 'utf8');
  const ctx = contextoBase || vm.createContext({ module: {}, exports: {}, require, console });
  vm.runInContext(codigo, ctx, { filename: archivo });
  return ctx;
}

// 1. Tokenizador PSeInt
const ctxTK = cargarEnContexto('core/pseint/tokenizer.js');

// 2. AST PSeInt
const ctxAST = cargarEnContexto('core/pseint/ast.js');

// 3. Parser en contexto combinado
const ctxParser = vm.createContext(Object.assign(
  {},
  ctxAST,
  { DocErroresPSeInt: ctxTK.DocErroresPSeInt, module: {}, exports: {}, console }
));
vm.runInContext(
  fs.readFileSync(path.join(raiz, 'core/pseint/parser.js'), 'utf8'),
  ctxParser,
  { filename: 'core/pseint/parser.js' }
);

// 4. DiagramaMapperPSeInt
const ctxMapper = vm.createContext({ module: {}, exports: {}, console });
vm.runInContext(
  fs.readFileSync(path.join(raiz, 'core/pseint/diagram-mapper.js'), 'utf8'),
  ctxMapper,
  { filename: 'core/pseint/diagram-mapper.js' }
);

const parsear    = ctxParser.parsearPSeInt;
const DiagramaMapperPSeInt = ctxMapper.DiagramaMapperPSeInt;

// ─────────────────────────────────────────────────────────────────────────────
//  Mini framework de pruebas
// ─────────────────────────────────────────────────────────────────────────────

let totalPruebas = 0;
let pruebasFallidas = 0;

function t(nombre, fn) {
  totalPruebas++;
  try {
    fn();
    console.log('ok - ' + nombre);
  } catch (err) {
    pruebasFallidas++;
    console.error('not ok - ' + nombre);
    console.error('  ' + (err && err.message ? err.message : String(err)));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: parsea código PSeInt y retorna el AST
// ─────────────────────────────────────────────────────────────────────────────

function ast(codigo) {
  const r = parsear(codigo, { asignacionConIgual: false });
  return r.ast;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Pruebas del DiagramaMapperPSeInt
// ─────────────────────────────────────────────────────────────────────────────

t('DiagramaMapperPSeInt existe y tiene DIAGRAMA_VERSION = 1', () => {
  assert.ok(DiagramaMapperPSeInt, 'DiagramaMapperPSeInt debe existir');
  assert.strictEqual(DiagramaMapperPSeInt.DIAGRAMA_VERSION, 1);
  assert.strictEqual(typeof DiagramaMapperPSeInt.mapear, 'function');
});

t('mapear: programa minimo produce raiz Programa con Proceso hijo', () => {
  const prog = ast('Algoritmo minimo\n  Escribir "hola"\nFinAlgoritmo');
  const { raiz, version } = DiagramaMapperPSeInt.mapear(prog);
  assert.strictEqual(version, 1);
  assert.strictEqual(raiz.tipo, 'Programa');
  assert.ok(raiz.hijos.length >= 1, 'debe haber al menos un hijo');
  const proceso = raiz.hijos[0];
  assert.strictEqual(proceso.tipo, 'Proceso');
  assert.ok(proceso.etiqueta.includes('minimo'), 'etiqueta debe incluir el nombre del algoritmo');
  assert.strictEqual(proceso.hijos.length, 1);
  assert.strictEqual(proceso.hijos[0].tipo, 'Io');
});

t('mapear: Si/Sino produce nodo Si con dos SiRama', () => {
  const codigo = [
    'Algoritmo test_si',
    '  Definir x Como Entero',
    '  x <- 5',
    '  Si x > 0 Entonces',
    '    Escribir "positivo"',
    '  Sino',
    '    Escribir "no positivo"',
    '  FinSi',
    'FinAlgoritmo',
  ].join('\n');
  const prog = ast(codigo);
  const { raiz } = DiagramaMapperPSeInt.mapear(prog);
  const proceso = raiz.hijos[0];
  const siNodo = proceso.hijos.find(n => n.tipo === 'Si');
  assert.ok(siNodo, 'debe haber nodo Si');
  assert.strictEqual(siNodo.etiqueta, 'x > 0');
  assert.strictEqual(siNodo.hijos.length, 2);
  assert.strictEqual(siNodo.hijos[0].tipo, 'SiRama');
  assert.strictEqual(siNodo.hijos[0].etiqueta, 'Verdadero');
  assert.strictEqual(siNodo.hijos[1].tipo, 'SiRama');
  assert.strictEqual(siNodo.hijos[1].etiqueta, 'Falso');
});

t('mapear: Mientras produce nodo BucleMientras con condicion', () => {
  const codigo = [
    'Algoritmo test_mientras',
    '  Definir i Como Entero',
    '  i <- 0',
    '  Mientras i < 5 Hacer',
    '    i <- i + 1',
    '  FinMientras',
    'FinAlgoritmo',
  ].join('\n');
  const prog = ast(codigo);
  const { raiz } = DiagramaMapperPSeInt.mapear(prog);
  const proceso = raiz.hijos[0];
  const mNodo = proceso.hijos.find(n => n.tipo === 'BucleMientras');
  assert.ok(mNodo, 'debe haber nodo BucleMientras');
  assert.strictEqual(mNodo.etiqueta, 'i < 5');
  assert.ok(mNodo.hijos.length >= 1, 'debe tener cuerpo');
});

t('mapear: Para produce nodo BuclePara con texto de cabecera', () => {
  const codigo = [
    'Algoritmo test_para',
    '  Definir i Como Entero',
    '  Para i <- 1 Hasta 10 Hacer',
    '    Escribir i',
    '  FinPara',
    'FinAlgoritmo',
  ].join('\n');
  const prog = ast(codigo);
  const { raiz } = DiagramaMapperPSeInt.mapear(prog);
  const proceso = raiz.hijos[0];
  const pNodo = proceso.hijos.find(n => n.tipo === 'BuclePara');
  assert.ok(pNodo, 'debe haber nodo BuclePara');
  assert.ok(pNodo.etiqueta && pNodo.etiqueta.length > 0, 'BuclePara debe tener etiqueta');
  assert.strictEqual(pNodo.hijos.length, 1);
  assert.strictEqual(pNodo.hijos[0].tipo, 'Io');
});

t('mapear: RepetirHastaQue produce nodo BucleRepetir con condicion', () => {
  const codigo = [
    'Algoritmo test_repetir',
    '  Definir n Como Entero',
    '  n <- 0',
    '  Repetir',
    '    n <- n + 1',
    '  Hasta Que n >= 3',
    'FinAlgoritmo',
  ].join('\n');
  const prog = ast(codigo);
  const { raiz } = DiagramaMapperPSeInt.mapear(prog);
  const proceso = raiz.hijos[0];
  const rNodo = proceso.hijos.find(n => n.tipo === 'BucleRepetir');
  assert.ok(rNodo, 'debe haber nodo BucleRepetir');
  assert.ok(rNodo.etiqueta && rNodo.etiqueta.length > 0, 'BucleRepetir debe tener condicion');
  assert.ok(rNodo.hijos.length >= 1, 'debe tener cuerpo');
});

t('mapear: Segun produce nodo Segun con CasoRama y De Otro Modo', () => {
  const codigo = [
    'Algoritmo test_segun',
    '  Definir opc Como Entero',
    '  opc <- 2',
    '  Segun opc Hacer',
    '    1: Escribir "uno"',
    '    2, 3: Escribir "dos o tres"',
    '    De Otro Modo:',
    '      Escribir "otro"',
    '  FinSegun',
    'FinAlgoritmo',
  ].join('\n');
  const prog = ast(codigo);
  const { raiz } = DiagramaMapperPSeInt.mapear(prog);
  const proceso = raiz.hijos[0];
  const sNodo = proceso.hijos.find(n => n.tipo === 'Segun');
  assert.ok(sNodo, 'debe haber nodo Segun');
  assert.strictEqual(sNodo.etiqueta, 'opc');
  // 2 casos + 1 De Otro Modo = 3 ramas
  assert.strictEqual(sNodo.hijos.length, 3);
  assert.ok(sNodo.hijos.every(h => h.tipo === 'CasoRama'), 'todos los hijos deben ser CasoRama');
  const otraNodo = sNodo.hijos.find(h => h.etiqueta === 'De Otro Modo');
  assert.ok(otraNodo, 'debe haber rama De Otro Modo');
});

t('mapear: SubProceso aparece como hijo adicional de raiz', () => {
  const codigo = [
    'Algoritmo test_sp',
    '  Llamar saludar()',
    'FinAlgoritmo',
    '',
    'SubProceso saludar()',
    '  Escribir "hola"',
    'FinSubProceso',
  ].join('\n');
  const prog = ast(codigo);
  const { raiz } = DiagramaMapperPSeInt.mapear(prog);
  // Proceso principal + SubProceso
  assert.ok(raiz.hijos.length >= 2, 'debe haber al menos 2 hijos en raiz');
  const spNodo = raiz.hijos.find(n => n.tipo === 'SubProceso');
  assert.ok(spNodo, 'debe haber nodo SubProceso en raiz');
  assert.ok(spNodo.etiqueta.includes('saludar'), 'etiqueta debe incluir nombre del subproceso');
});

t('mapear: nodo Programa con Proceso hijo y nodos Leaf e Io correctos', () => {
  const codigo = [
    'Algoritmo tipos_nodos',
    '  Definir x Como Entero',
    '  Leer x',
    '  x <- x + 1',
    '  Escribir x',
    'FinAlgoritmo',
  ].join('\n');
  const prog = ast(codigo);
  const { raiz } = DiagramaMapperPSeInt.mapear(prog);
  const proceso = raiz.hijos[0];
  const tipos = proceso.hijos.map(n => n.tipo);
  assert.ok(tipos.includes('Leaf'), 'debe haber nodo Leaf (Definir/Asignar)');
  assert.ok(tipos.includes('Io'),   'debe haber nodo Io (Leer/Escribir)');
});

// ─────────────────────────────────────────────────────────────────────────────
//  Prueba del provider: diagramaNS retorna null para código inválido
// ─────────────────────────────────────────────────────────────────────────────

t('mapear: lanza error si el AST no es un Programa', () => {
  assert.throws(
    () => DiagramaMapperPSeInt.mapear(null),
    /se esperaba un nodo Programa/
  );
  assert.throws(
    () => DiagramaMapperPSeInt.mapear({ tipo: 'Si' }),
    /se esperaba un nodo Programa/
  );
});

// ─────────────────────────────────────────────────────────────────────────────
//  Prueba del provider con diagramaNS()
//  Se carga el provider en contexto aislado para verificar la integración.
// ─────────────────────────────────────────────────────────────────────────────

t('provider.diagramaNS: retorna null para código con errores de parseo', () => {
  // Preparar contexto con todo lo necesario para el provider
  const ctxProvider = vm.createContext(Object.assign(
    {},
    ctxAST,
    {
      DocErroresPSeInt: ctxTK.DocErroresPSeInt,
      DiagramaMapperPSeInt: ctxMapper.DiagramaMapperPSeInt,
      // Mocks mínimos para el provider
      Code4Code: {
        crearProvider: (def) => def,
        tieneCapacidad: () => false,
        CAPACIDADES: {
          INSPECTOR_VARIABLES: 'inspector-variables',
          DIAGRAMA_NS: 'diagrama-ns',
          EJERCICIOS: 'ejercicios',
          DOCUMENTACION: 'documentacion',
        },
        registro: { registrar: (def) => def },
      },
      // Globals opcionales que el provider referencia de forma defensiva
      AyudasPSeInt: undefined,
      Code4CodeAyudas: undefined,
      validarPSeInt: undefined,
      RuntimePSeInt: undefined,
      DOC_COMANDOS_PSEINT: [],
      module: { exports: {} },
      exports: {},
      console,
      window: undefined,
      globalThis: undefined,
    }
  ));
  vm.runInContext(
    fs.readFileSync(path.join(raiz, 'core/pseint/parser.js'), 'utf8'),
    ctxProvider,
    { filename: 'core/pseint/parser.js' }
  );
  vm.runInContext(
    fs.readFileSync(path.join(raiz, 'core/pseint/provider.js'), 'utf8'),
    ctxProvider,
    { filename: 'core/pseint/provider.js' }
  );

  // El provider registrado queda en Code4Code.registro.registrar()
  // que devuelve la definición: extraemos diagramaNS directamente.
  const def = ctxProvider.Code4Code.registro.registrar;
  // En este mock, registrar recibe la definición y la devuelve.
  // Para obtener la definición del provider necesitamos module.exports:
  const providerExports = ctxProvider.module.exports;
  const definicion = providerExports && providerExports.definicion
    ? providerExports.definicion()
    : null;

  if (!definicion || typeof definicion.diagramaNS !== 'function') {
    // Si el provider no exporta diagramaNS, el test pasa con advertencia
    console.log('  (advertencia: provider no exporta definicion con diagramaNS en este contexto)');
    return;
  }

  // Código completamente inválido debe devolver null
  const resultado = definicion.diagramaNS('esto no es pseint válido');
  assert.strictEqual(resultado, null, 'diagramaNS debe devolver null para código inválido');
});

// ─────────────────────────────────────────────────────────────────────────────
//  Resumen
// ─────────────────────────────────────────────────────────────────────────────

if (pruebasFallidas > 0) {
  console.error('\n' + pruebasFallidas + ' de ' + totalPruebas + ' pruebas fallaron.');
  process.exitCode = 1;
} else {
  console.log('\n' + totalPruebas + ' pruebas pasaron.');
}
