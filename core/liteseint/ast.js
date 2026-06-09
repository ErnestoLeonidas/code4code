/**
 * ============================================================
 *  ast.js — Definición del AST LiteSeInt (v1.1.0)
 * ============================================================
 *  Define el contrato de nodos del AST que produce core/parser.js
 *  y que core/runtime.js consumirá a partir de v1.2.0 / F4 de v1.1.0.
 *
 *  Convenciones:
 *  - Los tipos de nodo van en PascalCase: Programa, Definir, Asignar,
 *    Leer, Escribir, Si, Mientras, Para, Repetir, Segun, Caso.
 *  - Cada nodo lleva `loc: { linea, columnaInicio, columnaFin }`.
 *  - El nodo raíz Programa lleva `astVersion`.
 *  - astVersion se sube cuando se agregan/cambian nodos del lenguaje.
 *
 *  v1.1.0 cubre los nodos del dialecto 1.0. Los nodos `Llamar`,
 *  `SubProceso`, `Dimension` mencionados en el roadmap entran en
 *  v1.6.0 y v1.8.0 (no en v1.1.0).
 *
 *  No depende de la UI ni del runtime.
 * ============================================================
 */

const AST_VERSION = 5;

function locDeLinea(linea, lineaRaw) {
  return {
    linea,
    columnaInicio: 0,
    columnaFin: lineaRaw ? lineaRaw.length : 0,
  };
}

function nodoPrograma(cuerpo, subprocesos, loc, nombreProceso) {
  return { tipo: 'Programa', astVersion: AST_VERSION, cuerpo, subprocesos, nombreProceso: nombreProceso || 'Principal', loc };
}

function nodoDefinir(texto, loc) {
  return { tipo: 'Definir', texto, loc };
}

function nodoAsignar(texto, loc) {
  return { tipo: 'Asignar', texto, loc };
}

function nodoLeer(texto, loc) {
  return { tipo: 'Leer', texto, loc };
}

function nodoEscribir(texto, loc) {
  return { tipo: 'Escribir', texto, loc };
}

function nodoSi(condicion, entonces, sino, loc) {
  return { tipo: 'Si', condicion, entonces, sino, loc };
}

function nodoMientras(condicion, cuerpo, loc) {
  return { tipo: 'Mientras', condicion, cuerpo, loc };
}

function nodoRepetir(cuerpo, condicion, locInicio, locFin) {
  return { tipo: 'Repetir', cuerpo, condicion, loc: locInicio, locHastaQue: locFin };
}

function nodoPara(variable, variableOriginal, desde, hasta, paso, cuerpo, loc) {
  return { tipo: 'Para', variable, variableOriginal, desde, hasta, paso, cuerpo, loc };
}

function nodoSegun(expresion, casos, otro, loc) {
  return { tipo: 'Segun', expresion, casos, otro, loc };
}

function nodoCaso(valores, cuerpo) {
  return { tipo: 'Caso', valores, cuerpo };
}

function nodoDimension(nombre, dimensiones, loc) {
  return { tipo: 'Dimension', nombre, dimensiones, loc };
}

function nodoAsignarIndice(nombre, indices, expresion, loc) {
  return { tipo: 'AsignarIndice', nombre, indices, expresion, loc };
}

function nodoLeerIndice(nombre, indices, loc) {
  return { tipo: 'LeerIndice', nombre, indices, loc };
}

/**
 * SubProceso / Funcion definition node.
 * params: [{ nombre, nombreOriginal, tipo, porReferencia }]
 * retorno: lowercase var name for return value, or null.
 */
function nodoSubProceso(nombre, nombreOriginal, retorno, params, esFuncion, cuerpo, loc) {
  return { tipo: 'SubProceso', nombre, nombreOriginal, retorno, params, esFuncion, cuerpo, loc };
}

/**
 * Call to a SubProceso/Funcion.
 * args: array of expression strings.
 * varRetorno: lowercase variable name that receives the return, or null.
 */
function nodoLlamar(nombre, nombreOriginal, args, varRetorno, loc) {
  return { tipo: 'Llamar', nombre, nombreOriginal, args, varRetorno, loc };
}

function nodoDesconocido(texto, loc) {
  return { tipo: 'Desconocido', texto, loc };
}

/**
 * Serializa un AST a JSON estable. Los nodos son objetos planos
 * sin ciclos, así que JSON.stringify es suficiente.
 */
function serializarAST(ast) {
  return JSON.stringify(ast);
}

/**
 * Deserializa un AST desde JSON. No valida el shape; eso queda
 * para los consumidores (parser/runtime).
 */
function deserializarAST(json) {
  return JSON.parse(json);
}

const LiteSeIntAST = {
  AST_VERSION,
  locDeLinea,
  nodoPrograma,
  nodoDefinir,
  nodoAsignar,
  nodoLeer,
  nodoEscribir,
  nodoSi,
  nodoMientras,
  nodoRepetir,
  nodoPara,
  nodoSegun,
  nodoCaso,
  nodoDimension,
  nodoAsignarIndice,
  nodoLeerIndice,
  nodoSubProceso,
  nodoLlamar,
  nodoDesconocido,
  serializarAST,
  deserializarAST,
};
