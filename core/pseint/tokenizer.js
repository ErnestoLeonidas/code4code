/**
 * ============================================================
 *  core/pseint/tokenizer.js — Capa Léxica de PSeInt
 * ============================================================
 *  Responsable de:
 *  - Tokenización por línea para el lenguaje PSeInt
 *  - Constantes léxicas (palabras reservadas, funciones nativas)
 *  - Tipos de token (TK) con soporte de FLECHA y COMPARADOR
 *
 *  Diferencias respecto a LiteSeInt:
 *  - `<-` es el único operador de asignación (perfil estricto)
 *  - `=` siempre es COMPARADOR en perfil estricto
 *  - `^` es operador de potencia
 *  - Keyword adicional `Cadena` (tipo de dato)
 *  - Funciones nativas más amplias (raiz, sen, cos, azar, etc.)
 *
 *  Las declaraciones top-level (const, function) comparten scope con
 *  otros archivos cuando se cargan como <script> clásicos o vía
 *  vm.runInContext en Node. Las funciones son puras.
 *
 *  NO depende de la UI ni del motor de ejecución.
 * ============================================================
 */

// ─────────────────────────────────────────────
//  TOKEN TYPES
// ─────────────────────────────────────────────

const TK = Object.freeze({
  KEYWORD:         'keyword',
  IDENTIFIER:      'identifier',
  STRING:          'string',
  STRING_UNCLOSED: 'string_unclosed',
  NUMBER:          'number',
  OPERATOR:        'operator',       // + - * / ^ (aritmética)
  FLECHA:          'flecha',         // <- (asignación en perfil estricto y flexible)
  COMPARADOR:      'comparador',     // == != <= >= < > = (= es comparador en perfil estricto)
  COMMA:           'comma',
  COLON:           'colon',          // : usado en Segun
  LPAREN:          'lparen',
  RPAREN:          'rparen',
  LBRACKET:        'lbracket',       // [ para arreglos Dimension y acceso
  RBRACKET:        'rbracket',
  UNKNOWN:         'unknown',
});

// ─────────────────────────────────────────────
//  CONSTANTES
// ─────────────────────────────────────────────

const KEYWORDS_PSEINT = new Set([
  // bloques principales
  'algoritmo', 'finalgoritmo', 'proceso', 'finproceso',
  // I/O
  'escribir', 'leer',
  // condicional
  'si', 'entonces', 'sino', 'finsi',
  // segun
  'segun', 'hacer', 'finsegun', 'de',
  // mientras
  'mientras', 'finmientras',
  // para
  'para', 'hasta', 'con', 'paso', 'finpara',
  // repetir
  'repetir', 'hastaque', 'que',
  // definir
  'definir', 'como', 'dimension',
  // subprocesos
  'subproceso', 'finsubproceso', 'funcion', 'finfuncion', 'retornar', 'llamar',
  // operadores lógicos
  'y', 'o', 'no', 'mod',
  // literales booleanos
  'verdadero', 'falso',
  // tipos
  'entero', 'real', 'caracter', 'cadena', 'logico',
  // sin saltar
  'sin', 'saltar',
]);

// Funciones nativas reconocidas en expresiones PSeInt.
const FUNCIONES_NATIVAS_SET = new Set([
  'rc', 'raiz', 'abs', 'ln', 'exp', 'sen', 'cos', 'tan', 'atan',
  'trunc', 'redon', 'azar', 'aleatorio',
  'longitud', 'subcadena', 'concatenar', 'mayusculas', 'minusculas',
  'convertiranumero', 'convertiratexto',
]);

// ─────────────────────────────────────────────
//  TOKENIZER
// ─────────────────────────────────────────────

/**
 * Tokeniza una línea de pseudocódigo PSeInt.
 * Respeta strings entre comillas y comentarios // fuera de strings.
 *
 * @param {string} linea   - texto crudo de la línea
 * @param {object} [perfil] - opciones del perfil de lenguaje
 *   perfil.asignacionConIgual = false (por defecto, perfil estricto):
 *     - `<-` emite FLECHA
 *     - `=`  siempre emite COMPARADOR
 *   perfil.asignacionConIgual = true (perfil flexible):
 *     - `<-` emite FLECHA
 *     - `=`  emite FLECHA cuando aparece como asignación (posición de inicio de sentencia)
 *            o COMPARADOR en contexto de expresión — por ahora emite COMPARADOR en ambos casos,
 *            ya que la distinción pertenece al parser.
 * @returns {Array<{tipo: string, valor: string, inicio: number, fin: number}>}
 */
function tokenizarLinea(linea, perfil) {
  const tokens = [];
  let i = 0;

  while (i < linea.length) {
    const inicio = i;

    // ── Whitespace: omitido (no se emite) ──
    if (/\s/.test(linea[i])) {
      while (i < linea.length && /\s/.test(linea[i])) i++;
      continue;
    }

    // ── Comentario // ──
    if (linea[i] === '/' && linea[i + 1] === '/') {
      // Todo lo que queda es comentario; se detiene la tokenización
      i = linea.length;
      continue;
    }

    // ── String literal "..." o string sin cerrar ──
    if (linea[i] === '"') {
      let j = i + 1;
      let foundClose = false;
      let commentInside = -1;

      while (j < linea.length) {
        if (linea[j] === '"') {
          foundClose = true;
          j++; // incluir la comilla de cierre
          break;
        }
        // // dentro de string sin cerrar → trata como comentario
        if (linea[j] === '/' && linea[j + 1] === '/') {
          commentInside = j;
          break;
        }
        j++;
      }

      if (foundClose) {
        tokens.push({ tipo: TK.STRING, valor: linea.substring(i, j), inicio, fin: j });
        i = j;
      } else if (commentInside >= 0) {
        tokens.push({ tipo: TK.STRING_UNCLOSED, valor: linea.substring(i, commentInside), inicio, fin: commentInside });
        // resto es comentario
        i = linea.length;
      } else {
        tokens.push({ tipo: TK.STRING_UNCLOSED, valor: linea.substring(i), inicio, fin: linea.length });
        i = linea.length;
      }
      continue;
    }

    // ── Flecha de asignación <- ──
    if (linea[i] === '<' && linea[i + 1] === '-') {
      tokens.push({ tipo: TK.FLECHA, valor: '<-', inicio, fin: inicio + 2 });
      i += 2;
      continue;
    }

    // ── Operadores de comparación de dos caracteres: ==, <=, >=, != ──
    if ('=<>!'.includes(linea[i])) {
      const two = linea.substring(i, i + 2);
      if (two === '==' || two === '<=' || two === '>=' || two === '!=' || two === '<>') {
        tokens.push({ tipo: TK.COMPARADOR, valor: two, inicio, fin: inicio + 2 });
        i += 2;
        continue;
      }
      // ── = simple: siempre COMPARADOR en PSeInt ──
      if (linea[i] === '=') {
        tokens.push({ tipo: TK.COMPARADOR, valor: '=', inicio, fin: inicio + 1 });
        i++;
        continue;
      }
      // ── < o > simples: COMPARADOR ──
      if (linea[i] === '<' || linea[i] === '>') {
        tokens.push({ tipo: TK.COMPARADOR, valor: linea[i], inicio, fin: inicio + 1 });
        i++;
        continue;
      }
      // '!' solo → UNKNOWN
    }

    // ── Operadores aritméticos: + - * / ^ ──
    if ('+-*/^'.includes(linea[i])) {
      tokens.push({ tipo: TK.OPERATOR, valor: linea[i], inicio, fin: inicio + 1 });
      i++;
      continue;
    }

    // ── Paréntesis ──
    if (linea[i] === '(') {
      tokens.push({ tipo: TK.LPAREN, valor: '(', inicio, fin: inicio + 1 });
      i++;
      continue;
    }
    if (linea[i] === ')') {
      tokens.push({ tipo: TK.RPAREN, valor: ')', inicio, fin: inicio + 1 });
      i++;
      continue;
    }

    // ── Coma ──
    if (linea[i] === ',') {
      tokens.push({ tipo: TK.COMMA, valor: ',', inicio, fin: inicio + 1 });
      i++;
      continue;
    }

    // ── Dos puntos ──
    if (linea[i] === ':') {
      tokens.push({ tipo: TK.COLON, valor: ':', inicio, fin: inicio + 1 });
      i++;
      continue;
    }

    // ── Corchetes ──
    if (linea[i] === '[') {
      tokens.push({ tipo: TK.LBRACKET, valor: '[', inicio, fin: inicio + 1 });
      i++;
      continue;
    }
    if (linea[i] === ']') {
      tokens.push({ tipo: TK.RBRACKET, valor: ']', inicio, fin: inicio + 1 });
      i++;
      continue;
    }

    // ── Palabra: keyword o identifier ──
    if (/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ_]/.test(linea[i])) {
      while (i < linea.length && /[\wáéíóúüñÁÉÍÓÚÜÑ]/.test(linea[i])) i++;
      const palabra = linea.substring(inicio, i);
      const tipo = KEYWORDS_PSEINT.has(palabra.toLowerCase()) ? TK.KEYWORD : TK.IDENTIFIER;
      tokens.push({ tipo, valor: palabra, inicio, fin: i });
      continue;
    }

    // ── Número ──
    if (/\d/.test(linea[i])) {
      while (i < linea.length && /\d/.test(linea[i])) i++;
      // parte decimal
      if (i < linea.length && linea[i] === '.' && /\d/.test(linea[i + 1])) {
        i++; // consumir punto
        while (i < linea.length && /\d/.test(linea[i])) i++;
      }
      tokens.push({ tipo: TK.NUMBER, valor: linea.substring(inicio, i), inicio, fin: i });
      continue;
    }

    // ── Carácter desconocido ──
    tokens.push({ tipo: TK.UNKNOWN, valor: linea[i], inicio, fin: inicio + 1 });
    i++;
  }

  return tokens;
}

// ─────────────────────────────────────────────
//  EXPORTACIÓN
// ─────────────────────────────────────────────

/**
 * Objeto equivalente a DocErrores de LiteSeInt, para uso desde el provider
 * y desde las pruebas en Node.
 */
const DocErroresPSeInt = { TK, KEYWORDS_PSEINT, FUNCIONES_NATIVAS_SET, tokenizarLinea };

// Exportación CommonJS para pruebas en Node; no existe en el navegador.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DocErroresPSeInt;
}
