/**
 * Code4Code — js/editor/highlight.js
 * ==================================
 * Resaltado de sintaxis del editor propio (Fase 2), dirigido por el
 * provider activo a través del contrato (core/language-provider.js):
 * consume provider.tokenizarLinea(linea) — tipos genéricos de token — y
 * provider.extraerVariables(codigo) — opcional — para distinguir las
 * variables del usuario (sh-variable) de los identificadores sueltos.
 *
 * Lógica PURA: no toca el DOM. La UI (js/app.js) pinta el HTML resultante
 * en la capa espejo "syntaxLayer". Mantiene byte a byte la salida del
 * resaltado v1.x (mismas clases sh-* y mismo escape HTML).
 *
 * Patrón de carga: script global en el navegador (window.Code4CodeHighlight)
 * y módulo CommonJS en Node para las pruebas (tests/editor-tests.js).
 */
(function (raiz) {
  'use strict';

  /** Tipo genérico de token (contrato) → clase CSS del editor. */
  var CLASE_POR_TIPO = {
    'palabra-clave': 'sh-keyword',
    'cadena': 'sh-string',
    'numero': 'sh-number',
    'comentario': 'sh-comment',
    'asignacion': 'sh-assign',
    'operador': 'sh-operator',
    'plano': 'sh-plain'
  };

  /** Escapa texto para inyectarlo en las capas espejo del editor. */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function span(clase, texto) {
    return '<span class="' + clase + '">' + escapeHtml(texto) + '</span>';
  }

  /**
   * Conjunto (claves en minúsculas) de variables declaradas por el usuario.
   * Si el provider no implementa la función opcional extraerVariables, se
   * asume que no hay variables: todo identificador queda como sh-plain.
   */
  function variablesDeUsuario(provider, codigo) {
    var conjunto = Object.create(null);
    if (!provider || typeof provider.extraerVariables !== 'function') {
      return conjunto;
    }
    var nombres = provider.extraerVariables(codigo) || [];
    for (var i = 0; i < nombres.length; i++) {
      conjunto[String(nombres[i]).toLowerCase()] = true;
    }
    return conjunto;
  }

  /**
   * Resalta una línea.
   * @param {object} provider - provider activo (contrato Code4Code).
   * @param {string} linea - texto de la línea, sin '\n'.
   * @param {object} varsUsuario - conjunto creado por variablesDeUsuario().
   * @param {number} [depth=0] - profundidad de paréntesis acumulada de las
   *        líneas anteriores; colorea sh-bracket-0/1/2 en ciclo de 3.
   * @returns {{ html: string, depth: number }} HTML de la línea y
   *          profundidad resultante, para encadenar con la línea siguiente.
   */
  function resaltarLinea(provider, linea, varsUsuario, depth) {
    depth = typeof depth === 'number' ? depth : 0;
    if (linea === '') return { html: '', depth: depth };

    var tokens = provider.tokenizarLinea(String(linea)).tokens || [];
    var html = '';

    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      switch (tk.tipo) {
        case 'parentesis-abre':
          html += span('sh-bracket-' + (depth % 3), tk.texto);
          depth++;
          break;
        case 'parentesis-cierra':
          depth = Math.max(0, depth - 1);
          html += span('sh-bracket-' + (depth % 3), tk.texto);
          break;
        case 'identificador':
          html += span(
            varsUsuario[tk.texto.toLowerCase()] ? 'sh-variable' : 'sh-plain',
            tk.texto
          );
          break;
        default:
          html += span(CLASE_POR_TIPO[tk.tipo] || 'sh-plain', tk.texto);
          break;
      }
    }

    return { html: html, depth: depth };
  }

  /**
   * Resalta un código completo: devuelve el HTML con una línea por renglón
   * (mismo número de líneas que el código de entrada), encadenando la
   * profundidad de paréntesis entre líneas.
   */
  function resaltarCodigo(provider, codigo) {
    var texto = String(codigo === undefined || codigo === null ? '' : codigo);
    var varsUsuario = variablesDeUsuario(provider, texto);
    var depth = 0;
    return texto.split('\n').map(function (linea) {
      var r = resaltarLinea(provider, linea, varsUsuario, depth);
      depth = r.depth;
      return r.html;
    }).join('\n');
  }

  var Code4CodeHighlight = {
    escapeHtml: escapeHtml,
    variablesDeUsuario: variablesDeUsuario,
    resaltarLinea: resaltarLinea,
    resaltarCodigo: resaltarCodigo
  };

  raiz.Code4CodeHighlight = Code4CodeHighlight;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code4CodeHighlight;
  }
})(typeof window !== 'undefined' ? window : globalThis);
