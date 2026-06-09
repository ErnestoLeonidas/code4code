/**
 * ============================================================
 *  diagram-mapper.js — Diagrama Bidireccional (v1.9.0)
 * ============================================================
 *  Responsable de:
 *  - Serializar el AST a código fuente (astACodigo / nodoACodigo)
 *  - Generar la estructura del diagrama NS desde el AST (astADiagrama)
 *  - Normalizar el AST para comparaciones estructurales
 *
 *  NO depende de la UI ni del DOM.
 *  Debe cargarse después de core/ast.js y core/parser.js.
 * ============================================================
 */

const DIAGRAMA_VERSION = 1;

// ─────────────────────────────────────────────
//  CODE GENERATOR
// ─────────────────────────────────────────────

function _capTipo(tipo) {
  const m = { entero: 'Entero', real: 'Real', caracter: 'Caracter', logico: 'Logico' };
  return m[(tipo || '').toLowerCase()] || (tipo || '');
}

/**
 * Serializa un nodo del AST a líneas de código fuente.
 * @param {Object} nodo — nodo del AST
 * @param {string} indent — sangría actual (se usa 2 espacios por nivel)
 * @returns {string[]}
 */
function nodoACodigo(nodo, indent) {
  indent = indent || '';
  const I = indent;
  const I2 = indent + '  ';
  if (!nodo) return [];

  switch (nodo.tipo) {
    case 'Definir':
    case 'Asignar':
    case 'Leer':
    case 'Escribir':
    case 'Desconocido':
      return [I + nodo.texto];

    case 'Dimension': {
      const dims = (nodo.dimensiones || []).join(', ');
      return [I + 'Dimension ' + nodo.nombre + '[' + dims + ']'];
    }

    case 'AsignarIndice': {
      const idx = (nodo.indices || []).join(', ');
      return [I + nodo.nombre + '[' + idx + '] = ' + nodo.expresion];
    }

    case 'LeerIndice': {
      const idx = (nodo.indices || []).join(', ');
      return [I + 'Leer ' + nodo.nombre + '[' + idx + ']'];
    }

    case 'Llamar': {
      const args = (nodo.args || []).join(', ');
      return [I + 'Llamar ' + nodo.nombreOriginal + '(' + args + ')'];
    }

    case 'Si': {
      const lineas = [I + 'Si ' + nodo.condicion + ' Entonces'];
      for (const n of (nodo.entonces || [])) lineas.push.apply(lineas, nodoACodigo(n, I2));
      if (nodo.sino) {
        lineas.push(I + 'Sino');
        for (const n of nodo.sino) lineas.push.apply(lineas, nodoACodigo(n, I2));
      }
      lineas.push(I + 'FinSi');
      return lineas;
    }

    case 'Mientras': {
      const lineas = [I + 'Mientras ' + nodo.condicion + ' Hacer'];
      for (const n of (nodo.cuerpo || [])) lineas.push.apply(lineas, nodoACodigo(n, I2));
      lineas.push(I + 'FinMientras');
      return lineas;
    }

    case 'Repetir': {
      const lineas = [I + 'Repetir'];
      for (const n of (nodo.cuerpo || [])) lineas.push.apply(lineas, nodoACodigo(n, I2));
      lineas.push(I + 'HastaQue ' + nodo.condicion);
      return lineas;
    }

    case 'Para': {
      let header = 'Para ' + nodo.variableOriginal + ' = ' + nodo.desde + ' Hasta ' + nodo.hasta;
      if (nodo.paso && nodo.paso !== '1') header += ' Con Paso ' + nodo.paso;
      header += ' Hacer';
      const lineas = [I + header];
      for (const n of (nodo.cuerpo || [])) lineas.push.apply(lineas, nodoACodigo(n, I2));
      lineas.push(I + 'FinPara');
      return lineas;
    }

    case 'Segun': {
      const lineas = [I + 'Segun ' + nodo.expresion + ' Hacer'];
      for (const caso of (nodo.casos || [])) {
        lineas.push(I2 + caso.valores.join(', ') + ':');
        for (const n of (caso.cuerpo || [])) lineas.push.apply(lineas, nodoACodigo(n, I2 + '  '));
      }
      if (nodo.otro) {
        lineas.push(I2 + 'De Otro Modo:');
        for (const n of nodo.otro) lineas.push.apply(lineas, nodoACodigo(n, I2 + '  '));
      }
      lineas.push(I + 'FinSegun');
      return lineas;
    }

    case 'SubProceso': {
      const keyword = nodo.esFuncion ? 'Funcion' : 'SubProceso';
      const finKeyword = nodo.esFuncion ? 'FinFuncion' : 'FinSubProceso';
      const paramsStr = (nodo.params || []).map(function(p) {
        const prefix = p.porReferencia ? 'Por Referencia ' : '';
        const tipoStr = p.tipo ? ' Como ' + _capTipo(p.tipo) : '';
        return prefix + p.nombreOriginal + tipoStr;
      }).join(', ');
      const header = nodo.retorno
        ? keyword + ' ' + nodo.retorno + ' = ' + nodo.nombreOriginal + '(' + paramsStr + ')'
        : keyword + ' ' + nodo.nombreOriginal + '(' + paramsStr + ')';
      const lineas = [I + header];
      for (const n of (nodo.cuerpo || [])) lineas.push.apply(lineas, nodoACodigo(n, I2));
      lineas.push(I + finKeyword);
      return lineas;
    }

    default:
      return [];
  }
}

/**
 * Serializa un AST completo a código fuente pseudocódigo.
 * @param {Object} ast — nodo Programa
 * @returns {string}
 */
function astACodigo(ast) {
  const lineas = [];

  // SubProcesos primero (en el orden en que aparecen)
  const sps = Object.values(ast.subprocesos || {});
  for (const sp of sps) {
    lineas.push.apply(lineas, nodoACodigo(sp, ''));
    lineas.push('');
  }

  // Proceso principal
  const nombre = ast.nombreProceso || 'Principal';
  lineas.push('Proceso ' + nombre);
  for (const nodo of (ast.cuerpo || [])) {
    lineas.push.apply(lineas, nodoACodigo(nodo, '  '));
  }
  lineas.push('FinProceso');

  return lineas.join('\n');
}

// ─────────────────────────────────────────────
//  AST NORMALIZER (para comparaciones estructurales)
// ─────────────────────────────────────────────

/**
 * Devuelve una copia del AST sin los campos loc / locHastaQue.
 * Útil para comparar la estructura semántica sin depender de posiciones.
 * @param {*} nodo
 * @returns {*}
 */
function normalizarASTParaComparacion(nodo) {
  if (nodo === null || nodo === undefined) return nodo;
  if (Array.isArray(nodo)) return nodo.map(normalizarASTParaComparacion);
  if (typeof nodo === 'object') {
    const copia = {};
    for (const k of Object.keys(nodo)) {
      if (k === 'loc' || k === 'locHastaQue') continue;
      copia[k] = normalizarASTParaComparacion(nodo[k]);
    }
    return copia;
  }
  return nodo;
}

// ─────────────────────────────────────────────
//  DIAGRAM BUILDER (NS — Nassi-Shneiderman)
// ─────────────────────────────────────────────
//
//  astADiagrama(ast) produces a tree of DiagramaNodo objects.
//  Each node stores its own content and children, but NOT absolute pixel
//  positions — the renderer computes those in one top-down pass.
//
//  DiagramaNodo shape:
//  {
//    id: string,              unique id ('dn1', 'dn2', …)
//    tipo: string,            see TIPOS below
//    etiqueta: string,        display text
//    editable: boolean,       can the user click to edit this node?
//    campoEditable: string|null,  which AST field to update ('condicion', 'texto', etc.)
//    hijos: DiagramaNodo[],   child nodes (blocks / branches)
//    _nodoAST: Object|null,   reference to original AST node
//    _campoAST: string|null,  field on _nodoAST that stores etiqueta
//  }
//
//  TIPOS:
//    'Inicio'         — terminal node marking start of a block
//    'Fin'            — terminal node marking end of a block
//    'Proceso'        — top-level Proceso block (container)
//    'SubProceso'     — top-level SubProceso block (container)
//    'Leaf'           — single-line instruction
//    'Io'             — I/O instruction (Leer / Escribir)
//    'Si'             — conditional (children: SiRama x 2)
//    'SiRama'         — one branch of a Si (children: leaf nodes in that branch)
//    'BucleMientras'  — Mientras loop (children: body nodes)
//    'BucleRepetir'   — Repetir loop (children: body nodes)
//    'BuclePara'      — Para loop (children: body nodes)
//    'Segun'          — Segun block (children: CasoRama)
//    'CasoRama'       — one branch of a Segun
//    'Desconocido'    — unrecognized instruction

let _dnCounter = 0;
function _dnId() { return 'dn' + (++_dnCounter); }

function _leaf(tipo, etiqueta, editable, campoEditable, astNodo, campoAST) {
  return {
    id: _dnId(),
    tipo: tipo,
    etiqueta: etiqueta,
    editable: !!editable,
    campoEditable: campoEditable || null,
    hijos: [],
    _nodoAST: astNodo || null,
    _campoAST: campoAST || null,
  };
}

function _bloque(tipo, etiqueta, hijos, astNodo, editable, campoEditable, campoAST) {
  return {
    id: _dnId(),
    tipo: tipo,
    etiqueta: etiqueta,
    editable: !!editable,
    campoEditable: campoEditable || null,
    hijos: hijos || [],
    _nodoAST: astNodo || null,
    _campoAST: campoAST || null,
  };
}

function _mapearNodo(nodo) {
  if (!nodo) return null;
  switch (nodo.tipo) {
    case 'Definir':
    case 'Asignar':
    case 'Dimension':
    case 'AsignarIndice':
    case 'LeerIndice':
      return _leaf('Leaf', nodo.texto || _labelNodo(nodo), true, 'texto', nodo, 'texto');

    case 'Leer':
      return _leaf('Io', nodo.texto, true, 'texto', nodo, 'texto');

    case 'Escribir':
      return _leaf('Io', nodo.texto, true, 'texto', nodo, 'texto');

    case 'Llamar':
      return _leaf('Leaf', 'Llamar ' + nodo.nombreOriginal + '(' + (nodo.args || []).join(', ') + ')', false, null, nodo, null);

    case 'Desconocido':
      return _leaf('Desconocido', nodo.texto, false, null, nodo, null);

    case 'Si': {
      const ramaTrue = _bloque('SiRama', 'Verdadero', _mapearBloque(nodo.entonces || []), nodo, false, null, null);
      const ramaFalse = _bloque('SiRama', nodo.sino ? 'Falso' : '', _mapearBloque(nodo.sino || []), nodo, false, null, null);
      return _bloque('Si', nodo.condicion, [ramaTrue, ramaFalse], nodo, true, 'condicion', 'condicion');
    }

    case 'Mientras':
      return _bloque('BucleMientras', nodo.condicion, _mapearBloque(nodo.cuerpo || []), nodo, true, 'condicion', 'condicion');

    case 'Repetir':
      return _bloque('BucleRepetir', nodo.condicion, _mapearBloque(nodo.cuerpo || []), nodo, true, 'condicion', 'condicion');

    case 'Para': {
      let etiq = 'Para ' + nodo.variableOriginal + ' = ' + nodo.desde + ' Hasta ' + nodo.hasta;
      if (nodo.paso && nodo.paso !== '1') etiq += ' Con Paso ' + nodo.paso;
      return _bloque('BuclePara', etiq, _mapearBloque(nodo.cuerpo || []), nodo, false, null, null);
    }

    case 'Segun': {
      const ramas = (nodo.casos || []).map(function(caso) {
        return _bloque('CasoRama', caso.valores.join(', '), _mapearBloque(caso.cuerpo || []), caso, false, null, null);
      });
      if (nodo.otro) {
        ramas.push(_bloque('CasoRama', 'De Otro Modo', _mapearBloque(nodo.otro), nodo, false, null, null));
      }
      return _bloque('Segun', nodo.expresion, ramas, nodo, true, 'expresion', 'expresion');
    }

    default:
      return _leaf('Leaf', nodo.texto || '(' + nodo.tipo + ')', false, null, nodo, null);
  }
}

function _labelNodo(nodo) {
  if (nodo.texto) return nodo.texto;
  if (nodo.tipo === 'Dimension') return 'Dimension ' + nodo.nombre + '[' + (nodo.dimensiones || []).join(', ') + ']';
  if (nodo.tipo === 'AsignarIndice') return nodo.nombre + '[' + (nodo.indices || []).join(', ') + '] = ' + nodo.expresion;
  if (nodo.tipo === 'LeerIndice') return 'Leer ' + nodo.nombre + '[' + (nodo.indices || []).join(', ') + ']';
  return nodo.tipo;
}

function _mapearBloque(nodos) {
  return (nodos || []).map(_mapearNodo).filter(function(n) { return n !== null; });
}

function _mapearSubProceso(sp) {
  const keyword = sp.esFuncion ? 'Funcion' : 'SubProceso';
  const paramsStr = (sp.params || []).map(function(p) {
    const prefix = p.porReferencia ? 'Por Referencia ' : '';
    const tipoStr = p.tipo ? ' Como ' + _capTipo(p.tipo) : '';
    return prefix + p.nombreOriginal + tipoStr;
  }).join(', ');
  const header = sp.retorno
    ? keyword + ' ' + sp.retorno + ' = ' + sp.nombreOriginal + '(' + paramsStr + ')'
    : keyword + ' ' + sp.nombreOriginal + '(' + paramsStr + ')';
  return _bloque('SubProceso', header, _mapearBloque(sp.cuerpo || []), sp, false, null, null);
}

/**
 * Convierte un AST Programa en un árbol de DiagramaNodo (NS diagram).
 * @param {Object} ast — nodo Programa devuelto por parsearPrograma
 * @returns {{ raiz: DiagramaNodo, version: number }}
 */
function astADiagrama(ast) {
  if (!ast || ast.tipo !== 'Programa') {
    throw new Error('astADiagrama: se esperaba un nodo Programa.');
  }

  _dnCounter = 0; // reset id counter for consistent ids in tests

  const nombre = ast.nombreProceso || 'Principal';
  const proceso = _bloque('Proceso', 'Proceso ' + nombre, _mapearBloque(ast.cuerpo || []), ast, false, null, null);

  const hijos = [proceso];
  const sps = Object.values(ast.subprocesos || {});
  for (const sp of sps) {
    hijos.push(_mapearSubProceso(sp));
  }

  const raiz = _bloque('Programa', nombre, hijos, ast, false, null, null);
  return { raiz: raiz, version: DIAGRAMA_VERSION };
}

// ─────────────────────────────────────────────
//  DIAGRAM → AST (para el roundtrip de edición)
// ─────────────────────────────────────────────

/**
 * Dado un DiagramaNodo con _nodoAST references modificadas,
 * devuelve el AST original (la edición modifica _nodoAST in-place,
 * por lo que el AST ya está actualizado). Útil para regenerar código.
 * @param {{ raiz: DiagramaNodo }} diagrama
 * @returns {Object} — nodo Programa (el mismo que pasó a astADiagrama, con campos editados)
 */
function diagramaAAst(diagrama) {
  if (!diagrama || !diagrama.raiz || !diagrama.raiz._nodoAST) {
    throw new Error('diagramaAAst: diagrama inválido.');
  }
  return diagrama.raiz._nodoAST;
}

// ─────────────────────────────────────────────
//  EXPORT
// ─────────────────────────────────────────────

const LiteSeIntDiagrama = {
  DIAGRAMA_VERSION,
  nodoACodigo,
  astACodigo,
  astADiagrama,
  diagramaAAst,
  normalizarASTParaComparacion,
};
