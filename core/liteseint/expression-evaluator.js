/**
 * ============================================================
 *  expression-evaluator.js — Evaluador de Expresiones y Condiciones
 * ============================================================
 *  Pipeline aritmético por etapas + evaluador de condiciones
 *  lógicas/relacionales del runtime de LiteSeInt.
 *
 *  Diseño F4 (v1.1.0):
 *  - Los métodos se exponen como un MIXIN que LiteSeInt.js aplica
 *    sobre LiteSeInt.prototype tras la declaración de la clase.
 *  - OPERADORES_EXPR y FUNCIONES_NATIVAS_EXPR son módulo-locales
 *    y se atan a la clase como LiteSeInt._OPERADORES /
 *    LiteSeInt._FUNCIONES_NATIVAS (los métodos las consultan así).
 *
 *  Las funciones usan `this.variables`, `this.callbacks`, etc.
 *  porque al ser invocadas por el runtime ya van a través del
 *  prototype: el `this` es la instancia de LiteSeInt.
 *
 *  No depende de la UI ni del parser.
 * ============================================================
 */

const OPERADORES_EXPR = {
    '+': {
      aridad: 2,
      precedencia: 1,
      asociatividad: 'izq',
      aplicar: (a, b) => {
        if (typeof a === 'string' || typeof b === 'string') {
          return String(a) + String(b);
        }
        return a + b;
      },
    },
    '-': {
      aridad: 2,
      precedencia: 1,
      asociatividad: 'izq',
      aplicar: (a, b) => {
        if (typeof a === 'string' || typeof b === 'string') {
          throw new Error('Operación aritmética "-" no válida con cadenas.');
        }
        return a - b;
      },
    },
    '*': {
      aridad: 2,
      precedencia: 2,
      asociatividad: 'izq',
      aplicar: (a, b) => {
        if (typeof a === 'string' || typeof b === 'string') {
          throw new Error('Operación aritmética "*" no válida con cadenas.');
        }
        return a * b;
      },
    },
    '/': {
      aridad: 2,
      precedencia: 2,
      asociatividad: 'izq',
      aplicar: (a, b) => {
        if (typeof a === 'string' || typeof b === 'string') {
          throw new Error('Operación aritmética "/" no válida con cadenas.');
        }
        if (b === 0) throw new Error('División por cero.');
        return a / b;
      },
    },
    'mod': {
      aridad: 2,
      precedencia: 2,
      asociatividad: 'izq',
      aplicar: (a, b) => {
        if (typeof a !== 'number' || typeof b !== 'number') {
          throw new Error('Operador "mod" requiere operandos numéricos.');
        }
        if (b === 0) throw new Error('División por cero en operación "mod".');
        return a % b;
      },
    },
    'u-': {
      aridad: 1,
      esPrefijo: true,
      simbolo: '-',
      precedencia: 3,
      asociatividad: 'der',
      aplicar: (a) => {
        if (typeof a !== 'number') {
          throw new Error('Operador unario "-" requiere un operando numérico.');
        }
        return -a;
      },
    },
    'No': {
      aridad: 1,
      esPrefijo: true,
      simbolo: 'No',
      precedencia: 3,
      asociatividad: 'der',
      aplicar: (a) => !Boolean(a),
    },
    '^': {
      aridad: 2,
      precedencia: 4,
      asociatividad: 'der',
      aplicar: (a, b) => {
        if (typeof a !== 'number' || typeof b !== 'number') {
          throw new Error('Operador "^" requiere operandos numéricos.');
        }
        return Math.pow(a, b);
      },
    },
    'Y': {
      aridad: 2,
      simbolo: 'Y',
      precedencia: 0,
      asociatividad: 'izq',
      aplicar: (a, b) => Boolean(a) && Boolean(b),
    },
    'O': {
      aridad: 2,
      simbolo: 'O',
      precedencia: -1,
      asociatividad: 'izq',
      aplicar: (a, b) => Boolean(a) || Boolean(b),
    },
};

const FUNCIONES_NATIVAS_EXPR = {
    abs: {
      aridadMin: 1,
      aridadMax: 1,
      aplicar: (args) => {
        const x = args[0];
        if (typeof x !== 'number') {
          throw new Error('La función "Abs" requiere un argumento numérico.');
        }
        return Math.abs(x);
      },
    },
    redon: {
      aridadMin: 1,
      aridadMax: 1,
      aplicar: (args) => {
        const x = args[0];
        if (typeof x !== 'number') {
          throw new Error('La función "Redon" requiere un argumento numérico.');
        }
        return Math.round(x);
      },
    },
    trunc: {
      aridadMin: 1,
      aridadMax: 1,
      aplicar: (args) => {
        const x = args[0];
        if (typeof x !== 'number') {
          throw new Error('La función "Trunc" requiere un argumento numérico.');
        }
        return Math.trunc(x);
      },
    },
    longitud: {
      aridadMin: 1,
      aridadMax: 1,
      aplicar: (args) => {
        const x = args[0];
        if (typeof x !== 'string') {
          throw new Error('La función "Longitud" requiere un argumento de tipo Caracter.');
        }
        return x.length;
      },
    },
    mayusculas: {
      aridadMin: 1,
      aridadMax: 1,
      aplicar: (args) => {
        const x = args[0];
        if (typeof x !== 'string') {
          throw new Error('La función "Mayusculas" requiere un argumento de tipo Caracter.');
        }
        return x.toUpperCase();
      },
    },
    minusculas: {
      aridadMin: 1,
      aridadMax: 1,
      aplicar: (args) => {
        const x = args[0];
        if (typeof x !== 'string') {
          throw new Error('La función "Minusculas" requiere un argumento de tipo Caracter.');
        }
        return x.toLowerCase();
      },
    },
};

// Divide una cadena de expresiones de índice por comas en el nivel exterior.
function _splitIndexArgs(str) {
  const parts = [];
  let current = '';
  let depth = 0;
  let inStr = false;
  for (let ci = 0; ci < str.length; ci++) {
    const ch = str[ci];
    if (ch === '"') { inStr = !inStr; current += ch; continue; }
    if (inStr) { current += ch; continue; }
    if (ch === '(' || ch === '[') { depth++; current += ch; continue; }
    if (ch === ')' || ch === ']') { depth--; current += ch; continue; }
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.length > 0 ? parts : [''];
}

const _ExprEvalMixin = {
  _evaluarCondicion(condStr, lineaIdx) {
    condStr = condStr.trim();

    // O (OR) — menor precedencia
    const partesO = this._splitByLogOp(condStr, 'O');
    if (partesO.length > 1) {
      for (const p of partesO) {
        if (this._evaluarCondicion(p, lineaIdx)) return true;
      }
      return false;
    }

    // Y (AND)
    const partesY = this._splitByLogOp(condStr, 'Y');
    if (partesY.length > 1) {
      for (const p of partesY) {
        if (!this._evaluarCondicion(p, lineaIdx)) return false;
      }
      return true;
    }

    // No (NOT) — prefijo unario
    if (/^no\s+/i.test(condStr)) {
      return !this._evaluarCondicion(condStr.replace(/^no\s+/i, '').trim(), lineaIdx);
    }

    // Eliminar paréntesis externos
    if (condStr.startsWith('(') && condStr.endsWith(')')) {
      return this._evaluarCondicion(condStr.slice(1, -1), lineaIdx);
    }

    // Operadores relacionales: ==, !=, <=, >=, <>, <, >
    const m = condStr.match(/^(.*?)\s*(==|!=|<=|>=|<>|<|>)\s*(.+)$/);
    if (m) {
      const izq = this._evaluarExpresion(m[1].trim(), lineaIdx);
      const der = this._evaluarExpresion(m[3].trim(), lineaIdx);
      return this._aplicarRelop(izq, m[2], der);
    }

    // Fallback: coerción booleana
    return Boolean(this._evaluarExpresion(condStr, lineaIdx));
  },

  _aplicarRelop(izq, op, der) {
    switch (op) {
      case '==': return izq == der;
      case '!=': return izq != der;
      case '<>': return izq != der;
      case '<':  return izq < der;
      case '>':  return izq > der;
      case '<=': return izq <= der;
      case '>=': return izq >= der;
      default:   throw new Error(`Operador relacional desconocido: "${op}"`);
    }
  },

  _splitByLogOp(condStr, op) {
    const result = [];
    let current = '';
    let depth = 0;
    let inStr = false;
    let i = 0;

    while (i < condStr.length) {
      if (condStr[i] === '"') {
        inStr = !inStr;
        current += condStr[i++];
        continue;
      }
      if (inStr) { current += condStr[i++]; continue; }
      if (condStr[i] === '(') { depth++; current += condStr[i++]; continue; }
      if (condStr[i] === ')') { depth--; current += condStr[i++]; continue; }

      if (depth === 0 && condStr[i] === ' ') {
        const ahead = condStr.slice(i + 1);
        const re = new RegExp(`^${op}\\s+`, 'i');
        const match = ahead.match(re);
        if (match) {
          result.push(current.trim());
          current = '';
          i += 1 + match[0].length;
          continue;
        }
      }
      current += condStr[i++];
    }
    if (current.trim()) result.push(current.trim());
    return result.length >= 2 ? result : [condStr];
  },

  _evaluarExpresion(expr, lineaIdx) {
    expr = expr.trim();
    if (expr === '') throw new Error('Expresión vacía.');

    // Operador lógico unario "No <expr>" como prefijo (fuera de strings).
    // Se resuelve en este nivel para mantener una semántica consistente
    // con _evaluarCondicion sin contaminar el pipeline aritmético.
    if (/^no\s+/i.test(expr)) {
      const sub = this._evaluarExpresion(expr.replace(/^no\s+/i, '').trim(), lineaIdx);
      return !Boolean(sub);
    }

    const tokens       = this._tokenizarExpresion(expr);
    const normalizados = this._normalizarTokens(tokens);
    const rpn          = this._parsearRPN(normalizados);
    return this._evaluarRPN(rpn, lineaIdx);
  },

  _tokenizarExpresion(expr) {
    const tokens = [];
    let i = 0;

    while (i < expr.length) {
      if (/\s/.test(expr[i])) { i++; continue; }

      // Cadena
      if (expr[i] === '"') {
        let j = i + 1;
        while (j < expr.length && expr[j] !== '"') j++;
        if (j >= expr.length) {
          throw new Error('Texto sin cerrar con comillas dobles.');
        }
        tokens.push({ tipo: 'cadena', valor: expr.substring(i + 1, j) });
        i = j + 1;
        continue;
      }

      // Número
      if (/\d/.test(expr[i])) {
        let j = i;
        while (j < expr.length && /\d/.test(expr[j])) j++;
        if (j < expr.length && expr[j] === '.' && /\d/.test(expr[j + 1])) {
          j++;
          while (j < expr.length && /\d/.test(expr[j])) j++;
        }
        const numStr = expr.substring(i, j);
        tokens.push({
          tipo: 'numero',
          valor: numStr.includes('.') ? parseFloat(numStr) : parseInt(numStr, 10),
        });
        i = j;
        continue;
      }

      if (expr[i] === '(') { tokens.push({ tipo: 'lparen' }); i++; continue; }
      if (expr[i] === ')') { tokens.push({ tipo: 'rparen' }); i++; continue; }
      if (expr[i] === ',') { tokens.push({ tipo: 'coma'   }); i++; continue; }

      if ('+-*/^'.includes(expr[i])) {
        tokens.push({ tipo: 'op', valor: expr[i] });
        i++;
        continue;
      }

      // Identificador, booleano o llamada a función
      if (/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ_]/.test(expr[i])) {
        let j = i;
        while (j < expr.length && /[\wáéíóúüñÁÉÍÓÚÜÑ]/.test(expr[j])) j++;
        const palabra = expr.substring(i, j);
        const lw = palabra.toLowerCase();

        if (lw === 'verdadero') {
          tokens.push({ tipo: 'booleano', valor: true });
        } else if (lw === 'falso') {
          tokens.push({ tipo: 'booleano', valor: false });
        } else if (lw === 'mod') {
          // Operador binario en forma de palabra. Se trata como cualquier
          // otro operador para que el shunting-yard aplique precedencia.
          tokens.push({ tipo: 'op', valor: 'mod' });
        } else if (lw === 'y') {
          tokens.push({ tipo: 'op', valor: 'Y' });
        } else if (lw === 'o') {
          tokens.push({ tipo: 'op', valor: 'O' });
        } else if (lw === 'no') {
          tokens.push({ tipo: 'op', valor: 'No' });
        } else {
          // Look-ahead para "(": llamada a función, o "[": acceso por índice.
          let k = j;
          while (k < expr.length && /\s/.test(expr[k])) k++;
          if (k < expr.length && expr[k] === '(') {
            tokens.push({ tipo: 'funcion', nombre: palabra });
          } else if (k < expr.length && expr[k] === '[') {
            // Acceso por índice: nombre[...] — parsear el contenido entre [ y ]
            k++; // saltar '['
            const contentStart = k;
            let depth = 0;
            while (k < expr.length) {
              if (expr[k] === '[') depth++;
              else if (expr[k] === ']') {
                if (depth === 0) break;
                depth--;
              }
              k++;
            }
            if (k >= expr.length) {
              throw new Error(`Falta "]" en el acceso por índice de "${palabra}".`);
            }
            const innerStr = expr.substring(contentStart, k);
            const indices = _splitIndexArgs(innerStr);
            tokens.push({ tipo: 'indiceArreglo', nombre: palabra, indices });
            i = k + 1; // después de ']'
            continue;
          } else {
            tokens.push({ tipo: 'variable', nombre: palabra });
          }
        }
        i = j;
        continue;
      }

      throw new Error(`Carácter inesperado en expresión: "${expr[i]}".`);
    }

    return tokens;
  },

  _normalizarTokens(tokens) {
    const out = [];
    for (const tk of tokens) {
      if (tk.tipo === 'op' && tk.valor === '-') {
        const prev = out[out.length - 1];
        const enInicio = !prev;
        const trasOperador = prev && (
          prev.tipo === 'op' || prev.tipo === 'lparen' || prev.tipo === 'coma'
        );
        if (enInicio || trasOperador) {
          out.push({ tipo: 'op', valor: 'u-' });
          continue;
        }
      }
      out.push(tk);
    }
    return out;
  },

  _parsearRPN(tokens) {
    const output      = [];
    const operadores  = []; // pila de operadores / lparen / funcion
    const argCount    = []; // arity stack: cuántos argumentos vistos
    const argSeen     = []; // ¿hubo contenido en el argumento actual?

    const popHastaLparen = () => {
      while (operadores.length > 0 && operadores[operadores.length - 1].tipo !== 'lparen') {
        output.push(operadores.pop());
      }
      if (operadores.length === 0) {
        throw new Error('Paréntesis desbalanceados: falta "(" en la expresión.');
      }
    };

    const funcionPendienteActual = () => {
      for (let i = operadores.length - 1; i >= 0; i--) {
        if (operadores[i].tipo !== 'lparen') continue;
        const debajo = operadores[i - 1];
        return debajo && debajo.tipo === 'funcion' ? debajo : null;
      }
      return null;
    };

    let prev = null;

    for (const tk of tokens) {
      if (tk.tipo === 'numero' || tk.tipo === 'cadena' ||
          tk.tipo === 'booleano' || tk.tipo === 'variable' || tk.tipo === 'indiceArreglo') {
        output.push(tk);
        if (argSeen.length > 0) argSeen[argSeen.length - 1] = true;
      }
      else if (tk.tipo === 'funcion') {
        operadores.push(tk);
      }
      else if (tk.tipo === 'op') {
        const meta = LiteSeInt._OPERADORES[tk.valor];
        if (!meta) throw new Error(`Operador desconocido: "${tk.valor}".`);
        const operadorTexto = meta.simbolo || tk.valor;

        if (meta.esPrefijo) {
          operadores.push(tk);
          prev = tk;
          continue;
        }

        if (!prev || prev.tipo === 'op' || prev.tipo === 'lparen' || prev.tipo === 'coma') {
          throw new Error(`Operador "${operadorTexto}" en posición inválida.`);
        }
        while (operadores.length > 0) {
          const top = operadores[operadores.length - 1];
          if (top.tipo !== 'op') break;
          const topMeta = LiteSeInt._OPERADORES[top.valor];
          const desplazaIzq = meta.asociatividad === 'izq' && topMeta.precedencia >= meta.precedencia;
          const desplazaDer = meta.asociatividad === 'der' && topMeta.precedencia >  meta.precedencia;
          if (desplazaIzq || desplazaDer) output.push(operadores.pop());
          else break;
        }
        operadores.push(tk);
      }
      else if (tk.tipo === 'lparen') {
        operadores.push(tk);
        const debajo = operadores[operadores.length - 2];
        if (debajo && debajo.tipo === 'funcion') {
          argCount.push(0);
          argSeen.push(false);
        }
      }
      else if (tk.tipo === 'coma') {
        if (argSeen.length === 0) {
          throw new Error('Coma inesperada fuera de una llamada a función.');
        }
        popHastaLparen();
        if (!argSeen[argSeen.length - 1]) {
          // El nombre de la función vive justo debajo del lparen actual.
          const lparenIdx = operadores.length - 1;
          const fnTok = operadores[lparenIdx - 1];
          const nombreFn = fnTok && fnTok.tipo === 'funcion' ? fnTok.nombre : null;
          throw new Error(
            nombreFn
              ? `Argumento vacío antes de "," en la llamada a "${nombreFn}".`
              : 'Argumento vacío antes de "," en la llamada a función.'
          );
        }
        argCount[argCount.length - 1]++;
        argSeen[argSeen.length - 1] = false;
      }
      else if (tk.tipo === 'rparen') {
        if (prev && prev.tipo === 'op') {
          const fnTok = funcionPendienteActual();
          if (fnTok) {
            throw new Error(`Argumento vacío antes de ")" en la llamada a "${fnTok.nombre}".`);
          }
          throw new Error('Falta operando antes de ")".');
        }
        popHastaLparen();
        operadores.pop(); // descarta "("
        const top = operadores[operadores.length - 1];
        if (top && top.tipo === 'funcion') {
          const huboArg = argSeen.pop();
          let n = argCount.pop();
          if (n > 0 && !huboArg) {
            throw new Error(`Argumento vacío antes de ")" en la llamada a "${top.nombre}".`);
          }
          if (huboArg) n++;
          operadores.pop();
          output.push({ tipo: 'funcion', nombre: top.nombre, aridad: n });
          // El valor producido por esta llamada cuenta como contenido
          // del argumento del posible call exterior (llamadas anidadas).
          if (argSeen.length > 0) argSeen[argSeen.length - 1] = true;
        }
      }
      prev = tk;
    }

    if (prev && prev.tipo === 'op') {
      const meta = LiteSeInt._OPERADORES[prev.valor];
      const operadorTexto = meta ? (meta.simbolo || prev.valor) : prev.valor;
      throw new Error(`Falta operando después de "${operadorTexto}".`);
    }

    while (operadores.length > 0) {
      const top = operadores.pop();
      if (top.tipo === 'lparen') {
        throw new Error('Paréntesis desbalanceados: falta ")" en la expresión.');
      }
      if (top.tipo === 'funcion') {
        throw new Error(`Llamada a "${top.nombre}" sin cerrar con ")".`);
      }
      output.push(top);
    }

    return output;
  },

  _evaluarRPN(rpn, lineaIdx) {
    if (rpn.length === 0) throw new Error('Expresión vacía.');

    const stack = [];

    for (const tk of rpn) {
      if (tk.tipo === 'numero' || tk.tipo === 'cadena' || tk.tipo === 'booleano') {
        stack.push(tk.valor);
      }
      else if (tk.tipo === 'variable') {
        const key = tk.nombre.toLowerCase();
        if (!this.variables.hasOwnProperty(key)) {
          throw new Error(`Variable "${tk.nombre}" no definida.`);
        }
        if (!this.variables[key].inicializada) {
          throw new Error(`Variable "${tk.nombre}" no inicializada.`);
        }
        stack.push(this.variables[key].valor);
      }
      else if (tk.tipo === 'indiceArreglo') {
        const key = tk.nombre.toLowerCase();
        if (!this.variables.hasOwnProperty(key)) {
          throw new Error(`Variable "${tk.nombre}" no definida.`);
        }
        const v = this.variables[key];
        if (!v.dimensiones) {
          throw new Error(`"${tk.nombre}" no es un arreglo dimensionado. Use "Dimension" para declararlo.`);
        }
        if (tk.indices.length !== v.dimensiones.length) {
          throw new Error(`Arreglo "${tk.nombre}" tiene ${v.dimensiones.length} dimensión(es), se usaron ${tk.indices.length}.`);
        }
        const indices = tk.indices.map((idxExpr, dimIdx) => {
          const val = this._evaluarExpresion(idxExpr, lineaIdx);
          if (typeof val !== 'number') {
            throw new Error(`El índice del arreglo "${tk.nombre}" debe ser numérico.`);
          }
          const idx = Math.trunc(val);
          const maxIdx = v.dimensiones[dimIdx];
          if (idx < 1 || idx > maxIdx) {
            throw new Error(`Índice ${idx} fuera de rango [1..${maxIdx}] en "${tk.nombre}".`);
          }
          return idx;
        });
        stack.push(this._getArrayElement(key, indices));
      }
      else if (tk.tipo === 'op') {
        const meta = LiteSeInt._OPERADORES[tk.valor];
        const operadorTexto = meta.simbolo || tk.valor;

        if (meta.aridad === 1) {
          if (stack.length < 1) {
            throw new Error(`Expresión mal formada cerca de "${operadorTexto}".`);
          }
          const valor = stack.pop();
          stack.push(meta.aplicar(valor));
          continue;
        }

        if (stack.length < 2) {
          throw new Error(`Expresión mal formada cerca de "${operadorTexto}".`);
        }
        const der = stack.pop();
        const izq = stack.pop();
        stack.push(meta.aplicar(izq, der));
      }
      else if (tk.tipo === 'funcion') {
        const fn = LiteSeInt._FUNCIONES_NATIVAS[tk.nombre.toLowerCase()];
        if (!fn) {
          throw new Error(`Función "${tk.nombre}" no reconocida.`);
        }
        if (stack.length < tk.aridad) {
          throw new Error(`Llamada a "${tk.nombre}" mal formada.`);
        }
        if (tk.aridad < fn.aridadMin || tk.aridad > fn.aridadMax) {
          const esperados = fn.aridadMin === fn.aridadMax
            ? `${fn.aridadMin}`
            : `${fn.aridadMin} a ${fn.aridadMax}`;
          throw new Error(
            `La función "${tk.nombre}" espera ${esperados} argumento(s), recibió ${tk.aridad}.`
          );
        }
        const args = new Array(tk.aridad);
        for (let i = tk.aridad - 1; i >= 0; i--) args[i] = stack.pop();
        stack.push(fn.aplicar(args, { lineaIdx, runtime: this }));
      }
    }

    if (stack.length !== 1) throw new Error('Expresión mal formada.');
    return stack[0];
  },

};

const LiteSeIntExprEval = {
  OPERADORES: OPERADORES_EXPR,
  FUNCIONES_NATIVAS: FUNCIONES_NATIVAS_EXPR,
  mixin: _ExprEvalMixin,
};
