/**
 * ============================================================
 *  core/pseint/diagram-mapper.js — Diagrama NS para PSeInt (v1.0.0)
 * ============================================================
 *  Genera la estructura del diagrama Nassi-Shneiderman desde el AST
 *  de PSeInt producido por parsearPSeInt().
 *
 *  La estructura de retorno (DiagramaNodo) es compatible con el
 *  renderizador js/diagram.js (mismos tipos de nodo que LiteSeInt).
 *
 *  NO depende de la UI ni del DOM.
 *  Debe cargarse después de core/pseint/ast.js y core/pseint/parser.js.
 * ============================================================
 */

/* global module */

const DIAGRAMA_VERSION_PSEINT = 1;

// ─────────────────────────────────────────────
//  Generador de IDs únicos para nodos de diagrama
// ─────────────────────────────────────────────

let _dpCounter = 0;
function _dpId() { return 'dp' + (++_dpCounter); }

// ─────────────────────────────────────────────
//  Constructores internos de nodos de diagrama
// ─────────────────────────────────────────────

/**
 * Crea un nodo hoja (sin hijos).
 */
function _leaf(tipo, etiqueta, editable, campoEditable, astNodo, campoAST) {
  return {
    id: _dpId(),
    tipo: tipo,
    etiqueta: etiqueta,
    editable: !!editable,
    campoEditable: campoEditable || null,
    hijos: [],
    _nodoAST: astNodo || null,
    _campoAST: campoAST || null,
  };
}

/**
 * Crea un nodo contenedor (con hijos).
 */
function _bloque(tipo, etiqueta, hijos, astNodo, editable, campoEditable, campoAST) {
  return {
    id: _dpId(),
    tipo: tipo,
    etiqueta: etiqueta,
    editable: !!editable,
    campoEditable: campoEditable || null,
    hijos: hijos || [],
    _nodoAST: astNodo || null,
    _campoAST: campoAST || null,
  };
}

// ─────────────────────────────────────────────
//  Mapeador de nodos del AST PSeInt → DiagramaNodo
// ─────────────────────────────────────────────

function _mapearNodo(nodo) {
  if (!nodo) return null;

  switch (nodo.tipo) {

    // ── Instrucciones simples ──────────────────
    case 'Definir':
    case 'Asignar':
    case 'Dimension':
    case 'Retornar':
    case 'Ordenar':
      return _leaf('Leaf', nodo.texto || nodo.tipo, true, 'texto', nodo, 'texto');

    case 'Leer':
      return _leaf('Io', nodo.texto, true, 'texto', nodo, 'texto');

    case 'Escribir':
      return _leaf('Io', nodo.texto, true, 'texto', nodo, 'texto');

    case 'Llamar':
      // En PSeInt, nodoLlamar almacena el texto completo de la instrucción
      return _leaf('Leaf', nodo.texto || 'Llamar', false, null, nodo, null);

    case 'Desconocido':
      return _leaf('Desconocido', nodo.texto || '', false, null, nodo, null);

    // ── Condicional ───────────────────────────
    case 'Si': {
      const ramaVerdadero = _bloque(
        'SiRama', 'Verdadero',
        _mapearBloque(nodo.entonces || []),
        nodo, false, null, null
      );
      const ramaFalso = _bloque(
        'SiRama', nodo.sino ? 'Falso' : '',
        _mapearBloque(nodo.sino || []),
        nodo, false, null, null
      );
      return _bloque('Si', nodo.condicion, [ramaVerdadero, ramaFalso], nodo, true, 'condicion', 'condicion');
    }

    // ── Bucles ────────────────────────────────
    case 'Mientras':
      return _bloque(
        'BucleMientras', nodo.condicion,
        _mapearBloque(nodo.cuerpo || []),
        nodo, true, 'condicion', 'condicion'
      );

    case 'Repetir':
      return _bloque(
        'BucleRepetir', nodo.condicion,
        _mapearBloque(nodo.cuerpo || []),
        nodo, true, 'condicion', 'condicion'
      );

    case 'Para':
      // En PSeInt, nodoPara almacena el texto completo de la cabecera
      return _bloque(
        'BuclePara', nodo.texto || 'Para',
        _mapearBloque(nodo.cuerpo || []),
        nodo, false, null, null
      );

    // ── Segun ─────────────────────────────────
    case 'Segun': {
      // En PSeInt, nodoSegun usa `variable` (campo `expresion` no existe)
      const ramas = (nodo.casos || []).map(function (caso) {
        return _bloque(
          'CasoRama', (caso.valores || []).join(', '),
          _mapearBloque(caso.cuerpo || []),
          caso, false, null, null
        );
      });
      if (nodo.otro) {
        ramas.push(_bloque(
          'CasoRama', 'De Otro Modo',
          _mapearBloque(nodo.otro),
          nodo, false, null, null
        ));
      }
      return _bloque('Segun', nodo.variable, ramas, nodo, false, null, null);
    }

    // ── SubProceso (definición anidada — raro pero soportado) ──
    case 'SubProceso': {
      // En PSeInt, nodoSubProceso tiene `nombre` y `paramTexto` (texto crudo)
      const header = (nodo.nombre || 'SubProceso') +
        (nodo.paramTexto ? '(' + nodo.paramTexto + ')' : '()');
      return _bloque(
        'SubProceso', header,
        _mapearBloque(nodo.cuerpo || []),
        nodo, false, null, null
      );
    }

    default:
      return _leaf('Leaf', nodo.texto || '(' + nodo.tipo + ')', false, null, nodo, null);
  }
}

function _mapearBloque(nodos) {
  return (nodos || []).map(_mapearNodo).filter(function (n) { return n !== null; });
}

/**
 * Genera el nodo visual de un SubProceso de nivel superior.
 * @param {Object} sp — nodo SubProceso del mapa ast.subprocesos
 * @returns {DiagramaNodo}
 */
function _mapearSubProceso(sp) {
  const header = (sp.nombre || 'SubProceso') +
    (sp.paramTexto ? '(' + sp.paramTexto + ')' : '()');
  return _bloque('SubProceso', header, _mapearBloque(sp.cuerpo || []), sp, false, null, null);
}

// ─────────────────────────────────────────────
//  Función pública de mapeo
// ─────────────────────────────────────────────

/**
 * Convierte un AST Programa PSeInt en un árbol DiagramaNodo (NS).
 * Compatible con el renderizador js/diagram.js.
 *
 * @param {Object} ast — nodo Programa devuelto por parsearPSeInt
 * @returns {{ raiz: DiagramaNodo, version: number }}
 * @throws {Error} si ast no es un nodo Programa
 */
function mapear(ast) {
  if (!ast || ast.tipo !== 'Programa') {
    throw new Error('DiagramaMapperPSeInt.mapear: se esperaba un nodo Programa.');
  }

  _dpCounter = 0; // resetear para IDs consistentes en tests

  const nombre = ast.nombreAlgoritmo || 'Principal';

  // Bloque principal: Algoritmo … FinAlgoritmo
  const proceso = _bloque(
    'Proceso', 'Algoritmo ' + nombre,
    _mapearBloque(ast.cuerpo || []),
    ast, false, null, null
  );

  const hijos = [proceso];

  // SubProcesos / Funciones de nivel superior
  const sps = Object.values(ast.subprocesos || {});
  for (const sp of sps) {
    hijos.push(_mapearSubProceso(sp));
  }

  const raiz = _bloque('Programa', nombre, hijos, ast, false, null, null);
  return { raiz: raiz, version: DIAGRAMA_VERSION_PSEINT };
}

// ─────────────────────────────────────────────
//  Exportación
// ─────────────────────────────────────────────

var DiagramaMapperPSeInt = {
  DIAGRAMA_VERSION: DIAGRAMA_VERSION_PSEINT,
  mapear: mapear,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DiagramaMapperPSeInt;
}
