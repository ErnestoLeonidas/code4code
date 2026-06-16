const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function loadRuntime() {
  const ctx = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
  };
  vm.createContext(ctx);
  const tokenizer = fs.readFileSync(path.join(root, 'core/liteseint/tokenizer.js'), 'utf8');
  const symbolTable = fs.readFileSync(path.join(root, 'core/liteseint/symbol-table.js'), 'utf8');
  const validator = fs.readFileSync(path.join(root, 'core/liteseint/validator.js'), 'utf8');
  const docErrores = fs.readFileSync(path.join(root, 'core/liteseint/doc_errores.js'), 'utf8');
  const ast = fs.readFileSync(path.join(root, 'core/liteseint/ast.js'), 'utf8');
  const parser = fs.readFileSync(path.join(root, 'core/liteseint/parser.js'), 'utf8');
  const exprEval = fs.readFileSync(path.join(root, 'core/liteseint/expression-evaluator.js'), 'utf8');
  const liteSeInt = fs.readFileSync(path.join(root, 'core/liteseint/runtime.js'), 'utf8');
  const ejercicios = fs.readFileSync(path.join(root, 'js/ejercicios-data.js'), 'utf8');
  vm.runInContext(`${tokenizer}\n${symbolTable}\n${validator}\n${docErrores}\nglobalThis.DocErrores = DocErrores; globalThis.LiteSeIntSymbolTable = LiteSeIntSymbolTable;`, ctx);
  vm.runInContext(`${ast}\n${parser}\nglobalThis.LiteSeIntAST = LiteSeIntAST; globalThis.LiteSeIntParser = LiteSeIntParser;`, ctx);
  const diagramMapper = fs.readFileSync(path.join(root, 'core/liteseint/diagram-mapper.js'), 'utf8');
  vm.runInContext(`${diagramMapper}\nglobalThis.LiteSeIntDiagrama = LiteSeIntDiagrama;`, ctx);
  vm.runInContext(`${exprEval}\nglobalThis.LiteSeIntExprEval = LiteSeIntExprEval;`, ctx);
  vm.runInContext(`${liteSeInt}\nglobalThis.LiteSeInt = LiteSeInt;`, ctx);
  vm.runInContext(`${ejercicios}\nglobalThis.EjerciciosLiteSeInt = globalThis.EjerciciosLiteSeInt;`, ctx);
  const ejerciciosJson = ctx.EjerciciosLiteSeInt.EJERCICIOS_JSON_PATHS.flatMap((jsonPath) => {
    const data = JSON.parse(fs.readFileSync(path.join(root, jsonPath), 'utf8'));
    return ctx.EjerciciosLiteSeInt.ejerciciosDesdeData(data, jsonPath);
  });
  ctx.EjerciciosLiteSeInt.instalarBanco(ejerciciosJson);
  return ctx;
}

function leerAppConstArray(nombre) {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const inicio = app.indexOf(`const ${nombre} = [`);
  assert(inicio >= 0, `No se encontró ${nombre} en js/app.js`);
  const bracketInicio = app.indexOf('[', inicio);
  let profundidad = 0;
  let quote = null;
  let escaped = false;
  for (let i = bracketInicio; i < app.length; i++) {
    const ch = app[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '[') profundidad++;
    if (ch === ']') profundidad--;
    if (profundidad === 0) {
      const snippet = app.slice(inicio, i + 1);
      const ctx = {};
      vm.createContext(ctx);
      vm.runInContext(`${snippet}; globalThis.valor = ${nombre};`, ctx);
      return ctx.valor;
    }
  }
  throw new Error(`No se pudo extraer ${nombre} desde js/app.js`);
}

function validar(ctx, codigo) {
  return ctx.DocErrores.validarDocumento(codigo).errores;
}

async function ejecutar(ctx, codigo, opciones = {}) {
  const salida = [];
  const errores = [];
  let resolverEntrada = null;
  const interprete = new ctx.LiteSeInt({
    onEscribir: (texto) => salida.push(texto),
    onError: (linea, mensaje) => errores.push({ linea: linea + 1, mensaje }),
    onLeer: () => new Promise((resolve) => {
      resolverEntrada = resolve;
    }),
  });
  interprete.velocidadPausa = 0;

  const ejecucion = interprete.ejecutar(codigo);

  if (opciones.detenerDuranteLeer) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    interprete.detener();
    if (resolverEntrada) resolverEntrada('');
  }

  const resultado = await ejecucion;
  return { resultado, salida, errores };
}

const tests = [];

function test(nombre, fn) {
  tests.push({ nombre, fn });
}

test('rechaza documentos sin Proceso y FinProceso', () => {
  const ctx = loadRuntime();
  const errores = validar(ctx, 'Definir x Como Entero\nx = 1\nEscribir x');
  assert(errores.some((e) => e.tipo === 'proceso_faltante'));
  assert(errores.some((e) => e.tipo === 'finproceso_faltante'));
});

test('detecta cierres cruzados entre bloques anidados', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Definir x Como Entero',
    'x = 0',
    'Si Verdadero Entonces',
    '  Mientras x < 1 Hacer',
    '    Escribir "dentro"',
    '  FinSi',
    'FinMientras',
    'FinProceso',
  ].join('\n');
  const errores = validar(ctx, codigo);
  assert(errores.some((e) => e.tipo === 'bloque_cierre_cruzado'));
});

test('ejecuta Segun con expresion en la cabecera', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Definir dia Como Entero',
    'dia = 1',
    'Segun dia + 0 Hacer',
    '  1: Escribir "ok"',
    'FinSegun',
    'FinProceso',
  ].join('\n');
  assert.strictEqual(validar(ctx, codigo).length, 0);
  const { resultado, salida } = await ejecutar(ctx, codigo);
  assert.strictEqual(resultado.exito, true);
  assert.deepStrictEqual(salida, ['ok']);
});

test('evalua Y, O y No dentro de asignaciones logicas', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Definir a, b, c Como Logico',
    'a = Verdadero',
    'b = Falso',
    'c = a Y No b',
    'Escribir c',
    'c = b O Falso',
    'Escribir c',
    'FinProceso',
  ].join('\n');
  assert.strictEqual(validar(ctx, codigo).length, 0);
  const { resultado, salida } = await ejecutar(ctx, codigo);
  assert.strictEqual(resultado.exito, true);
  assert.deepStrictEqual(salida, ['Verdadero', 'Falso']);
});

// =====================================================
// Banco de ejercicios y material pedagógico
// =====================================================

const CAMPOS_OBLIGATORIOS = [
  'id', 'origen', 'modulo', 'experiencia', 'nivelLiteSeInt',
  'numero', 'dificultad', 'gradoAyuda', 'titulo', 'conceptos', 'enunciado',
  'entradaProcesoSalida', 'salidaEsperada', 'pista',
  'codigoReferencia', 'estadoAdaptacion', 'motivoExclusion',
];

test('banco de ejercicios: ids unicos', () => {
  const ctx = loadRuntime();
  const ej = ctx.EjerciciosLiteSeInt.EJERCICIOS;
  const vistos = new Set();
  for (const e of ej) {
    assert(!vistos.has(e.id), `ID duplicado: ${e.id}`);
    vistos.add(e.id);
  }
});

test('banco de ejercicios: carga 245 ejercicios desde N1 a N7', () => {
  const ctx = loadRuntime();
  const ej = ctx.EjerciciosLiteSeInt.EJERCICIOS;
  assert.strictEqual(ej.length, 245);
  const conteo = new Map();
  for (const e of ej) {
    conteo.set(e.nivelLiteSeInt, (conteo.get(e.nivelLiteSeInt) || 0) + 1);
  }
  assert.deepStrictEqual(
    [...conteo.entries()].sort((a, b) => a[0] - b[0]),
    [[1, 20], [2, 40], [3, 40], [4, 60], [5, 15], [6, 40], [7, 30]],
  );
});

test('banco de ejercicios: campos obligatorios presentes', () => {
  const ctx = loadRuntime();
  const ej = ctx.EjerciciosLiteSeInt.EJERCICIOS;
  for (const e of ej) {
    for (const campo of CAMPOS_OBLIGATORIOS) {
      assert(campo in e, `Falta campo "${campo}" en ${e.id}`);
    }
  }
});

test('banco de ejercicios: solo estados, dificultades y grados permitidos', () => {
  const ctx = loadRuntime();
  const { EJERCICIOS, ESTADOS_VALIDOS, DIFICULTADES_VALIDAS, GRADOS_VALIDOS } =
    ctx.EjerciciosLiteSeInt;
  for (const e of EJERCICIOS) {
    assert(ESTADOS_VALIDOS.includes(e.estadoAdaptacion),
      `Estado inválido en ${e.id}: ${e.estadoAdaptacion}`);
    assert(DIFICULTADES_VALIDAS.includes(e.dificultad),
      `Dificultad inválida en ${e.id}: ${e.dificultad}`);
    assert(GRADOS_VALIDOS.includes(e.gradoAyuda),
      `Grado inválido en ${e.id}: ${e.gradoAyuda}`);
    assert(Number.isInteger(e.nivelLiteSeInt) && e.nivelLiteSeInt >= 0 && e.nivelLiteSeInt <= 9,
      `Nivel fuera de rango en ${e.id}: ${e.nivelLiteSeInt}`);
    assert.strictEqual(
      e.numero,
      `N${e.nivelLiteSeInt}-${String(Number(e.id.split('-')[1])).padStart(2, '0')}`,
      `Numero inválido en ${e.id}: ${e.numero}`,
    );
  }
});

test('banco de ejercicios: codigoReferencia adaptado no contiene sintaxis prohibida', () => {
  const ctx = loadRuntime();
  const adaptados = ctx.EjerciciosLiteSeInt.listarAdaptados();
  for (const e of adaptados) {
    const codigo = e.codigoReferencia;
    assert(!/<-/.test(codigo), `${e.id}: contiene "<-"`);
    assert(!/\bCadena\b/.test(codigo), `${e.id}: contiene "Cadena"`);
    assert(!/\bSiNo\b/.test(codigo), `${e.id}: contiene "SiNo"`);
    assert(!/\bMOD\b/.test(codigo), `${e.id}: contiene "MOD"`);
    assert(!/\bDIV\b/.test(codigo), `${e.id}: contiene "DIV"`);
    const lineasNoComentario = codigo
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, '').trimEnd());
    for (const linea of lineasNoComentario) {
      assert(!/;\s*$/.test(linea),
        `${e.id}: línea termina con ";": "${linea}"`);
    }
  }
});

test('banco de ejercicios: codigoReferencia adaptado pasa validacion estatica', () => {
  const ctx = loadRuntime();
  const adaptados = ctx.EjerciciosLiteSeInt.listarAdaptados();
  for (const e of adaptados) {
    const errores = validar(ctx, e.codigoReferencia);
    assert.strictEqual(
      errores.length,
      0,
      `${e.id} tiene errores estáticos: ${JSON.stringify(errores)}`,
    );
  }
});

test('banco de ejercicios: todos los visibles estan adaptados', () => {
  const ctx = loadRuntime();
  const visibles = ctx.EjerciciosLiteSeInt.listarAdaptados();
  for (const e of visibles) {
    assert.strictEqual(
      e.estadoAdaptacion,
      'adaptado',
      `${e.id} visible pero no adaptado`,
    );
  }
  assert(visibles.length > 0, 'No hay ejercicios visibles');
});

test('app: niveles visibles alineados con N1 a N7', () => {
  const nivelesVisibles = leerAppConstArray('NIVELES_VISIBLES');
  assert.deepStrictEqual(Array.from(nivelesVisibles), [1, 2, 3, 4, 5, 6, 7]);
});

test('documentacion de comandos: ejercicios recomendados existen', () => {
  const ctx = loadRuntime();
  const docs = leerAppConstArray('DOC_COMANDOS');
  assert(docs.length >= 17, `DOC_COMANDOS tiene solo ${docs.length} entradas`);
  for (const doc of docs) {
    assert(Array.isArray(doc.ejercicios), `${doc.nombre}: ejercicios debe ser array`);
    for (const id of doc.ejercicios) {
      assert(ctx.EjerciciosLiteSeInt.porId(id), `${doc.nombre}: ejercicio inexistente ${id}`);
    }
  }
});

test('documentacion de comandos: ejemplos no usan sintaxis PSeInt prohibida', () => {
  const docs = leerAppConstArray('DOC_COMANDOS');
  const prohibidos = [
    [/<-/, '<-'],
    [/\bCadena\b/, 'Cadena'],
    [/\bSiNo\b/, 'SiNo'],
    [/\bMOD\b/, 'MOD'],
    [/\bDIV\b/, 'DIV'],
  ];
  for (const doc of docs) {
    for (const campo of ['sintaxis', 'ejemplo', 'ejemplo2']) {
      if (!doc[campo]) continue;
      for (const [regex, label] of prohibidos) {
        assert(!regex.test(doc[campo]), `${doc.nombre}.${campo}: contiene ${label}`);
      }
    }
  }
});

test('documentacion de errores: ejemplos corregidos validan', () => {
  const ctx = loadRuntime();
  const errores = leerAppConstArray('DOC_ERRORES_COMUNES');
  assert(errores.length >= 16, `DOC_ERRORES_COMUNES tiene solo ${errores.length} entradas`);
  for (const err of errores) {
    const res = validar(ctx, err.ejemplo);
    assert.strictEqual(
      res.length,
      0,
      `${err.titulo}: ejemplo corregido tiene errores: ${JSON.stringify(res)}`,
    );
  }
});

test('documentacion de errores: ejemplos incorrectos reproducen errores o son de runtime', () => {
  const ctx = loadRuntime();
  const errores = leerAppConstArray('DOC_ERRORES_COMUNES');
  for (const err of errores) {
    if (!err.ejemploMal) continue;
    const res = validar(ctx, err.ejemploMal);
    const esRuntime = /Al ejecutar/i.test(err.sintoma || '');
    assert(
      res.length > 0 || esRuntime,
      `${err.titulo}: ejemplo incorrecto no falla en validación ni está marcado como runtime`,
    );
  }
});

test('parser: produce Programa raiz con astVersion 5 y cuerpo array', () => {
  const ctx = loadRuntime();
  const codigo = 'Proceso p\nDefinir x Como Entero\nx = 1\nEscribir x\nFinProceso';
  const ast = ctx.LiteSeIntParser.parsearPrograma(codigo);
  assert.strictEqual(ast.tipo, 'Programa');
  assert.strictEqual(ast.astVersion, 5);
  assert.ok(Array.isArray(ast.cuerpo));
  assert.ok(ast.loc && typeof ast.loc.linea === 'number');
  assert.ok(ast.subprocesos && typeof ast.subprocesos === 'object');
});

test('parser: emite nodos PascalCase para instrucciones simples', () => {
  const ctx = loadRuntime();
  const codigo = 'Proceso p\nDefinir x Como Entero\nLeer x\nx = x + 1\nEscribir x\nFinProceso';
  const cuerpo = ctx.LiteSeIntParser.parsearPrograma(codigo).cuerpo;
  const tipos = Array.from(cuerpo, (n) => n.tipo);
  assert.deepStrictEqual(tipos, ['Definir', 'Leer', 'Asignar', 'Escribir']);
  for (const nodo of cuerpo) {
    assert.ok(nodo.loc, `nodo ${nodo.tipo} sin loc`);
    assert.strictEqual(typeof nodo.loc.linea, 'number');
    assert.strictEqual(typeof nodo.loc.columnaInicio, 'number');
    assert.strictEqual(typeof nodo.loc.columnaFin, 'number');
  }
});

test('parser: construye nodo Si con entonces y sino', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Definir x Como Entero',
    'x = 1',
    'Si x > 0 Entonces',
    '  Escribir "pos"',
    'Sino',
    '  Escribir "neg"',
    'FinSi',
    'FinProceso',
  ].join('\n');
  const cuerpo = ctx.LiteSeIntParser.parsearPrograma(codigo).cuerpo;
  const si = cuerpo.find((n) => n.tipo === 'Si');
  assert.ok(si, 'no se encontro nodo Si');
  assert.strictEqual(si.condicion, 'x > 0');
  assert.strictEqual(si.entonces.length, 1);
  assert.strictEqual(si.entonces[0].tipo, 'Escribir');
  assert.ok(Array.isArray(si.sino));
  assert.strictEqual(si.sino.length, 1);
  assert.strictEqual(si.sino[0].tipo, 'Escribir');
});

test('parser: construye nodo Mientras con condicion y cuerpo', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Definir i Como Entero',
    'i = 0',
    'Mientras i < 3 Hacer',
    '  Escribir i',
    '  i = i + 1',
    'FinMientras',
    'FinProceso',
  ].join('\n');
  const m = ctx.LiteSeIntParser.parsearPrograma(codigo).cuerpo.find((n) => n.tipo === 'Mientras');
  assert.ok(m);
  assert.strictEqual(m.condicion, 'i < 3');
  assert.strictEqual(m.cuerpo.length, 2);
  assert.strictEqual(m.cuerpo[0].tipo, 'Escribir');
  assert.strictEqual(m.cuerpo[1].tipo, 'Asignar');
});

test('parser: construye nodo Para con desde, hasta y paso', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Definir i Como Entero',
    'Para i = 1 Hasta 10 Con Paso 2 Hacer',
    '  Escribir i',
    'FinPara',
    'FinProceso',
  ].join('\n');
  const p = ctx.LiteSeIntParser.parsearPrograma(codigo).cuerpo.find((n) => n.tipo === 'Para');
  assert.ok(p);
  assert.strictEqual(p.variable, 'i');
  assert.strictEqual(p.variableOriginal, 'i');
  assert.strictEqual(p.desde, '1');
  assert.strictEqual(p.hasta, '10');
  assert.strictEqual(p.paso, '2');
  assert.strictEqual(p.cuerpo.length, 1);
});

test('parser: construye nodo Repetir con condicion de HastaQue', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Definir i Como Entero',
    'i = 0',
    'Repetir',
    '  i = i + 1',
    'HastaQue i >= 3',
    'FinProceso',
  ].join('\n');
  const r = ctx.LiteSeIntParser.parsearPrograma(codigo).cuerpo.find((n) => n.tipo === 'Repetir');
  assert.ok(r);
  assert.strictEqual(r.condicion, 'i >= 3');
  assert.strictEqual(r.cuerpo.length, 1);
  assert.ok(r.locHastaQue && typeof r.locHastaQue.linea === 'number');
});

test('parser: construye nodo Segun con casos y rama otro', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Definir d Como Entero',
    'd = 1',
    'Segun d Hacer',
    '  1: Escribir "uno"',
    '  2, 3: Escribir "dos o tres"',
    '  De Otro Modo:',
    '    Escribir "otro"',
    'FinSegun',
    'FinProceso',
  ].join('\n');
  const s = ctx.LiteSeIntParser.parsearPrograma(codigo).cuerpo.find((n) => n.tipo === 'Segun');
  assert.ok(s);
  assert.strictEqual(s.expresion, 'd');
  assert.strictEqual(s.casos.length, 2);
  assert.deepStrictEqual(Array.from(s.casos[0].valores), ['1']);
  assert.deepStrictEqual(Array.from(s.casos[1].valores), ['2', '3']);
  assert.ok(Array.isArray(s.otro));
  assert.strictEqual(s.otro.length, 1);
});

test('parser: roundtrip JSON preserva el AST', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Definir x Como Entero',
    'Si x > 0 Entonces',
    '  Para x = 1 Hasta 3 Hacer',
    '    Escribir x',
    '  FinPara',
    'Sino',
    '  Escribir "neg"',
    'FinSi',
    'FinProceso',
  ].join('\n');
  const ast = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const json = ctx.LiteSeIntAST.serializarAST(ast);
  const rehidratado = ctx.LiteSeIntAST.deserializarAST(json);
  assert.strictEqual(rehidratado.tipo, 'Programa');
  assert.strictEqual(rehidratado.astVersion, 5);
  assert.deepStrictEqual(rehidratado, ast);
  assert.strictEqual(ctx.LiteSeIntAST.serializarAST(rehidratado), json);
});

test('parser: los 245 ejercicios visibles parsean sin throw y producen Programa', () => {
  const ctx = loadRuntime();
  const visibles = ctx.EjerciciosLiteSeInt.listarAdaptados().filter((e) => e.codigoReferencia);
  assert.ok(visibles.length >= 200, `se esperaban al menos 200 ejercicios visibles, hubo ${visibles.length}`);
  for (const ej of visibles) {
    const ast = ctx.LiteSeIntParser.parsearPrograma(ej.codigoReferencia);
    assert.strictEqual(ast.tipo, 'Programa', `${ej.id}: tipo raiz no es Programa`);
    assert.strictEqual(ast.astVersion, 5, `${ej.id}: astVersion incorrecto`);
    assert.ok(Array.isArray(ast.cuerpo), `${ej.id}: cuerpo no es array`);
  }
});

test('symbol-table: TablaSimbolos define, marca inicializada y clona', () => {
  const ctx = loadRuntime();
  const tabla = new ctx.LiteSeIntSymbolTable.TablaSimbolos();
  tabla.definir('Edad', 'entero', 3);
  assert.strictEqual(tabla.existeVariable('edad'), true);
  assert.strictEqual(tabla.estaInicializada('edad'), false);
  assert.strictEqual(tabla.obtenerTipo('edad'), 'entero');
  tabla.marcarInicializada('edad');
  assert.strictEqual(tabla.estaInicializada('edad'), true);
  const clon = tabla.clonar();
  tabla.marcarInicializada('inexistente');
  assert.deepStrictEqual(Array.from(clon.obtenerNombres()), ['Edad']);
});

test('symbol-table: ScopeChain comienza con scope global y resuelve nombres', () => {
  const ctx = loadRuntime();
  const chain = new ctx.LiteSeIntSymbolTable.ScopeChain();
  assert.strictEqual(chain.profundidad(), 1);
  chain.global().definir('total', 'entero', 0);
  const hallado = chain.lookup('total');
  assert.ok(hallado, 'lookup global debió encontrar la variable');
  assert.strictEqual(hallado.obtenerTipo('total'), 'entero');
  assert.strictEqual(chain.lookup('inexistente'), null);
});

test('symbol-table: ScopeChain push/pop respeta visibilidad de scopes anidados', () => {
  const ctx = loadRuntime();
  const chain = new ctx.LiteSeIntSymbolTable.ScopeChain();
  chain.global().definir('global_var', 'real', 0);
  const local = chain.push();
  local.definir('local_var', 'caracter', 5);
  assert.strictEqual(chain.profundidad(), 2);
  assert.ok(chain.lookup('local_var'), 'local visible desde scope actual');
  assert.ok(chain.lookup('global_var'), 'global sigue visible desde scope anidado');
  chain.pop();
  assert.strictEqual(chain.profundidad(), 1);
  assert.strictEqual(chain.lookup('local_var'), null, 'local desaparece tras pop');
  assert.throws(() => chain.pop(), /scope global/i);
});

test('runtime: ejercicios sin Leer ejecutan sin errores sobre el AST nuevo', async () => {
  const ctx = loadRuntime();
  const sinLeer = ctx.EjerciciosLiteSeInt.listarAdaptados()
    .filter((e) => e.codigoReferencia && !/\bLeer\b/i.test(e.codigoReferencia));
  assert.ok(sinLeer.length >= 10, `se esperaban >=10 ejercicios sin Leer, hubo ${sinLeer.length}`);
  for (const ej of sinLeer) {
    const { resultado, errores } = await ejecutar(ctx, ej.codigoReferencia);
    assert.strictEqual(
      resultado.exito,
      true,
      `${ej.id} falló: ${errores.length ? errores[0].mensaje : 'sin mensaje'}`
    );
    assert.strictEqual(errores.length, 0, `${ej.id} reportó errores runtime: ${JSON.stringify(errores)}`);
  }
});

// =====================================================
// v1.6.0 — Arreglos y matrices (Dimension)
// =====================================================

test('v1.6.0: Dimension 1D valida sin errores', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Dimension v[5]',
    'Definir v Como Entero',
    'FinProceso',
  ].join('\n');
  assert.strictEqual(validar(ctx, codigo).length, 0);
});

test('v1.6.0: Dimension 2D valida sin errores', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Dimension m[3, 4]',
    'Definir m Como Real',
    'FinProceso',
  ].join('\n');
  assert.strictEqual(validar(ctx, codigo).length, 0);
});

test('v1.6.0: Dimension con tamaño cero emite error', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Dimension v[0]',
    'Definir v Como Entero',
    'FinProceso',
  ].join('\n');
  assert.ok(validar(ctx, codigo).some(e => e.tipo === 'dimension_no_positiva'));
});

test('v1.6.0: parser emite nodo Dimension con nombre y dimensiones', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Dimension arr[10]',
    'Definir arr Como Entero',
    'FinProceso',
  ].join('\n');
  const cuerpo = ctx.LiteSeIntParser.parsearPrograma(codigo).cuerpo;
  const nodo = cuerpo.find(n => n.tipo === 'Dimension');
  assert.ok(nodo, 'no se encontró nodo Dimension');
  assert.strictEqual(nodo.nombre, 'arr');
  assert.deepStrictEqual(Array.from(nodo.dimensiones), [10]);
});

test('v1.6.0: parser emite nodo AsignarIndice', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Dimension v[3]',
    'Definir v Como Entero',
    'v[1] = 42',
    'FinProceso',
  ].join('\n');
  const cuerpo = ctx.LiteSeIntParser.parsearPrograma(codigo).cuerpo;
  const nodo = cuerpo.find(n => n.tipo === 'AsignarIndice');
  assert.ok(nodo, 'no se encontró nodo AsignarIndice');
  assert.strictEqual(nodo.nombre, 'v');
  assert.deepStrictEqual(Array.from(nodo.indices), ['1']);
  assert.strictEqual(nodo.expresion, '42');
});

test('v1.6.0: runtime ejecuta arreglo 1D — asignacion y lectura', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Dimension v[3]',
    'Definir v Como Entero',
    'v[1] = 10',
    'v[2] = 20',
    'v[3] = 30',
    'Escribir v[1], " ", v[2], " ", v[3]',
    'FinProceso',
  ].join('\n');
  assert.strictEqual(validar(ctx, codigo).length, 0);
  const { resultado, salida } = await ejecutar(ctx, codigo);
  assert.strictEqual(resultado.exito, true);
  assert.deepStrictEqual(salida, ['10 20 30']);
});

test('v1.6.0: runtime ejecuta matriz 2D', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Dimension m[2, 2]',
    'Definir m Como Entero',
    'm[1, 1] = 1',
    'm[1, 2] = 2',
    'm[2, 1] = 3',
    'm[2, 2] = 4',
    'Escribir m[1, 1], m[1, 2], m[2, 1], m[2, 2]',
    'FinProceso',
  ].join('\n');
  assert.strictEqual(validar(ctx, codigo).length, 0);
  const { resultado, salida } = await ejecutar(ctx, codigo);
  assert.strictEqual(resultado.exito, true);
  assert.deepStrictEqual(salida, ['1234']);
});

test('v1.6.0: runtime lanza error IndiceFueraDeRango', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Dimension v[3]',
    'Definir v Como Entero',
    'v[5] = 1',
    'FinProceso',
  ].join('\n');
  const { resultado, errores } = await ejecutar(ctx, codigo);
  assert.strictEqual(resultado.exito, false);
  assert.ok(errores.some(e => /fuera de rango/i.test(e.mensaje)));
});

test('v1.6.0: runtime lanza error ArregloNoDimensionado', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Definir v Como Entero',
    'v[1] = 1',
    'FinProceso',
  ].join('\n');
  const { resultado, errores } = await ejecutar(ctx, codigo);
  assert.strictEqual(resultado.exito, false);
  assert.ok(errores.some(e => /no es un arreglo/i.test(e.mensaje)));
});

test('v1.6.0: arreglo en bucle Para — suma de elementos', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Dimension v[4]',
    'Definir v Como Entero',
    'Definir i, s Como Entero',
    'v[1] = 1',
    'v[2] = 2',
    'v[3] = 3',
    'v[4] = 4',
    's = 0',
    'Para i = 1 Hasta 4 Hacer',
    '  s = s + v[i]',
    'FinPara',
    'Escribir s',
    'FinProceso',
  ].join('\n');
  assert.strictEqual(validar(ctx, codigo).length, 0);
  const { resultado, salida } = await ejecutar(ctx, codigo);
  assert.strictEqual(resultado.exito, true);
  assert.deepStrictEqual(salida, ['10']);
});

test('v1.6.0: roundtrip JSON del AST preserva nodos Dimension y AsignarIndice', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Dimension v[5]',
    'Definir v Como Entero',
    'v[1] = 99',
    'FinProceso',
  ].join('\n');
  const ast = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const rehidratado = ctx.LiteSeIntAST.deserializarAST(ctx.LiteSeIntAST.serializarAST(ast));
  assert.deepStrictEqual(rehidratado, ast);
  assert.ok(rehidratado.cuerpo.some(n => n.tipo === 'Dimension'));
  assert.ok(rehidratado.cuerpo.some(n => n.tipo === 'AsignarIndice'));
});

test('v1.7.0: onVariableChanged se emite al definir y asignar variable', async () => {
  const ctx = loadRuntime();
  const cambios = [];
  const interprete = new ctx.LiteSeInt({
    onVariableChanged: info => cambios.push({ ...info }),
  });
  interprete.velocidadPausa = 0;
  await interprete.ejecutar(
    'Proceso p\n  Definir x Como Entero\n  x = 42\nFinProceso'
  );
  const definicion = cambios.find(c => c.nombre === 'x' && !c.inicializada && c.tipo === 'entero');
  assert.ok(definicion, 'emite al Definir');
  const asignado = cambios.find(c => c.nombre === 'x' && c.inicializada && c.valor === 42);
  assert.ok(asignado, 'emite al asignar con valor correcto');
});

test('v1.7.0: onScopeEntered y onScopeExited se emiten una vez', async () => {
  const ctx = loadRuntime();
  let entered = 0;
  let exited = 0;
  const interprete = new ctx.LiteSeInt({
    onScopeEntered: () => entered++,
    onScopeExited:  () => exited++,
  });
  interprete.velocidadPausa = 0;
  await interprete.ejecutar('Proceso p\n  Definir x Como Entero\nFinProceso');
  assert.strictEqual(entered, 1, 'onScopeEntered una vez');
  assert.strictEqual(exited,  1, 'onScopeExited una vez');
});

test('v1.7.0: onVariableChanged en arreglo 1D emite dimensiones y datos', async () => {
  const ctx = loadRuntime();
  const cambios = [];
  const interprete = new ctx.LiteSeInt({
    onVariableChanged: info => cambios.push({ ...info, datos: info.datos ? [...info.datos] : null }),
  });
  interprete.velocidadPausa = 0;
  await interprete.ejecutar([
    'Proceso p',
    'Dimension arr[3]',
    'Definir arr Como Entero',
    'arr[1] = 10',
    'arr[2] = 20',
    'FinProceso',
  ].join('\n'));
  const conDatos = cambios.filter(c => c.nombre === 'arr' && c.datos && c.dimensiones);
  assert.ok(conDatos.length > 0, 'emite para arreglo');
  const ultimo = conDatos[conDatos.length - 1];
  assert.strictEqual(ultimo.dimensiones[0], 3);
});

test('v1.7.0: onVariableChanged se emite con valor correcto en ciclo', async () => {
  const ctx = loadRuntime();
  const valores = [];
  const interprete = new ctx.LiteSeInt({
    onVariableChanged: info => { if (info.nombre === 'i') valores.push(info.valor); },
  });
  interprete.velocidadPausa = 0;
  await interprete.ejecutar([
    'Proceso p',
    'Definir i Como Entero',
    'Para i = 1 Hasta 3 Hacer',
    '  Escribir i',
    'FinPara',
    'FinProceso',
  ].join('\n'));
  assert.ok(valores.includes(1) && valores.includes(2) && valores.includes(3), 'emite valores del contador');
});

// ─────────────────────────────────────────────
//  v1.8.0 — SubProceso / Funcion / Call Stack
// ─────────────────────────────────────────────

test('v1.8.0: parser emite nodo SubProceso con params y cuerpo', () => {
  const ctx = loadRuntime();
  const codigo = [
    'SubProceso Saludar(nombre Como Caracter)',
    '  Escribir "Hola, ", nombre',
    'FinSubProceso',
    'Proceso p',
    '  Llamar Saludar("Mundo")',
    'FinProceso',
  ].join('\n');
  const ast = ctx.LiteSeIntParser.parsearPrograma(codigo);
  assert.ok(ast.subprocesos && ast.subprocesos.saludar, 'subproceso en el AST');
  const sp = ast.subprocesos.saludar;
  assert.strictEqual(sp.tipo, 'SubProceso');
  assert.strictEqual(sp.nombre, 'saludar');
  assert.strictEqual(sp.nombreOriginal, 'Saludar');
  assert.strictEqual(sp.retorno, null);
  assert.strictEqual(sp.params.length, 1);
  assert.strictEqual(sp.params[0].nombre, 'nombre');
  assert.strictEqual(sp.params[0].tipo, 'caracter');
  assert.strictEqual(sp.cuerpo.length, 1);
  // Llamar node in cuerpo
  const llamar = ast.cuerpo.find(n => n.tipo === 'Llamar');
  assert.ok(llamar, 'nodo Llamar en cuerpo principal');
  assert.strictEqual(llamar.nombre, 'saludar');
});

test('v1.8.0: runtime ejecuta SubProceso void', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'SubProceso Saludar(nombre Como Caracter)',
    '  Escribir "Hola, ", nombre',
    'FinSubProceso',
    'Proceso p',
    '  Llamar Saludar("Mundo")',
    'FinProceso',
  ].join('\n');
  const { salida } = await ejecutar(ctx, codigo);
  assert.deepStrictEqual(salida, ['Hola, Mundo']);
});

test('v1.8.0: runtime ejecuta Funcion con retorno', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'Funcion res = Cuadrado(n Como Entero)',
    '  res = n * n',
    'FinFuncion',
    'Proceso p',
    '  Definir x, r Como Entero',
    '  x = 5',
    '  r = Cuadrado(x)',
    '  Escribir r',
    'FinProceso',
  ].join('\n');
  const { salida } = await ejecutar(ctx, codigo);
  assert.deepStrictEqual(salida, ['25']);
});

test('v1.8.0: parametro por referencia modifica variable del llamador', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'SubProceso Duplicar(Por Referencia n Como Entero)',
    '  n = n * 2',
    'FinSubProceso',
    'Proceso p',
    '  Definir x Como Entero',
    '  x = 7',
    '  Llamar Duplicar(x)',
    '  Escribir x',
    'FinProceso',
  ].join('\n');
  const { salida } = await ejecutar(ctx, codigo);
  assert.deepStrictEqual(salida, ['14']);
});

test('v1.8.0: arreglo se pasa por referencia por defecto', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'SubProceso Llenar(arr Como Entero)',
    '  arr[1] = 99',
    'FinSubProceso',
    'Proceso p',
    '  Dimension arr[3]',
    '  Definir arr Como Entero',
    '  Llamar Llenar(arr)',
    '  Escribir arr[1]',
    'FinProceso',
  ].join('\n');
  const { salida } = await ejecutar(ctx, codigo);
  assert.deepStrictEqual(salida, ['99']);
});

test('v1.8.0: recursion calcula factorial correctamente', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'Funcion res = Fact(n Como Entero)',
    '  Si n <= 1 Entonces',
    '    res = 1',
    '  Sino',
    '    Definir m Como Entero',
    '    m = n - 1',
    '    m = Fact(m)',
    '    res = n * m',
    '  FinSi',
    'FinFuncion',
    'Proceso p',
    '  Definir r Como Entero',
    '  r = Fact(5)',
    '  Escribir r',
    'FinProceso',
  ].join('\n');
  const { salida } = await ejecutar(ctx, codigo);
  assert.deepStrictEqual(salida, ['120']);
});

test('v1.8.0: error cuando SubProceso no esta definido', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    '  Llamar Inexistente()',
    'FinProceso',
  ].join('\n');
  const { resultado } = await ejecutar(ctx, codigo);
  assert.strictEqual(resultado.exito, false, 'debe fallar');
});

test('v1.8.0: error de desbordamiento de pila en recursion infinita', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'SubProceso Inf()',
    '  Llamar Inf()',
    'FinSubProceso',
    'Proceso p',
    '  Llamar Inf()',
    'FinProceso',
  ].join('\n');
  const { resultado } = await ejecutar(ctx, codigo);
  assert.strictEqual(resultado.exito, false, 'debe fallar por desbordamiento');
  assert.ok(resultado.errores.some(e => /pila|profundidad/i.test(e.mensaje)), 'mensaje de stack overflow');
});

test('v1.8.0: validador acepta SubProceso con Llamar valido', () => {
  const ctx = loadRuntime();
  const errores = validar(ctx, [
    'SubProceso Saludo()',
    '  Escribir "hi"',
    'FinSubProceso',
    'Proceso p',
    '  Llamar Saludo()',
    'FinProceso',
  ].join('\n'));
  assert.strictEqual(errores.length, 0, `errores inesperados: ${JSON.stringify(errores)}`);
});

test('v1.8.0: validador reporta SubProceso no definido en Llamar', () => {
  const ctx = loadRuntime();
  const errores = validar(ctx, [
    'Proceso p',
    '  Llamar Inexistente()',
    'FinProceso',
  ].join('\n'));
  assert.ok(errores.some(e => e.tipo === 'subproceso_no_definido'), 'debe reportar subproceso_no_definido');
});

test('v1.8.0: SubProceso definido despues de Proceso funciona', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    '  Llamar Doblar()',
    'FinProceso',
    'SubProceso Doblar()',
    '  Escribir "doble"',
    'FinSubProceso',
  ].join('\n');
  const { salida } = await ejecutar(ctx, codigo);
  assert.deepStrictEqual(salida, ['doble']);
});

// ─────────────────────────────────────────────────────────────
//  v1.9.0 — DiagramaMapper
// ─────────────────────────────────────────────────────────────

test('v1.9.0: DiagramaMapper disponible y DIAGRAMA_VERSION es 1', () => {
  const ctx = loadRuntime();
  assert.ok(ctx.LiteSeIntDiagrama, 'LiteSeIntDiagrama debe existir');
  assert.strictEqual(ctx.LiteSeIntDiagrama.DIAGRAMA_VERSION, 1);
  assert.strictEqual(typeof ctx.LiteSeIntDiagrama.astACodigo, 'function');
  assert.strictEqual(typeof ctx.LiteSeIntDiagrama.astADiagrama, 'function');
  assert.strictEqual(typeof ctx.LiteSeIntDiagrama.normalizarASTParaComparacion, 'function');
});

test('v1.9.0: astACodigo emite Proceso Principal y FinProceso', () => {
  const ctx = loadRuntime();
  const ast = ctx.LiteSeIntParser.parsearPrograma('Proceso Principal\n  Escribir "hola"\nFinProceso');
  const generado = ctx.LiteSeIntDiagrama.astACodigo(ast);
  assert.ok(generado.includes('Proceso Principal'));
  assert.ok(generado.includes('Escribir "hola"'));
  assert.ok(generado.includes('FinProceso'));
});

test('v1.9.0: astACodigo roundtrip instrucciones simples', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = ['Proceso p', '  Definir x Como Entero', '  x = 42', '  Escribir x', 'FinProceso'].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo roundtrip Si Sino FinSi', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'Proceso p',
    '  Definir x Como Entero',
    '  x = 3',
    '  Si x > 2 Entonces',
    '    Escribir "mayor"',
    '  Sino',
    '    Escribir "menor"',
    '  FinSi',
    'FinProceso',
  ].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo roundtrip Mientras', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'Proceso p',
    '  Definir i Como Entero',
    '  i = 0',
    '  Mientras i < 5 Hacer',
    '    i = i + 1',
    '  FinMientras',
    'FinProceso',
  ].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo roundtrip Repetir HastaQue', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'Proceso p',
    '  Definir n Como Entero',
    '  n = 0',
    '  Repetir',
    '    n = n + 1',
    '  HastaQue n >= 3',
    'FinProceso',
  ].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo roundtrip Para sin paso', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'Proceso p',
    '  Definir i Como Entero',
    '  Para i = 1 Hasta 10 Hacer',
    '    Escribir i',
    '  FinPara',
    'FinProceso',
  ].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo roundtrip Para con paso', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'Proceso p',
    '  Definir i Como Entero',
    '  Para i = 0 Hasta 10 Con Paso 2 Hacer',
    '    Escribir i',
    '  FinPara',
    'FinProceso',
  ].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo roundtrip Segun con De Otro Modo', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'Proceso p',
    '  Definir x Como Entero',
    '  x = 2',
    '  Segun x Hacer',
    '  1:',
    '    Escribir "uno"',
    '  2, 3:',
    '    Escribir "dos o tres"',
    '  De Otro Modo:',
    '    Escribir "otro"',
    '  FinSegun',
    'FinProceso',
  ].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo roundtrip SubProceso void', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'SubProceso Saludar()',
    '  Escribir "hola"',
    'FinSubProceso',
    'Proceso p',
    '  Llamar Saludar()',
    'FinProceso',
  ].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo roundtrip Funcion con retorno', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'Funcion res = Doble(n Como Entero)',
    '  res = n * 2',
    'FinFuncion',
    'Proceso p',
    '  Definir x Como Entero',
    '  x = Doble(5)',
    '  Escribir x',
    'FinProceso',
  ].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo roundtrip SubProceso Por Referencia', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'SubProceso Incrementar(Por Referencia x Como Entero)',
    '  x = x + 1',
    'FinSubProceso',
    'Proceso p',
    '  Definir n Como Entero',
    '  n = 0',
    '  Llamar Incrementar(n)',
    '  Escribir n',
    'FinProceso',
  ].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo roundtrip Dimension y AsignarIndice', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'Proceso p',
    '  Dimension v[3]',
    '  Definir v Como Entero',
    '  v[1] = 10',
    '  Escribir v[1]',
    'FinProceso',
  ].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo roundtrip Leer con indice', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'Proceso p',
    '  Dimension v[5]',
    '  Definir v Como Entero',
    '  Leer v[1]',
    '  Escribir v[1]',
    'FinProceso',
  ].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo roundtrip estructuras anidadas', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'Proceso p',
    '  Definir i Como Entero',
    '  i = 0',
    '  Mientras i < 3 Hacer',
    '    Si i == 1 Entonces',
    '      Escribir "uno"',
    '    FinSi',
    '    i = i + 1',
    '  FinMientras',
    'FinProceso',
  ].join('\n');
  const ast1 = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const ast2 = ctx.LiteSeIntParser.parsearPrograma(ctx.LiteSeIntDiagrama.astACodigo(ast1));
  assert.deepStrictEqual(norm(ast1), norm(ast2));
});

test('v1.9.0: astACodigo preserva nombreProceso personalizado', () => {
  const ctx = loadRuntime();
  const ast = ctx.LiteSeIntParser.parsearPrograma('Proceso MiPrograma\n  Escribir "ok"\nFinProceso');
  const generado = ctx.LiteSeIntDiagrama.astACodigo(ast);
  assert.ok(generado.includes('Proceso MiPrograma'));
});

test('v1.9.0: astADiagrama estructura Programa y Proceso', () => {
  const ctx = loadRuntime();
  const ast = ctx.LiteSeIntParser.parsearPrograma('Proceso p\n  Escribir "test"\nFinProceso');
  const { raiz, version } = ctx.LiteSeIntDiagrama.astADiagrama(ast);
  assert.strictEqual(version, 1);
  assert.strictEqual(raiz.tipo, 'Programa');
  const proceso = raiz.hijos[0];
  assert.strictEqual(proceso.tipo, 'Proceso');
  assert.strictEqual(proceso.hijos.length, 1);
  assert.strictEqual(proceso.hijos[0].tipo, 'Io');
});

test('v1.9.0: astADiagrama Si produce 2 SiRama', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    '  Definir x Como Entero',
    '  x = 1',
    '  Si x > 0 Entonces',
    '    Escribir "pos"',
    '  FinSi',
    'FinProceso',
  ].join('\n');
  const ast = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const { raiz } = ctx.LiteSeIntDiagrama.astADiagrama(ast);
  const proceso = raiz.hijos[0];
  const siNodo = proceso.hijos.find(n => n.tipo === 'Si');
  assert.ok(siNodo, 'debe haber nodo Si');
  assert.strictEqual(siNodo.hijos.length, 2);
  assert.strictEqual(siNodo.hijos[0].tipo, 'SiRama');
  assert.strictEqual(siNodo.hijos[0].etiqueta, 'Verdadero');
});

test('v1.9.0: astADiagrama bucles tienen tipo correcto', () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    '  Definir i Como Entero',
    '  i = 0',
    '  Mientras i < 1 Hacer',
    '    i = i + 1',
    '  FinMientras',
    '  Repetir',
    '    i = i + 1',
    '  HastaQue i > 5',
    '  Para i = 1 Hasta 3 Hacer',
    '    Escribir i',
    '  FinPara',
    'FinProceso',
  ].join('\n');
  const ast = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const { raiz } = ctx.LiteSeIntDiagrama.astADiagrama(ast);
  const tipos = raiz.hijos[0].hijos.map(n => n.tipo);
  assert.ok(tipos.includes('BucleMientras'), 'BucleMientras');
  assert.ok(tipos.includes('BucleRepetir'), 'BucleRepetir');
  assert.ok(tipos.includes('BuclePara'), 'BuclePara');
});

test('v1.9.0: astADiagrama SubProceso aparece en hijos de raiz', () => {
  const ctx = loadRuntime();
  const codigo = [
    'SubProceso Prueba()',
    '  Escribir "sp"',
    'FinSubProceso',
    'Proceso p',
    '  Llamar Prueba()',
    'FinProceso',
  ].join('\n');
  const ast = ctx.LiteSeIntParser.parsearPrograma(codigo);
  const { raiz } = ctx.LiteSeIntDiagrama.astADiagrama(ast);
  assert.strictEqual(raiz.hijos.length, 2);
  const sp = raiz.hijos.find(n => n.tipo === 'SubProceso');
  assert.ok(sp, 'debe haber nodo SubProceso');
  assert.ok(sp.etiqueta.includes('Prueba'));
});

test('v1.9.0: normalizarASTParaComparacion elimina loc y locHastaQue', () => {
  const ctx = loadRuntime();
  const norm = ctx.LiteSeIntDiagrama.normalizarASTParaComparacion;
  const codigo = [
    'Proceso p',
    '  Definir x Como Entero',
    '  Repetir',
    '    x = x + 1',
    '  HastaQue x >= 3',
    'FinProceso',
  ].join('\n');
  const normalizado = norm(ctx.LiteSeIntParser.parsearPrograma(codigo));
  assert.ok(!('loc' in normalizado), 'Programa no debe tener loc');
  const rep = normalizado.cuerpo[1];
  assert.strictEqual(rep.tipo, 'Repetir');
  assert.ok(!('loc' in rep), 'Repetir no debe tener loc');
  assert.ok(!('locHastaQue' in rep), 'Repetir no debe tener locHastaQue');
});

test('detener durante Leer marca la ejecucion como detenida', async () => {
  const ctx = loadRuntime();
  const codigo = [
    'Proceso p',
    'Definir nombre Como Caracter',
    'Leer nombre',
    'Escribir nombre',
    'FinProceso',
  ].join('\n');
  const { resultado, salida } = await ejecutar(ctx, codigo, { detenerDuranteLeer: true });
  assert.strictEqual(resultado.detenido, true);
  assert.strictEqual(resultado.exito, false);
  assert.deepStrictEqual(salida, []);
});

// =====================================================
// Banco de ejercicios PSeInt (Fase 3 / Fase 5)
// =====================================================

function loadPSeIntEjercicios() {
  const raiz = path.resolve(__dirname, '..');
  const ctx = { console, setTimeout, clearTimeout, Promise };
  vm.createContext(ctx);
  const archivos = [
    'core/pseint/tokenizer.js',
    'core/pseint/ast.js',
    'core/pseint/builtins.js',
    'core/pseint/symbol-table.js',
    'core/pseint/parser.js',
    'core/pseint/validator.js',
    'core/pseint/expression-evaluator.js',
    'core/pseint/runtime.js',
    'js/ejercicios-pseint-data.js',
  ];
  for (const rel of archivos) {
    vm.runInContext(fs.readFileSync(path.join(raiz, rel), 'utf8'), ctx, { filename: rel });
  }
  const ejJsonPaths = [
    'json/pseint/N1.json', 'json/pseint/N2.json', 'json/pseint/N3.json',
    'json/pseint/N4.json', 'json/pseint/N5.json', 'json/pseint/N6.json',
    'json/pseint/N7.json',
  ];
  const ejercicios = ejJsonPaths.flatMap((p) => {
    const data = JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8'));
    return ctx.EjerciciosPSeInt.ejerciciosDesdeData(data, p);
  });
  ctx.EjerciciosPSeInt.instalarBanco(ejercicios);
  return ctx;
}

function loadPythonEjercicios() {
  const raiz = path.resolve(__dirname, '..');
  const ctx = { console, setTimeout, clearTimeout, Promise };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(path.join(raiz, 'js/ejercicios-python-data.js'), 'utf8'), ctx,
    { filename: 'ejercicios-python-data.js' });
  const ejJsonPaths = [
    'json/python/N1.json', 'json/python/N2.json', 'json/python/N3.json',
    'json/python/N4.json', 'json/python/N5.json', 'json/python/N6.json',
    'json/python/N7.json',
  ];
  const ejercicios = ejJsonPaths.flatMap((p) => {
    const data = JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8'));
    return ctx.EjerciciosPython.ejerciciosDesdeData(data, p);
  });
  ctx.EjerciciosPython.instalarBanco(ejercicios);
  return ctx;
}

test('banco PSeInt: carga 110 ejercicios de N1 a N7', () => {
  const ctx = loadPSeIntEjercicios();
  const ej = ctx.EjerciciosPSeInt.EJERCICIOS;
  assert.strictEqual(ej.length, 110,
    `se esperaban 110 ejercicios PSeInt, se obtuvieron ${ej.length}`);
});

test('banco PSeInt: IDs únicos y con prefijo ps-', () => {
  const ctx = loadPSeIntEjercicios();
  const vistos = new Set();
  for (const e of ctx.EjerciciosPSeInt.EJERCICIOS) {
    assert(!vistos.has(e.id), `ID duplicado: ${e.id}`);
    assert(/^ps-/.test(e.id), `ID sin prefijo ps-: ${e.id}`);
    vistos.add(e.id);
  }
});

test('banco PSeInt: todos los adaptados pasan validarPSeInt', () => {
  const ctx = loadPSeIntEjercicios();
  const adaptados = ctx.EjerciciosPSeInt.listarAdaptados().filter((e) => e.codigoReferencia);
  assert.ok(adaptados.length > 0, 'no hay ejercicios adaptados con codigoReferencia');
  for (const e of adaptados) {
    const errores = ctx.validarPSeInt(e.codigoReferencia, {});
    assert.strictEqual(errores.length, 0,
      `${e.id} tiene errores estáticos: ${JSON.stringify(errores.slice(0, 2))}`);
  }
});

test('banco PSeInt: ejercicios no contienen sintaxis LiteSeInt prohibida', () => {
  const ctx = loadPSeIntEjercicios();
  for (const e of ctx.EjerciciosPSeInt.listarAdaptados()) {
    const c = e.codigoReferencia || '';
    assert(!/\bProceso\b/.test(c), `${e.id}: contiene "Proceso" (LiteSeInt)`);
    assert(!/\bFinProceso\b/.test(c), `${e.id}: contiene "FinProceso" (LiteSeInt)`);
    assert(!/\bDefinir\s+\w+\s+Como\s+Caracter\b/i.test(c),
      `${e.id}: usa "Caracter" en lugar de "Cadena"`);
  }
});

// =====================================================
// Banco de ejercicios Python (Fase 4 / Fase 5)
// =====================================================

test('banco Python: carga 110 ejercicios de N1 a N7', () => {
  const ctx = loadPythonEjercicios();
  const ej = ctx.EjerciciosPython.EJERCICIOS;
  assert.strictEqual(ej.length, 110,
    `se esperaban 110 ejercicios Python, se obtuvieron ${ej.length}`);
});

test('banco Python: IDs únicos y con prefijo py-', () => {
  const ctx = loadPythonEjercicios();
  const vistos = new Set();
  for (const e of ctx.EjerciciosPython.EJERCICIOS) {
    assert(!vistos.has(e.id), `ID duplicado: ${e.id}`);
    assert(/^py-/.test(e.id), `ID sin prefijo py-: ${e.id}`);
    vistos.add(e.id);
  }
});

test('banco Python: todos los adaptados tienen codigoReferencia', () => {
  const ctx = loadPythonEjercicios();
  const adaptados = ctx.EjerciciosPython.listarAdaptados();
  assert.ok(adaptados.length > 0, 'no hay ejercicios Python adaptados');
  for (const e of adaptados) {
    assert(e.codigoReferencia && e.codigoReferencia.trim().length > 0,
      `${e.id} no tiene codigoReferencia`);
  }
});

test('banco Python: ejercicios no contienen sintaxis PSeInt o LiteSeInt', () => {
  const ctx = loadPythonEjercicios();
  for (const e of ctx.EjerciciosPython.listarAdaptados()) {
    const c = e.codigoReferencia || '';
    assert(!/\bAlgoritmo\b/.test(c), `${e.id}: contiene "Algoritmo" (PSeInt)`);
    assert(!/\bFinAlgoritmo\b/.test(c), `${e.id}: contiene "FinAlgoritmo" (PSeInt)`);
    assert(!/\bProceso\b/.test(c), `${e.id}: contiene "Proceso" (LiteSeInt)`);
    assert(!/\bEscribir\b/.test(c), `${e.id}: contiene "Escribir" (PSeInt/LiteSeInt)`);
    assert(!/\bLeer\b/.test(c), `${e.id}: contiene "Leer" (PSeInt/LiteSeInt)`);
  }
});

(async () => {
  let fallas = 0;

  for (const { nombre, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${nombre}`);
    } catch (err) {
      fallas++;
      console.error(`not ok - ${nombre}`);
      console.error(err && err.stack ? err.stack : err);
    }
  }

  if (fallas > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`\n${tests.length} pruebas pasaron.`);
})();
