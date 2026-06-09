/**
 * ============================================================
 *  tokenizer.js — Capa Léxica
 * ============================================================
 *  Responsable de:
 *  - Tokenización por línea
 *  - Constantes léxicas (palabras reservadas, tipos, funciones nativas)
 *  - Tipos de token (TK) y helpers léxicos (cursorContext, crearError, stripComment)
 *
 *  Las declaraciones top-level (const, function) comparten scope con
 *  validator.js y doc_errores.js cuando se cargan como <script> clásicos
 *  o vía vm.runInContext en Node. Las funciones son puras.
 *
 *  NO depende de la UI ni del motor de ejecución.
 * ============================================================
 */

// ─────────────────────────────────────────────
//  CONSTANTES
// ─────────────────────────────────────────────

const PALABRAS_RESERVADAS_SET = new Set([
  'definir', 'escribir', 'leer', 'como', 'entero', 'real', 'caracter', 'logico',
  'proceso', 'finproceso',
  'si', 'entonces', 'sino', 'finsi',
  'mientras', 'hacer', 'finmientras',
  'repetir', 'hastaque', 'que',
  'para', 'hasta', 'con', 'paso', 'finpara',
  'segun', 'finsegun', 'de', 'otro', 'modo',
  'y', 'o', 'no',
  'verdadero', 'falso',
  'mod',
  'dimension',
  // v1.8.0 — SubProceso/Funcion
  'subproceso', 'finsubproceso', 'funcion', 'finfuncion', 'llamar',
]);

const TIPOS_VALIDOS = new Set(['entero', 'real', 'caracter', 'logico']);

// Palabras reservadas permitidas dentro de expresiones y condiciones:
//   - 'verdadero' / 'falso': literales booleanos
//   - 'no':                  operador unario lógico (prefijo)
//   - 'y' / 'o':             operadores binarios lógicos
//   - 'mod':                 operador binario aritmético (resto entero)
const KEYWORDS_EXPR_OK = new Set(['verdadero', 'falso', 'no', 'y', 'o', 'mod']);

// Funciones nativas reconocidas en expresiones. El evaluador del runtime
// resuelve cada nombre contra LiteSeInt._FUNCIONES_NATIVAS y aplica la
// validación de aridad y tipos. Aquí solo se listan los nombres aceptados
// estáticamente para que el validador no marque como "Función no
// reconocida" lo que el runtime sí sabe ejecutar.
const FUNCIONES_NATIVAS_SET = new Set([
  'abs', 'redon', 'trunc',
  'longitud', 'mayusculas', 'minusculas',
]);

// Construcciones de PSeInt fuera del alcance de LiteSeInt.
// Si aparecen como primer token de una línea, el validador emite un
// mensaje pedagógico en lugar de "Instrucción no reconocida".
const CONSTRUCCIONES_FUERA_DE_ALCANCE = {
  'dimensionar': 'La instrucción "Dimensionar" no está soportada. Use "Dimension nombre[tamaño]".',
};

// ─────────────────────────────────────────────
//  TOKEN TYPES
// ─────────────────────────────────────────────

const TK = Object.freeze({
  KEYWORD:          'keyword',
  IDENTIFIER:       'identifier',
  STRING:           'string',
  STRING_UNCLOSED:  'string_unclosed',   // opening " without closing "
  NUMBER:           'number',
  OPERATOR:         'operator',          // + - * /
  ASSIGN:           'assign',            // =
  COMMA:            'comma',
  COLON:            'colon',             // : used in Segun case labels
  LPAREN:           'lparen',
  RPAREN:           'rparen',
  LBRACKET:         'lbracket',          // [ used in Dimension and array index
  RBRACKET:         'rbracket',          // ]
  COMMENT:          'comment',
  WHITESPACE:       'whitespace',
  UNKNOWN:          'unknown',
});

// ─────────────────────────────────────────────
//  TOKENIZER
// ─────────────────────────────────────────────

/**
 * Tokeniza una línea de pseudocódigo.
 * Respeta strings entre comillas y comentarios // fuera de strings.
 *
 * Regla de string sin cerrar:
 * - Si se abre " y no se cierra antes del fin de línea, se emite STRING_UNCLOSED.
 * - Si dentro del texto sin cerrar aparece //, se trata como comentario
 *   (el string sin cerrar termina justo antes del //).
 *
 * @param {string} linea - texto crudo de la línea
 * @returns {Array<{type: string, value: string, col: number, end: number}>}
 */
function tokenizarLinea(linea) {
  const tokens = [];
  let i = 0;

  while (i < linea.length) {
    const start = i;

    // ── Whitespace ──
    if (/\s/.test(linea[i])) {
      while (i < linea.length && /\s/.test(linea[i])) i++;
      tokens.push({ type: TK.WHITESPACE, value: linea.substring(start, i), col: start, end: i });
      continue;
    }

    // ── Comment // ──
    if (linea[i] === '/' && linea[i + 1] === '/') {
      const value = linea.substring(i);
      tokens.push({ type: TK.COMMENT, value, col: start, end: linea.length });
      i = linea.length;
      continue;
    }

    // ── String literal "..." or unclosed string ──
    if (linea[i] === '"') {
      let j = i + 1;
      let foundClose = false;
      let commentInside = -1;

      while (j < linea.length) {
        if (linea[j] === '"') {
          foundClose = true;
          j++; // include closing quote
          break;
        }
        // Check for // inside an unclosed string candidate
        if (linea[j] === '/' && linea[j + 1] === '/') {
          commentInside = j;
          break;
        }
        j++;
      }

      if (foundClose) {
        // Normal closed string
        tokens.push({ type: TK.STRING, value: linea.substring(i, j), col: start, end: j });
        i = j;
      } else if (commentInside >= 0) {
        // Unclosed string that runs into a // — treat the string as unclosed up to //,
        // then the rest is a comment.
        tokens.push({ type: TK.STRING_UNCLOSED, value: linea.substring(i, commentInside), col: start, end: commentInside });
        // Now emit the comment
        tokens.push({ type: TK.COMMENT, value: linea.substring(commentInside), col: commentInside, end: linea.length });
        i = linea.length;
      } else {
        // Unclosed string to end of line
        tokens.push({ type: TK.STRING_UNCLOSED, value: linea.substring(i), col: start, end: linea.length });
        i = linea.length;
      }
      continue;
    }

    // ── Comparison operators (2 chars): ==, <=, >=, !=, <> ──
    if ('=<>!'.includes(linea[i])) {
      const two = linea.substring(i, i + 2);
      if (two === '==' || two === '<=' || two === '>=' || two === '!=' || two === '<>') {
        tokens.push({ type: TK.OPERATOR, value: two, col: start, end: start + 2 });
        i += 2;
        continue;
      }
      // ── Assignment operator: single '=' ──
      if (linea[i] === '=') {
        tokens.push({ type: TK.ASSIGN, value: '=', col: start, end: start + 1 });
        i++;
        continue;
      }
      // ── Comparison: single '<' or '>' ──
      if (linea[i] === '<' || linea[i] === '>') {
        tokens.push({ type: TK.OPERATOR, value: linea[i], col: start, end: start + 1 });
        i++;
        continue;
      }
      // '!' solo → cae a UNKNOWN
    }

    // ── Arithmetic operators ──
    if ('+-*/^'.includes(linea[i])) {
      tokens.push({ type: TK.OPERATOR, value: linea[i], col: start, end: start + 1 });
      i++;
      continue;
    }

    // ── Parentheses ──
    if (linea[i] === '(') {
      tokens.push({ type: TK.LPAREN, value: '(', col: start, end: start + 1 });
      i++;
      continue;
    }
    if (linea[i] === ')') {
      tokens.push({ type: TK.RPAREN, value: ')', col: start, end: start + 1 });
      i++;
      continue;
    }

    // ── Comma ──
    if (linea[i] === ',') {
      tokens.push({ type: TK.COMMA, value: ',', col: start, end: start + 1 });
      i++;
      continue;
    }

    // ── Colon ──
    if (linea[i] === ':') {
      tokens.push({ type: TK.COLON, value: ':', col: start, end: start + 1 });
      i++;
      continue;
    }

    // ── Brackets ──
    if (linea[i] === '[') {
      tokens.push({ type: TK.LBRACKET, value: '[', col: start, end: start + 1 });
      i++;
      continue;
    }
    if (linea[i] === ']') {
      tokens.push({ type: TK.RBRACKET, value: ']', col: start, end: start + 1 });
      i++;
      continue;
    }

    // ── Word (keyword or identifier) ──
    if (/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ_]/.test(linea[i])) {
      while (i < linea.length && /[\wáéíóúüñÁÉÍÓÚÜÑ]/.test(linea[i])) i++;
      const word = linea.substring(start, i);
      const type = PALABRAS_RESERVADAS_SET.has(word.toLowerCase()) ? TK.KEYWORD : TK.IDENTIFIER;
      tokens.push({ type, value: word, col: start, end: i });
      continue;
    }

    // ── Number ──
    if (/\d/.test(linea[i])) {
      while (i < linea.length && /\d/.test(linea[i])) i++;
      if (i < linea.length && linea[i] === '.' && /\d/.test(linea[i + 1])) {
        i++; // skip dot
        while (i < linea.length && /\d/.test(linea[i])) i++;
      }
      tokens.push({ type: TK.NUMBER, value: linea.substring(start, i), col: start, end: i });
      continue;
    }

    // ── Unknown character ──
    tokens.push({ type: TK.UNKNOWN, value: linea[i], col: start, end: start + 1 });
    i++;
  }

  return tokens;
}

/**
 * Returns only significant tokens (no whitespace, no comment).
 */
function tokensSignificativos(tokens) {
  return tokens.filter(t => t.type !== TK.WHITESPACE && t.type !== TK.COMMENT);
}

// ─────────────────────────────────────────────
//  CURSOR CONTEXT HELPERS
// ─────────────────────────────────────────────

/**
 * Determines if a cursor position (column) within a line is inside
 * a string literal or a comment.
 * @param {string} lineText - the full line text
 * @param {number} col - 0-based column position
 * @returns {{inString: boolean, inComment: boolean}}
 */
function cursorContext(lineText, col) {
  let inStr = false;
  for (let i = 0; i < lineText.length && i <= col; i++) {
    if (lineText[i] === '"') {
      if (i === col) {
        return { inString: true, inComment: false };
      }
      inStr = !inStr;
    }
    if (!inStr && lineText[i] === '/' && lineText[i + 1] === '/' && i <= col) {
      return { inString: false, inComment: true };
    }
  }
  return { inString: inStr, inComment: false };
}

// ─────────────────────────────────────────────
//  ERROR STRUCTURE
// ─────────────────────────────────────────────

/**
 * Creates a standardized error object.
 */
function crearError(linea, colInicio, colFin, tipo, mensaje, token) {
  return {
    linea,           // 0-based line index
    columnaInicio: colInicio,
    columnaFin: colFin,
    tipo,
    mensaje,
    token: token || '',
  };
}
// ─────────────────────────────────────────────

/**
 * Strips inline comment from a line, respecting properly closed strings.
 * If a string is opened but not closed, // inside it IS treated as a comment.
 */
function stripComment(linea) {
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    if (linea[i] === '"') {
      enComillas = !enComillas;
    } else if (!enComillas && linea[i] === '/' && linea[i + 1] === '/') {
      return linea.substring(0, i).trim();
    }
  }
  return linea.trim();
}
