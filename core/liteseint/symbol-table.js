/**
 * ============================================================
 *  symbol-table.js — Tabla de Símbolos y Cadena de Scopes
 * ============================================================
 *  TablaSimbolos:
 *    Mapa por nombre normalizado (lowercase) que el validador
 *    estático y el runtime usan para llevar tipo, inicialización,
 *    nombre original y línea de definición de cada variable.
 *
 *  ScopeChain:
 *    Pila de TablaSimbolos para soportar múltiples scopes anidados.
 *    En v1.1.0 solo existe el scope global, pero la cadena queda
 *    instalada para que `v1.8.0` (SubProceso/Funcion) la consuma
 *    sin rehacer la estructura interna.
 *
 *    Convención de búsqueda: `lookup(nombre)` recorre la cadena
 *    desde el frame superior (el más reciente) hacia el global,
 *    devolviendo la primera TablaSimbolos que contiene el nombre.
 *    `actual()` apunta al frame superior; `global()` al frame base.
 *
 *  No depende de la UI ni del runtime.
 * ============================================================
 */

class TablaSimbolos {
  constructor() {
    /** @type {Map<string, {tipo: string, inicializada: boolean, lineaDefinicion: number, nombreOriginal: string}>} */
    this.variables = new Map();
  }

  definir(nombreOriginal, tipo, lineaIdx) {
    const key = nombreOriginal.toLowerCase();
    if (this.variables.has(key)) {
      const existing = this.variables.get(key);
      if (existing.tipo === null) {
        // Pre-registrado por dimensionar(); ahora se completa con el tipo.
        existing.tipo = tipo;
        existing.lineaDefinicion = lineaIdx;
        return;
      }
    }
    this.variables.set(key, {
      tipo,
      inicializada: false,
      lineaDefinicion: lineaIdx,
      nombreOriginal,
    });
  }

  dimensionar(nombreOriginal, dimensiones, lineaIdx) {
    const key = nombreOriginal.toLowerCase();
    if (this.variables.has(key)) {
      this.variables.get(key).dimensiones = dimensiones;
    } else {
      this.variables.set(key, {
        tipo: null,
        inicializada: false,
        lineaDefinicion: lineaIdx,
        nombreOriginal,
        dimensiones,
      });
    }
  }

  obtenerDimensiones(nombre) {
    const v = this.variables.get(nombre.toLowerCase());
    return v ? (v.dimensiones || null) : null;
  }

  esArreglo(nombre) {
    const v = this.variables.get(nombre.toLowerCase());
    return !!(v && Array.isArray(v.dimensiones));
  }

  existeVariable(nombre) {
    return this.variables.has(nombre.toLowerCase());
  }

  estaInicializada(nombre) {
    const v = this.variables.get(nombre.toLowerCase());
    return v ? v.inicializada : false;
  }

  marcarInicializada(nombre) {
    const v = this.variables.get(nombre.toLowerCase());
    if (v) v.inicializada = true;
  }

  obtenerTipo(nombre) {
    const v = this.variables.get(nombre.toLowerCase());
    return v ? v.tipo : null;
  }

  obtenerNombres() {
    return Array.from(this.variables.values()).map(v => v.nombreOriginal);
  }

  clonar() {
    const copia = new TablaSimbolos();
    for (const [key, val] of this.variables) {
      const entrada = { ...val };
      if (Array.isArray(val.dimensiones)) entrada.dimensiones = [...val.dimensiones];
      copia.variables.set(key, entrada);
    }
    return copia;
  }
}

class ScopeChain {
  constructor() {
    this.scopes = [new TablaSimbolos()];
  }

  actual() {
    return this.scopes[this.scopes.length - 1];
  }

  global() {
    return this.scopes[0];
  }

  push() {
    const nuevo = new TablaSimbolos();
    this.scopes.push(nuevo);
    return nuevo;
  }

  pop() {
    if (this.scopes.length <= 1) {
      throw new Error('No se puede salir del scope global.');
    }
    return this.scopes.pop();
  }

  /**
   * Busca un nombre desde el frame actual hacia el global.
   * Devuelve la TablaSimbolos que lo contiene, o null si no existe.
   */
  lookup(nombre) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const tabla = this.scopes[i];
      if (tabla.existeVariable(nombre)) return tabla;
    }
    return null;
  }

  profundidad() {
    return this.scopes.length;
  }
}

const LiteSeIntSymbolTable = {
  TablaSimbolos,
  ScopeChain,
};
