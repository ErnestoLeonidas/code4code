/**
 * Code4Code — core/liteseint/provider.js
 * ======================================
 * Provider del lenguaje LiteSeInt: adapta el núcleo original (intacto en
 * core/liteseint/) al contrato Code4Code (core/language-provider.js) y lo
 * registra en Code4Code.registro.
 *
 * El núcleo expone sus APIs como globals de script clásico (DocErrores,
 * LiteSeInt, LiteSeIntParser, ...). Este provider es la única pieza que
 * los conoce: la UI (js/app.js) habla solo con el contrato y ejecuta a
 * través del RuntimeHost (core/runtime-host.js).
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

  // OJO: DocErrores (const) y LiteSeInt (class) son declaraciones léxicas
  // de script clásico: NO cuelgan de window/globalThis. Por eso aquí se
  // referencian como identificadores libres (DocErrores, LiteSeInt) y
  // nunca como propiedades (raiz.DocErrores no existe en el navegador).

  /** Plantilla protegida del editor (idéntica a la estructura base v1.x). */
  var PLANTILLA = 'Proceso nombre_proceso\n\n\n\n\n\n\n\n\nFinProceso';

  /** Tipos de token del núcleo → tipos genéricos del contrato. */
  var MAPA_TOKENS = null;
  function mapaTokens() {
    if (MAPA_TOKENS) return MAPA_TOKENS;
    var TK = DocErrores.TK;
    MAPA_TOKENS = {};
    MAPA_TOKENS[TK.KEYWORD] = 'palabra-clave';
    MAPA_TOKENS[TK.STRING] = 'cadena';
    MAPA_TOKENS[TK.STRING_UNCLOSED] = 'cadena';
    MAPA_TOKENS[TK.NUMBER] = 'numero';
    MAPA_TOKENS[TK.COMMENT] = 'comentario';
    MAPA_TOKENS[TK.ASSIGN] = 'asignacion';
    MAPA_TOKENS[TK.OPERATOR] = 'operador';
    MAPA_TOKENS[TK.LPAREN] = 'parentesis-abre';
    MAPA_TOKENS[TK.RPAREN] = 'parentesis-cierra';
    MAPA_TOKENS[TK.IDENTIFIER] = 'identificador';
    return MAPA_TOKENS;
  }

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
       * Tokens para el resaltado, desde el tokenizer real del núcleo.
       * Conserva el token original en `nucleo` para consumidores que
       * necesiten detalle (columnas, tipo TK exacto).
       */
      tokenizarLinea: function (linea) {
        if (typeof DocErrores === 'undefined' ||
            typeof DocErrores.tokenizarLinea !== 'function') {
          return { tokens: [{ tipo: 'plano', texto: String(linea) }] };
        }
        var mapa = mapaTokens();
        var tokens = DocErrores.tokenizarLinea(String(linea)).map(function (tk) {
          return { tipo: mapa[tk.type] || 'plano', texto: tk.value, nucleo: tk };
        });
        return { tokens: tokens };
      },

      /**
       * Validación estática vía el validador real. Devuelve los objetos de
       * error del núcleo, que ya cumplen el contrato mínimo
       * { linea, mensaje, tipo } y agregan columnaInicio/columnaFin/token
       * para las decoraciones del editor.
       */
      validar: function (codigo) {
        return DocErrores.validarDocumento(String(codigo || '')).errores;
      },

      /**
       * Ejecución a través del RuntimeHost: todo el I/O (consola, Leer,
       * línea activa, inspector de variables, detención) pasa por el host.
       * @param {object} [opciones] - pausaPorLinea en ms (default 100,
       *        igual que v1.x; 0 en pruebas).
       */
      ejecutar: function (codigo, host, opciones) {
        var interprete = new LiteSeInt({
          onEscribir: function (texto) {
            host.escribir(texto, { tipo: 'salida' });
          },
          onSistema: function (texto) {
            host.escribir(texto, { tipo: 'sistema' });
          },
          onLeer: function (nombreVar) {
            // Si se detiene mientras espera entrada, el núcleo ya quedó con
            // `ejecutando = false` (detener del control), recibe '' y corta
            // el bloque: mismo comportamiento que v1.x.
            return host.leer(nombreVar).catch(function (e) {
              if (e && e.esDetencionDeHost) return '';
              throw e;
            });
          },
          onError: function (lineaIdx, mensaje) {
            if (host.fueDetenido()) return; // la detención no es un error
            host.reportarError({ message: mensaje, linea: lineaIdx });
          },
          onLineaActiva: function (lineaIdx) {
            host.contarPaso(lineaIdx);
          },
          onScopeEntered: function () {
            host.reportarVariables({ evento: 'reiniciar' });
          },
          onVariableChanged: function (info) {
            host.reportarVariables({ evento: 'cambio', variable: info });
          }
        });

        if (opciones && typeof opciones.pausaPorLinea === 'number') {
          interprete.velocidadPausa = opciones.pausaPorLinea;
        }

        host.iniciar();
        interprete.ejecutar(codigo).then(
          function (resultado) {
            if (resultado.detenido || host.fueDetenido()) {
              host.detener();
            } else if (resultado.exito) {
              host.finalizar();
            }
            // Si exito es false, los errores ya pasaron por reportarError
            // (estado 'error') a medida que ocurrieron.
          },
          function (err) {
            host.reportarError(err);
          }
        );

        return {
          detener: function (motivo) {
            interprete.detener();
            host.detener(motivo);
          }
        };
      },

      reglasIndentacion: function () {
        return {
          aperturas: ['Proceso', 'Si', 'Mientras', 'Para', 'Repetir', 'Segun',
            'SubProceso', 'Funcion'],
          cierres: ['FinProceso', 'FinSi', 'FinMientras', 'FinPara', 'HastaQue',
            'Hasta Que', 'FinSegun', 'FinSubProceso', 'FinFuncion'],
          intermedios: ['Sino', 'De Otro Modo:']
        };
      },

      /**
       * Candidatos de autocompletado (función opcional del contrato).
       * Replica los datos que la UI v1.x calculaba directo del núcleo:
       * palabras reservadas + variables del usuario, filtradas por el
       * prefijo bajo el cursor (insensible a mayúsculas, sin sugerir la
       * palabra ya completa) y sin duplicados (gana la primera aparición).
       *
       * Nota: DocErrores (const) y LiteSeInt (class) son declaraciones
       * léxicas de script clásico; se referencian como identificadores
       * libres, nunca como propiedades de window/globalThis.
       *
       * @param {object} contexto - { linea, columna, codigo } donde columna
       *        es el índice 0-based del cursor dentro de la línea.
       * @returns {Array<{texto: string, tipo: string, detalle?: string}>}
       */
      autocompletar: function (contexto) {
        var linea = String((contexto && contexto.linea) || '');
        var columna = contexto && typeof contexto.columna === 'number'
          ? contexto.columna : linea.length;
        var codigo = String((contexto && contexto.codigo) || '');

        // Sin sugerencias dentro de cadenas o comentarios (igual que v1.x).
        var entorno = DocErrores.cursorContext(linea, columna - 1);
        if (entorno.inString || entorno.inComment) return [];

        // Prefijo: caracteres de palabra hacia atrás desde el cursor.
        var ini = columna - 1;
        while (ini >= 0 && /[\wáéíóúüñÁÉÍÓÚÜÑ]/.test(linea[ini])) ini--;
        ini++;
        var palabra = linea.substring(ini, columna);
        if (palabra.length < 2) return [];

        // Mismo orden que v1.x: palabras reservadas y luego variables.
        var candidatos = LiteSeInt.PALABRAS_RESERVADAS.map(function (p) {
          return { texto: p.texto, tipo: 'palabra-clave', detalle: p.tipo };
        }).concat(
          DocErrores.extraerVariablesDelCodigo(codigo).map(function (v) {
            return { texto: v, tipo: 'variable' };
          })
        );

        var prefijo = palabra.toLowerCase();
        var vistos = {};
        return candidatos.filter(function (c) {
          var clave = c.texto.toLowerCase();
          if (clave === prefijo || clave.indexOf(prefijo) !== 0) return false;
          if (Object.prototype.hasOwnProperty.call(vistos, clave)) return false;
          vistos[clave] = true;
          return true;
        });
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
