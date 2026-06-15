/**
 * Code4Code — core/python/worker.js
 * =====================================
 * Web Worker que ejecuta código Python usando Pyodide (CDN).
 *
 * Protocolo de mensajes (main ↔ worker):
 *
 *   main → worker: { tipo: 'ejecutar', codigo: string, entradas: string[] }
 *   worker → main: { tipo: 'salida',  texto: string }
 *   worker → main: { tipo: 'fin' }
 *   worker → main: { tipo: 'error',  mensaje: string, linea: number|null }
 *   main → worker: { tipo: 'detener' }
 *
 * Nota: en v1 el input() se sirve desde una cola pre-cargada (no interactivo).
 * El usuario provee todas las entradas antes de ejecutar.
 *
 * Ver ROADMAP.md — Fase 4.
 */
'use strict';

importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js');

var pyodide = null;
var detenido = false;
var _primeraVez = true;

/**
 * Carga Pyodide una sola vez. Las llamadas subsiguientes devuelven de inmediato.
 */
async function cargarPyodide() {
  if (pyodide) return;
  // loadPyodide es el global que expone el importScript de Pyodide CDN.
  pyodide = await loadPyodide(); // eslint-disable-line no-undef
}

/**
 * Reconfigura stdout, stderr e input() de Python para redirigirlos
 * al hilo principal mediante postMessage.
 *
 * @param {string[]} colaEntradas  - líneas de stdin pre-cargadas
 */
function configurarIO(colaEntradas) {
  // Exponemos la función de escritura como global Python para que la clase
  // _JSStdout pueda llamarla sin importar `js` (no siempre disponible).
  pyodide.globals.set('_write_output', function (texto) {
    self.postMessage({ tipo: 'salida', texto: String(texto) });
  });

  // Copiamos la cola de entradas al scope Python como lista.
  pyodide.globals.set('_input_queue', colaEntradas.slice());

  pyodide.runPython([
    'import sys, io, builtins',
    '',
    'class _JSStdout(io.TextIOBase):',
    '    def write(self, s):',
    '        if s:',
    '            _write_output(s)',
    '        return len(s)',
    '    def flush(self): pass',
    '',
    'sys.stdout = _JSStdout()',
    'sys.stderr = _JSStdout()',
    '',
    'def _custom_input(prompt=""):',
    '    if prompt:',
    '        _write_output(str(prompt))',
    '    if _input_queue:',
    '        val = _input_queue.pop(0)',
    '        _write_output(val + "\\n")',
    '        return val',
    '    return ""',
    '',
    'builtins.input = _custom_input',
  ].join('\n'));
}

self.onmessage = async function (e) {
  var msg = e.data;

  if (msg.tipo === 'detener') {
    detenido = true;
    return;
  }

  if (msg.tipo === 'ejecutar') {
    detenido = false;
    var entradas = Array.isArray(msg.entradas) ? msg.entradas.slice() : [];

    try {
      if (!pyodide) {
        self.postMessage({ tipo: 'cargando', mensaje: 'Cargando Python (Pyodide)... puede tardar unos segundos la primera vez.' });
      }
      await cargarPyodide();
      if (_primeraVez) {
        _primeraVez = false;
        if (!detenido) self.postMessage({ tipo: 'listo' });
      }
      configurarIO(entradas);

      await pyodide.runPythonAsync(String(msg.codigo || ''));

      if (!detenido) {
        self.postMessage({ tipo: 'fin' });
      }
    } catch (err) {
      var linea = null;
      var mensaje = String(err);
      // Intentar extraer el número de línea del traceback de Python
      var m = mensaje.match(/line (\d+)/);
      if (m) linea = parseInt(m[1], 10);
      self.postMessage({ tipo: 'error', mensaje: mensaje, linea: linea });
    }
  }
};
