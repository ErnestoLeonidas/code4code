/**
 * Code4Code — core/python/worker.js
 * =====================================
 * Web Worker que ejecuta código Python usando Pyodide (CDN).
 *
 * Protocolo de mensajes (main ↔ worker):
 *
 *   main → worker: { tipo: 'ejecutar', codigo: string }
 *   worker → main: { tipo: 'salida',            texto: string }
 *   worker → main: { tipo: 'entrada_solicitada', prompt: string }
 *   worker → main: { tipo: 'fin' }
 *   worker → main: { tipo: 'error',              mensaje: string, linea: number|null }
 *   worker → main: { tipo: 'variables',          vars: object }
 *   worker → main: { tipo: 'cargando',           mensaje: string }
 *   worker → main: { tipo: 'listo' }
 *   main → worker: { tipo: 'entrada',            valor: string }
 *   main → worker: { tipo: 'detener' }
 *
 * input() interactivo: el código del usuario se transforma antes de ejecutar —
 * input( → await __input__(  — y las funciones que lo necesitan se vuelven
 * async def. El worker pausa la ejecución enviando 'entrada_solicitada' y
 * la reanuda al recibir 'entrada'.
 *
 * Ver ROADMAP.md — Fase 4.
 */
'use strict';

importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js');

var pyodide = null;
var detenido = false;
var _pyodideListo = false;

// ─────────────────────────────────────────────────────────────────────────────
//  Carga de Pyodide
// ─────────────────────────────────────────────────────────────────────────────

async function cargarPyodide() {
  if (pyodide) return;
  pyodide = await loadPyodide(); // eslint-disable-line no-undef
  _pyodideListo = true;
  if (!detenido) self.postMessage({ tipo: 'listo' });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Configuración de I/O (se ejecuta antes de cada programa)
// ─────────────────────────────────────────────────────────────────────────────

function configurarIO() {
  // Función JS expuesta a Python para enviar texto a la consola
  pyodide.globals.set('_write_output', function (texto) {
    self.postMessage({ tipo: 'salida', texto: String(texto) });
  });

  // Función JS expuesta a Python para solicitar entrada al usuario
  pyodide.globals.set('_solicitar_entrada', function (prompt) {
    self.postMessage({ tipo: 'entrada_solicitada', prompt: String(prompt) });
  });

  pyodide.runPython([
    'import sys, io, builtins',
    'import js as _js_mod',
    'from pyodide.ffi import create_once_callable as _coc',
    '',
    '# ── stdout/stderr → consola ──────────────────────────────────',
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
    '# ── input() interactivo ──────────────────────────────────────',
    '_resolver_entrada = None',
    '',
    'def _registrar_resolver(resolve, reject):',
    '    global _resolver_entrada',
    '    _resolver_entrada = resolve',
    '',
    'async def __input__(prompt=""):',
    '    global _resolver_entrada',
    '    if prompt:',
    '        _write_output(str(prompt))',
    '    # Crear Promise ANTES de enviar el mensaje para evitar condiciones de carrera',
    '    _p = _js_mod.Promise.new(_coc(_registrar_resolver))',
    '    _solicitar_entrada(str(prompt))',
    '    val = await _p',
    '    _write_output(str(val) + "\\n")',
    '    return str(val)',
    '',
    'builtins.input = lambda *a, **kw: (_ for _ in ()).throw(',
    '    RuntimeError("Llamada a input() no transformada — posible uso dinámico no soportado")',
    ')',
  ].join('\n'));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Transformador de código para input() interactivo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reemplaza input( por await __input__( fuera de strings y comentarios.
 * Retorna el código modificado, o el original si no había input().
 */
function _reemplazarInputFueraStrings(codigo) {
  var resultado = '';
  var i = 0;
  var n = codigo.length;

  while (i < n) {
    var c = codigo[i];

    // Comentario hasta fin de línea
    if (c === '#') {
      var finLinea = codigo.indexOf('\n', i);
      if (finLinea === -1) { resultado += codigo.slice(i); break; }
      resultado += codigo.slice(i, finLinea + 1);
      i = finLinea + 1;
      continue;
    }

    // String triple
    if ((c === '"' || c === "'") && codigo[i + 1] === c && codigo[i + 2] === c) {
      var delim = c + c + c;
      var finTriple = codigo.indexOf(delim, i + 3);
      if (finTriple === -1) { resultado += codigo.slice(i); break; }
      resultado += codigo.slice(i, finTriple + 3);
      i = finTriple + 3;
      continue;
    }

    // String simple
    if (c === '"' || c === "'") {
      var j = i + 1;
      while (j < n) {
        if (codigo[j] === c && codigo[j - 1] !== '\\') break;
        j++;
      }
      resultado += codigo.slice(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }

    // Detectar "input(" como identificador (no método: prev char no es '.' ni letra)
    if (codigo.slice(i, i + 6) === 'input(' &&
        (i === 0 || !/[a-zA-Z0-9_.]/.test(codigo[i - 1]))) {
      resultado += 'await __input__(';
      i += 6;
      continue;
    }

    resultado += c;
    i++;
  }

  return resultado;
}

/**
 * Detecta rangos de funciones en el código (por línea de inicio/fin).
 * Usa la indentación para determinar los bloques.
 */
function _detectarRangosFunciones(lineas) {
  var funciones = [];
  var pila = [];

  for (var i = 0; i < lineas.length; i++) {
    var m = lineas[i].match(/^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/);
    if (m) {
      var indent = m[1].length;
      while (pila.length > 0 && pila[pila.length - 1].indent >= indent) {
        var cerrada = pila.pop();
        cerrada.fin = i - 1;
        funciones.push(cerrada);
      }
      pila.push({ nombre: m[2], inicio: i, indent: indent, fin: lineas.length - 1 });
    }
  }
  while (pila.length > 0) {
    var fn = pila.pop();
    fn.fin = lineas.length - 1;
    funciones.push(fn);
  }
  return funciones;
}

/**
 * Transforma el código Python para que input() sea interactivo:
 * - Reemplaza input( → await __input__(
 * - Hace async def a las funciones que lo requieren (propagado)
 * - Añade await a las llamadas de las nuevas funciones async
 *
 * Usa top-level await soportado por runPythonAsync (sin wrapper __main__
 * para preservar el comportamiento de 'global' y el scope del módulo).
 *
 * Retorna el código transformado, o null si no hay ningún input().
 */
function _transformarInputInteractivo(codigo) {
  var transformado = _reemplazarInputFueraStrings(codigo);
  if (transformado === codigo) return null; // no había input()

  var lineas = transformado.split('\n');
  var funciones = _detectarRangosFunciones(lineas);

  // Paso 1: funciones que directamente contienen await __input__
  var asyncFuncs = new Set();
  funciones.forEach(function (fn) {
    var cuerpo = lineas.slice(fn.inicio + 1, fn.fin + 1).join('\n');
    if (/\bawait\s+__input__\s*\(/.test(cuerpo)) {
      asyncFuncs.add(fn.nombre);
    }
  });

  // Paso 2: propagar — funciones que llaman a una async también deben serlo
  var cambio = true;
  while (cambio) {
    cambio = false;
    funciones.forEach(function (fn) {
      if (asyncFuncs.has(fn.nombre)) return;
      var cuerpo = lineas.slice(fn.inicio + 1, fn.fin + 1).join('\n');
      asyncFuncs.forEach(function (asyncNombre) {
        if (!asyncFuncs.has(fn.nombre)) {
          if (new RegExp('(?<![a-zA-Z0-9_])' + asyncNombre + '\\s*\\(').test(cuerpo)) {
            asyncFuncs.add(fn.nombre);
            cambio = true;
          }
        }
      });
    });
  }

  if (asyncFuncs.size === 0) return transformado; // solo top-level await

  // Paso 3: hacer async las funciones detectadas
  lineas = lineas.map(function (linea) {
    var m = linea.match(/^(\s*)def\s+(\w+)\s*\(/);
    if (m && asyncFuncs.has(m[2])) {
      return linea.replace(/^(\s*)def\s+/, '$1async def ');
    }
    return linea;
  });

  // Paso 4: añadir await a llamadas de funciones async (fuera de sus definiciones)
  var resultado = lineas.join('\n');
  asyncFuncs.forEach(function (nombre) {
    var re = new RegExp(
      '(?<![a-zA-Z0-9_.])(await\\s+)?' + nombre + '\\s*\\(',
      'g'
    );
    resultado = resultado.replace(re, function (match, yaAwait) {
      if (yaAwait) return match; // ya tiene await
      return 'await ' + nombre + '(';
    });
    // Revertir el 'await' en la línea de definición 'async def nombre('
    resultado = resultado.replace(
      new RegExp('async def await ' + nombre + '\\s*\\(', 'g'),
      'async def ' + nombre + '('
    );
  });

  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Análisis de errores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrae información útil de un traceback de Python.
 * Filtra rutas internas de Pyodide y devuelve { linea, mensaje }.
 */
function parsearError(textoError) {
  var texto = String(textoError);
  var lineas = texto.split('\n').filter(function (l) { return l.trim().length > 0; });

  var PATRON_SISTEMA = /\/lib\/python[\d.]+\/|\/usr\/lib\/|pyodide\/|site-packages\//;
  var lineasUsuario = lineas.filter(function (l) {
    if (l.match(/^\s*File\s+"/)) {
      return l.indexOf('<string>') !== -1 && !PATRON_SISTEMA.test(l);
    }
    return true;
  });

  var lineaNum = null;
  for (var i = 0; i < lineasUsuario.length; i++) {
    var m = lineasUsuario[i].match(/line (\d+)/);
    if (m) lineaNum = parseInt(m[1], 10);
  }
  if (!lineaNum) {
    var coincidencias = texto.match(/line (\d+)/g);
    if (coincidencias && coincidencias.length) {
      var ultimaMatch = coincidencias[coincidencias.length - 1].match(/\d+/);
      if (ultimaMatch) lineaNum = parseInt(ultimaMatch[0], 10);
    }
  }

  var ultimaLinea = lineas[lineas.length - 1] || texto;
  var mensajeCorto = ultimaLinea.trim();
  if (lineaNum) mensajeCorto = 'Línea ' + lineaNum + ': ' + mensajeCorto;

  return { linea: lineaNum, mensaje: mensajeCorto };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Manejo de mensajes
// ─────────────────────────────────────────────────────────────────────────────

self.onmessage = async function (e) {
  var msg = e.data;

  if (msg.tipo === 'detener') {
    detenido = true;
    return;
  }

  // Respuesta del usuario a una solicitud de entrada
  if (msg.tipo === 'entrada') {
    if (pyodide) {
      pyodide.globals.set('__valor_entrada_js', String(msg.valor));
      pyodide.runPython([
        'if _resolver_entrada is not None:',
        '    _res = _resolver_entrada',
        '    _resolver_entrada = None',
        '    _res(__valor_entrada_js)',
      ].join('\n'));
    }
    return;
  }

  if (msg.tipo === 'ejecutar') {
    detenido = false;

    try {
      if (!_pyodideListo) {
        self.postMessage({ tipo: 'cargando', mensaje: 'Cargando Python (Pyodide)... puede tardar unos segundos la primera vez.' });
      }
      await cargarPyodide();
      configurarIO();

      var codigoOriginal = String(msg.codigo || '');

      // Verificación de sintaxis sobre el código original (líneas correctas)
      try {
        pyodide.globals.set('_codigo_a_compilar', codigoOriginal);
        pyodide.runPython("compile(_codigo_a_compilar, '<programa>', 'exec')");
      } catch (syntaxErr) {
        var errorSintaxis = parsearError(String(syntaxErr));
        self.postMessage({ tipo: 'error', mensaje: errorSintaxis.mensaje, linea: errorSintaxis.linea });
        if (!detenido) self.postMessage({ tipo: 'fin' });
        return;
      }

      // Transformar para input() interactivo (null = sin input, ejecutar tal cual)
      var codigoEjecutar = _transformarInputInteractivo(codigoOriginal) || codigoOriginal;

      await pyodide.runPythonAsync(codigoEjecutar);

      // Inspector de variables tras la ejecución
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
