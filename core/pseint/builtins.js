/**
 * ============================================================
 *  core/pseint/builtins.js — Funciones nativas de PSeInt
 * ============================================================
 *  Declara BUILTINS_PSEINT: un mapa de nombre → { aridad, fn }
 *  para todas las funciones incorporadas del lenguaje PSeInt.
 *
 *  Convenciones:
 *  - aridad: número de argumentos esperados. -1 = variádico.
 *  - fn: función JS que recibe los argumentos evaluados y
 *    devuelve el resultado o lanza Error con mensaje en español.
 *  - Los nombres de clave son en MAYÚSCULAS (PSeInt es case-
 *    insensitive; el intérprete normalizará a mayúsculas antes
 *    de buscar aquí).
 *
 *  Script clásico — NO módulo ES. Compatible con browser y Node.
 * ============================================================
 */

/* global module */

'use strict';

// ---------------------------------------------------------------------------
// Helpers internos de validación
// ---------------------------------------------------------------------------

function _exigirNumero(x, nombreFn) {
  if (typeof x !== 'number' || isNaN(x)) {
    throw new Error('La función "' + nombreFn + '" requiere un argumento numérico; se recibió: ' + JSON.stringify(x));
  }
}

function _exigirNumeros(args, nombreFn) {
  for (let i = 0; i < args.length; i++) {
    if (typeof args[i] !== 'number' || isNaN(args[i])) {
      throw new Error('La función "' + nombreFn + '" requiere argumentos numéricos; argumento ' + (i + 1) + ': ' + JSON.stringify(args[i]));
    }
  }
}

// ---------------------------------------------------------------------------
// Tabla de funciones nativas
// ---------------------------------------------------------------------------

const BUILTINS_PSEINT = {

  // ---- Matemáticas --------------------------------------------------------

  /** RC(x): raíz cuadrada (alias corto) */
  RC: {
    aridad: 1,
    fn: function(x) {
      _exigirNumero(x, 'RC');
      if (x < 0) throw new Error('RC: el argumento no puede ser negativo (' + x + ').');
      return Math.sqrt(x);
    },
  },

  /** RAIZ(x): raíz cuadrada */
  RAIZ: {
    aridad: 1,
    fn: function(x) {
      _exigirNumero(x, 'RAIZ');
      if (x < 0) throw new Error('RAIZ: el argumento no puede ser negativo (' + x + ').');
      return Math.sqrt(x);
    },
  },

  /** ABS(x): valor absoluto */
  ABS: {
    aridad: 1,
    fn: function(x) {
      _exigirNumero(x, 'ABS');
      return Math.abs(x);
    },
  },

  /** LN(x): logaritmo natural */
  LN: {
    aridad: 1,
    fn: function(x) {
      _exigirNumero(x, 'LN');
      if (x <= 0) throw new Error('LN: el argumento debe ser mayor que cero (' + x + ').');
      return Math.log(x);
    },
  },

  /** EXP(x): e elevado a x */
  EXP: {
    aridad: 1,
    fn: function(x) {
      _exigirNumero(x, 'EXP');
      return Math.exp(x);
    },
  },

  /** SEN(x): seno (radianes) */
  SEN: {
    aridad: 1,
    fn: function(x) {
      _exigirNumero(x, 'SEN');
      return Math.sin(x);
    },
  },

  /** COS(x): coseno (radianes) */
  COS: {
    aridad: 1,
    fn: function(x) {
      _exigirNumero(x, 'COS');
      return Math.cos(x);
    },
  },

  /** TAN(x): tangente (radianes) */
  TAN: {
    aridad: 1,
    fn: function(x) {
      _exigirNumero(x, 'TAN');
      return Math.tan(x);
    },
  },

  /** ATAN(x): arcotangente (radianes) */
  ATAN: {
    aridad: 1,
    fn: function(x) {
      _exigirNumero(x, 'ATAN');
      return Math.atan(x);
    },
  },

  /** TRUNC(x): parte entera (trunca hacia cero) */
  TRUNC: {
    aridad: 1,
    fn: function(x) {
      _exigirNumero(x, 'TRUNC');
      return Math.trunc(x);
    },
  },

  /** REDON(x): redondeo al entero más cercano */
  REDON: {
    aridad: 1,
    fn: function(x) {
      _exigirNumero(x, 'REDON');
      return Math.round(x);
    },
  },

  /** AZAR(x): entero aleatorio 0..(x-1) */
  AZAR: {
    aridad: 1,
    fn: function(x) {
      _exigirNumero(x, 'AZAR');
      if (x <= 0) throw new Error('AZAR: el argumento debe ser mayor que cero (' + x + ').');
      if (!Number.isInteger(x)) throw new Error('AZAR: el argumento debe ser un entero (' + x + ').');
      return Math.floor(Math.random() * x);
    },
  },

  /** ALEATORIO(a, b): entero aleatorio a..b (inclusive en ambos extremos) */
  ALEATORIO: {
    aridad: 2,
    fn: function(a, b) {
      _exigirNumeros([a, b], 'ALEATORIO');
      if (a > b) throw new Error('ALEATORIO: el primer argumento (' + a + ') no puede ser mayor que el segundo (' + b + ').');
      return a + Math.floor(Math.random() * (b - a + 1));
    },
  },

  // ---- Cadenas ------------------------------------------------------------

  /** LONGITUD(s): cantidad de caracteres */
  LONGITUD: {
    aridad: 1,
    fn: function(s) {
      return String(s).length;
    },
  },

  /**
   * SUBCADENA(s, i, j): subcadena desde posición i hasta j (1-based, inclusivo).
   * Si los índices están fuera de rango o i > j devuelve ''.
   */
  SUBCADENA: {
    aridad: 3,
    fn: function(s, i, j) {
      _exigirNumero(i, 'SUBCADENA (índice inicio)');
      _exigirNumero(j, 'SUBCADENA (índice fin)');
      const str = String(s);
      const inicio = Math.trunc(i) - 1; // convertir a 0-based
      const fin    = Math.trunc(j);     // slice es exclusivo en extremo superior
      if (inicio >= fin || inicio < 0 || inicio >= str.length) return '';
      return str.slice(inicio, fin);
    },
  },

  /**
   * CONCATENAR(s1, s2, ...): une todas las cadenas argumento.
   * aridad -1 indica variádico; el intérprete debe pasar los args como array spread.
   */
  CONCATENAR: {
    aridad: -1,
    fn: function() {
      return Array.prototype.slice.call(arguments).map(String).join('');
    },
  },

  /** MAYUSCULAS(s): convierte a mayúsculas */
  MAYUSCULAS: {
    aridad: 1,
    fn: function(s) {
      return String(s).toUpperCase();
    },
  },

  /** MINUSCULAS(s): convierte a minúsculas */
  MINUSCULAS: {
    aridad: 1,
    fn: function(s) {
      return String(s).toLowerCase();
    },
  },

  /** CONVERTIRANUMERO(s): convierte cadena a número; lanza error si no es posible */
  CONVERTIRANUMERO: {
    aridad: 1,
    fn: function(s) {
      const n = Number(s);
      if (isNaN(n)) {
        throw new Error('CONVERTIRANUMERO: no se puede convertir "' + s + '" a número.');
      }
      return n;
    },
  },

  /** CONVERTIRATEXTO(x): convierte cualquier valor a cadena */
  CONVERTIRATEXTO: {
    aridad: 1,
    fn: function(x) {
      return String(x);
    },
  },
};

// ---------------------------------------------------------------------------
// Exportación (Node.js / CommonJS)
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BUILTINS_PSEINT;
}
