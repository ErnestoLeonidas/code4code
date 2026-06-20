/**
 * Code4Code — core/python/bridge.js
 * =====================================
 * Bridge entre el Web Worker Python (core/python/worker.js) y el
 * RuntimeHost de Code4Code (core/runtime-host.js).
 *
 * Traduce los mensajes del worker a las llamadas del contrato del host:
 *   salida              → host.escribir()
 *   entrada_solicitada  → host.leer(prompt) → envía 'entrada' al worker
 *   error               → host.reportarError()
 *   fin                 → host.finalizar()
 *   cargando            → host.escribir() (solo la primera vez)
 *   listo               → actualiza estado interno a 'idle'
 *
 * Reutilización del worker: el worker se crea una sola vez y se reutiliza
 * entre ejecuciones normales. Solo se crea un worker nuevo si fue terminado
 * con terminate() (estado 'dead') o si nunca existió.
 *
 * Estados del worker gestionados por el bridge:
 *   'sin-crear' — nunca se ha creado un worker
 *   'cargando'  — el worker existe pero Pyodide aún no terminó de cargar
 *   'idle'      — Pyodide listo, sin ejecución en curso
 *   'running'   — hay un programa ejecutándose
 *   'dead'      — el worker fue terminado con terminate()
 *
 * Exporta PythonWorkerBridge como global de window (navegador) y como
 * módulo CommonJS (Node / tests de integración).
 *
 * Ver ROADMAP.md — Fase 4.
 */
(function (raiz) {
  'use strict';

  function mapearTipoPy(tipoPy) {
    var mapa = {
      'int':   'entero',
      'float': 'real',
      'str':   'caracter',
      'bool':  'logico',
      'list':  'lista',
      'dict':  'dict',
    };
    return mapa[tipoPy] || tipoPy;
  }

  function lineaPythonAIndice(linea) {
    return typeof linea === 'number' && isFinite(linea)
      ? Math.max(0, linea - 1)
      : null;
  }

  // ---------------------------------------------------------------------------
  // Estado compartido del worker entre ejecuciones
  // ---------------------------------------------------------------------------

  /** @type {Worker|null} Instancia actual del worker (reutilizable). */
  var _workerActual = null;

  /**
   * Estado del ciclo de vida del worker.
   * 'sin-crear' | 'cargando' | 'idle' | 'running' | 'dead'
   */
  var _estadoWorker = 'sin-crear';

  /**
   * Host activo durante la ejecución en curso.
   * Se asigna al iniciar ejecutar() y se limpia al recibir 'fin' o 'error'.
   */
  var _hostActual = null;

  /**
   * Buffer de stdout de Python. print() escribe en fragmentos (el texto y el
   * "\n" llegan en mensajes separados, y end="" no emite salto). Acumulamos
   * y emitimos a la consola UNA línea por cada "\n", para que cada renglón de
   * la consola corresponda a una línea real del programa (como en una terminal)
   * y las tabulaciones/espacios se conserven dentro de cada línea.
   */
  var _bufferSalida = '';

  /** Emite a la consola todas las líneas completas (terminadas en \n) del buffer. */
  function _emitirLineasCompletas(host) {
    if (!host) return;
    var idx;
    while ((idx = _bufferSalida.indexOf('\n')) !== -1) {
      var linea = _bufferSalida.slice(0, idx);
      _bufferSalida = _bufferSalida.slice(idx + 1);
      try { host.escribir(linea, { tipo: 'salida' }); } catch (_) { /* detenido */ }
    }
  }

  /** Vacía el buffer: emite líneas completas y la línea parcial pendiente (sin \n). */
  function _flushSalida(host) {
    _emitirLineasCompletas(host);
    if (_bufferSalida.length > 0) {
      if (host) {
        try { host.escribir(_bufferSalida, { tipo: 'salida' }); } catch (_) { /* detenido */ }
      }
      _bufferSalida = '';
    }
  }

  /**
   * Registra los manejadores de mensajes y errores en el worker.
   * Se llaman con el host de la ejecución que inició el mensaje.
   */
  function _configurarMensajesWorker(worker) {
    worker.onmessage = function (e) {
      var msg = e.data;
      var host = _hostActual;

      if (msg.tipo === 'salida') {
        // Acumular y emitir por líneas completas (conserva tabs y alineación)
        _bufferSalida += String(msg.texto);
        _emitirLineasCompletas(host);

      } else if (msg.tipo === 'entrada_solicitada') {
        // Python llamó a input() — vaciar el prompt pendiente (sin \n) y
        // pedir entrada inline al usuario
        _flushSalida(host);
        if (host && typeof host.leer === 'function') {
          var workerRef = _workerActual;
          host.leer(msg.prompt || '').then(function (valor) {
            // Solo enviar si el worker no fue reemplazado ni detenido
            if (workerRef && _workerActual === workerRef && _estadoWorker === 'running') {
              workerRef.postMessage({ tipo: 'entrada', valor: String(valor) });
            }
          }).catch(function () { /* ejecución detenida antes de que el usuario respondiera */ });
        }

      } else if (msg.tipo === 'error') {
        // Error de Python (SyntaxError, NameError, etc.): primero vaciar la
        // salida pendiente para conservar el orden.
        _flushSalida(host);
        if (host) {
          host.reportarError({
            message: String(msg.mensaje),
            linea: lineaPythonAIndice(msg.linea)
          });
        }

      } else if (msg.tipo === 'fin') {
        // El programa Python terminó con éxito; vaciar la última línea sin \n
        // (p. ej. print(..., end="")) y liberar el worker.
        _flushSalida(host);
        _estadoWorker = 'idle';
        _hostActual = null;
        if (host) {
          try { host.finalizar(); } catch (_) { /* ya finalizado */ }
        }

      } else if (msg.tipo === 'cargando') {
        // Pyodide aún no estaba cacheado, se está descargando por primera vez
        _estadoWorker = 'cargando';
        if (host) {
          try { host.escribir('⏳ ' + msg.mensaje, { tipo: 'salida' }); } catch (_) { /* detenido */ }
        }

      } else if (msg.tipo === 'listo') {
        // Pyodide terminó de cargar; el worker pasa a idle (ya está ejecutando)
        // Nota: después de 'listo' vendrán 'salida'/'error'/'fin' del programa actual.
        if (host) {
          try { host.escribir('✓ Python listo\n', { tipo: 'salida' }); } catch (_) { /* detenido */ }
        }

      } else if (msg.tipo === 'variables') {
        if (host && typeof host.reportarVariables === 'function') {
          var vars = msg.vars || {};
          Object.keys(vars).forEach(function (nombre) {
            var info = vars[nombre];
            host.reportarVariables({
              evento: 'cambio',
              variable: {
                nombre: nombre,
                valor: info.valor,
                tipo: mapearTipoPy(info.tipo),
                inicializada: true
              }
            });
          });
        }
      } else if (msg.tipo === 'linea_activa') {
        if (host && typeof host.contarPaso === 'function') {
          var lineaIdx = lineaPythonAIndice(msg.linea);
          if (lineaIdx !== null) {
            try { host.contarPaso(lineaIdx); } catch (_) { /* detenido */ }
          }
        }
      }
    };

    worker.onerror = function (e) {
      var host = _hostActual;
      var msg = e.message || 'Error en el worker Python';
      _estadoWorker = 'dead';
      _workerActual = null;
      _hostActual = null;
      if (host) {
        host.reportarError({ message: msg, linea: null });
      }
    };
  }

  /**
   * Devuelve el worker listo para enviar un mensaje de ejecución.
   * - Si el worker está 'idle' (Pyodide ya cargado), lo reutiliza.
   * - Si el worker está 'dead' o 'sin-crear', crea uno nuevo.
   *
   * @returns {Worker}
   */
  function _obtenerWorker() {
    if (_estadoWorker === 'idle' && _workerActual) {
      return _workerActual;
    }
    // Crear worker nuevo
    var worker = new Worker('core/python/worker.js'); // eslint-disable-line no-undef
    _configurarMensajesWorker(worker);
    _workerActual = worker;
    _estadoWorker = 'cargando'; // cambiará a 'idle' al recibir 'listo'
    return worker;
  }

  var PythonWorkerBridge = {
    /**
     * Crea un bridge para una ejecución.
     *
     * A diferencia de la versión anterior, el bridge ya no tiene un worker
     * propio: gestiona el worker compartido del módulo. Esto permite
     * reutilizar Pyodide entre ejecuciones sin recarga.
     *
     * @param {object} host  - RuntimeHost de Code4Code (crearRuntimeHost())
     * @returns {{ ejecutar: function(string), detener: function() }}
     */
    crear: function (host) {
      return {
        /**
         * Envía el código al worker para ejecutarlo.
         * Reutiliza el worker si Pyodide ya está cargado ('idle').
         *
         * @param {string} codigo
         */
        ejecutar: function (codigo) {
          if (host && typeof host.reportarVariables === 'function') {
            host.reportarVariables({ evento: 'reiniciar' });
          }
          _bufferSalida = '';

          var worker = _obtenerWorker();
          _hostActual = host;
          _estadoWorker = 'running';
          worker.postMessage({ tipo: 'ejecutar', codigo: String(codigo || '') });
        },

        /**
         * Detiene la ejecución terminando el worker.
         * Marca el estado como 'dead' para que la siguiente ejecución
         * cree un worker nuevo.
         */
        detener: function () {
          _hostActual = null;
          // Vaciar lo que quede en el buffer antes de cortar
          _flushSalida(host);
          if (_workerActual) {
            _workerActual.postMessage({ tipo: 'detener' });
            // Terminar el worker de forma inmediata para liberar recursos
            _workerActual.terminate();
            _workerActual = null;
          }
          _estadoWorker = 'dead';
          try { host.escribir('[Ejecución detenida]', { tipo: 'salida' }); } catch (_) { /* host ya detenido */ }
        }
      };
    },

    /**
     * Expone el estado interno para diagnóstico / tests.
     * @returns {'sin-crear'|'cargando'|'idle'|'running'|'dead'}
     */
    estadoWorker: function () {
      return _estadoWorker;
    }
  };

  // Exponer como global en el navegador
  if (typeof raiz !== 'undefined' && raiz.window !== undefined) {
    raiz.PythonWorkerBridge = PythonWorkerBridge;
  } else if (typeof raiz !== 'undefined') {
    raiz.PythonWorkerBridge = PythonWorkerBridge;
  }

  // Exportación CommonJS para pruebas en Node
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PythonWorkerBridge;
  }
})(typeof window !== 'undefined' ? window : globalThis);
