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
 *   worker → main: { tipo: 'cargando', mensaje: string }
 *   worker → main: { tipo: 'listo' }      — Pyodide terminó de cargar
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
var _pyodideListo = false; // true una vez que Pyodide terminó de cargar

/**
 * Carga Pyodide una sola vez. Las llamadas subsiguientes devuelven de inmediato.
 * Cuando Pyodide termina de cargarse por primera vez, envía { tipo: 'listo' }
 * al hilo principal para que el bridge sepa que puede reutilizar el worker.
 */
async function cargarPyodide() {
  if (pyodide) return;
  // loadPyodide es el global que expone el importScript de Pyodide CDN.
  pyodide = await loadPyodide(); // eslint-disable-line no-undef
  _pyodideListo = true;
  if (!detenido) self.postMessage({ tipo: 'listo' });
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

/**
 * Extrae información útil de un traceback de Python.
 * Filtra líneas internas de Pyodide y devuelve { linea, mensaje }.
 *
 * @param {string} textoError - El string completo del error
 * @returns {{ linea: number|null, mensaje: string }}
 */
function parsearError(textoError) {
  var texto = String(textoError);
  var lineas = texto.split('\n').filter(function (l) { return l.trim().length > 0; });

  // Filtrar líneas que apuntan a rutas internas de Pyodide/Python
  // Solo conservar líneas de código del usuario ('<string>') o sin ruta de sistema
  var PATRON_SISTEMA = /\/lib\/python[\d.]+\/|\/usr\/lib\/|pyodide\/|site-packages\//;
  var lineasUsuario = lineas.filter(function (l) {
    // Las líneas de traceback con ruta se ven como: File "/ruta/...", line N
    if (l.match(/^\s*File\s+"/)) {
      return l.indexOf('<string>') !== -1 && !PATRON_SISTEMA.test(l);
    }
    return true;
  });

  // Determinar número de línea: buscar en las líneas de usuario primero
  var lineaNum = null;
  for (var i = 0; i < lineasUsuario.length; i++) {
    var m = lineasUsuario[i].match(/line (\d+)/);
    if (m) lineaNum = parseInt(m[1], 10);
  }
  // Si no se encontró en líneas de usuario, buscar en el texto completo
  if (!lineaNum) {
    var coincidencias = texto.match(/line (\d+)/g);
    if (coincidencias && coincidencias.length) {
      var ultimaMatch = coincidencias[coincidencias.length - 1].match(/\d+/);
      if (ultimaMatch) lineaNum = parseInt(ultimaMatch[0], 10);
    }
  }

  // Obtener la última línea significativa (el tipo y mensaje del error)
  var ultimaLinea = lineas[lineas.length - 1] || texto;
  var mensajeCorto = ultimaLinea.trim();

  // Formatear como "Línea N: TipoError: mensaje"
  if (lineaNum) {
    mensajeCorto = 'Línea ' + lineaNum + ': ' + mensajeCorto;
  }

  return { linea: lineaNum, mensaje: mensajeCorto };
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
      // Solo avisar "cargando" si Pyodide aún no está listo.
      // El mensaje 'listo' se envía dentro de cargarPyodide() al terminar.
      if (!_pyodideListo) {
        self.postMessage({ tipo: 'cargando', mensaje: 'Cargando Python (Pyodide)... puede tardar unos segundos la primera vez.' });
      }
      await cargarPyodide();
      configurarIO(entradas);

      // Verificación de sintaxis antes de ejecutar: da mensajes más claros.
      var codigoPy = String(msg.codigo || '');
      try {
        pyodide.globals.set('_codigo_a_compilar', codigoPy);
        pyodide.runPython("compile(_codigo_a_compilar, '<programa>', 'exec')");
      } catch (syntaxErr) {
        var errorSintaxis = parsearError(String(syntaxErr));
        self.postMessage({ tipo: 'error', mensaje: errorSintaxis.mensaje, linea: errorSintaxis.linea });
        if (!detenido) self.postMessage({ tipo: 'fin' });
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
      var errorRuntime = parsearError(String(err));
      self.postMessage({ tipo: 'error', mensaje: errorRuntime.mensaje, linea: errorRuntime.linea });
    }
  }
};
