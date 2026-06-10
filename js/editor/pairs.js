/**
 * Code4Code — js/editor/pairs.js
 * ==============================
 * Autocierre/manejo de pares y auto-indentación del editor propio (Fase 2).
 *
 * Módulo puro, sin DOM: cada función recibe el texto del editor y la
 * selección (valor, selStart, selEnd, ...) y devuelve un objeto
 * { valor, selStart, selEnd } con el nuevo estado, o `null` si la regla
 * no aplica (en cuyo caso el editor deja el comportamiento por defecto).
 *
 * El cableado con el textarea (#editor) vive en js/app.js, dentro del
 * handler keydown central: ahí se comprueba la zona protegida de la
 * plantilla, se registra el historial y se refresca la vista.
 */
(function (raiz) {
  'use strict';

  /** Pares soportados: apertura → cierre. */
  var PARES = { '(': ')', '"': '"' };

  /** Cierres que pueden "saltarse" si ya están junto al caret. */
  var CIERRES = { ')': true, '"': true };

  /**
   * Unidad de indentación del editor (la misma que insertan Tab y
   * tabularLineas en js/app.js: dos espacios).
   */
  var UNIDAD_INDENTACION = '  ';

  /**
   * Tecleo de un carácter de apertura ('(' o '"').
   * - Con selección: envuelve la selección en el par y la conserva
   *   seleccionada (desplazada un carácter por la apertura insertada).
   * - Sin selección: inserta apertura+cierre y deja el caret en medio.
   * - Caso especial de '"': si el carácter siguiente ya es '"', salta
   *   sobre él en lugar de insertar (cerrar una cadena ya autocerrada).
   * @returns {{valor: string, selStart: number, selEnd: number}|null}
   */
  function alTeclearApertura(valor, selStart, selEnd, caracter) {
    var cierre = PARES[caracter];
    if (!cierre) return null;
    valor = String(valor);

    if (selStart !== selEnd) {
      var interior = valor.substring(selStart, selEnd);
      return {
        valor: valor.substring(0, selStart) + caracter + interior + cierre +
          valor.substring(selEnd),
        selStart: selStart + 1,
        selEnd: selEnd + 1
      };
    }

    if (caracter === '"' && valor.charAt(selStart) === '"') {
      return { valor: valor, selStart: selStart + 1, selEnd: selStart + 1 };
    }

    return {
      valor: valor.substring(0, selStart) + caracter + cierre +
        valor.substring(selStart),
      selStart: selStart + 1,
      selEnd: selStart + 1
    };
  }

  /**
   * Tecleo de un carácter de cierre (')'; '"' ya lo cubre la apertura).
   * Si el carácter siguiente al caret es exactamente ese cierre, avanza
   * el caret sin insertar nada (evita duplicar el cierre autoinsertado).
   * @returns {{valor: string, selStart: number, selEnd: number}|null}
   */
  function alTeclearCierre(valor, selStart, selEnd, caracter) {
    if (!CIERRES[caracter]) return null;
    if (selStart !== selEnd) return null;
    valor = String(valor);
    if (valor.charAt(selStart) !== caracter) return null;
    return { valor: valor, selStart: selStart + 1, selEnd: selStart + 1 };
  }

  /**
   * Backspace con el caret entre un par adyacente vacío ('()' o '""'):
   * elimina ambos caracteres de una vez.
   * @returns {{valor: string, selStart: number, selEnd: number}|null}
   */
  function alBorrarAtras(valor, selStart, selEnd) {
    if (selStart !== selEnd || selStart <= 0) return null;
    valor = String(valor);
    var apertura = valor.charAt(selStart - 1);
    var cierre = PARES[apertura];
    if (!cierre || valor.charAt(selStart) !== cierre) return null;
    return {
      valor: valor.substring(0, selStart - 1) + valor.substring(selStart + 1),
      selStart: selStart - 1,
      selEnd: selStart - 1
    };
  }

  /** ¿Es `c` un límite de palabra (fin de línea o carácter no identificador)? */
  function esLimiteDePalabra(c) {
    return !c || !/[A-Za-z0-9_áéíóúÁÉÍÓÚñÑ]/.test(c);
  }

  /**
   * ¿La línea (ignorando indentación y comentario `//`) comienza con una
   * palabra de apertura o intermedia del lenguaje? Comparación insensible
   * a mayúsculas y por palabra completa ("Sino" sí, "Sinonimo" no).
   */
  function abreBloque(linea, reglas) {
    if (!reglas) return false;
    var texto = String(linea).replace(/\/\/.*$/, '').replace(/^[ \t]+/, '');
    if (!texto) return false;
    var palabras = (reglas.aperturas || []).concat(reglas.intermedios || []);
    for (var i = 0; i < palabras.length; i++) {
      var p = String(palabras[i]);
      if (!p) continue;
      if (texto.length >= p.length &&
        texto.substring(0, p.length).toLowerCase() === p.toLowerCase() &&
        esLimiteDePalabra(texto.charAt(p.length))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Enter: inserta la nueva línea conservando la indentación de la línea
   * actual y, si esta abre un bloque según `reglas` (aperturas o
   * intermedios del provider), agrega un nivel extra con la unidad de
   * indentación del editor. No toca nada más de la línea.
   * @param {{aperturas: string[], cierres: string[], intermedios: string[]}} reglas
   * @returns {{valor: string, selStart: number, selEnd: number}}
   */
  function alNuevaLinea(valor, selStart, selEnd, reglas) {
    valor = String(valor);
    var inicioLinea = valor.lastIndexOf('\n', selStart - 1) + 1;
    var linea = valor.substring(inicioLinea, selStart);
    var indent = (linea.match(/^[ \t]*/) || [''])[0];
    var extra = abreBloque(linea, reglas) ? UNIDAD_INDENTACION : '';
    var insercion = '\n' + indent + extra;
    var caret = selStart + insercion.length;
    return {
      valor: valor.substring(0, selStart) + insercion + valor.substring(selEnd),
      selStart: caret,
      selEnd: caret
    };
  }

  var Code4CodePairs = {
    UNIDAD_INDENTACION: UNIDAD_INDENTACION,
    alTeclearApertura: alTeclearApertura,
    alTeclearCierre: alTeclearCierre,
    alBorrarAtras: alBorrarAtras,
    alNuevaLinea: alNuevaLinea
  };

  raiz.Code4CodePairs = Code4CodePairs;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code4CodePairs;
  }
})(typeof window !== 'undefined' ? window : globalThis);
