/**
 * Code4Code — tests/python-bridge-tests.js
 * ========================================
 * Pruebas del buffering de salida del bridge Python (core/python/bridge.js).
 *
 * El bridge acumula stdout y emite UNA línea de consola por cada "\n" del
 * programa, conservando tabs y alineación. Se simula el Worker con un stub.
 *
 * Uso: node tests/python-bridge-tests.js
 */
'use strict';

const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
//  Stub de Worker: captura postMessage y expone onmessage para inyectar mensajes
// ─────────────────────────────────────────────────────────────────────────────

let workerCreado = null;
class WorkerStub {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
    this.enviados = [];
    workerCreado = this;
  }
  postMessage(msg) { this.enviados.push(msg); }
  terminate() { this.terminado = true; }
  // Helper para simular un mensaje del worker → main
  emitir(msg) { if (this.onmessage) this.onmessage({ data: msg }); }
}
global.Worker = WorkerStub;

const PythonWorkerBridge = require(path.join(__dirname, '..', 'core', 'python', 'bridge.js'));

// ─────────────────────────────────────────────────────────────────────────────
//  Host falso que captura las líneas escritas
// ─────────────────────────────────────────────────────────────────────────────

function crearHostFalso() {
  const lineas = [];
  const lineasActivas = [];
  return {
    lineas,
    lineasActivas,
    escribir(texto, meta) { lineas.push({ texto: String(texto), meta: meta || {} }); },
    reportarVariables() {},
    reportarError(error) {
      const meta = { tipo: 'error' };
      if (error && typeof error.linea === 'number') meta.linea = error.linea;
      this.escribir(error && error.message ? error.message : error, meta);
    },
    contarPaso(linea) { lineasActivas.push(linea); },
    finalizar() { this.finalizado = true; },
    leer() { return Promise.resolve(''); },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Mini framework
// ─────────────────────────────────────────────────────────────────────────────

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

console.log('\nBridge Python — buffering de salida\n');

prueba('emite una línea por cada \\n y conserva tabs', () => {
  const host = crearHostFalso();
  const b = PythonWorkerBridge.crear(host);
  b.ejecutar('codigo');
  // print("1\t2\t3") llega como fragmentos separados + "\n" aparte
  workerCreado.emitir({ tipo: 'salida', texto: '1\t2' });
  workerCreado.emitir({ tipo: 'salida', texto: '\t3' });
  workerCreado.emitir({ tipo: 'salida', texto: '\n' });
  const textos = host.lineas.map((l) => l.texto);
  igual(textos, ['1\t2\t3'], 'debe unir fragmentos en una línea con tabs intactos');
});

prueba('no emite línea hasta que llega el \\n', () => {
  const host = crearHostFalso();
  const b = PythonWorkerBridge.crear(host);
  b.ejecutar('codigo');
  workerCreado.emitir({ tipo: 'salida', texto: 'sin salto todavía' });
  igual(host.lineas.length, 0, 'sin \\n no debe emitir nada');
});

prueba('varias líneas en un solo fragmento se separan', () => {
  const host = crearHostFalso();
  const b = PythonWorkerBridge.crear(host);
  b.ejecutar('codigo');
  workerCreado.emitir({ tipo: 'salida', texto: 'a\nb\nc\n' });
  igual(host.lineas.map((l) => l.texto), ['a', 'b', 'c']);
});

prueba('fin vacía el buffer parcial (print con end="")', () => {
  const host = crearHostFalso();
  const b = PythonWorkerBridge.crear(host);
  b.ejecutar('codigo');
  workerCreado.emitir({ tipo: 'salida', texto: 'parcial sin newline' });
  workerCreado.emitir({ tipo: 'fin' });
  igual(host.lineas.map((l) => l.texto), ['parcial sin newline']);
  igual(host.finalizado, true, 'debe finalizar el host');
});

prueba('cada ejecución reinicia el buffer', () => {
  const host1 = crearHostFalso();
  const b1 = PythonWorkerBridge.crear(host1);
  b1.ejecutar('codigo');
  workerCreado.emitir({ tipo: 'salida', texto: 'colgado sin newline' });
  // Sin 'fin': el buffer queda con texto. Nueva ejecución debe limpiarlo.
  const host2 = crearHostFalso();
  const b2 = PythonWorkerBridge.crear(host2);
  b2.ejecutar('codigo');
  workerCreado.emitir({ tipo: 'salida', texto: 'nuevo\n' });
  igual(host2.lineas.map((l) => l.texto), ['nuevo'], 'no debe arrastrar el buffer anterior');
});

prueba('error vacía el buffer pendiente antes del mensaje de error', () => {
  const host = crearHostFalso();
  const b = PythonWorkerBridge.crear(host);
  b.ejecutar('codigo');
  workerCreado.emitir({ tipo: 'salida', texto: 'salida previa\n' });
  workerCreado.emitir({ tipo: 'salida', texto: 'a medias' });
  workerCreado.emitir({ tipo: 'error', mensaje: 'Línea 2: ValueError', linea: 2 });
  const textos = host.lineas.map((l) => l.texto);
  igual(textos, ['salida previa', 'a medias', 'Línea 2: ValueError'],
    'la salida pendiente debe aparecer antes del error');
  igual(host.lineas[2].meta.linea, 1, 'la línea Python 1-based debe convertirse a índice 0-based');
});

prueba('linea_activa del worker alimenta el debugger con índice 0-based', () => {
  const host = crearHostFalso();
  const b = PythonWorkerBridge.crear(host);
  b.ejecutar('codigo');
  workerCreado.emitir({ tipo: 'linea_activa', linea: 3 });
  workerCreado.emitir({ tipo: 'linea_activa', linea: 1 });
  igual(host.lineasActivas, [2, 0]);
});

console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
if (fallas > 0) process.exit(1);
