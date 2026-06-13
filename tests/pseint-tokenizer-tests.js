/**
 * Code4Code — tests/pseint-tokenizer-tests.js
 * ============================================
 * Pruebas del tokenizador PSeInt (core/pseint/tokenizer.js).
 *
 * Uso: node tests/pseint-tokenizer-tests.js
 */
'use strict';

const path = require('path');
const DocErroresPSeInt = require(path.join(__dirname, '..', 'core', 'pseint', 'tokenizer.js'));

const { TK, KEYWORDS_PSEINT, FUNCIONES_NATIVAS_SET, tokenizarLinea } = DocErroresPSeInt;

let total = 0;
let fallas = 0;

function prueba(nombre, fn) {
  total += 1;
  try {
    fn();
    console.log('  ✔ ' + nombre);
  } catch (e) {
    fallas += 1;
    console.error('  ✘ ' + nombre + ' → ' + e.message);
  }
}

function asegurar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'aserción fallida');
}

function igual(real, esperado, mensaje) {
  const r = JSON.stringify(real);
  const e = JSON.stringify(esperado);
  if (r !== e) {
    throw new Error((mensaje || 'valores distintos') + '\n    real:     ' + r +
      '\n    esperado: ' + e);
  }
}

/** Extrae sólo tipos y valores de un array de tokens para comparaciones concisas. */
function tiposValores(tokens) {
  return tokens.map(t => ({ tipo: t.tipo, valor: t.valor }));
}

console.log('Pruebas del tokenizador PSeInt');

// ── 1. Algoritmo → KEYWORD + IDENTIFIER ──
prueba('Algoritmo suma → [KEYWORD, IDENTIFIER]', () => {
  const tks = tokenizarLinea('Algoritmo suma');
  igual(tiposValores(tks), [
    { tipo: TK.KEYWORD,     valor: 'Algoritmo' },
    { tipo: TK.IDENTIFIER,  valor: 'suma' },
  ]);
});

// ── 2. Flecha de asignación ──
prueba('x <- 5 → [IDENTIFIER, FLECHA, NUMBER]', () => {
  const tks = tokenizarLinea('x <- 5');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.FLECHA,     valor: '<-' },
    { tipo: TK.NUMBER,     valor: '5' },
  ]);
});

// ── 3. = es COMPARADOR en perfil estricto ──
prueba('Si x = 5 Entonces → [KEYWORD, IDENTIFIER, COMPARADOR(=), NUMBER, KEYWORD]', () => {
  const tks = tokenizarLinea('Si x = 5 Entonces');
  igual(tiposValores(tks), [
    { tipo: TK.KEYWORD,     valor: 'Si' },
    { tipo: TK.IDENTIFIER,  valor: 'x' },
    { tipo: TK.COMPARADOR,  valor: '=' },
    { tipo: TK.NUMBER,      valor: '5' },
    { tipo: TK.KEYWORD,     valor: 'Entonces' },
  ]);
});

// ── 4. String literal ──
prueba('Escribir "hola mundo" → [KEYWORD, STRING]', () => {
  const tks = tokenizarLinea('Escribir "hola mundo"');
  igual(tiposValores(tks), [
    { tipo: TK.KEYWORD, valor: 'Escribir' },
    { tipo: TK.STRING,  valor: '"hola mundo"' },
  ]);
});

// ── 5. Expresión aritmética ──
prueba('x <- x + 1 → [IDENTIFIER, FLECHA, IDENTIFIER, OPERATOR, NUMBER]', () => {
  const tks = tokenizarLinea('x <- x + 1');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.FLECHA,     valor: '<-' },
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.OPERATOR,   valor: '+' },
    { tipo: TK.NUMBER,     valor: '1' },
  ]);
});

// ── 6. Función nativa como identifier ──
prueba('RC(4) → [IDENTIFIER(RC), LPAREN, NUMBER, RPAREN]', () => {
  const tks = tokenizarLinea('RC(4)');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'RC' },
    { tipo: TK.LPAREN,     valor: '(' },
    { tipo: TK.NUMBER,     valor: '4' },
    { tipo: TK.RPAREN,     valor: ')' },
  ]);
});

// ── 7. Definir con tipos ──
prueba('Definir x Como Entero → [KEYWORD, IDENTIFIER, KEYWORD, KEYWORD]', () => {
  const tks = tokenizarLinea('Definir x Como Entero');
  igual(tiposValores(tks), [
    { tipo: TK.KEYWORD,    valor: 'Definir' },
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.KEYWORD,    valor: 'Como' },
    { tipo: TK.KEYWORD,    valor: 'Entero' },
  ]);
});

// ── 8. Acceso a arreglo con flecha ──
prueba('a[1] <- 5 → [IDENTIFIER, LBRACKET, NUMBER, RBRACKET, FLECHA, NUMBER]', () => {
  const tks = tokenizarLinea('a[1] <- 5');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'a' },
    { tipo: TK.LBRACKET,   valor: '[' },
    { tipo: TK.NUMBER,     valor: '1' },
    { tipo: TK.RBRACKET,   valor: ']' },
    { tipo: TK.FLECHA,     valor: '<-' },
    { tipo: TK.NUMBER,     valor: '5' },
  ]);
});

// ── 9. Exponenciación con ^ ──
prueba('x ^ 2 → [IDENTIFIER, OPERATOR(^), NUMBER]', () => {
  const tks = tokenizarLinea('x ^ 2');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.OPERATOR,   valor: '^' },
    { tipo: TK.NUMBER,     valor: '2' },
  ]);
});

// ── 10. Comentario de línea → vacío ──
prueba('// esto es comentario → [] (vacío)', () => {
  const tks = tokenizarLinea('// esto es comentario');
  igual(tks, []);
});

// ── 11. String sin cerrar ──
prueba('x <- "hola → [..., STRING_UNCLOSED]', () => {
  const tks = tokenizarLinea('x <- "hola');
  const ultimo = tks[tks.length - 1];
  asegurar(ultimo.tipo === TK.STRING_UNCLOSED, 'el último token debe ser STRING_UNCLOSED');
  asegurar(ultimo.valor === '"hola', 'valor del string sin cerrar incorrecto');
});

// ── 12. Mientras con comparador >= ──
prueba('Mientras x >= 0 Hacer → tokens correctos', () => {
  const tks = tokenizarLinea('Mientras x >= 0 Hacer');
  igual(tiposValores(tks), [
    { tipo: TK.KEYWORD,    valor: 'Mientras' },
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.COMPARADOR, valor: '>=' },
    { tipo: TK.NUMBER,     valor: '0' },
    { tipo: TK.KEYWORD,    valor: 'Hacer' },
  ]);
});

// ── 13. Operador Mod como keyword ──
// Nota: 'y' también es KEYWORD en PSeInt (operador lógico OR).
prueba('resultado <- x Mod 3 → [..., KEYWORD(mod), ...]', () => {
  const tks = tokenizarLinea('resultado <- x Mod 3');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'resultado' },
    { tipo: TK.FLECHA,     valor: '<-' },
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.KEYWORD,    valor: 'Mod' },
    { tipo: TK.NUMBER,     valor: '3' },
  ]);
});

// ── 14. Retornar expresión ──
prueba('Retornar x + 1 → [KEYWORD, IDENTIFIER, OPERATOR, NUMBER]', () => {
  const tks = tokenizarLinea('Retornar x + 1');
  igual(tiposValores(tks), [
    { tipo: TK.KEYWORD,    valor: 'Retornar' },
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.OPERATOR,   valor: '+' },
    { tipo: TK.NUMBER,     valor: '1' },
  ]);
});

// ── 15. Literales booleanos y operador Y ──
prueba('Verdadero Y Falso → [KEYWORD(verdadero), KEYWORD(y), KEYWORD(falso)]', () => {
  const tks = tokenizarLinea('Verdadero Y Falso');
  igual(tiposValores(tks), [
    { tipo: TK.KEYWORD, valor: 'Verdadero' },
    { tipo: TK.KEYWORD, valor: 'Y' },
    { tipo: TK.KEYWORD, valor: 'Falso' },
  ]);
});

// ── 16. Tipo Cadena reconocido como keyword ──
prueba('Definir nombre Como Cadena → el tipo Cadena es KEYWORD', () => {
  const tks = tokenizarLinea('Definir nombre Como Cadena');
  const ultimo = tks[tks.length - 1];
  asegurar(ultimo.tipo === TK.KEYWORD, 'Cadena debe ser KEYWORD');
  asegurar(ultimo.valor === 'Cadena', 'valor incorrecto');
});

// ── 17. Número decimal ──
prueba('x <- 3.14 → [IDENTIFIER, FLECHA, NUMBER(3.14)]', () => {
  const tks = tokenizarLinea('x <- 3.14');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.FLECHA,     valor: '<-' },
    { tipo: TK.NUMBER,     valor: '3.14' },
  ]);
});

// ── 18. Posiciones inicio/fin correctas ──
prueba('tokens llevan inicio y fin correctos', () => {
  const tks = tokenizarLinea('x <- 5');
  igual(tks[0].inicio, 0);
  igual(tks[0].fin,    1);
  igual(tks[1].inicio, 2);
  igual(tks[1].fin,    4);
  igual(tks[2].inicio, 5);
  igual(tks[2].fin,    6);
});

// ── 19. KEYWORDS_PSEINT contiene las palabras esperadas ──
prueba('KEYWORDS_PSEINT incluye palabras clave obligatorias', () => {
  const obligatorias = [
    'algoritmo', 'finalgoritmo', 'escribir', 'leer',
    'si', 'sino', 'finsi', 'mientras', 'finmientras',
    'para', 'finpara', 'repetir', 'hastaque',
    'definir', 'como', 'dimension',
    'subproceso', 'finsubproceso', 'funcion', 'finfuncion', 'retornar',
    'verdadero', 'falso', 'entero', 'real', 'caracter', 'cadena', 'logico',
  ];
  for (const kw of obligatorias) {
    asegurar(KEYWORDS_PSEINT.has(kw), 'falta keyword: ' + kw);
  }
});

// ── 20. FUNCIONES_NATIVAS_SET contiene funciones esperadas ──
prueba('FUNCIONES_NATIVAS_SET incluye funciones nativas clave', () => {
  const esperadas = ['abs', 'raiz', 'rc', 'sen', 'cos', 'tan', 'longitud', 'subcadena', 'azar'];
  for (const fn of esperadas) {
    asegurar(FUNCIONES_NATIVAS_SET.has(fn), 'falta función nativa: ' + fn);
  }
});

// ── 21. TK exporta todos los tipos requeridos ──
prueba('TK contiene todos los tipos de token requeridos', () => {
  const requeridos = [
    'keyword', 'identifier', 'string', 'string_unclosed', 'number',
    'operator', 'flecha', 'comparador', 'comma', 'colon',
    'lparen', 'rparen', 'lbracket', 'rbracket', 'unknown',
  ];
  const valores = Object.values(TK);
  for (const tipo of requeridos) {
    asegurar(valores.includes(tipo), 'falta tipo de token: ' + tipo);
  }
});

// ── 22. DocErroresPSeInt exporta las cuatro claves requeridas ──
prueba('DocErroresPSeInt exporta TK, KEYWORDS_PSEINT, FUNCIONES_NATIVAS_SET y tokenizarLinea', () => {
  asegurar(typeof DocErroresPSeInt.TK === 'object', 'TK debe ser objeto');
  asegurar(DocErroresPSeInt.KEYWORDS_PSEINT instanceof Set, 'KEYWORDS_PSEINT debe ser Set');
  asegurar(DocErroresPSeInt.FUNCIONES_NATIVAS_SET instanceof Set, 'FUNCIONES_NATIVAS_SET debe ser Set');
  asegurar(typeof DocErroresPSeInt.tokenizarLinea === 'function', 'tokenizarLinea debe ser función');
});

// ── 23. Comentario al final de línea ──
prueba('código seguido de // descarta el comentario', () => {
  const tks = tokenizarLinea('x <- 1 // valor inicial');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.FLECHA,     valor: '<-' },
    { tipo: TK.NUMBER,     valor: '1' },
  ]);
});

// ── 24. String seguido de comentario ──
prueba('string cerrado + // → STRING sin comentario en los tokens', () => {
  const tks = tokenizarLinea('Escribir "ok" // nota');
  asegurar(tks.length === 2, 'deben ser exactamente 2 tokens');
  asegurar(tks[0].tipo === TK.KEYWORD, 'primero es KEYWORD');
  asegurar(tks[1].tipo === TK.STRING, 'segundo es STRING');
});

// ── 25. Colon en Segun ──
prueba('1: → [NUMBER, COLON]', () => {
  const tks = tokenizarLinea('1:');
  igual(tiposValores(tks), [
    { tipo: TK.NUMBER, valor: '1' },
    { tipo: TK.COLON,  valor: ':' },
  ]);
});

console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
if (fallas > 0) process.exit(1);
