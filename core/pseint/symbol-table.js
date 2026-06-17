/**
 * ============================================================
 *  core/pseint/symbol-table.js — Tabla de Símbolos PSeInt
 * ============================================================
 *  TablaPSeInt:
 *    Mapa de variables con tipo PSeInt, estado de inicialización
 *    y metadatos de definición (nombre original, línea).
 *    Las claves se normalizan a minúsculas (PSeInt es case-
 *    insensitive).
 *
 *  ScopeChainPSeInt:
 *    Pila de TablaPSeInt para soportar scopes anidados
 *    (funciones / procedimientos). El frame 0 es el global.
 *    lookup() recorre la cadena de más local a más global.
 *
 *  TIPOS_PSEINT:
 *    Constantes de tipo del lenguaje (Entero, Real, Caracter,
 *    Cadena, Logico).
 *
 *  coercionarValor(valor, tipo):
 *    Convierte un valor JS al tipo PSeInt solicitado.
 *
 *  Script clásico — NO módulo ES. Compatible con browser y Node.
 * ============================================================
 */

/* global module */

'use strict';

// ---------------------------------------------------------------------------
// Tipos PSeInt
// ---------------------------------------------------------------------------

const TIPOS_PSEINT = Object.freeze({
  ENTERO:   'Entero',
  REAL:     'Real',
  CARACTER: 'Caracter',
  CADENA:   'Cadena',
  LOGICO:   'Logico',
});

// ---------------------------------------------------------------------------
// TablaPSeInt
// ---------------------------------------------------------------------------

class TablaPSeInt {
  constructor() {
    /**
     * @type {Map<string, {
     *   tipo: string|null,
     *   inicializada: boolean,
     *   lineaDefinicion: number,
     *   nombreOriginal: string
     * }>}
     */
    this.variables = new Map();
  }

  /**
   * Define una variable en la tabla.
   * Si ya existe con tipo null (pre-registrada), completa los datos.
   * @param {string} nombreOriginal
   * @param {string} tipo  — uno de TIPOS_PSEINT
   * @param {number} lineaIdx — índice de línea (0-based)
   */
  definir(nombreOriginal, tipo, lineaIdx) {
    const clave = nombreOriginal.toLowerCase();
    if (this.variables.has(clave)) {
      const existente = this.variables.get(clave);
      if (existente.tipo === null) {
        // Pre-registrada sin tipo; completar ahora.
        existente.tipo = tipo;
        existente.lineaDefinicion = lineaIdx;
        existente.nombreOriginal = nombreOriginal;
        return;
      }
      // Ya definida con tipo: sobreescribir (la nueva declaración gana).
      existente.tipo = tipo;
      existente.lineaDefinicion = lineaIdx;
      existente.nombreOriginal = nombreOriginal;
      existente.inicializada = false;
      return;
    }
    this.variables.set(clave, {
      tipo,
      inicializada: false,
      lineaDefinicion: lineaIdx,
      nombreOriginal,
    });
  }

  /**
   * Busca una variable por nombre (normaliza a minúsculas).
   * @param {string} nombre
   * @returns {{ tipo: string|null, inicializada: boolean, lineaDefinicion: number, nombreOriginal: string }|null}
   */
  buscar(nombre) {
    return this.variables.get(nombre.toLowerCase()) || null;
  }

  /**
   * Marca la variable como inicializada (tiene valor asignado).
   * @param {string} nombre
   */
  inicializar(nombre) {
    const entrada = this.variables.get(nombre.toLowerCase());
    if (entrada) entrada.inicializada = true;
  }

  /** @returns {boolean} */
  existeVariable(nombre) {
    return this.variables.has(nombre.toLowerCase());
  }

  /** @returns {boolean} */
  estaInicializada(nombre) {
    const entrada = this.variables.get(nombre.toLowerCase());
    return entrada ? entrada.inicializada : false;
  }

  /** @returns {string|null} */
  obtenerTipo(nombre) {
    const entrada = this.variables.get(nombre.toLowerCase());
    return entrada ? entrada.tipo : null;
  }

  /**
   * Lista todas las entradas de la tabla (para el inspector de variables).
   * @returns {Array<[string, object]>}
   */
  listar() {
    return [...this.variables.entries()];
  }

  /** Devuelve una copia profunda de la tabla. */
  clonar() {
    const copia = new TablaPSeInt();
    for (const [clave, entrada] of this.variables) {
      copia.variables.set(clave, { ...entrada });
    }
    return copia;
  }
}

// ---------------------------------------------------------------------------
// ScopeChainPSeInt
// ---------------------------------------------------------------------------

class ScopeChainPSeInt {
  constructor() {
    /** Pila de scopes; índice 0 = global, último = más local. */
    this._pilaScopes = [new TablaPSeInt()];
  }

  /** Devuelve el scope más local (el frame superior). */
  actual() {
    return this._pilaScopes[this._pilaScopes.length - 1];
  }

  /** Devuelve el scope global (frame base). */
  global() {
    return this._pilaScopes[0];
  }

  /** Abre un nuevo scope (al entrar en una función/procedimiento). */
  push() {
    this._pilaScopes.push(new TablaPSeInt());
  }

  /** Cierra el scope actual. No permite sacar el scope global. */
  pop() {
    if (this._pilaScopes.length > 1) {
      this._pilaScopes.pop();
    }
  }

  /**
   * Busca una variable desde el scope más local hasta el global.
   * @param {string} nombre
   * @returns {{ tipo: string|null, inicializada: boolean, lineaDefinicion: number, nombreOriginal: string }|null}
   */
  lookup(nombre) {
    for (let i = this._pilaScopes.length - 1; i >= 0; i--) {
      const sim = this._pilaScopes[i].buscar(nombre);
      if (sim) return sim;
    }
    return null;
  }

  /**
   * Define una variable en el scope actual.
   * @param {string} nombre
   * @param {string} tipo
   * @param {number} linea
   */
  definir(nombre, tipo, linea) {
    this.actual().definir(nombre, tipo, linea);
  }

  /** Inicializa (marca como asignada) en el scope donde vive la variable. */
  inicializar(nombre) {
    for (let i = this._pilaScopes.length - 1; i >= 0; i--) {
      if (this._pilaScopes[i].existeVariable(nombre)) {
        this._pilaScopes[i].inicializar(nombre);
        return;
      }
    }
  }

  /** Profundidad actual de la cadena (útil para depuración). */
  profundidad() {
    return this._pilaScopes.length;
  }
}

// ---------------------------------------------------------------------------
// coercionarValor
// ---------------------------------------------------------------------------

/**
 * Convierte un valor JS al tipo PSeInt dado.
 *
 * Tabla de conversiones implícitas soportadas:
 *   Entero  ← Real (trunca), Logico (0/1), Cadena numérica (parseFloat→trunc)
 *   Real    ← Entero, Logico (0.0/1.0), Cadena numérica (parseFloat)
 *   Logico  ← Entero/Real (0↔Falso, ≠0↔Verdadero), Cadena "Verdadero"/"Falso"
 *   Cadena  ← Entero/Real (String), Logico ("Verdadero"/"Falso"), Caracter
 *   Caracter← Cadena (primer carácter), Logico ("V"/"F", primer char de la cadena PSeInt)
 *
 * @param {*} valor
 * @param {string} tipo — uno de TIPOS_PSEINT
 * @returns {number|string|boolean}
 */
function coercionarValor(valor, tipo) {
  switch (tipo) {

    case TIPOS_PSEINT.ENTERO: {
      // Logico: true → 1, false → 0
      if (typeof valor === 'boolean') return valor ? 1 : 0;
      // Cadena: convertir vía parseFloat para soportar "3.9" → 3
      if (typeof valor === 'string') {
        const n = Math.trunc(parseFloat(valor));
        if (isNaN(n)) throw new Error('No se puede convertir "' + valor + '" a Entero.');
        return n;
      }
      // Number (Real → Entero: trunca)
      const ne = Math.trunc(Number(valor));
      if (isNaN(ne)) throw new Error('No se puede convertir "' + valor + '" a Entero.');
      return ne;
    }

    case TIPOS_PSEINT.REAL: {
      // Logico: true → 1.0, false → 0.0
      if (typeof valor === 'boolean') return valor ? 1 : 0;
      // Cadena: parseFloat (más estricto que Number para espacios intermedios)
      if (typeof valor === 'string') {
        const n = parseFloat(valor);
        if (isNaN(n)) throw new Error('No se puede convertir "' + valor + '" a Real.');
        return n;
      }
      // Entero → Real
      const nr = Number(valor);
      if (isNaN(nr)) throw new Error('No se puede convertir "' + valor + '" a Real.');
      return nr;
    }

    case TIPOS_PSEINT.CADENA:
      // Logico → "Verdadero" / "Falso" (no "true"/"false" de JS)
      if (valor === true)  return 'Verdadero';
      if (valor === false) return 'Falso';
      // Entero/Real/Caracter → representación de texto
      return String(valor);

    case TIPOS_PSEINT.CARACTER: {
      // Logico: coercionar primero a su representación PSeInt y tomar primer char
      if (valor === true)  return 'V';
      if (valor === false) return 'F';
      // Cadena/Entero/Real: primer carácter de la representación en texto
      return String(valor)[0] || '';
    }

    case TIPOS_PSEINT.LOGICO:
      if (typeof valor === 'string') {
        const v = valor.trim().toLowerCase();
        if (v === 'verdadero' || v === 'true'  || v === '1') return true;
        if (v === 'falso'     || v === 'false' || v === '0') return false;
        throw new Error('Valor Logico inválido: "' + valor + '". Use Verdadero o Falso.');
      }
      // Entero/Real: 0 → Falso, cualquier otro número → Verdadero
      return Boolean(valor);

    default:
      throw new Error('coercionarValor: tipo desconocido "' + tipo + '".');
  }
}

// ---------------------------------------------------------------------------
// Exportación (Node.js / CommonJS)
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TablaPSeInt, ScopeChainPSeInt, TIPOS_PSEINT, coercionarValor };
}
