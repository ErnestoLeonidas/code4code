/**
 * Code4Code — core/python/tokenizer.js
 * =====================================
 * Tokenizador Python para resaltado de sintaxis. Exporta DocErroresPython
 * (global de script clásico) con la función tokenizarLinea(linea).
 *
 * No depende de la UI ni del motor de ejecución.
 * Ver ROADMAP.md — Fase 4.
 */

// ─────────────────────────────────────────────
//  TOKEN TYPES
// ─────────────────────────────────────────────

const TK_PYTHON = Object.freeze({
  KEYWORD:         'KEYWORD',
  IDENTIFIER:      'IDENTIFIER',
  STRING:          'STRING',
  STRING_UNCLOSED: 'STRING_UNCLOSED',
  NUMBER:          'NUMBER',
  COMMENT:         'COMMENT',
  OPERATOR:        'OPERATOR',
  LPAREN:          'LPAREN',
  RPAREN:          'RPAREN',
  LBRACKET:        'LBRACKET',
  RBRACKET:        'RBRACKET',
  LBRACE:          'LBRACE',
  RBRACE:          'RBRACE',
  COLON:           'COLON',
  COMMA:           'COMMA',
  DOT:             'DOT',
  UNKNOWN:         'UNKNOWN',
});

// ─────────────────────────────────────────────
//  PALABRAS RESERVADAS PYTHON
// ─────────────────────────────────────────────

const KEYWORDS_PYTHON = new Set([
  // control de flujo
  'if', 'elif', 'else', 'for', 'while', 'break', 'continue',
  'return', 'pass', 'yield',
  // definición
  'def', 'class', 'lambda', 'with', 'as',
  // excepciones
  'try', 'except', 'finally', 'raise',
  // importación
  'import', 'from',
  // operadores lógicos
  'and', 'or', 'not', 'in', 'is',
  // literales booleanos / nulos
  'True', 'False', 'None',
  // builtins tratados como keywords para colorear
  'print', 'input', 'range', 'len',
  'int', 'float', 'str', 'bool',
  'list', 'dict', 'tuple', 'set',
]);

// ─────────────────────────────────────────────
//  OPERADORES
// ─────────────────────────────────────────────

// Operadores de dos caracteres (se prueban antes que los de uno)
const OPS_DOS_PYTHON = new Set(['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=']);

// Operadores de un carácter
const OPS_UNO_PYTHON = new Set(['+', '-', '*', '/', '%', '=', '<', '>']);

// ─────────────────────────────────────────────
//  TOKENIZER
// ─────────────────────────────────────────────

/**
 * Tokeniza una línea de código Python.
 * Maneja strings con escape \", comentarios # y palabras reservadas.
 *
 * @param {string} linea  - texto crudo de la línea
 * @returns {Array<{tipo: string, valor: string, inicio: number, fin: number}>}
 */
function tokenizarLineaPython(linea) {
  const tokens = [];
  let i = 0;
  const n = linea.length;

  while (i < n) {
    const inicio = i;
    const c = linea[i];

    // ── Espacios en blanco: se omiten ──
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }

    // ── Comentario # ──
    if (c === '#') {
      const valor = linea.substring(i);
      tokens.push({ tipo: TK_PYTHON.COMMENT, valor, inicio, fin: n });
      i = n;
      continue;
    }

    // ── String con comilla doble "..." ──
    if (c === '"') {
      const resultado = leerStringPython(linea, i, '"');
      tokens.push(resultado.token);
      i = resultado.fin;
      continue;
    }

    // ── String con comilla simple '...' ──
    if (c === "'") {
      const resultado = leerStringPython(linea, i, "'");
      tokens.push(resultado.token);
      i = resultado.fin;
      continue;
    }

    // ── Número (entero o decimal) ──
    if (c >= '0' && c <= '9') {
      let j = i + 1;
      while (j < n && linea[j] >= '0' && linea[j] <= '9') j++;
      // parte decimal
      if (j < n && linea[j] === '.' && j + 1 < n && linea[j + 1] >= '0' && linea[j + 1] <= '9') {
        j++; // consumir '.'
        while (j < n && linea[j] >= '0' && linea[j] <= '9') j++;
      }
      tokens.push({ tipo: TK_PYTHON.NUMBER, valor: linea.substring(i, j), inicio, fin: j });
      i = j;
      continue;
    }

    // ── Operadores de dos caracteres ──
    if (i + 1 < n) {
      const dos = linea.substring(i, i + 2);
      if (OPS_DOS_PYTHON.has(dos)) {
        tokens.push({ tipo: TK_PYTHON.OPERATOR, valor: dos, inicio, fin: i + 2 });
        i += 2;
        continue;
      }
    }

    // ── Operadores de un carácter ──
    if (OPS_UNO_PYTHON.has(c)) {
      tokens.push({ tipo: TK_PYTHON.OPERATOR, valor: c, inicio, fin: i + 1 });
      i++;
      continue;
    }

    // ── Paréntesis y llaves ──
    if (c === '(') { tokens.push({ tipo: TK_PYTHON.LPAREN,   valor: c, inicio, fin: i + 1 }); i++; continue; }
    if (c === ')') { tokens.push({ tipo: TK_PYTHON.RPAREN,   valor: c, inicio, fin: i + 1 }); i++; continue; }
    if (c === '[') { tokens.push({ tipo: TK_PYTHON.LBRACKET, valor: c, inicio, fin: i + 1 }); i++; continue; }
    if (c === ']') { tokens.push({ tipo: TK_PYTHON.RBRACKET, valor: c, inicio, fin: i + 1 }); i++; continue; }
    if (c === '{') { tokens.push({ tipo: TK_PYTHON.LBRACE,   valor: c, inicio, fin: i + 1 }); i++; continue; }
    if (c === '}') { tokens.push({ tipo: TK_PYTHON.RBRACE,   valor: c, inicio, fin: i + 1 }); i++; continue; }

    // ── Dos puntos ──
    if (c === ':') { tokens.push({ tipo: TK_PYTHON.COLON, valor: c, inicio, fin: i + 1 }); i++; continue; }

    // ── Coma ──
    if (c === ',') { tokens.push({ tipo: TK_PYTHON.COMMA, valor: c, inicio, fin: i + 1 }); i++; continue; }

    // ── Punto (atributos/métodos: texto.strip()) ──
    if (c === '.') { tokens.push({ tipo: TK_PYTHON.DOT, valor: c, inicio, fin: i + 1 }); i++; continue; }

    // ── Identificador o keyword ──
    if (esInicioIdentificadorPython(c)) {
      let j = i + 1;
      while (j < n && esCuerpoIdentificadorPython(linea[j])) j++;
      const palabra = linea.substring(i, j);
      const tipo = KEYWORDS_PYTHON.has(palabra) ? TK_PYTHON.KEYWORD : TK_PYTHON.IDENTIFIER;
      tokens.push({ tipo, valor: palabra, inicio, fin: j });
      i = j;
      continue;
    }

    // ── Carácter desconocido ──
    tokens.push({ tipo: TK_PYTHON.UNKNOWN, valor: c, inicio, fin: i + 1 });
    i++;
  }

  return tokens;
}

// ─────────────────────────────────────────────
//  FUNCIONES AUXILIARES
// ─────────────────────────────────────────────

/**
 * Lee un string que comienza en la posición i con la comilla dada.
 * Maneja escapes (\\, \", \', etc.) y strings sin cerrar al fin de línea.
 */
function leerStringPython(linea, i, comilla) {
  const n = linea.length;
  const inicio = i;
  let j = i + 1; // saltar la comilla de apertura

  while (j < n) {
    const c = linea[j];
    if (c === '\\') {
      // escape: saltar la barra y el siguiente carácter
      j += 2;
      continue;
    }
    if (c === comilla) {
      // cerrar string (incluir la comilla de cierre)
      j++;
      return {
        token: { tipo: TK_PYTHON.STRING, valor: linea.substring(inicio, j), inicio, fin: j },
        fin: j
      };
    }
    j++;
  }

  // String sin cerrar al final de la línea
  return {
    token: { tipo: TK_PYTHON.STRING_UNCLOSED, valor: linea.substring(inicio, n), inicio, fin: n },
    fin: n
  };
}

function esInicioIdentificadorPython(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function esCuerpoIdentificadorPython(c) {
  return esInicioIdentificadorPython(c) || (c >= '0' && c <= '9');
}

// ─────────────────────────────────────────────
//  EXPORTACIÓN
// ─────────────────────────────────────────────

/**
 * Interfaz pública del tokenizador Python.
 * Exportado como global DocErroresPython (navegador) y módulo CommonJS (Node).
 */
const DocErroresPython = {
  TK: TK_PYTHON,
  KEYWORDS_PYTHON,
  tokenizarLinea: tokenizarLineaPython,
};

// Exportación CommonJS para pruebas en Node; no existe en el navegador.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DocErroresPython;
}
