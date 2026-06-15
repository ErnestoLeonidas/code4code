/**
 * Code4Code — core/python/bridge.js
 * =====================================
 * Bridge entre el Web Worker Python (core/python/worker.js) y el
 * RuntimeHost de Code4Code (core/runtime-host.js).
 *
 * Traduce los mensajes del worker a las llamadas del contrato del host:
 *   salida  → host.escribir()
 *   error   → host.escribir() + host.reportarError()
 *   fin     → host.finalizar()
 *
 * Para pasar entradas al worker, lee el textarea #pythonStdin si existe en
 * el DOM (primera versión no interactiva: todas las entradas van de antemano).
 *
 * Exporta PythonWorkerBridge como global de window (navegador) y como
 * módulo CommonJS (Node / tests de integración).
 *
 * Ver ROADMAP.md — Fase 4.
 */
(function (raiz) {
  'use strict';

  var PythonWorkerBridge = {
    /**
     * Crea un bridge para una ejecución.
     *
     * @param {object} host  - RuntimeHost de Code4Code (crearRuntimeHost())
     * @returns {{ ejecutar: function(string), detener: function() }}
     */
    crear: function (host) {
      // La ruta al worker es relativa al documento (index.html en la raíz).
      var worker = new Worker('core/python/worker.js'); // eslint-disable-line no-undef

      worker.onmessage = function (e) {
        var msg = e.data;

        if (msg.tipo === 'salida') {
          // Salida normal del programa Python
          try { host.escribir(String(msg.texto), { tipo: 'salida' }); } catch (_) { /* detenido */ }

        } else if (msg.tipo === 'error') {
          // Error de Python (SyntaxError, NameError, etc.)
          var meta = { tipo: 'error' };
          if (typeof msg.linea === 'number') meta.linea = msg.linea;
          try { host.escribir(String(msg.mensaje), meta); } catch (_) { /* detenido */ }
          host.reportarError({ message: String(msg.mensaje), linea: msg.linea || null });

        } else if (msg.tipo === 'fin') {
          // El programa Python terminó con éxito
          host.finalizar();
        }
      };

      worker.onerror = function (e) {
        var msg = e.message || 'Error en el worker Python';
        try { host.escribir(msg, { tipo: 'error' }); } catch (_) { /* detenido */ }
        host.reportarError({ message: msg, linea: null });
      };

      return {
        /**
         * Envía el código al worker para ejecutarlo.
         * Lee las entradas del textarea #pythonStdin si existe.
         *
         * @param {string} codigo
         */
        ejecutar: function (codigo) {
          var entradas = [];
          // Leer el textarea de stdin si existe en el DOM (solo navegador)
          if (typeof document !== 'undefined') {
            var stdinEl = document.getElementById('pythonStdin');
            if (stdinEl && stdinEl.value) {
              entradas = stdinEl.value
                .split('\n')
                .filter(function (s) { return s.length > 0; });
            }
          }
          worker.postMessage({ tipo: 'ejecutar', codigo: String(codigo || ''), entradas: entradas });
        },

        /**
         * Detiene la ejecución terminando el worker.
         */
        detener: function () {
          worker.postMessage({ tipo: 'detener' });
          // Terminar el worker de forma inmediata para liberar recursos
          worker.terminate();
          try { host.escribir('\n[Ejecución detenida]', { tipo: 'salida' }); } catch (_) { /* host ya detenido */ }
        }
      };
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
