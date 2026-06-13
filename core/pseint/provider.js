/**
 * Code4Code — core/pseint/provider.js
 * =====================================
 * Provider del lenguaje PSeInt (perfil estricto): adapta el núcleo
 * core/pseint/ al contrato Code4Code (core/language-provider.js) y lo
 * registra en Code4Code.registro.
 *
 * El núcleo expone sus APIs como globals de script clásico:
 *   DocErroresPSeInt  (core/pseint/tokenizer.js)
 *   parsearPSeInt     (core/pseint/parser.js)
 *   validarPSeInt     (core/pseint/validator.js)
 *   RuntimePSeInt     (core/pseint/runtime.js)
 *
 * Este provider es la única pieza que los conoce: la UI (js/app.js) habla
 * solo con el contrato y ejecuta a través del RuntimeHost (core/runtime-host.js).
 *
 * Ver ROADMAP.md — Fase 3.
 */
(function (raiz) {
  'use strict';

  var Code4Code = raiz.Code4Code;
  if (!Code4Code || typeof Code4Code.crearProvider !== 'function') {
    if (raiz.console) raiz.console.warn(
      'pseint/provider.js: falta language-provider.js; provider no registrado.');
    return;
  }

  var g = raiz;

  // OJO: DocErroresPSeInt (const), validarPSeInt (function) y RuntimePSeInt
  // (class) son declaraciones léxicas de script clásico: NO cuelgan de
  // window/globalThis. Se referencian como identificadores libres.

  /**
   * Acceso defensivo al núcleo DocErroresPSeInt.
   */
  function nucleoDocErroresPSeInt() {
    return typeof DocErroresPSeInt !== 'undefined' ? DocErroresPSeInt : null;
  }

  /** Plantilla inicial del editor para PSeInt. */
  var PLANTILLA = 'Algoritmo nombre_algoritmo\n\n\n\n\n\nFinAlgoritmo';

  /** Perfil estricto: `<-` para asignación, `=` siempre es comparador. */
  var PERFIL_ESTRICTO = Object.freeze({ asignacionConIgual: false });

  /** Tipos de token del núcleo PSeInt → tipos genéricos del contrato. */
  var MAPA_TOKENS = null;
  function mapaTokens() {
    if (MAPA_TOKENS) return MAPA_TOKENS;
    var nucleo = nucleoDocErroresPSeInt();
    if (!nucleo) return {};
    var TK = nucleo.TK;
    MAPA_TOKENS = {};
    MAPA_TOKENS[TK.KEYWORD]          = 'palabra-clave';
    MAPA_TOKENS[TK.STRING]           = 'cadena';
    MAPA_TOKENS[TK.STRING_UNCLOSED]  = 'cadena';
    MAPA_TOKENS[TK.NUMBER]           = 'numero';
    MAPA_TOKENS[TK.FLECHA]           = 'asignacion';
    MAPA_TOKENS[TK.COMPARADOR]       = 'operador';
    MAPA_TOKENS[TK.OPERATOR]         = 'operador';
    MAPA_TOKENS[TK.IDENTIFIER]       = 'identificador';
    MAPA_TOKENS[TK.COMMA]            = 'plano';
    MAPA_TOKENS[TK.COLON]            = 'plano';
    MAPA_TOKENS[TK.LPAREN]           = 'parentesis-abre';
    MAPA_TOKENS[TK.RPAREN]           = 'parentesis-cierra';
    MAPA_TOKENS[TK.LBRACKET]         = 'plano';
    MAPA_TOKENS[TK.RBRACKET]         = 'plano';
    return MAPA_TOKENS;
  }

  function definicion() {
    return {
      id: 'pseint',
      nombre: 'PSeInt',
      extension: '.psc',
      capacidades: [
        Code4Code.CAPACIDADES.INSPECTOR_VARIABLES,
        Code4Code.CAPACIDADES.EJERCICIOS
      ],

      plantillaInicial: function () {
        return PLANTILLA;
      },

      /**
       * Tokens para el resaltado, desde el tokenizer real del núcleo PSeInt.
       */
      tokenizarLinea: function (linea) {
        var nucleo = nucleoDocErroresPSeInt();
        if (!nucleo || typeof nucleo.tokenizarLinea !== 'function') {
          return { tokens: [{ tipo: 'plano', texto: String(linea) }] };
        }
        var mapa = mapaTokens();
        var tokens = nucleo.tokenizarLinea(String(linea), PERFIL_ESTRICTO).map(function (tk) {
          return { tipo: mapa[tk.tipo] || 'plano', texto: tk.valor, nucleo: tk };
        });
        return { tokens: tokens };
      },

      /**
       * Reglas de indentación para el editor:
       * - aperturas: palabras que abren un bloque (aumentan nivel)
       * - cierres:   palabras que cierran un bloque (disminuyen nivel)
       * - intermedios: palabras que vuelven al nivel del apertura (Sino)
       */
      reglasIndentacion: function () {
        return {
          aperturas: [
            'Algoritmo', 'Proceso',
            'Si', 'Mientras', 'Para', 'Repetir', 'Segun',
            'SubProceso', 'Funcion'
          ],
          cierres: [
            'FinAlgoritmo', 'FinProceso',
            'FinSi', 'FinMientras', 'FinPara', 'Hasta Que', 'HastaQue',
            'FinSegun', 'FinSubProceso', 'FinFuncion'
          ],
          intermedios: ['Sino', 'De Otro Modo:']
        };
      },

      /**
       * Extrae variables declaradas con "Definir x Como Tipo" para el
       * resaltado del editor (js/editor/highlight.js las marca como sh-variable).
       */
      extraerVariables: function (codigo) {
        var vars = [];
        var vistos = {};
        String(codigo || '').split('\n').forEach(function (linea) {
          var m = linea.match(/^\s*definir\s+([^,\s].+?)\s+como\s+\S/i);
          if (!m) return;
          // Puede ser "Definir x, y, z Como Entero"
          m[1].split(',').forEach(function (parte) {
            var nombre = parte.trim().toLowerCase();
            if (nombre && !vistos[nombre]) {
              vistos[nombre] = true;
              vars.push(parte.trim());
            }
          });
        });
        return vars;
      },

      /**
       * Validación estática mediante validarPSeInt().
       * La función devuelve [{ linea, mensaje }] con linea 1-based.
       * El contrato espera [{ linea, mensaje, tipo }].
       */
      validar: function (codigo) {
        if (typeof validarPSeInt !== 'function') return [];
        return validarPSeInt(String(codigo || ''), PERFIL_ESTRICTO).map(function (e) {
          return { linea: e.linea, mensaje: e.mensaje, tipo: 'error' };
        });
      },

      /**
       * Candidatos de autocompletado: palabras clave PSeInt + funciones nativas.
       * La UI filtra por prefijo antes de mostrar el popup.
       *
       * @param {object} contexto - { linea, columna, codigo }
       * @returns {Array<{texto: string, tipo: string, detalle?: string}>}
       */
      autocompletar: function (contexto) {
        var nucleo = nucleoDocErroresPSeInt();
        if (!nucleo) return [];

        var palabras = [];
        nucleo.KEYWORDS_PSEINT.forEach(function (kw) {
          // Capitalizar primera letra para mostrarlo en el popup igual
          // que aparece en el código PSeInt.
          var cap = kw.charAt(0).toUpperCase() + kw.slice(1);
          palabras.push({ texto: cap, tipo: 'keyword' });
        });

        var funciones = [];
        nucleo.FUNCIONES_NATIVAS_SET.forEach(function (fn) {
          funciones.push({ texto: fn.toUpperCase() + '()', tipo: 'funcion' });
        });

        return palabras.concat(funciones);
      },

      /**
       * Ejecución a través del RuntimeHost: adapta la interfaz simple del
       * RuntimePSeInt (host.escribir, host.leer, host.variables, host.lineaActiva)
       * al contrato del RuntimeHost de Code4Code.
       *
       * RuntimePSeInt llama:
       *   host.escribir(texto, tipo_string)   tipo_string: 'error'|'output'|…
       *   host.leer(nombreVar)                → Promise<string>
       *   host.variables(snapshot)            para el inspector de variables
       *   host.lineaActiva(lineaIdx)          resaltado de línea activa
       *
       * Y NO llama host.iniciar() ni host.finalizar() — eso lo hace el provider.
       */
      ejecutar: function (codigo, host) {
        if (typeof RuntimePSeInt === 'undefined') {
          host.iniciar();
          host.reportarError(new Error('El núcleo PSeInt no está cargado.'));
          return { detener: function () {} };
        }

        var rt = new RuntimePSeInt(PERFIL_ESTRICTO);
        var detenido = false;

        // Objeto puente que RuntimePSeInt recibe como `host` interno.
        // Adapta la interfaz simple del runtime al contrato del RuntimeHost.
        var puenteHost = {
          escribir: function (texto, tipo) {
            // RuntimePSeInt llama host.escribir(texto, tipo_string).
            // El RuntimeHost de Code4Code espera host.escribir(texto, meta_object).
            // Aquí el texto de error ya incluye "Error: …" como prefijo.
            if (tipo === 'error') {
              host.reportarError({ message: String(texto) });
            } else {
              host.escribir(String(texto), { tipo: 'salida' });
            }
          },
          leer: function (nombreVar) {
            return host.leer(nombreVar).catch(function (e) {
              if (e && e.esDetencionDeHost) return '';
              throw e;
            });
          },
          variables: function (snapshot) {
            host.reportarVariables(snapshot);
          },
          lineaActiva: function (lineaIdx) {
            // RuntimePSeInt pasa el índice 0-based; contarPaso espera cualquier
            // número (lo propaga a callbacks.lineaActiva).
            try { host.contarPaso(lineaIdx); } catch (e) {
              // EjecucionDetenida: marcar detenido para que el runtime pare.
              if (e && e.esDetencionDeHost) {
                detenido = true;
              }
            }
          }
        };

        host.iniciar();

        // ejecutar() es async: devuelve la Promise pero el control (detener)
        // se devuelve de forma síncrona.
        rt.ejecutar(String(codigo || ''), puenteHost).then(
          function () {
            if (detenido || host.fueDetenido()) {
              host.detener();
            } else {
              host.finalizar();
            }
          },
          function (err) {
            host.reportarError(err);
          }
        );

        return {
          detener: function (motivo) {
            detenido = true;
            host.detener(motivo);
          }
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
    if (g.console) g.console.error('[Code4Code] No se pudo registrar PSeInt:', e);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { definicion: definicion };
  }
})(typeof window !== 'undefined' ? window : globalThis);
