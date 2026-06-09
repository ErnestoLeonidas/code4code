/**
 * Code4Code — core/liteseint/provider.js
 * ======================================
 * Provider del lenguaje LiteSeInt: adapta el núcleo original (intacto en
 * core/liteseint/) al contrato Code4Code (core/language-provider.js) y lo
 * registra en Code4Code.registro.
 *
 * IMPORTANTE — Estado Fase 1 (parcial):
 * El núcleo LiteSeInt expone sus APIs como globals de script clásico
 * (DocErrores, parsearPrograma, runtime de core/liteseint/runtime.js, etc.).
 * Este provider detecta esos globals de forma defensiva y deja marcados con
 * `TODO(FASE1)` los puntos donde el cableado fino debe hacerse con el código
 * fuente a la vista (sesión de Claude Code sobre el repo completo), porque
 * las firmas exactas del núcleo no deben adivinarse.
 *
 * Mientras el cableado no se complete, app.js sigue usando el núcleo
 * directamente como en v1.x — este provider NO se interpone y la app
 * funciona igual que antes (regresión cero de la Fase 0).
 */
(function (raiz) {
  'use strict';

  var Code4Code = raiz.Code4Code;
  if (!Code4Code || typeof Code4Code.crearProvider !== 'function') {
    if (raiz.console) raiz.console.warn(
      'liteseint/provider.js: falta language-provider.js; provider no registrado.');
    return;
  }

  var g = raiz;

  /** Plantilla protegida del editor (igual que v1.x). */
  var PLANTILLA = 'Proceso sin_titulo\n\t\nFinProceso';

  function definicion() {
    return {
      id: 'liteseint',
      nombre: 'LiteSeInt',
      extension: '.psc',
      capacidades: [
        Code4Code.CAPACIDADES.INSPECTOR_VARIABLES,
        Code4Code.CAPACIDADES.DIAGRAMA_NS,
        Code4Code.CAPACIDADES.EJERCICIOS,
        Code4Code.CAPACIDADES.DOCUMENTACION
      ],

      plantillaInicial: function () {
        return PLANTILLA;
      },

      /**
       * TODO(FASE1): conectar con el tokenizer real
       * (core/liteseint/tokenizer.js) para que el editor multi-lenguaje
       * obtenga los tokens de resaltado desde aquí. Hoy el resaltado lo
       * hace app.js directamente, así que devolver la línea como un único
       * token plano es seguro y no se usa todavía.
       */
      tokenizarLinea: function (linea) {
        return { tokens: [{ tipo: 'plano', texto: String(linea) }] };
      },

      /**
       * Validación estática. TODO(FASE1): confirmar la firma pública real
       * del validador (core/liteseint/validator.js o doc_errores.js) y
       * normalizar su salida a [{ linea, mensaje, tipo }].
       */
      validar: function (codigo) {
        var candidatos = [
          g.DocErrores && g.DocErrores.validar,
          g.DocErrores && g.DocErrores.validarDocumento,
          g.validarDocumento,
          g.Validator && g.Validator.validar
        ];
        for (var i = 0; i < candidatos.length; i++) {
          if (typeof candidatos[i] === 'function') {
            try {
              var resultado = candidatos[i](codigo);
              return Array.isArray(resultado) ? resultado
                : (resultado && Array.isArray(resultado.errores) ? resultado.errores : []);
            } catch (e) {
              if (g.console) g.console.warn('liteseint/provider validar():', e);
              return [];
            }
          }
        }
        // TODO(FASE1): si llegamos aquí, mapear la API real del validador.
        return [];
      },

      /**
       * Ejecución a través del RuntimeHost.
       * TODO(FASE1): adaptar la invocación real del runtime
       * (core/liteseint/runtime.js, global de la v1.x) a los callbacks del
       * host: escribir/leer/lineaActiva/variables/contarPaso. Hoy app.js
       * sigue invocando el runtime directamente, por lo que esta función
       * aún no se usa en producción.
       */
      ejecutar: function (codigo, host) {
        host.iniciar();
        host.reportarError(new Error(
          '[Code4Code] El provider LiteSeInt aún no está cableado al runtime ' +
          '(TODO FASE1). La app sigue ejecutando por la vía v1.x.'));
        return { detener: function () { host.detener(); } };
      },

      reglasIndentacion: function () {
        return {
          aperturas: ['Proceso', 'Si', 'Mientras', 'Para', 'Repetir', 'Segun',
            'SubProceso', 'Funcion'],
          cierres: ['FinProceso', 'FinSi', 'FinMientras', 'FinPara', 'HastaQue',
            'Hasta Que', 'FinSegun', 'FinSubProceso', 'FinFuncion'],
          intermedios: ['Sino', 'De Otro Modo:']
        };
      }
    };
  }

  try {
    var provider = Code4Code.registro.registrar(definicion());
    if (g.console && g.console.debug) {
      g.console.debug('[Code4Code] Lenguaje registrado:', provider.nombre);
    }
  } catch (e) {
    if (g.console) g.console.error('[Code4Code] No se pudo registrar LiteSeInt:', e);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { definicion: definicion };
  }
})(typeof window !== 'undefined' ? window : globalThis);
