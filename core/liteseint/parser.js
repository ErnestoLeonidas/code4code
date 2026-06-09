/**
 * ============================================================
 *  parser.js — Construcción del AST LiteSeInt (v1.8.0)
 * ============================================================
 *  parsearPrograma(codigo) returns the Programa AST consumed by
 *  the runtime. Supports multiple top-level blocks:
 *    Proceso Principal ... FinProceso
 *    SubProceso / Funcion ... FinSubProceso / FinFuncion
 *
 *  SubProceso blocks may appear before or after Proceso.
 *  No static errors are emitted — unrecognized lines become
 *  Desconocido nodes; the runtime turns them into runtime errors.
 * ============================================================
 */

const _REGEX_HASTAQUE_PARSER = /^(?:hastaque|hasta\s+que)\s+(.+)$/i;

function _encontrarPosAsignacionParser(linea) {
  let inStr = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '=') {
      const prev = linea[i - 1];
      const next = linea[i + 1];
      if (prev === '=' || prev === '<' || prev === '>' || prev === '!') continue;
      if (next === '=') { i++; continue; }
      return i;
    }
  }
  return -1;
}

/** Split a comma-separated arg string respecting nested parentheses and strings. */
function _splitArgsPorComas(str) {
  str = str.trim();
  if (!str) return [];
  const parts = [];
  let current = '';
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"') { inStr = !inStr; current += ch; continue; }
    if (inStr) { current += ch; continue; }
    if (ch === '(' || ch === '[') { depth++; current += ch; continue; }
    if (ch === ')' || ch === ']') { depth--; current += ch; continue; }
    if (ch === ',' && depth === 0) {
      const t = current.trim();
      if (t) parts.push(t);
      current = '';
    } else {
      current += ch;
    }
  }
  const t = current.trim();
  if (t) parts.push(t);
  return parts;
}

/**
 * Parse SubProceso parameter list string.
 * Accepts:
 *   nombre Como Tipo
 *   Por Referencia nombre Como Tipo
 *   Por Valor nombre Como Tipo
 */
function _parsearParams(paramStr) {
  paramStr = paramStr.trim();
  if (!paramStr) return [];

  const params = [];
  const parts = _splitArgsPorComas(paramStr);

  for (const part of parts) {
    let rest = part.trim();
    if (!rest) continue;

    let porReferencia = false;
    if (/^por\s+referencia\s+/i.test(rest)) {
      porReferencia = true;
      rest = rest.replace(/^por\s+referencia\s+/i, '').trim();
    } else if (/^por\s+valor\s+/i.test(rest)) {
      rest = rest.replace(/^por\s+valor\s+/i, '').trim();
    }

    const m = rest.match(/^(\w+)\s+como\s+(entero|real|caracter|logico)$/i);
    if (m) {
      params.push({
        nombre: m[1].toLowerCase(),
        nombreOriginal: m[1],
        tipo: m[2].toLowerCase(),
        porReferencia,
      });
    } else {
      const mName = rest.match(/^(\w+)/);
      if (mName) {
        params.push({
          nombre: mName[1].toLowerCase(),
          nombreOriginal: mName[1],
          tipo: null,
          porReferencia,
        });
      }
    }
  }
  return params;
}

/**
 * Parse the header of a SubProceso/Funcion line.
 * `keyword` = 'subproceso' | 'funcion'
 * `resto`   = the part after the keyword
 *
 * Accepted forms:
 *   Nombre(params)                → void subproceso
 *   retorno = Nombre(params)      → subproceso with return value
 */
function _parsearCabeceraSubProceso(keyword, resto, lineaIdx, lineaRaw) {
  const esFuncion = /^funcion$/i.test(keyword);
  const loc = locDeLinea(lineaIdx, lineaRaw);

  // Form: retorno = Nombre(params)
  const matchFn = resto.match(/^(\w+)\s*=\s*(\w+)\s*\(([^)]*)\)$/);
  if (matchFn) {
    const retorno       = matchFn[1].toLowerCase();
    const nombreOriginal = matchFn[2];
    const params        = _parsearParams(matchFn[3]);
    return nodoSubProceso(nombreOriginal.toLowerCase(), nombreOriginal, retorno, params, esFuncion, [], loc);
  }

  // Form: Nombre(params) or Nombre()
  const matchVoid = resto.match(/^(\w+)\s*\(([^)]*)\)$/);
  if (matchVoid) {
    const nombreOriginal = matchVoid[1];
    const params        = _parsearParams(matchVoid[2]);
    return nodoSubProceso(nombreOriginal.toLowerCase(), nombreOriginal, null, params, esFuncion, [], loc);
  }

  // Fallback: just a name (no parens — malformed header)
  const mName = resto.match(/^(\w+)/);
  const nombre = mName ? mName[1] : 'desconocido';
  return nodoSubProceso(nombre.toLowerCase(), nombre, null, [], esFuncion, [], loc);
}

/**
 * Build a simple (non-block) AST node from a single normalized line.
 * Unrecognized lines become Desconocido so the runtime catches them.
 */
function _crearNodoSimpleAST(linea, lineaIdx, lineaRaw) {
  const loc = locDeLinea(lineaIdx, lineaRaw);

  if (/^definir\s+/i.test(linea))  return nodoDefinir(linea, loc);
  if (/^escribir\s+/i.test(linea)) return nodoEscribir(linea, loc);

  // Leer arr[idx] must be matched before plain Leer
  const leerArrMatch = linea.match(/^leer\s+(\w+)\s*\[([^\]]*)\]$/i);
  if (leerArrMatch) {
    const indices = leerArrMatch[2].split(',').map(s => s.trim());
    return nodoLeerIndice(leerArrMatch[1], indices, loc);
  }

  if (/^leer\s+/i.test(linea)) return nodoLeer(linea, loc);

  // Llamar SubProceso(args) — void call statement
  const llamarMatch = linea.match(/^llamar\s+(\w+)\s*\(([^)]*)\)$/i);
  if (llamarMatch) {
    const nombreOriginal = llamarMatch[1];
    const args = _splitArgsPorComas(llamarMatch[2]);
    return nodoLlamar(nombreOriginal.toLowerCase(), nombreOriginal, args, null, loc);
  }
  // Llamar with no parens (malformed but absorb gracefully)
  const llamarNoParMatch = linea.match(/^llamar\s+(\w+)\s*$/i);
  if (llamarNoParMatch) {
    const nombreOriginal = llamarNoParMatch[1];
    return nodoLlamar(nombreOriginal.toLowerCase(), nombreOriginal, [], null, loc);
  }

  // Dimension nombre[n] or Dimension nombre[n, m]
  const dimMatch = linea.match(/^dimension\s+(\w+)\s*\[([^\]]*)\]$/i);
  if (dimMatch) {
    const nombre = dimMatch[1];
    const dimensiones = dimMatch[2].split(',').map(s => {
      const t = s.trim();
      const n = parseInt(t, 10);
      return isNaN(n) ? t : n;
    });
    return nodoDimension(nombre, dimensiones, loc);
  }

  // nombre[idx] = expr  (array element assignment)
  const arrAssignMatch = linea.match(/^(\w+)\s*\[([^\]]*)\]\s*=(?!=)\s*(.+)$/i);
  if (arrAssignMatch) {
    const nombre = arrAssignMatch[1];
    const indices = arrAssignMatch[2].split(',').map(s => s.trim());
    const expresion = arrAssignMatch[3].trim();
    return nodoAsignarIndice(nombre, indices, expresion, loc);
  }

  // Regular assignment: var = expr
  if (_encontrarPosAsignacionParser(linea) >= 0) return nodoAsignar(linea, loc);

  return nodoDesconocido(linea, loc);
}

/**
 * Main parser entry point.
 * Returns { tipo:'Programa', astVersion, cuerpo, subprocesos, loc }
 */
function parsearPrograma(codigo) {
  const lineas = codigo.split('\n');
  const cuerpoRaiz = [];
  const subprocesos = {};
  const stack = [];           // block nesting stack (Si, Mientras, etc.)
  let bloqueActual = null;    // null when between top-level blocks
  let contextActual = null;   // 'proceso' | 'subproceso' | null
  let spActual = null;        // SubProceso node being built
  let nombreProceso = 'Principal';

  for (let i = 0; i < lineas.length; i++) {
    const lineaRaw = lineas[i].trim();
    const linea = stripComment(lineaRaw);
    if (linea === '') continue;

    // ── Top-level block entry/exit ──────────────────────────

    if (/^proceso(\s+\S+)?$/i.test(linea)) {
      const mProc = linea.match(/^proceso\s+(\S+)\s*$/i);
      if (mProc) nombreProceso = mProc[1];
      contextActual = 'proceso';
      bloqueActual = cuerpoRaiz;
      stack.length = 0;
      continue;
    }
    if (/^finproceso$/i.test(linea)) {
      contextActual = null;
      bloqueActual = null;
      stack.length = 0;
      continue;
    }

    // SubProceso/Funcion at top level (not inside Proceso)
    const spMatch = linea.match(/^(subproceso|funcion)\s+(.+)$/i);
    if (spMatch && contextActual === null) {
      spActual = _parsearCabeceraSubProceso(spMatch[1], spMatch[2], i, lineaRaw);
      contextActual = 'subproceso';
      bloqueActual = spActual.cuerpo;
      stack.length = 0;
      continue;
    }

    // FinSubProceso/FinFuncion at top of inner stack
    if ((/^finsubproceso$/i.test(linea) || /^finfuncion$/i.test(linea)) && stack.length === 0) {
      if (contextActual === 'subproceso' && spActual) {
        subprocesos[spActual.nombre] = spActual;
      }
      spActual = null;
      contextActual = null;
      bloqueActual = null;
      continue;
    }

    // Skip lines outside any named block (between top-level sections)
    if (contextActual === null) continue;

    // ── Control structure blocks ─────────────────────────────

    if (/^si\s+.+\s+entonces$/i.test(linea)) {
      const condicion = linea.replace(/^si\s+/i, '').replace(/\s+entonces$/i, '').trim();
      const loc = locDeLinea(i, lineaRaw);
      const nodo = nodoSi(condicion, [], null, loc);
      bloqueActual.push(nodo);
      stack.push({ tipo: 'Si', nodo, parentBloque: bloqueActual });
      bloqueActual = nodo.entonces;
      continue;
    }

    if (/^sino$/i.test(linea)) {
      const ctx = stack[stack.length - 1];
      if (ctx && ctx.tipo === 'Si') {
        ctx.nodo.sino = [];
        bloqueActual = ctx.nodo.sino;
      }
      continue;
    }

    if (/^finsi$/i.test(linea)) {
      const ctx = stack.pop();
      bloqueActual = ctx ? ctx.parentBloque : cuerpoRaiz;
      continue;
    }

    if (/^mientras\s+.+\s+hacer$/i.test(linea)) {
      const condicion = linea.replace(/^mientras\s+/i, '').replace(/\s+hacer$/i, '').trim();
      const loc = locDeLinea(i, lineaRaw);
      const nodo = nodoMientras(condicion, [], loc);
      bloqueActual.push(nodo);
      stack.push({ tipo: 'Mientras', nodo, parentBloque: bloqueActual });
      bloqueActual = nodo.cuerpo;
      continue;
    }

    if (/^finmientras$/i.test(linea)) {
      const ctx = stack.pop();
      bloqueActual = ctx ? ctx.parentBloque : cuerpoRaiz;
      continue;
    }

    if (/^repetir$/i.test(linea)) {
      const loc = locDeLinea(i, lineaRaw);
      const nodo = nodoRepetir([], null, loc, loc);
      bloqueActual.push(nodo);
      stack.push({ tipo: 'Repetir', nodo, parentBloque: bloqueActual });
      bloqueActual = nodo.cuerpo;
      continue;
    }

    const hqMatch = linea.match(_REGEX_HASTAQUE_PARSER);
    if (hqMatch) {
      const condicion = hqMatch[1].trim();
      const ctx = stack[stack.length - 1];
      if (ctx && ctx.tipo === 'Repetir') {
        ctx.nodo.condicion = condicion;
        ctx.nodo.locHastaQue = locDeLinea(i, lineaRaw);
        stack.pop();
        bloqueActual = ctx.parentBloque;
      }
      continue;
    }

    const paraMatch = linea.match(
      /^para\s+(\w+)\s*=(?!=)\s*(.+?)\s+hasta\s+(.+?)(?:\s+con\s+paso\s+(.+?))?\s+hacer$/i
    );
    if (paraMatch) {
      const loc = locDeLinea(i, lineaRaw);
      const nodo = nodoPara(
        paraMatch[1].toLowerCase(),
        paraMatch[1],
        paraMatch[2].trim(),
        paraMatch[3].trim(),
        (paraMatch[4] || '1').trim(),
        [],
        loc
      );
      bloqueActual.push(nodo);
      stack.push({ tipo: 'Para', nodo, parentBloque: bloqueActual });
      bloqueActual = nodo.cuerpo;
      continue;
    }

    if (/^finpara$/i.test(linea)) {
      const ctx = stack.pop();
      bloqueActual = ctx ? ctx.parentBloque : cuerpoRaiz;
      continue;
    }

    if (/^segun\s+.+\s+hacer$/i.test(linea)) {
      const exprMatch = linea.match(/^segun\s+(.+?)\s+hacer$/i);
      const loc = locDeLinea(i, lineaRaw);
      const nodo = nodoSegun(exprMatch[1].trim(), [], null, loc);
      bloqueActual.push(nodo);
      stack.push({ tipo: 'Segun', nodo, parentBloque: bloqueActual });
      bloqueActual = null;
      continue;
    }

    if (/^de\s+otro\s+modo\s*:$/i.test(linea)) {
      const ctx = stack[stack.length - 1];
      if (ctx && ctx.tipo === 'Segun') {
        ctx.nodo.otro = [];
        bloqueActual = ctx.nodo.otro;
      }
      continue;
    }

    if (/^finsegun$/i.test(linea)) {
      const ctx = stack.pop();
      bloqueActual = ctx ? ctx.parentBloque : cuerpoRaiz;
      continue;
    }

    // ── Segun case labels ─────────────────────────────────────
    const ctxTop = stack[stack.length - 1];
    if (ctxTop && ctxTop.tipo === 'Segun') {
      const casoMatch = linea.match(/^([^:]+):\s*(.*)$/);
      if (casoMatch) {
        const valores = casoMatch[1].split(',').map(v => v.trim());
        const casoNodo = nodoCaso(valores, []);
        ctxTop.nodo.casos.push(casoNodo);
        bloqueActual = casoNodo.cuerpo;
        const restLinea = casoMatch[2].trim();
        if (restLinea) {
          const instrNodo = _crearNodoSimpleAST(restLinea, i, lineaRaw);
          if (instrNodo) bloqueActual.push(instrNodo);
        }
        continue;
      }
    }

    // ── Simple instructions ───────────────────────────────────
    if (bloqueActual !== null) {
      const nodo = _crearNodoSimpleAST(linea, i, lineaRaw);
      if (nodo) bloqueActual.push(nodo);
    }
  }

  const locPrograma = {
    linea: 0,
    columnaInicio: 0,
    columnaFin: lineas.length > 0 ? lineas[0].length : 0,
  };
  return nodoPrograma(cuerpoRaiz, subprocesos, locPrograma, nombreProceso);
}

const LiteSeIntParser = {
  parsearPrograma,
};
