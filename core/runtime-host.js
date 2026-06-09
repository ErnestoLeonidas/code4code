/**
 * Code4Code — core/runtime-host.js
 * ================================
 * Host de ejecución unificado. Centraliza lo que cada runtime de lenguaje
 * necesita de la UI: salida a consola, entrada del usuario (Leer / input()),
 * resaltado de línea activa, inspector de variables, botón Detener y
 * protección contra ciclos infinitos por límite de pasos.
 *
 * Cualquier lenguaje (LiteSeInt, PSeInt, Python) ejecuta a través de un
 * host con la misma interfaz, de modo que la consola y los controles de
 * la UI se cablean una sola vez.
 *
 * Estados: 'inactivo' | 'ejecutando' | 'esperando-entrada'
 *        | 'finalizado' | 'detenido' | 'error'
 */
(function (raiz) {
  'use strict';

  var Code4Code = raiz.Code4Code || {};

  /** Error de control usado para cortar la ejecución desde el host. */
  function EjecucionDetenida(motivo) {
    this.name = 'EjecucionDetenida';
    this.message = motivo || 'Ejecución detenida por el usuario.';
    this.esDetencionDeHost = true;
  }
  EjecucionDetenida.prototype = Object.create(Error.prototype);

  var LIMITE_PASOS_DEFECTO = 1000000;

  /**
   * Crea un RuntimeHost.
   * @param {object} callbacks - integración con la UI:
   *   escribir(texto, meta?)        salida a consola
   *   leer(prompt?) -> Promise<string>  entrada del usuario
   *   lineaActiva(numeroLinea|null) resaltado de línea en ejecución
   *   variables(snapshot)           datos para el inspector de variables
   *   alCambiarEstado(estado)       cambios de estado para la UI
   * @param {object} [opciones]
   *   maxPasos  límite de pasos antes de abortar (default 1e6)
   */
  function crearRuntimeHost(callbacks, opciones) {
    callbacks = callbacks || {};
    opciones = opciones || {};

    var maxPasos = typeof opciones.maxPasos === 'number'
      ? opciones.maxPasos
      : LIMITE_PASOS_DEFECTO;

    var estado = 'inactivo';
    var pasos = 0;
    var detenido = false;
    var motivoDetencion = null;
    var lecturaPendiente = null; // { resolver, rechazar }

    function cambiarEstado(nuevo) {
      if (estado === nuevo) return;
      estado = nuevo;
      if (typeof callbacks.alCambiarEstado === 'function') {
        try { callbacks.alCambiarEstado(nuevo); } catch (e) { /* UI no debe romper runtime */ }
      }
    }

    function exigirVivo() {
      if (detenido) throw new EjecucionDetenida(motivoDetencion);
    }

    var host = {
      EjecucionDetenida: EjecucionDetenida,

      estado: function () { return estado; },
      pasos: function () { return pasos; },
      fueDetenido: function () { return detenido; },

      /** El runtime lo llama al comenzar a ejecutar. */
      iniciar: function () {
        pasos = 0;
        detenido = false;
        motivoDetencion = null;
        cambiarEstado('ejecutando');
      },

      /**
       * El runtime lo llama en cada instrucción / iteración.
       * Lanza EjecucionDetenida si se pidió detener o se superó el límite
       * de pasos (protección contra ciclos infinitos).
       */
      contarPaso: function (linea) {
        exigirVivo();
        pasos += 1;
        if (pasos > maxPasos) {
          detenido = true;
          motivoDetencion = 'Se superó el límite de ' + maxPasos +
            ' pasos. Posible ciclo infinito.';
          cambiarEstado('detenido');
          throw new EjecucionDetenida(motivoDetencion);
        }
        if (linea !== undefined && typeof callbacks.lineaActiva === 'function') {
          callbacks.lineaActiva(linea);
        }
      },

      /** Salida a consola. */
      escribir: function (texto, meta) {
        exigirVivo();
        if (typeof callbacks.escribir === 'function') callbacks.escribir(texto, meta);
      },

      /**
       * Entrada del usuario. Devuelve una Promise que resuelve con el texto
       * ingresado, o rechaza con EjecucionDetenida si se detiene mientras
       * se espera.
       */
      leer: function (prompt) {
        exigirVivo();
        if (typeof callbacks.leer !== 'function') {
          return Promise.reject(new Error('Este host no soporta entrada de usuario.'));
        }
        cambiarEstado('esperando-entrada');
        return new Promise(function (resolver, rechazar) {
          lecturaPendiente = { resolver: resolver, rechazar: rechazar };
          Promise.resolve(callbacks.leer(prompt)).then(
            function (valor) {
              if (lecturaPendiente) {
                lecturaPendiente = null;
                if (detenido) {
                  rechazar(new EjecucionDetenida(motivoDetencion));
                  return;
                }
                cambiarEstado('ejecutando');
                resolver(valor);
              }
            },
            function (err) {
              if (lecturaPendiente) {
                lecturaPendiente = null;
                rechazar(err);
              }
            }
          );
        });
      },

      /** Snapshot para el inspector de variables (opcional por lenguaje). */
      reportarVariables: function (snapshot) {
        if (typeof callbacks.variables === 'function') {
          try { callbacks.variables(snapshot); } catch (e) { /* no romper */ }
        }
      },

      /** Botón Detener de la UI. Corta también lecturas pendientes. */
      detener: function (motivo) {
        if (detenido) return;
        detenido = true;
        motivoDetencion = motivo || 'Ejecución detenida por el usuario.';
        cambiarEstado('detenido');
        if (lecturaPendiente) {
          var pendiente = lecturaPendiente;
          lecturaPendiente = null;
          pendiente.rechazar(new EjecucionDetenida(motivoDetencion));
        }
      },

      /** El runtime lo llama al terminar con éxito. */
      finalizar: function () {
        if (detenido) return;
        if (typeof callbacks.lineaActiva === 'function') callbacks.lineaActiva(null);
        cambiarEstado('finalizado');
      },

      /** El runtime lo llama ante un error del programa del usuario. */
      reportarError: function (error) {
        if (error && error.esDetencionDeHost) {
          // La detención no es un error del programa.
          cambiarEstado('detenido');
          return;
        }
        cambiarEstado('error');
        if (typeof callbacks.escribir === 'function') {
          callbacks.escribir(String(error && error.message ? error.message : error),
            { tipo: 'error' });
        }
      }
    };

    return host;
  }

  Code4Code.crearRuntimeHost = crearRuntimeHost;
  Code4Code.EjecucionDetenida = EjecucionDetenida;

  raiz.Code4Code = Code4Code;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code4Code;
  }
})(typeof window !== 'undefined' ? window : globalThis);
