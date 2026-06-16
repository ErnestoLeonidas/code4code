/**
 * ============================================================
 *  core/pseint/expression-evaluator.js — Evaluador de Expresiones PSeInt
 * ============================================================
 *  Evalúa expresiones y condiciones del lenguaje PSeInt usando el
 *  algoritmo shunting-yard para convertir infijo a RPN y luego
 *  evaluar la pila.
 *
 *  Script clásico — NO módulo ES. Compatible con browser y Node.
 *
 *  Dependencias globales (deben estar en scope antes de cargar este archivo):
 *  - DocErroresPSeInt: { TK, tokenizarLinea }  (core/pseint/tokenizer.js)
 *  - BUILTINS_PSEINT: mapa de funciones nativas (core/pseint/builtins.js)
 *  - ScopeChainPSeInt: tabla de símbolos    (core/pseint/symbol-table.js)
 * ============================================================
 */

/* global DocErroresPSeInt, BUILTINS_PSEINT, ScopeChainPSeInt, module */

'use strict';

// ---------------------------------------------------------------------------
//  Tabla de operadores PSeInt con precedencias y asociatividades
// ---------------------------------------------------------------------------

const OPERADORES_PSEINT = {
  // Lógicos
  'O':  { aridad: 2, precedencia: 0, asociatividad: 'izq', aplicar: (a, b) => Boolean(a) || Boolean(b) },
  'Y':  { aridad: 2, precedencia: 1, asociatividad: 'izq', aplicar: (a, b) => Boolean(a) && Boolean(b) },

  // Relacionales  (= es comparación en PSeInt, nunca asignación)
  '=':  { aridad: 2, precedencia: 3, asociatividad: 'izq', aplicar: (a, b) => a == b },
  '!=': { aridad: 2, precedencia: 3, asociatividad: 'izq', aplicar: (a, b) => a != b },
  '<>': { aridad: 2, precedencia: 3, asociatividad: 'izq', aplicar: (a, b) => a != b },
  '<':  { aridad: 2, precedencia: 3, asociatividad: 'izq', aplicar: (a, b) => a <  b },
  '>':  { aridad: 2, precedencia: 3, asociatividad: 'izq', aplicar: (a, b) => a >  b },
  '<=': { aridad: 2, precedencia: 3, asociatividad: 'izq', aplicar: (a, b) => a <= b },
  '>=': { aridad: 2, precedencia: 3, asociatividad: 'izq', aplicar: (a, b) => a >= b },

  // Aritméticos
  '+':  {
    aridad: 2, precedencia: 4, asociatividad: 'izq',
    aplicar: (a, b) => {
      if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
      return a + b;
    },
  },
  '-':  {
    aridad: 2, precedencia: 4, asociatividad: 'izq',
    aplicar: (a, b) => {
      if (typeof a === 'string' || typeof b === 'string') {
        throw new Error('Operación "-" no válida con cadenas.');
      }
      return a - b;
    },
  },
  '*':  {
    aridad: 2, precedencia: 5, asociatividad: 'izq',
    aplicar: (a, b) => {
      if (typeof a === 'string' || typeof b === 'string') {
        throw new Error('Operación "*" no válida con cadenas.');
      }
      return a * b;
    },
  },
  '/':  {
    aridad: 2, precedencia: 5, asociatividad: 'izq',
    aplicar: (a, b) => {
      if (typeof a === 'string' || typeof b === 'string') {
        throw new Error('Operación "/" no válida con cadenas.');
      }
      if (b === 0) throw new Error('División por cero.');
      return a / b;
    },
  },
  'MOD': {
    aridad: 2, precedencia: 5, asociatividad: 'izq',
    aplicar: (a, b) => {
      if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('Operador MOD requiere operandos numéricos.');
      }
      if (b === 0) throw new Error('División por cero en MOD.');
      return a % b;
    },
  },
  '^':  {
    aridad: 2, precedencia: 6, asociatividad: 'der',
    aplicar: (a, b) => {
      if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('Operador "^" requiere operandos numéricos.');
      }
      return Math.pow(a, b);
    },
  },

  // Unarios (prefijo)
  'u-': {
    aridad: 1, esPrefijo: true, simbolo: '-', precedencia: 7, asociatividad: 'der',
    aplicar: (a) => {
      if (typeof a !== 'number') throw new Error('Operador unario "-" requiere número.');
      return -a;
    },
  },
  'NO': {
    aridad: 1, esPrefijo: true, simbolo: 'NO', precedencia: 7, asociatividad: 'der',
    aplicar: (a) => !Boolean(a),
  },
};

// ---------------------------------------------------------------------------
//  Helper: split por comas respetando paréntesis y strings
// ---------------------------------------------------------------------------

function _splitArgsPSeInt(str) {
  const partes = [];
  let actual = '';
  let profundidad = 0;
  let enStr = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"') { enStr = !enStr; actual += c; continue; }
    if (enStr) { actual += c; continue; }
    if (c === '(' || c === '[') { profundidad++; actual += c; continue; }
    if (c === ')' || c === ']') { profundidad--; actual += c; continue; }
    if (c === ',' && profundidad === 0) {
      partes.push(actual.trim());
      actual = '';
    } else {
      actual += c;
    }
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes.length > 0 ? partes : [''];
}

// ---------------------------------------------------------------------------
//  EvaluadorPSeInt
// ---------------------------------------------------------------------------

class EvaluadorPSeInt {
  /**
   * @param {ScopeChainPSeInt} scopes      - cadena de scopes activa
   * @param {object}           builtins    - BUILTINS_PSEINT
   * @param {Map|object}       subprocesos - funciones/procedimientos del AST
   * @param {object}           [perfil]    - perfil activo del provider
   */
  constructor(scopes, builtins, subprocesos, perfil) {
    this._scopes      = scopes;
    this._builtins    = builtins;
    this._valores     = new Map(); // clave en minúsculas → valor JS actual
    this._subprocesos = subprocesos || {};
    this._perfil      = Object.assign({ asignacionConIgual: false, indicesDesde0: false }, perfil || {});
  }

  // ── API pública ────────────────────────────────────────────────────────────

  /**
   * Registra un valor para una variable en el evaluador (sincronizado con el
   * runtime después de cada asignación).
   */
  setValor(nombre, valor) {
    this._valores.set(nombre.toLowerCase(), valor);
  }

  /**
   * Lee el valor JS de una variable.
   * @param {string} nombre
   * @returns {*}
   */
  getValor(nombre) {
    const clave = nombre.toLowerCase();
    if (!this._valores.has(clave)) {
      const entrada = this._scopes.lookup(nombre);
      if (!entrada) throw new Error(`Variable "${nombre}" no definida.`);
      if (!entrada.inicializada) throw new Error(`Variable "${nombre}" no inicializada.`);
    }
    return this._valores.get(clave);
  }

  /**
   * Evalúa una expresión textual y devuelve el valor JS resultante.
   * @param {string} textoExpr
   * @returns {*}
   */
  evaluar(textoExpr) {
    textoExpr = String(textoExpr).trim();
    if (!textoExpr) throw new Error('Expresión vacía.');

    // Prefijo "NO <expr>" fuera del shunting-yard
    if (/^no\s+/i.test(textoExpr)) {
      const sub = this.evaluar(textoExpr.replace(/^no\s+/i, '').trim());
      return !Boolean(sub);
    }

    const tokens       = this._tokenizar(textoExpr);
    const normalizados = this._normalizarTokens(tokens);
    const rpn          = this._shuntingYard(normalizados);
    return this._evaluarRPN(rpn);
  }

  /**
   * Evalúa una expresión que debe resultar en booleano.
   * @param {string} textoExpr
   * @returns {boolean}
   */
  evaluarCondicion(textoExpr) {
    return Boolean(this.evaluar(textoExpr));
  }

  // ── Tokenización de expresiones ────────────────────────────────────────────

  /**
   * Convierte el texto de una expresión en tokens internos del evaluador.
   * Usa DocErroresPSeInt.tokenizarLinea como base léxica y los mapea a un
   * conjunto de tipos simplificados para el shunting-yard.
   */
  _tokenizar(expr) {
    const TK = DocErroresPSeInt.TK;
    const rawTokens = DocErroresPSeInt.tokenizarLinea(expr);
    const result = [];

    let i = 0;
    while (i < rawTokens.length) {
      const rt = rawTokens[i];
      const val = rt.valor;
      const valUp = val.toUpperCase();
      const valLow = val.toLowerCase();

      switch (rt.tipo) {
        case TK.NUMBER:
          result.push({
            tipo: 'numero',
            valor: val.includes('.') ? parseFloat(val) : parseInt(val, 10),
          });
          break;

        case TK.STRING:
          // Quitar comillas
          result.push({ tipo: 'cadena', valor: val.slice(1, -1) });
          break;

        case TK.STRING_UNCLOSED:
          throw new Error('Cadena sin cerrar en expresión.');

        case TK.OPERATOR:
          result.push({ tipo: 'op', valor: val });
          break;

        case TK.COMPARADOR:
          result.push({ tipo: 'op', valor: val });
          break;

        case TK.LPAREN:
          result.push({ tipo: 'lparen' });
          break;

        case TK.RPAREN:
          result.push({ tipo: 'rparen' });
          break;

        case TK.COMMA:
          result.push({ tipo: 'coma' });
          break;

        case TK.LBRACKET: {
          // Acceso por índice: viene justo después de un IDENTIFIER
          // El IDENTIFIER ya fue procesado en la iteración anterior;
          // sin embargo, el tokenizador emite IDENTIFIER y luego LBRACKET.
          // Necesitamos retroceder para capturar el nombre del arreglo.
          const prev = result[result.length - 1];
          if (!prev || prev.tipo !== 'variable') {
            throw new Error('Corchete "[" inesperado en expresión.');
          }
          const nombreArr = prev.nombre;
          result.pop(); // remover el token variable anterior

          // Recolectar el contenido hasta el RBRACKET balanceado
          i++; // saltar LBRACKET
          const partes = [];
          let parteActual = '';
          let profundidad = 0;
          while (i < rawTokens.length) {
            const rtt = rawTokens[i];
            if (rtt.tipo === TK.LBRACKET) { profundidad++; parteActual += rtt.valor; i++; continue; }
            if (rtt.tipo === TK.RBRACKET) {
              if (profundidad === 0) { i++; break; } // cierre
              profundidad--;
              parteActual += rtt.valor;
              i++;
              continue;
            }
            if (rtt.tipo === TK.COMMA && profundidad === 0) {
              partes.push(parteActual.trim());
              parteActual = '';
              i++;
              continue;
            }
            parteActual += rtt.valor;
            i++;
          }
          if (parteActual.trim()) partes.push(parteActual.trim());
          result.push({ tipo: 'indiceArreglo', nombre: nombreArr, indices: partes });
          continue; // ya avanzamos i
        }

        case TK.KEYWORD: {
          if (valLow === 'verdadero') {
            result.push({ tipo: 'booleano', valor: true });
          } else if (valLow === 'falso') {
            result.push({ tipo: 'booleano', valor: false });
          } else if (valLow === 'y') {
            result.push({ tipo: 'op', valor: 'Y' });
          } else if (valLow === 'o') {
            result.push({ tipo: 'op', valor: 'O' });
          } else if (valLow === 'no') {
            result.push({ tipo: 'op', valor: 'NO' });
          } else if (valLow === 'mod') {
            result.push({ tipo: 'op', valor: 'MOD' });
          } else {
            // keyword no reconocido en expresión → tratar como identificador
            result.push({ tipo: 'variable', nombre: val });
          }
          break;
        }

        case TK.IDENTIFIER: {
          // Look-ahead: ¿sigue un LPAREN? → llamada a función
          const sig = rawTokens[i + 1];
          if (sig && sig.tipo === TK.LPAREN) {
            result.push({ tipo: 'funcion', nombre: val });
          } else {
            result.push({ tipo: 'variable', nombre: val });
          }
          break;
        }

        default:
          throw new Error(`Token inesperado en expresión: "${val}".`);
      }
      i++;
    }
    return result;
  }

  // ── Normalización de tokens (detecta unarios) ──────────────────────────────

  _normalizarTokens(tokens) {
    const out = [];
    for (const tk of tokens) {
      if (tk.tipo === 'op' && tk.valor === '-') {
        const prev = out[out.length - 1];
        const enInicio = !prev;
        const trasOp = prev && (prev.tipo === 'op' || prev.tipo === 'lparen' || prev.tipo === 'coma');
        if (enInicio || trasOp) {
          out.push({ tipo: 'op', valor: 'u-' });
          continue;
        }
      }
      // NO unario: si NO viene justo antes de un operando (inicio o tras op/lparen)
      if (tk.tipo === 'op' && tk.valor === 'NO') {
        // siempre es prefijo
        out.push(tk);
        continue;
      }
      out.push(tk);
    }
    return out;
  }

  // ── Shunting-Yard (Dijkstra) ───────────────────────────────────────────────

  _shuntingYard(tokens) {
    const salida     = [];
    const opStack    = [];
    const argCount   = [];
    const argSeen    = [];

    const popHastaLparen = () => {
      while (opStack.length > 0 && opStack[opStack.length - 1].tipo !== 'lparen') {
        salida.push(opStack.pop());
      }
      if (opStack.length === 0) {
        throw new Error('Paréntesis desbalanceados: falta "(".');
      }
    };

    let prev = null;

    for (const tk of tokens) {
      if (tk.tipo === 'numero' || tk.tipo === 'cadena' ||
          tk.tipo === 'booleano' || tk.tipo === 'variable' || tk.tipo === 'indiceArreglo') {
        salida.push(tk);
        if (argSeen.length > 0) argSeen[argSeen.length - 1] = true;
      } else if (tk.tipo === 'funcion') {
        opStack.push(tk);
      } else if (tk.tipo === 'op') {
        const meta = OPERADORES_PSEINT[tk.valor];
        if (!meta) throw new Error(`Operador desconocido: "${tk.valor}".`);

        if (meta.esPrefijo) {
          opStack.push(tk);
          prev = tk;
          continue;
        }

        while (opStack.length > 0) {
          const top = opStack[opStack.length - 1];
          if (top.tipo !== 'op') break;
          const topMeta = OPERADORES_PSEINT[top.valor];
          if (!topMeta) break;
          const desplazaIzq = meta.asociatividad === 'izq' && topMeta.precedencia >= meta.precedencia;
          const desplazaDer = meta.asociatividad === 'der' && topMeta.precedencia >  meta.precedencia;
          if (desplazaIzq || desplazaDer) salida.push(opStack.pop());
          else break;
        }
        opStack.push(tk);
      } else if (tk.tipo === 'lparen') {
        opStack.push(tk);
        const debajo = opStack[opStack.length - 2];
        if (debajo && debajo.tipo === 'funcion') {
          argCount.push(0);
          argSeen.push(false);
        }
      } else if (tk.tipo === 'coma') {
        popHastaLparen();
        argCount[argCount.length - 1]++;
        argSeen[argSeen.length - 1] = false;
      } else if (tk.tipo === 'rparen') {
        popHastaLparen();
        opStack.pop(); // descartar '('
        const top = opStack[opStack.length - 1];
        if (top && top.tipo === 'funcion') {
          const huboArg = argSeen.pop();
          let n = argCount.pop();
          if (huboArg) n++;
          opStack.pop();
          salida.push({ tipo: 'funcion', nombre: top.nombre, aridad: n });
          if (argSeen.length > 0) argSeen[argSeen.length - 1] = true;
        }
      }
      prev = tk;
    }

    while (opStack.length > 0) {
      const top = opStack.pop();
      if (top.tipo === 'lparen') throw new Error('Paréntesis desbalanceados: falta ")".');
      salida.push(top);
    }

    return salida;
  }

  // ── Evaluación RPN ─────────────────────────────────────────────────────────

  _evaluarRPN(rpn) {
    if (rpn.length === 0) throw new Error('Expresión vacía.');
    const pila = [];

    for (const tk of rpn) {
      if (tk.tipo === 'numero' || tk.tipo === 'cadena' || tk.tipo === 'booleano') {
        pila.push(tk.valor);
      } else if (tk.tipo === 'variable') {
        const clave = tk.nombre.toLowerCase();
        const entrada = this._scopes.lookup(tk.nombre);
        if (!entrada) throw new Error(`Variable "${tk.nombre}" no definida.`);
        if (!entrada.inicializada) throw new Error(`Variable "${tk.nombre}" no inicializada.`);
        if (!this._valores.has(clave)) {
          throw new Error(`Variable "${tk.nombre}" no tiene valor asignado.`);
        }
        pila.push(this._valores.get(clave));
      } else if (tk.tipo === 'indiceArreglo') {
        const clave = tk.nombre.toLowerCase();
        if (!this._arreglos || !this._arreglos.has(clave)) {
          throw new Error(`"${tk.nombre}" no es un arreglo.`);
        }
        const arr = this._arreglos.get(clave);
        const indices = tk.indices.map((idxExpr) => {
          const val = this.evaluar(idxExpr);
          if (typeof val !== 'number') throw new Error(`Índice de "${tk.nombre}" debe ser numérico.`);
          return Math.trunc(val);
        });
        pila.push(this._getElementoArreglo(arr, indices, tk.nombre));
      } else if (tk.tipo === 'op') {
        const meta = OPERADORES_PSEINT[tk.valor];
        if (!meta) throw new Error(`Operador desconocido: "${tk.valor}".`);
        if (meta.aridad === 1) {
          if (pila.length < 1) throw new Error(`Expresión mal formada cerca de "${meta.simbolo || tk.valor}".`);
          pila.push(meta.aplicar(pila.pop()));
        } else {
          if (pila.length < 2) throw new Error(`Expresión mal formada cerca de "${tk.valor}".`);
          const der = pila.pop();
          const izq = pila.pop();
          pila.push(meta.aplicar(izq, der));
        }
      } else if (tk.tipo === 'funcion') {
        const nombreUp = tk.nombre.toUpperCase();
        const builtin = this._builtins[nombreUp];
        if (!builtin) throw new Error(`Función "${tk.nombre}" no reconocida.`);
        if (pila.length < tk.aridad) throw new Error(`Llamada a "${tk.nombre}" mal formada.`);
        const args = new Array(tk.aridad);
        for (let j = tk.aridad - 1; j >= 0; j--) args[j] = pila.pop();
        // BUILTINS_PSEINT.fn puede ser variádico (aridad -1: CONCATENAR)
        let resultado;
        if (builtin.aridad === -1) {
          resultado = builtin.fn.apply(null, args);
        } else {
          if (tk.aridad !== builtin.aridad) {
            throw new Error(
              `La función "${tk.nombre}" espera ${builtin.aridad} argumento(s), recibió ${tk.aridad}.`
            );
          }
          resultado = builtin.fn.apply(null, args);
        }
        pila.push(resultado);
      }
    }

    if (pila.length !== 1) throw new Error('Expresión mal formada.');
    return pila[0];
  }

  // ── Soporte de arreglos ────────────────────────────────────────────────────

  /**
   * Registra el mapa de arreglos (usado por el runtime).
   * @param {Map<string, {datos: *, dimensiones: number[]}>} arreglos
   */
  setArreglos(arreglos) {
    this._arreglos = arreglos;
  }

  _getElementoArreglo(arr, indices, nombre) {
    const desdesCero = this._perfil.indicesDesde0 === true;
    if (indices.length === 1) {
      const idx = indices[0];
      if (desdesCero) {
        // Índices 0-based: válido de 0 a tamaño-1
        const tam = arr.datos.length - 1; // initDatos reserva tamaño+1
        if (idx < 0 || idx >= tam) {
          throw new Error(`Índice ${idx} fuera de rango en "${nombre}" (0 a ${tam - 1}).`);
        }
        return arr.datos[idx + 1]; // el arreglo interno sigue siendo 1-based internamente
      } else {
        if (idx < 1 || idx > arr.datos.length - 1) {
          throw new Error(`Índice ${idx} fuera de rango en "${nombre}".`);
        }
        return arr.datos[idx];
      }
    } else if (indices.length === 2) {
      const [i, j] = indices;
      if (desdesCero) {
        const tamI = arr.datos.length - 1;
        const tamJ = arr.datos[1].length - 1;
        if (i < 0 || i >= tamI) throw new Error(`Índice ${i} fuera de rango en "${nombre}" (0 a ${tamI - 1}).`);
        if (j < 0 || j >= tamJ) throw new Error(`Índice ${j} fuera de rango en "${nombre}" (0 a ${tamJ - 1}).`);
        return arr.datos[i + 1][j + 1];
      } else {
        if (i < 1 || i >= arr.datos.length) throw new Error(`Índice ${i} fuera de rango en "${nombre}".`);
        if (j < 1 || j >= arr.datos[i].length) throw new Error(`Índice ${j} fuera de rango en "${nombre}".`);
        return arr.datos[i][j];
      }
    }
    throw new Error(`Acceso a arreglo con ${indices.length} índices no soportado.`);
  }

  _setElementoArreglo(arr, indices, valor, nombre) {
    const desdesCero = this._perfil.indicesDesde0 === true;
    if (indices.length === 1) {
      const idx = indices[0];
      if (desdesCero) {
        const tam = arr.datos.length - 1;
        if (idx < 0 || idx >= tam) {
          throw new Error(`Índice ${idx} fuera de rango en "${nombre}" (0 a ${tam - 1}).`);
        }
        arr.datos[idx + 1] = valor;
      } else {
        if (idx < 1 || idx > arr.datos.length - 1) {
          throw new Error(`Índice ${idx} fuera de rango en "${nombre}".`);
        }
        arr.datos[idx] = valor;
      }
    } else if (indices.length === 2) {
      const [i, j] = indices;
      if (desdesCero) {
        const tamI = arr.datos.length - 1;
        const tamJ = arr.datos[1].length - 1;
        if (i < 0 || i >= tamI) throw new Error(`Índice ${i} fuera de rango en "${nombre}" (0 a ${tamI - 1}).`);
        if (j < 0 || j >= tamJ) throw new Error(`Índice ${j} fuera de rango en "${nombre}" (0 a ${tamJ - 1}).`);
        arr.datos[i + 1][j + 1] = valor;
      } else {
        if (i < 1 || i >= arr.datos.length) throw new Error(`Índice ${i} fuera de rango en "${nombre}".`);
        if (j < 1 || j >= arr.datos[i].length) throw new Error(`Índice ${j} fuera de rango en "${nombre}".`);
        arr.datos[i][j] = valor;
      }
    } else {
      throw new Error(`Asignación a arreglo con ${indices.length} índices no soportada.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Exportación CommonJS (Node.js / tests)
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EvaluadorPSeInt, OPERADORES_PSEINT };
}
