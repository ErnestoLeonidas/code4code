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
 * un contexto aislado (como hace el navegador con scripts clásicos) y
 * devuelve el contexto con Code4Code.registro ya poblado.
 */
function cargarAppEnContexto() {
  const raizRepo = path.join(__dirname, '..');
  const leer = (rel) => fs.readFileSync(path.join(raizRepo, rel), 'utf8');
  const ctx = { console, setTimeout, clearTimeout, Promise };
  vm.createContext(ctx);
  vm.runInContext([
    leer('core/language-provider.js'),
    leer('core/language-registry.js'),
    leer('core/runtime-host.js'),
    leer('core/liteseint/tokenizer.js'),
    leer('core/liteseint/symbol-table.js'),
    leer('core/liteseint/validator.js'),
    leer('core/liteseint/doc_errores.js'),
    leer('core/liteseint/ast.js'),
    leer('core/liteseint/parser.js'),
    leer('core/liteseint/expression-evaluator.js'),
    leer('core/liteseint/runtime.js'),
    'globalThis.DocErrores = DocErrores;',
    'globalThis.LiteSeInt = LiteSeInt;',
    leer('core/liteseint/provider.js')
  ].join('\n'), ctx);
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

  console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
  if (fallas > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
