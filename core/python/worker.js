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
 *   worker → main: { tipo: 'error',     mensaje: string, linea: number|null }
 *   worker → main: { tipo: 'variables', vars: object }
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

      // Verificación de sintaxis antes de ejecutar: da mensajes más claros.
      var codigoPy = String(msg.codigo || '');
      try {
        pyodide.globals.set('_codigo_a_compilar', codigoPy);
        pyodide.runPython("compile(_codigo_a_compilar, '<programa>', 'exec')");
      } catch (syntaxErr) {
        var smsg = String(syntaxErr);
        var slinea = null;
        var sm = smsg.match(/line (\d+)/);
        if (sm) slinea = parseInt(sm[1], 10);
        var slines = smsg.split('\n').filter(function (l) { return l.trim(); });
        var slast = slines[slines.length - 1] || smsg;
        var smensaje = slinea ? 'Línea ' + slinea + ': ' + slast.trim() : slast.trim();
        self.postMessage({ tipo: 'error', mensaje: smensaje, linea: slinea });
        return;
      }

      await pyodide.runPythonAsync(codigoPy);

      var varsPy = pyodide.runPython([
        'import types as _types',
        '_result = {}',
        'for _n, _v in list(globals().items()):',
        '    if _n.startswith("_"): continue',
        '    if isinstance(_v, _types.ModuleType): continue',
        '    if callable(_v): continue',
        '    try: _result[_n] = {"valor": repr(_v), "tipo": type(_v).__name__}',
        '    except Exception: pass',
        '_result',
      ].join('\n'));
      var _varsObj = varsPy.toJs ? varsPy.toJs({ dict_converter: Object.fromEntries }) : {};
      if (!detenido) {
        self.postMessage({ tipo: 'variables', vars: _varsObj });
      }

      if (!detenido) {
        self.postMessage({ tipo: 'fin' });
      }
    } catch (err) {
      var linea = null;
      var mensaje = String(err);
      var coincidencias = mensaje.match(/line (\d+)/g);
      if (coincidencias && coincidencias.length) {
        var ultimaMatch = coincidencias[coincidencias.length - 1].match(/\d+/);
        if (ultimaMatch) linea = parseInt(ultimaMatch[0], 10);
      }
      var mensajeCorto = mensaje;
      var lineasError = mensaje.split('\n').filter(function (l) { return l.trim().length > 0; });
      var ultimaLinea = lineasError[lineasError.length - 1];
      if (ultimaLinea && ultimaLinea.match(/^\w+Error:|^\w+Exception:|^SyntaxError:|^IndentationError:/)) {
        mensajeCorto = ultimaLinea.trim();
        if (linea) mensajeCorto = 'Línea ' + linea + ': ' + mensajeCorto;
      }
      self.postMessage({ tipo: 'error', mensaje: mensajeCorto, linea: linea });
    }
  }
};
