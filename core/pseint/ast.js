/**
 * ============================================================
 *  core/pseint/ast.js — Definición del AST PSeInt (v1.0.0)
 * ============================================================
 *  Define el contrato de nodos del AST que produce core/pseint/parser.js.
 *
 *  Convenciones:
 *  - Los tipos de nodo van en PascalCase: Programa, Definir, Asignar, etc.
 *  - Cada nodo lleva `loc: { linea, columnaInicio, columnaFin }`.
 *  - El nodo raíz Programa lleva `astVersion`.
 *  - Las expresiones (condiciones, valores) se almacenan como texto crudo;
 *    el evaluador de expresiones las procesará en tiempo de ejecución.
 *
 *  Script clásico — NO módulo ES. Compatible con browser y Node.
 * ============================================================
 */

/* global module */

const AST_VERSION_PSEINT = 1;

/**
 * Construye un objeto loc para una línea completa.
 * @param {number} linea     - índice de línea (0-based)
 * @param {string} [lineaRaw] - texto crudo para calcular columnaFin
 */
function locDeLinea(linea, lineaRaw) {
  return {
    linea,
    columnaInicio: 0,
    columnaFin: lineaRaw ? lineaRaw.length : 0,
  };
}

/**
 * Nodo raíz. Contiene el cuerpo del bloque Algoritmo/Proceso y un mapa
 * de subprocesos indexados por nombre en minúsculas.
 */
function nodoPrograma(cuerpo, subprocesos, loc, nombreAlgoritmo) {
  return {
    tipo: 'Programa',
    astVersion: AST_VERSION_PSEINT,
    nombreAlgoritmo: nombreAlgoritmo || 'Principal',
    cuerpo,
    subprocesos,
    loc,
  };
}

/** Declaración de tipo: Definir x Como Entero */
function nodoDefinir(texto, loc) {
  return { tipo: 'Definir', texto, loc };
}

/** Asignación: variable <- expresion (texto = línea completa) */
function nodoAsignar(texto, loc) {
  return { tipo: 'Asignar', texto, loc };
}

/** Lectura: Leer x, y (texto = línea completa) */
function nodoLeer(texto, loc) {
  return { tipo: 'Leer', texto, loc };
}

/** Escritura: Escribir "texto", var (texto = línea completa) */
function nodoEscribir(texto, loc) {
  return { tipo: 'Escribir', texto, loc };
}

/** Declaración de arreglo: Dimension arr[10] */
function nodoDimension(texto, loc) {
  return { tipo: 'Dimension', texto, loc };
}

/**
 * Condicional Si/Sino/FinSi.
 * @param {string}   condicion - expresión cruda de la condición
 * @param {Array}    entonces  - nodos del bloque Si-Verdadero
 * @param {Array|null} sino    - nodos del bloque Sino (null si no existe)
 */
function nodoSi(condicion, entonces, sino, loc) {
  return { tipo: 'Si', condicion, entonces, sino, loc };
}

/**
 * Ciclo Mientras/FinMientras.
 * @param {string} condicion - expresión cruda de la condición
 * @param {Array}  cuerpo    - nodos del cuerpo del ciclo
 */
function nodoMientras(condicion, cuerpo, loc) {
  return { tipo: 'Mientras', condicion, cuerpo, loc };
}

/**
 * Ciclo Para/FinPara.
 * @param {string} texto  - la línea del Para completa (el runtime la parsea)
 * @param {Array}  cuerpo - nodos del cuerpo
 */
function nodoPara(texto, cuerpo, loc) {
  return { tipo: 'Para', texto, cuerpo, loc };
}

/**
 * Ciclo Repetir/Hasta Que.
 * @param {Array}  cuerpo    - nodos del cuerpo
 * @param {string} condicion - expresión cruda de la condición de parada
 */
function nodoRepetir(cuerpo, condicion, loc) {
  return { tipo: 'Repetir', cuerpo, condicion, loc };
}

/**
 * Selección Segun/FinSegun.
 * @param {string}     variable - nombre de variable o expresión
 * @param {Array}      casos    - array de nodoCaso
 * @param {Array|null} otro     - nodos del bloque De Otro Modo (null si no existe)
 */
function nodoSegun(variable, casos, otro, loc) {
  return { tipo: 'Segun', variable, casos, otro, loc };
}

/**
 * Caso dentro de Segun.
 * @param {Array}  valores - array de strings con los valores del caso
 * @param {Array}  cuerpo  - nodos del cuerpo del caso
 */
function nodoCaso(valores, cuerpo, loc) {
  return { tipo: 'Caso', valores, cuerpo, loc };
}

/**
 * Definición de SubProceso o Función.
 * @param {string}      nombre     - nombre en minúsculas
 * @param {string}      paramTexto - texto crudo de los parámetros
 * @param {Array}       cuerpo     - nodos del cuerpo
 */
function nodoSubProceso(nombre, paramTexto, cuerpo, loc) {
  return { tipo: 'SubProceso', nombre, paramTexto, cuerpo, loc };
}

/** Retornar valor dentro de un subproceso */
function nodoRetornar(texto, loc) {
  return { tipo: 'Retornar', texto, loc };
}

/** Llamada a subproceso como instrucción */
function nodoLlamar(texto, loc) {
  return { tipo: 'Llamar', texto, loc };
}

/** Ordenar(arreglo) o Ordenar(arreglo, n) */
function nodoOrdenar(texto, loc) {
  return { tipo: 'Ordenar', texto, loc };
}

/** Nodo comodín para instrucciones no reconocidas */
function nodoDesconocido(texto, loc) {
  return { tipo: 'Desconocido', texto, loc };
}

// ─────────────────────────────────────────────
//  Exportación CommonJS (Node.js / tests)
// ─────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AST_VERSION_PSEINT,
    locDeLinea,
    nodoPrograma,
    nodoDefinir,
    nodoAsignar,
    nodoLeer,
    nodoEscribir,
    nodoDimension,
    nodoSi,
    nodoMientras,
    nodoPara,
    nodoRepetir,
    nodoSegun,
    nodoCaso,
    nodoSubProceso,
    nodoRetornar,
    nodoLlamar,
    nodoOrdenar,
    nodoDesconocido,
  };
}
