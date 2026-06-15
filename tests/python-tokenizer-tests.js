/**
 * Code4Code — tests/python-tokenizer-tests.js
 * ============================================
 * Pruebas del tokenizador Python (core/python/tokenizer.js).
 *
 * Uso: node tests/python-tokenizer-tests.js
 */
'use strict';

const path = require('path');
const DocErroresPython = require(path.join(__dirname, '..', 'core', 'python', 'tokenizer.js'));

const { TK, KEYWORDS_PYTHON, tokenizarLinea } = DocErroresPython;

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
    throw new Error((mensaje || 'valores distintos') +
      '\n    real:     ' + r +
      '\n    esperado: ' + e);
  }
}

/** Extrae sólo tipos y valores de un array de tokens para comparaciones concisas. */
function tiposValores(tokens) {
  return tokens.map(function (t) { return { tipo: t.tipo, valor: t.valor }; });
}

console.log('Pruebas del tokenizador Python');

// ── 1. print es KEYWORD ──
prueba('print("hola") → [KEYWORD, LPAREN, STRING, RPAREN]', function () {
  const tks = tokenizarLinea('print("hola")');
  igual(tiposValores(tks), [
    { tipo: TK.KEYWORD,  valor: 'print' },
    { tipo: TK.LPAREN,   valor: '(' },
    { tipo: TK.STRING,   valor: '"hola"' },
    { tipo: TK.RPAREN,   valor: ')' },
  ]);
});

// ── 2. def nombre → KEYWORD + IDENTIFIER ──
prueba('def saludar → [KEYWORD(def), IDENTIFIER(saludar)]', function () {
  const tks = tokenizarLinea('def saludar');
  igual(tiposValores(tks), [
    { tipo: TK.KEYWORD,     valor: 'def' },
    { tipo: TK.IDENTIFIER,  valor: 'saludar' },
  ]);
});

// ── 3. if condición → KEYWORD ──
prueba('if x > 0: → [KEYWORD, IDENTIFIER, OPERATOR, NUMBER, COLON]', function () {
  const tks = tokenizarLinea('if x > 0:');
  igual(tiposValores(tks), [
    { tipo: TK.KEYWORD,    valor: 'if' },
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.OPERATOR,   valor: '>' },
    { tipo: TK.NUMBER,     valor: '0' },
    { tipo: TK.COLON,      valor: ':' },
  ]);
});

// ── 4. Número entero ──
prueba('x = 42 → [IDENTIFIER, OPERATOR(=), NUMBER(42)]', function () {
  const tks = tokenizarLinea('x = 42');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.OPERATOR,   valor: '=' },
    { tipo: TK.NUMBER,     valor: '42' },
  ]);
});

// ── 5. Número decimal ──
prueba('pi = 3.14 → [..., NUMBER(3.14)]', function () {
  const tks = tokenizarLinea('pi = 3.14');
  const numToken = tks.find(function (t) { return t.tipo === TK.NUMBER; });
  asegurar(numToken && numToken.valor === '3.14', 'esperaba NUMBER con valor 3.14');
});

// ── 6. String con comilla doble ──
prueba('"Hola, mundo" → [STRING]', function () {
  const tks = tokenizarLinea('"Hola, mundo"');
  igual(tiposValores(tks), [
    { tipo: TK.STRING, valor: '"Hola, mundo"' },
  ]);
});

// ── 7. String con comilla simple ──
prueba("'texto simple' → [STRING]", function () {
  const tks = tokenizarLinea("'texto simple'");
  igual(tiposValores(tks), [
    { tipo: TK.STRING, valor: "'texto simple'" },
  ]);
});

// ── 8. String con escape interno ──
prueba('"di \\"hola\\"" con escape → STRING', function () {
  const tks = tokenizarLinea('"di \\"hola\\""');
  asegurar(tks.length === 1 && tks[0].tipo === TK.STRING,
    'esperaba un único token STRING; got: ' + JSON.stringify(tiposValores(tks)));
});

// ── 9. Comentario # ──
prueba('# esto es un comentario → [COMMENT]', function () {
  const tks = tokenizarLinea('# esto es un comentario');
  asegurar(tks.length === 1, 'esperaba exactamente un token');
  asegurar(tks[0].tipo === TK.COMMENT, 'el tipo debe ser COMMENT');
  asegurar(tks[0].valor.startsWith('#'), 'el valor debe empezar con #');
});

// ── 10. Comentario al final de la línea ──
prueba('x = 1  # comentario → [IDENTIFIER, OPERATOR, NUMBER, COMMENT]', function () {
  const tks = tokenizarLinea('x = 1  # comentario');
  const tipos = tks.map(function (t) { return t.tipo; });
  asegurar(tipos[tipos.length - 1] === TK.COMMENT,
    'el último token debe ser COMMENT; tipos: ' + tipos.join(','));
  asegurar(tipos.indexOf(TK.NUMBER) !== -1, 'debe haber un NUMBER antes del comentario');
});

// ── 11. String sin cerrar (comilla doble) ──
prueba('"cadena sin cerrar → STRING_UNCLOSED', function () {
  const tks = tokenizarLinea('"cadena sin cerrar');
  asegurar(tks.length === 1, 'esperaba exactamente un token');
  asegurar(tks[0].tipo === TK.STRING_UNCLOSED,
    'el tipo debe ser STRING_UNCLOSED; got: ' + tks[0].tipo);
});

// ── 12. String sin cerrar (comilla simple) ──
prueba("'cadena sin cerrar → STRING_UNCLOSED", function () {
  const tks = tokenizarLinea("'cadena sin cerrar");
  asegurar(tks.length === 1, 'esperaba exactamente un token');
  asegurar(tks[0].tipo === TK.STRING_UNCLOSED,
    'el tipo debe ser STRING_UNCLOSED; got: ' + tks[0].tipo);
});

// ── 13. Operadores de dos caracteres ──
prueba('x == 5 → [IDENTIFIER, OPERATOR(==), NUMBER]', function () {
  const tks = tokenizarLinea('x == 5');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.OPERATOR,   valor: '==' },
    { tipo: TK.NUMBER,     valor: '5' },
  ]);
});

// ── 14. Operador potencia ** ──
prueba('x ** 2 → [IDENTIFIER, OPERATOR(**), NUMBER]', function () {
  const tks = tokenizarLinea('x ** 2');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.OPERATOR,   valor: '**' },
    { tipo: TK.NUMBER,     valor: '2' },
  ]);
});

// ── 15. División entera // ──
prueba('x // 3 → [IDENTIFIER, OPERATOR(//), NUMBER]', function () {
  const tks = tokenizarLinea('x // 3');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.OPERATOR,   valor: '//' },
    { tipo: TK.NUMBER,     valor: '3' },
  ]);
});

// ── 16. Operadores de asignación compuesta ──
prueba('x += 1 → [IDENTIFIER, OPERATOR(+=), NUMBER]', function () {
  const tks = tokenizarLinea('x += 1');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'x' },
    { tipo: TK.OPERATOR,   valor: '+=' },
    { tipo: TK.NUMBER,     valor: '1' },
  ]);
});

// ── 17. Indentación (espacios al inicio se omiten) ──
prueba('    return x → [KEYWORD, IDENTIFIER] (sin tokens de espacio)', function () {
  const tks = tokenizarLinea('    return x');
  igual(tiposValores(tks), [
    { tipo: TK.KEYWORD,    valor: 'return' },
    { tipo: TK.IDENTIFIER, valor: 'x' },
  ]);
});

// ── 18. Identificador de usuario (no es keyword) ──
prueba('nombre = "Ana" → IDENTIFIER, no KEYWORD', function () {
  const tks = tokenizarLinea('nombre = "Ana"');
  asegurar(tks[0].tipo === TK.IDENTIFIER,
    'nombre es un identificador de usuario, no keyword');
  asegurar(tks[0].valor === 'nombre');
});

// ── 19. True, False, None son KEYWORD ──
prueba('True False None → todos KEYWORD', function () {
  const tks = tokenizarLinea('True False None');
  for (const tk of tks) {
    asegurar(tk.tipo === TK.KEYWORD,
      tk.valor + ' debe ser KEYWORD, got: ' + tk.tipo);
  }
});

// ── 20. for … in range() ──
prueba('for i in range(10): → tokens correctos', function () {
  const tks = tokenizarLinea('for i in range(10):');
  const tipos = tks.map(function (t) { return t.tipo; });
  const valores = tks.map(function (t) { return t.valor; });
  asegurar(valores[0] === 'for' && tipos[0] === TK.KEYWORD, 'for debe ser KEYWORD');
  asegurar(valores.indexOf('in') !== -1 && tipos[valores.indexOf('in')] === TK.KEYWORD,
    'in debe ser KEYWORD');
  asegurar(valores.indexOf('range') !== -1 && tipos[valores.indexOf('range')] === TK.KEYWORD,
    'range debe ser KEYWORD');
  asegurar(tipos[tipos.length - 1] === TK.COLON, 'último token debe ser COLON');
});

// ── 21. Llaves (dict) ──
prueba('d = {} → [IDENTIFIER, OPERATOR, LBRACE, RBRACE]', function () {
  const tks = tokenizarLinea('d = {}');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'd' },
    { tipo: TK.OPERATOR,   valor: '=' },
    { tipo: TK.LBRACE,     valor: '{' },
    { tipo: TK.RBRACE,     valor: '}' },
  ]);
});

// ── 22. Coma en lista ──
prueba('a, b, c → [IDENTIFIER, COMMA, IDENTIFIER, COMMA, IDENTIFIER]', function () {
  const tks = tokenizarLinea('a, b, c');
  igual(tiposValores(tks), [
    { tipo: TK.IDENTIFIER, valor: 'a' },
    { tipo: TK.COMMA,      valor: ',' },
    { tipo: TK.IDENTIFIER, valor: 'b' },
    { tipo: TK.COMMA,      valor: ',' },
    { tipo: TK.IDENTIFIER, valor: 'c' },
  ]);
});

// ── 23. Posiciones inicio/fin correctas ──
prueba('tokens llevan inicio y fin correctos', function () {
  const tks = tokenizarLinea('x = 5');
  // x: 0-1, =: 2-3, 5: 4-5
  igual(tks[0].inicio, 0); igual(tks[0].fin, 1);
  igual(tks[1].inicio, 2); igual(tks[1].fin, 3);
  igual(tks[2].inicio, 4); igual(tks[2].fin, 5);
});

// ── 24. KEYWORDS_PYTHON contiene las palabras obligatorias ──
prueba('KEYWORDS_PYTHON incluye palabras clave obligatorias', function () {
  const obligatorias = [
    'def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return',
    'import', 'from', 'in', 'and', 'or', 'not', 'is',
    'True', 'False', 'None',
    'print', 'input', 'range', 'len',
    'int', 'float', 'str', 'bool',
    'list', 'dict', 'tuple', 'set',
    'try', 'except', 'finally', 'raise',
    'with', 'as', 'pass', 'break', 'continue', 'yield', 'lambda',
  ];
  for (const kw of obligatorias) {
    asegurar(KEYWORDS_PYTHON.has(kw), 'falta keyword: ' + kw);
  }
});

// ── 25. DocErroresPython exporta las claves requeridas ──
prueba('DocErroresPython exporta TK, KEYWORDS_PYTHON y tokenizarLinea', function () {
  asegurar(typeof DocErroresPython.TK === 'object', 'TK debe ser objeto');
  asegurar(DocErroresPython.KEYWORDS_PYTHON instanceof Set, 'KEYWORDS_PYTHON debe ser Set');
  asegurar(typeof DocErroresPython.tokenizarLinea === 'function',
    'tokenizarLinea debe ser función');
});

// ── 26. TK tiene todos los tipos requeridos ──
prueba('TK contiene todos los tipos de token requeridos', function () {
  const requeridos = [
    'KEYWORD', 'IDENTIFIER', 'STRING', 'STRING_UNCLOSED', 'NUMBER',
    'COMMENT', 'OPERATOR',
    'LPAREN', 'RPAREN', 'LBRACKET', 'RBRACKET', 'LBRACE', 'RBRACE',
    'COLON', 'COMMA',
  ];
  for (const tipo of requeridos) {
    asegurar(TK[tipo] === tipo, 'falta o incorrecto tipo de token: ' + tipo);
  }
});

// ── 27. Línea vacía → tokens vacíos ──
prueba('línea vacía → array vacío', function () {
  const tks = tokenizarLinea('');
  igual(tks, []);
});

// ── 28. Solo espacios → array vacío ──
prueba('sólo espacios → array vacío', function () {
  const tks = tokenizarLinea('    ');
  igual(tks, []);
});

console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
if (fallas > 0) process.exit(1);
