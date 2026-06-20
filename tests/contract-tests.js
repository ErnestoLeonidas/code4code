/**
 * Code4Code — tests/contract-tests.js
 * ===================================
 * Pruebas de la capa multi-lenguaje (Fase 1): contrato de provider,
 * registro de lenguajes y RuntimeHost. No dependen del núcleo LiteSeInt,
 * por lo que corren incluso antes de importar los archivos originales.
 *
 * Uso: node tests/contract-tests.js
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const Code4Code = require(path.join(__dirname, '..', 'core', 'language-provider.js'));
require(path.join(__dirname, '..', 'core', 'language-registry.js'));
require(path.join(__dirname, '..', 'core', 'runtime-host.js'));

let total = 0;
let fallas = 0;

function prueba(nombre, fn) {
  total += 1;
  return Promise.resolve()
    .then(fn)
    .then(() => console.log('  ✔ ' + nombre))
    .catch((e) => {
      fallas += 1;
      console.error('  ✘ ' + nombre + ' → ' + e.message);
    });
}

function asegurar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'aserción fallida');
}

function storageFalso() {
  const datos = {};
  return {
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v); },
    _datos: datos
  };
}

/**
 * Carga la capa multi-lenguaje + el núcleo LiteSeInt + el provider real en
 * un contexto aislado, ejecutando CADA archivo como un script separado en
 * el MISMO orden que index.html. Esto reproduce fielmente al navegador:
 * los const/class de nivel superior (DocErrores, LiteSeInt) quedan en el
 * entorno léxico global pero NO como propiedades de globalThis, igual que
 * con <script> clásicos. No asignar globals a mano aquí: ocultaría bugs
 * de acceso vía window.X.
 */
function cargarAppEnContexto() {
  const raizRepo = path.join(__dirname, '..');
  const ctx = { console, setTimeout, clearTimeout, Promise };
  vm.createContext(ctx);
  // Mismo orden de carga que index.html.
  const scripts = [
    'core/language-provider.js',
    'core/language-registry.js',
    'core/runtime-host.js',
    'core/liteseint/tokenizer.js',
    'core/liteseint/symbol-table.js',
    'core/liteseint/validator.js',
    'core/liteseint/doc_errores.js',
    'core/liteseint/ast.js',
    'core/liteseint/parser.js',
    'core/liteseint/expression-evaluator.js',
    'core/liteseint/runtime.js',
    'core/liteseint/provider.js'
  ];
  for (const rel of scripts) {
    vm.runInContext(fs.readFileSync(path.join(raizRepo, rel), 'utf8'), ctx,
      { filename: rel });
  }
  return ctx;
}

/**
 * Ejecuta un programa con el provider real y un host de prueba.
 * @returns {Promise<string>} estado final ('finalizado'|'detenido'|'error').
 */
function ejecutarConHost(ctx, provider, codigo, opciones) {
  const entradas = (opciones.entradas || []).slice();
  const salidas = opciones.salidas || [];
  return new Promise((resolver, rechazar) => {
    const temporizador = setTimeout(
      () => rechazar(new Error('la ejecución no terminó en 5s')), 5000);
    const host = ctx.Code4Code.crearRuntimeHost({
      escribir: (texto, meta) => salidas.push({
        texto: texto,
        tipo: meta && meta.tipo,
        linea: meta && meta.linea
      }),
      leer: () => Promise.resolve(entradas.shift() || ''),
      alCambiarEstado: (estado) => {
        if (estado === 'finalizado' || estado === 'detenido' || estado === 'error') {
          clearTimeout(temporizador);
          resolver(estado);
        }
      }
    });
    provider.ejecutar(codigo, host, { pausaPorLinea: 0 });
  });
}

function providerMock(id) {
  return {
    id: id,
    nombre: 'Mock ' + id,
    extension: '.mock',
    plantillaInicial: () => '',
    tokenizarLinea: (l) => ({ tokens: [{ tipo: 'plano', texto: l }] }),
    validar: () => [],
    ejecutar: (codigo, host) => {
      host.iniciar();
      host.contarPaso(1);
      host.escribir('hola desde ' + id);
      host.finalizar();
      return { detener: () => host.detener() };
    }
  };
}

async function main() {
  console.log('Pruebas de contrato Code4Code (capa multi-lenguaje)');

  // ---- language-provider ----
  await prueba('validarProvider acepta un provider completo', () => {
    asegurar(Code4Code.validarProvider(providerMock('a')).length === 0);
  });

  await prueba('validarProvider reporta campos y funciones faltantes', () => {
    const problemas = Code4Code.validarProvider({ id: 'x' });
    asegurar(problemas.length >= 3, 'esperaba varios problemas, hubo ' + problemas.length);
  });

  await prueba('crearProvider congela y exige extensión con punto', () => {
    const p = Code4Code.crearProvider(providerMock('b'));
    asegurar(Object.isFrozen(p), 'el provider debe quedar congelado');
    let lanzo = false;
    try {
      Code4Code.crearProvider(Object.assign(providerMock('c'), { extension: 'psc' }));
    } catch (e) { lanzo = true; }
    asegurar(lanzo, 'extensión sin punto debía rechazarse');
  });

  await prueba('tieneCapacidad detecta capacidades declaradas', () => {
    const p = Code4Code.crearProvider(Object.assign(providerMock('d'), {
      capacidades: [Code4Code.CAPACIDADES.DIAGRAMA_NS]
    }));
    asegurar(Code4Code.tieneCapacidad(p, Code4Code.CAPACIDADES.DIAGRAMA_NS));
    asegurar(!Code4Code.tieneCapacidad(p, Code4Code.CAPACIDADES.EJERCICIOS));
  });

  // ---- language-registry ----
  await prueba('el primer lenguaje registrado queda activo', () => {
    const r = Code4Code.crearRegistro({ storage: storageFalso() });
    r.registrar(providerMock('uno'));
    r.registrar(providerMock('dos'));
    asegurar(r.activo().id === 'uno');
    asegurar(r.lista().length === 2);
  });

  await prueba('activar() persiste y notifica suscriptores', () => {
    const st = storageFalso();
    const r = Code4Code.crearRegistro({ storage: st });
    r.registrar(providerMock('uno'));
    r.registrar(providerMock('dos'));
    let notificado = null;
    r.onCambio((p) => { notificado = p.id; });
    r.activar('dos');
    asegurar(notificado === 'dos', 'el suscriptor no fue notificado');
    asegurar(st.getItem(Code4Code.CLAVE_LENGUAJE) === 'dos', 'no se persistió la elección');
  });

  await prueba('la selección persistida se restaura al registrar', () => {
    const st = storageFalso();
    st.setItem(Code4Code.CLAVE_LENGUAJE, 'dos');
    const r = Code4Code.crearRegistro({ storage: st });
    r.registrar(providerMock('uno'));
    r.registrar(providerMock('dos'));
    asegurar(r.activo().id === 'dos', 'debía restaurar el lenguaje persistido');
  });

  await prueba('ids duplicados y activar() de ids desconocidos se rechazan', () => {
    const r = Code4Code.crearRegistro({ storage: storageFalso() });
    r.registrar(providerMock('uno'));
    let dup = false, desconocido = false;
    try { r.registrar(providerMock('uno')); } catch (e) { dup = true; }
    try { r.activar('nada'); } catch (e) { desconocido = true; }
    asegurar(dup && desconocido);
  });

  // ---- runtime-host ----
  await prueba('flujo feliz: iniciar → pasos → escribir → finalizar', () => {
    const salidas = [];
    const estados = [];
    const host = Code4Code.crearRuntimeHost({
      escribir: (t) => salidas.push(t),
      alCambiarEstado: (e) => estados.push(e)
    });
    providerMock('run').ejecutar('', host);
    asegurar(salidas.length === 1 && salidas[0].includes('hola'));
    asegurar(estados[0] === 'ejecutando' && estados[estados.length - 1] === 'finalizado',
      'estados: ' + estados.join(','));
  });

  await prueba('el límite de pasos corta ciclos infinitos', () => {
    const host = Code4Code.crearRuntimeHost({}, { maxPasos: 100 });
    host.iniciar();
    let cortado = false;
    try {
      for (;;) host.contarPaso();
    } catch (e) {
      cortado = !!e.esDetencionDeHost;
    }
    asegurar(cortado, 'esperaba EjecucionDetenida por límite de pasos');
    asegurar(host.estado() === 'detenido');
  });

  await prueba('detener() rechaza una lectura pendiente', async () => {
    let resolverEntrada;
    const host = Code4Code.crearRuntimeHost({
      leer: () => new Promise((res) => { resolverEntrada = res; })
    });
    host.iniciar();
    const lectura = host.leer();
    asegurar(host.estado() === 'esperando-entrada');
    host.detener();
    let rechazada = false;
    await lectura.catch((e) => { rechazada = !!e.esDetencionDeHost; });
    asegurar(rechazada, 'la lectura pendiente debía rechazarse al detener');
    asegurar(host.fueDetenido());
  });

  await prueba('contarPaso lanza tras detener()', () => {
    const host = Code4Code.crearRuntimeHost({});
    host.iniciar();
    host.detener();
    let lanzo = false;
    try { host.contarPaso(); } catch (e) { lanzo = !!e.esDetencionDeHost; }
    asegurar(lanzo);
  });

  await prueba('reportarError no trata la detención como error de programa', () => {
    const salidas = [];
    const host = Code4Code.crearRuntimeHost({ escribir: (t, m) => salidas.push(m && m.tipo) });
    host.iniciar();
    host.reportarError(new Code4Code.EjecucionDetenida('stop'));
    asegurar(host.estado() === 'detenido');
    asegurar(salidas.length === 0, 'la detención no debe imprimir error');
    host.iniciar();
    host.reportarError(new Error('división por cero'));
    asegurar(host.estado() === 'error');
    asegurar(salidas[0] === 'error');
  });

  await prueba('reportarError propaga la línea del error en el meta', () => {
    const metas = [];
    const host = Code4Code.crearRuntimeHost({ escribir: (t, m) => metas.push(m) });
    host.iniciar();
    host.reportarError({ message: 'variable no definida', linea: 4 });
    asegurar(host.estado() === 'error');
    asegurar(metas[0].tipo === 'error' && metas[0].linea === 4,
      'meta: ' + JSON.stringify(metas[0]));
  });

  await prueba('el límite de pasos informa el motivo por consola', () => {
    const salidas = [];
    const host = Code4Code.crearRuntimeHost(
      { escribir: (t, m) => salidas.push({ texto: t, tipo: m && m.tipo }) },
      { maxPasos: 10 });
    host.iniciar();
    try { for (;;) host.contarPaso(); } catch (e) { /* EjecucionDetenida */ }
    asegurar(salidas.length === 1 && salidas[0].tipo === 'error');
    asegurar(salidas[0].texto.indexOf('ciclo infinito') !== -1,
      'motivo: ' + salidas[0].texto);
  });

  // ---- provider liteseint (definición, sin núcleo) ----
  await prueba('la definición del provider LiteSeInt cumple el contrato', () => {
    // Carga aislada: registra en el registro global, pero aquí solo
    // verificamos que la definición sea válida según el contrato.
    const mod = require(path.join(__dirname, '..', 'core', 'liteseint', 'provider.js'));
    const problemas = Code4Code.validarProvider(mod.definicion());
    asegurar(problemas.length === 0, problemas.join(' | '));
  });

  // ---- provider liteseint cableado al núcleo real (integración) ----
  const ctx = cargarAppEnContexto();
  const proveedorReal = ctx.Code4Code.registro.activo();

  await prueba('integración: el registro global queda con LiteSeInt activo', () => {
    asegurar(proveedorReal && proveedorReal.id === 'liteseint');
    asegurar(ctx.Code4Code.tieneCapacidad(proveedorReal,
      ctx.Code4Code.CAPACIDADES.DIAGRAMA_NS));
  });

  await prueba('integración: tokenizarLinea usa el tokenizer real', () => {
    const r = proveedorReal.tokenizarLinea('Escribir "hola" // saludo');
    const tipos = r.tokens.map((t) => t.tipo);
    asegurar(tipos.indexOf('palabra-clave') !== -1, 'tipos: ' + tipos.join(','));
    asegurar(tipos.indexOf('cadena') !== -1, 'tipos: ' + tipos.join(','));
    asegurar(tipos.indexOf('comentario') !== -1, 'tipos: ' + tipos.join(','));
  });

  await prueba('integración: validar reporta errores con línea y mensaje', () => {
    const errores = proveedorReal.validar(
      'Proceso p\n  x = 1\nFinProceso');
    asegurar(errores.length > 0, 'esperaba errores de variable no definida');
    asegurar(typeof errores[0].linea === 'number' && errores[0].mensaje,
      'error: ' + JSON.stringify(errores[0]));
    asegurar(proveedorReal.validar(
      'Proceso p\n  Escribir "ok"\nFinProceso').length === 0,
      'un programa válido no debe reportar errores');
  });

  await prueba('integración: ejecutar corre el núcleo real a través del host', async () => {
    const salidas = [];
    const resultado = await ejecutarConHost(ctx, proveedorReal,
      'Proceso p\n' +
      '  Definir x Como Entero\n' +
      '  Escribir "Ingresa x"\n' +
      '  Leer x\n' +
      '  Escribir "Doble: ", x * 2\n' +
      'FinProceso',
      { entradas: ['21'], salidas });
    asegurar(resultado === 'finalizado', 'estado final: ' + resultado);
    const textos = salidas.filter((s) => s.tipo === 'salida').map((s) => s.texto);
    asegurar(textos.indexOf('Ingresa x') !== -1, 'salidas: ' + textos.join(' | '));
    asegurar(textos.indexOf('Doble: 42') !== -1, 'salidas: ' + textos.join(' | '));
  });

  await prueba('integración: un error de runtime deja al host en estado error', async () => {
    const salidas = [];
    const resultado = await ejecutarConHost(ctx, proveedorReal,
      'Proceso p\n' +
      '  Definir x Como Entero\n' +
      '  x = 1 / 0\n' +
      '  Escribir x\n' +
      'FinProceso',
      { salidas });
    asegurar(resultado === 'error', 'estado final: ' + resultado);
    const errores = salidas.filter((s) => s.tipo === 'error');
    asegurar(errores.length > 0 && typeof errores[0].linea === 'number',
      'errores: ' + JSON.stringify(errores));
  });

  // ---- provider PSeInt (definición, sin núcleo) ----
  await prueba('PSeInt: la definición del provider cumple el contrato', () => {
    const mod = require(path.join(__dirname, '..', 'core', 'pseint', 'provider.js'));
    const problemas = Code4Code.validarProvider(mod.definicion());
    asegurar(problemas.length === 0, problemas.join(' | '));
  });

  // ---- provider PSeInt cableado al núcleo real (integración) ----
  /**
   * Carga la capa multi-lenguaje + el núcleo PSeInt + el provider real en
   * un contexto aislado, ejecutando cada archivo como un script separado
   * en el mismo orden que index.html.
   */
  function cargarPSeIntEnContexto() {
    const raizRepo = path.join(__dirname, '..');
    const ctx2 = { console, setTimeout, clearTimeout, Promise };
    vm.createContext(ctx2);
    const scripts = [
      'core/language-provider.js',
      'core/language-registry.js',
      'core/runtime-host.js',
      'core/pseint/tokenizer.js',
      'core/pseint/ast.js',
      'core/pseint/builtins.js',
      'core/pseint/symbol-table.js',
      'core/pseint/parser.js',
      'core/pseint/validator.js',
      'core/pseint/expression-evaluator.js',
      'core/pseint/runtime.js',
      'core/pseint/provider.js',
    ];
    for (const rel of scripts) {
      vm.runInContext(fs.readFileSync(path.join(raizRepo, rel), 'utf8'), ctx2,
        { filename: rel });
    }
    return ctx2;
  }

  const ctxPS = cargarPSeIntEnContexto();
  const proveedorPS = ctxPS.Code4Code.registro.activo();

  await prueba('PSeInt integración: el registro queda con PSeInt activo', () => {
    asegurar(proveedorPS && proveedorPS.id === 'pseint',
      'provider activo: ' + (proveedorPS && proveedorPS.id));
    asegurar(ctxPS.Code4Code.tieneCapacidad(proveedorPS,
      ctxPS.Code4Code.CAPACIDADES.INSPECTOR_VARIABLES));
  });

  await prueba('PSeInt integración: plantillaInicial contiene Algoritmo y FinAlgoritmo', () => {
    const plantilla = proveedorPS.plantillaInicial();
    asegurar(typeof plantilla === 'string' && plantilla.length > 0,
      'plantilla vacía');
    asegurar(plantilla.indexOf('Algoritmo') !== -1, 'falta Algoritmo');
    asegurar(plantilla.indexOf('FinAlgoritmo') !== -1, 'falta FinAlgoritmo');
  });

  await prueba('PSeInt integración: tokenizarLinea usa el tokenizer real', () => {
    const r = proveedorPS.tokenizarLinea('Escribir "hola"');
    const tipos = r.tokens.map((t) => t.tipo);
    asegurar(tipos.indexOf('palabra-clave') !== -1, 'tipos: ' + tipos.join(','));
    asegurar(tipos.indexOf('cadena') !== -1, 'tipos: ' + tipos.join(','));
  });

  await prueba('PSeInt integración: tokenizarLinea reconoce flecha y número', () => {
    const r = proveedorPS.tokenizarLinea('x <- 42');
    const tipos = r.tokens.map((t) => t.tipo);
    asegurar(tipos.indexOf('identificador') !== -1, 'tipos: ' + tipos.join(','));
    asegurar(tipos.indexOf('asignacion') !== -1, 'falta asignacion: ' + tipos.join(','));
    asegurar(tipos.indexOf('numero') !== -1, 'tipos: ' + tipos.join(','));
  });

  await prueba('PSeInt integración: reglasIndentacion incluye Algoritmo y FinAlgoritmo', () => {
    const reglas = proveedorPS.reglasIndentacion();
    asegurar(Array.isArray(reglas.aperturas) && reglas.aperturas.indexOf('Algoritmo') !== -1,
      'falta Algoritmo en aperturas');
    asegurar(Array.isArray(reglas.cierres) && reglas.cierres.indexOf('FinAlgoritmo') !== -1,
      'falta FinAlgoritmo en cierres');
    asegurar(Array.isArray(reglas.intermedios) && reglas.intermedios.indexOf('Sino') !== -1,
      'falta Sino en intermedios');
  });

  await prueba('PSeInt integración: autocompletar devuelve palabras clave y funciones', () => {
    const candidatos = proveedorPS.autocompletar({});
    asegurar(Array.isArray(candidatos) && candidatos.length > 0, 'candidatos vacíos');
    const tipos = candidatos.map((c) => c.tipo);
    asegurar(tipos.indexOf('keyword') !== -1, 'faltan keywords');
    asegurar(tipos.indexOf('funcion') !== -1, 'faltan funciones nativas');
    // Verificar que hay funciones con paréntesis y keywords con capitalización
    const fns = candidatos.filter((c) => c.tipo === 'funcion');
    asegurar(fns.some((f) => f.texto.indexOf('()') !== -1), 'funciones sin paréntesis');
  });

  await prueba('PSeInt integración: validar acepta un programa correcto', () => {
    const errores = proveedorPS.validar(
      'Algoritmo suma\n' +
      '  Definir a, b, r Como Entero\n' +
      '  a <- 3\n' +
      '  b <- 5\n' +
      '  r <- a + b\n' +
      '  Escribir r\n' +
      'FinAlgoritmo');
    asegurar(errores.length === 0, 'esperaba sin errores: ' + JSON.stringify(errores));
  });

  await prueba('PSeInt integración: validar reporta error con linea y tipo', () => {
    const errores = proveedorPS.validar('Escribir "hola"');
    asegurar(errores.length > 0, 'esperaba al menos un error');
    asegurar(typeof errores[0].linea === 'number', 'error sin linea: ' + JSON.stringify(errores[0]));
    asegurar(typeof errores[0].mensaje === 'string', 'error sin mensaje');
    asegurar(errores[0].tipo === 'error', 'tipo incorrecto: ' + errores[0].tipo);
  });

  await prueba('PSeInt integración: ejecutar corre el núcleo real a través del host', async () => {
    const salidas = [];
    const resultado = await ejecutarConHost(ctxPS, proveedorPS,
      'Algoritmo suma\n' +
      '  Definir a, b Como Entero\n' +
      '  a <- 3\n' +
      '  b <- 4\n' +
      '  Escribir a + b\n' +
      'FinAlgoritmo',
      { salidas });
    asegurar(resultado === 'finalizado', 'estado final: ' + resultado);
    const textos = salidas.filter((s) => s.tipo === 'salida').map((s) => s.texto);
    asegurar(textos.indexOf('7') !== -1, 'salidas: ' + textos.join(' | '));
  });

  await prueba('PSeInt integración: ejecutar con Leer y Escribir usa el host correctamente', async () => {
    const salidas = [];
    const resultado = await ejecutarConHost(ctxPS, proveedorPS,
      'Algoritmo doblar\n' +
      '  Definir x Como Entero\n' +
      '  Leer x\n' +
      '  Escribir x * 2\n' +
      'FinAlgoritmo',
      { entradas: ['21'], salidas });
    asegurar(resultado === 'finalizado', 'estado final: ' + resultado);
    const textos = salidas.filter((s) => s.tipo === 'salida').map((s) => s.texto);
    asegurar(textos.indexOf('42') !== -1, 'salidas: ' + textos.join(' | '));
  });

  await prueba('PSeInt integración: documentacion() devuelve comandos con nombre y ejemplo', () => {
    asegurar(typeof proveedorPS.documentacion === 'function',
      'documentacion debe ser función');
    const doc = proveedorPS.documentacion();
    asegurar(doc && Array.isArray(doc.comandos), 'doc.comandos debe ser array');
    asegurar(doc.comandos.length > 0, 'debe haber al menos un comando');
    const primero = doc.comandos[0];
    asegurar(typeof primero.nombre === 'string' && primero.nombre.length > 0,
      'nombre del primer comando');
    asegurar(typeof primero.ejemplo === 'string' && primero.ejemplo.length > 0,
      'ejemplo del primer comando');
  });

  await prueba('PSeInt integración: configurarPerfil y obtenerPerfil existen y funcionan', () => {
    // configurarPerfil y obtenerPerfil deben existir en el provider
    asegurar(typeof proveedorPS.configurarPerfil === 'function',
      'configurarPerfil debe ser función');
    asegurar(typeof proveedorPS.obtenerPerfil === 'function',
      'obtenerPerfil debe ser función');

    // El perfil inicial debe ser estricto
    const perfilInicial = proveedorPS.obtenerPerfil();
    asegurar(perfilInicial.asignacionConIgual === false,
      'perfil inicial debe ser estricto (asignacionConIgual: false)');

    // Cambiar a flexible
    proveedorPS.configurarPerfil('flexible');
    const perfilFlexible = proveedorPS.obtenerPerfil();
    asegurar(perfilFlexible.asignacionConIgual === true,
      'después de configurarPerfil("flexible") asignacionConIgual debe ser true');

    // Volver a estricto
    proveedorPS.configurarPerfil('estricto');
    const perfilEstricto = proveedorPS.obtenerPerfil();
    asegurar(perfilEstricto.asignacionConIgual === false,
      'después de configurarPerfil("estricto") asignacionConIgual debe ser false');

    // Preset desconocido cae en estricto
    proveedorPS.configurarPerfil('desconocido');
    const perfilDesconocido = proveedorPS.obtenerPerfil();
    asegurar(perfilDesconocido.asignacionConIgual === false,
      'preset desconocido debe caer en estricto');
  });

  // ---- provider Python (definición, con tokenizador real en Node) ----

  /**
   * Carga el tokenizador Python + el provider en un contexto aislado, sin
   * PythonWorkerBridge (no hay Worker en Node). El provider maneja la
   * ausencia de la bridge de forma segura.
   */
  function cargarPythonEnContexto() {
    const raizRepo = path.join(__dirname, '..');
    const ctxPy = { console, setTimeout, clearTimeout, Promise };
    vm.createContext(ctxPy);
    const scripts = [
      'core/language-provider.js',
      'core/language-registry.js',
      'core/runtime-host.js',
      'core/python/tokenizer.js',
      'core/python/provider.js',
    ];
    for (const rel of scripts) {
      vm.runInContext(fs.readFileSync(path.join(raizRepo, rel), 'utf8'), ctxPy,
        { filename: rel });
    }
    return ctxPy;
  }

  await prueba('Python: la definición del provider cumple el contrato', () => {
    const mod = require(path.join(__dirname, '..', 'core', 'python', 'provider.js'));
    const problemas = Code4Code.validarProvider(mod.definicion);
    asegurar(problemas.length === 0, problemas.join(' | '));
  });

  const ctxPy = cargarPythonEnContexto();
  const proveedorPy = ctxPy.Code4Code.registro.activo();

  await prueba('Python integración: el registro queda con Python activo', () => {
    asegurar(proveedorPy && proveedorPy.id === 'python',
      'provider activo: ' + (proveedorPy && proveedorPy.id));
  });

  await prueba('Python integración: plantillaInicial contiene print', () => {
    const plantilla = proveedorPy.plantillaInicial();
    asegurar(typeof plantilla === 'string' && plantilla.length > 0, 'plantilla vacía');
    asegurar(plantilla.indexOf('print') !== -1, 'falta print en la plantilla');
  });

  await prueba('Python integración: tokenizarLinea reconoce keywords Python', () => {
    const r = proveedorPy.tokenizarLinea('if x > 0:');
    const tipos = r.tokens.map((t) => t.tipo);
    // Los tipos genéricos deben estar en el vocabulario del contrato (español),
    // igual que LiteSeInt/PSeInt, o el resaltado del editor no aplica color.
    asegurar(tipos.indexOf('palabra-clave') !== -1, 'tipos: ' + tipos.join(','));
    asegurar(tipos.indexOf('operador') !== -1, 'falta operador: ' + tipos.join(','));
    asegurar(tipos.indexOf('plano') !== -1, 'falta plano (:) al final: ' + tipos.join(','));
  });

  await prueba('Python integración: tokenizarLinea reconoce string y comentario', () => {
    const r = proveedorPy.tokenizarLinea('print("hola")  # saludo');
    const tipos = r.tokens.map((t) => t.tipo);
    asegurar(tipos.indexOf('palabra-clave') !== -1, 'falta palabra-clave (print): ' + tipos.join(','));
    asegurar(tipos.indexOf('cadena') !== -1, 'falta cadena: ' + tipos.join(','));
    asegurar(tipos.indexOf('comentario') !== -1, 'falta comentario: ' + tipos.join(','));
  });

  await prueba('Python integración: tokenizarLinea colorea paréntesis', () => {
    const r = proveedorPy.tokenizarLinea('print("hola")');
    const tipos = r.tokens.map((t) => t.tipo);
    asegurar(tipos.indexOf('parentesis-abre') !== -1, 'falta parentesis-abre: ' + tipos.join(','));
    asegurar(tipos.indexOf('parentesis-cierra') !== -1, 'falta parentesis-cierra: ' + tipos.join(','));
  });

  await prueba('Python integración: reglasIndentacion incluye def e if', () => {
    const reglas = proveedorPy.reglasIndentacion();
    asegurar(Array.isArray(reglas.aperturas), 'aperturas debe ser array');
    asegurar(reglas.aperturas.some((a) => a.startsWith('def')),
      'falta def en aperturas');
    asegurar(reglas.aperturas.some((a) => a.startsWith('if')),
      'falta if en aperturas');
    asegurar(Array.isArray(reglas.cierres), 'cierres debe ser array');
  });

  await prueba('Python integración: autocompletar devuelve palabras clave', () => {
    const candidatos = proveedorPy.autocompletar({ prefijo: 'de' });
    asegurar(Array.isArray(candidatos), 'candidatos debe ser array');
    asegurar(candidatos.length > 0, 'candidatos vacíos para prefijo "de"');
    const textos = candidatos.map((c) => c.texto);
    asegurar(textos.indexOf('def') !== -1, 'falta def en candidatos');
    const tipos = candidatos.map((c) => c.tipo);
    asegurar(tipos.indexOf('keyword') !== -1, 'faltan keywords');
  });

  await prueba('Python integración: autocompletar devuelve array vacío con prefijo corto', () => {
    const candidatos = proveedorPy.autocompletar({ prefijo: 'd' });
    asegurar(Array.isArray(candidatos) && candidatos.length === 0,
      'prefijo de 1 carácter debe devolver vacío');
  });

  await prueba('Python integración: validar devuelve array vacío para código correcto', () => {
    const errores = proveedorPy.validar('print("hola")\nx = 1 + 2\nprint(x)');
    asegurar(Array.isArray(errores), 'validar debe devolver array');
    asegurar(errores.length === 0, 'código correcto no debe tener errores: ' +
      JSON.stringify(errores));
  });

  await prueba('Python integración: validar detecta string sin cerrar', () => {
    const errores = proveedorPy.validar('x = "cadena sin cerrar\nprint(x)');
    asegurar(errores.length > 0, 'esperaba al menos un error por string sin cerrar');
    asegurar(typeof errores[0].linea === 'number', 'error sin linea: ' + JSON.stringify(errores[0]));
    asegurar(typeof errores[0].mensaje === 'string', 'error sin mensaje');
    asegurar(errores[0].tipo === 'error', 'tipo incorrecto: ' + errores[0].tipo);
  });

  await prueba('Python integración: ejecutar devuelve { detener: Function } sin bridge', () => {
    // En Node no hay PythonWorkerBridge, el provider lo detecta y devuelve el stub.
    const host = ctxPy.Code4Code.crearRuntimeHost({
      escribir: () => {},
      alCambiarEstado: () => {},
    });
    const control = proveedorPy.ejecutar('print("hola")', host);
    asegurar(control && typeof control.detener === 'function',
      'ejecutar debe devolver { detener: Function }');
  });

  await prueba('Python integración: documentacion() devuelve comandos con nombre y ejemplo', () => {
    asegurar(typeof proveedorPy.documentacion === 'function',
      'documentacion debe ser función');
    const doc = proveedorPy.documentacion();
    asegurar(doc && Array.isArray(doc.comandos), 'doc.comandos debe ser array');
    asegurar(doc.comandos.length > 0, 'debe haber al menos un comando');
    const primero = doc.comandos[0];
    asegurar(typeof primero.nombre === 'string' && primero.nombre.length > 0,
      'nombre del primer comando');
    asegurar(typeof primero.ejemplo === 'string' && primero.ejemplo.length > 0,
      'ejemplo del primer comando');
  });

  console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
  if (fallas > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
