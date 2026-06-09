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

  // ---- provider liteseint (definición, sin núcleo) ----
  await prueba('la definición del provider LiteSeInt cumple el contrato', () => {
    // Carga aislada: registra en el registro global, pero aquí solo
    // verificamos que la definición sea válida según el contrato.
    const mod = require(path.join(__dirname, '..', 'core', 'liteseint', 'provider.js'));
    const problemas = Code4Code.validarProvider(mod.definicion());
    asegurar(problemas.length === 0, problemas.join(' | '));
  });

  console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
  if (fallas > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
