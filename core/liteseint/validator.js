/**
 * ============================================================
 *  validator.js — Validación Estática y Tabla de Símbolos
 * ============================================================
 *  Responsable de:
 *  - Tabla de símbolos (variables definidas, inicializadas)
 *  - Validación estática del código completo
 *  - Detección de errores con rango exacto (columna inicio/fin)
 *  - Helpers para extracción de variables y decoraciones del editor
 *
 *  Depende de tokenizer.js (TK, tokenizarLinea, tokensSignificativos,
 *  cursorContext, crearError, stripComment, constantes léxicas).
 *  Las declaraciones top-level se asumen visibles en el mismo scope global.
 *
 *  NO depende de la UI ni del motor de ejecución.
 * ============================================================
 */

// ─────────────────────────────────────────────
//  SYMBOL TABLE
//  La clase TablaSimbolos vive en core/symbol-table.js (extraída
//  en v1.1.0 F5 para preparar la cadena de scopes que v1.8.0
//  necesita). validator.js la usa por nombre, asumiendo que
//  symbol-table.js se cargó antes en el mismo scope global.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  STATIC VALIDATOR
// ─────────────────────────────────────────────

/**
 * Validates the entire pseudocode document.
 * Returns { errores: Array, tablaSimbolos: TablaSimbolos, erroresPorLinea: Map }
 */
function validarDocumento(codigo) {
  const lineas = codigo.split('\n');
  const todosErrores = [];
  const erroresPorLinea = new Map();

  const agregarError = (i, err) => {
    if (!erroresPorLinea.has(i)) erroresPorLinea.set(i, []);
    erroresPorLinea.get(i).push(err);
    todosErrores.push(err);
  };

  // Pre-paso: recolectar definiciones de SubProceso para que el validador
  // de línea pueda reconocer llamadas a subprocesos definidos por el usuario.
  const tablaSubprocesos = _recolectarSubprocesos(lineas);

  // Paso 1: validación línea a línea
  // La tabla de símbolos se reinicia al cruzar límites de SubProceso.
  const tablaGlobal = new TablaSimbolos();
  let dentroSubproceso = false;
  let tablaSubproc = null;

  for (let i = 0; i < lineas.length; i++) {
    const lineaRaw = lineas[i];
    const tokens = tokenizarLinea(lineaRaw);
    const sig = tokensSignificativos(tokens);
    if (sig.length === 0) continue;

    const primera = sig[0];
    const palabraLower = primera.type === TK.KEYWORD ? primera.value.toLowerCase() : null;

    // Detectar transición a SubProceso
    if (palabraLower === 'subproceso' || palabraLower === 'funcion') {
      dentroSubproceso = true;
      tablaSubproc = new TablaSimbolos();
      // Register return variable for Funcion: "Funcion retVar = Nombre(...)"
      const assignIdx = sig.findIndex(t => t.type === TK.ASSIGN);
      if (assignIdx > 0 && sig[assignIdx - 1] && sig[assignIdx - 1].type === TK.IDENTIFIER) {
        const retTok = sig[assignIdx - 1];
        tablaSubproc.definir(retTok.value, 'caracter', i);
      }
      _registrarParamsSubproceso(sig, tablaSubproc);
      continue;
    }
    if (palabraLower === 'finsubproceso' || palabraLower === 'finfuncion') {
      dentroSubproceso = false;
      tablaSubproc = null;
      continue;
    }

    const tabla = dentroSubproceso && tablaSubproc ? tablaSubproc : tablaGlobal;
    const erroresLinea = validarLinea(sig, tokens, i, tabla, tablaSubprocesos);
    for (const e of erroresLinea) agregarError(i, e);
  }

  // Paso 2: estructura global de documento
  validarEstructuraProceso(lineas, agregarError);
  validarBloquesSubProceso(lineas, agregarError);
  validarBalanceGlobalBloques(lineas, agregarError);

  // Paso 3: balance simple de Mientras
  const BLOQUES = [
    { abre: 'mientras', cierra: 'finmientras', etiqueta: 'Mientras', cierraLabel: 'FinMientras' },
  ];

  const stackBloques = [];
  for (let i = 0; i < lineas.length; i++) {
    const linea = stripComment(lineas[i].trim());
    if (linea === '') continue;
    const primera = linea.split(/\s+/)[0].toLowerCase();

    for (const b of BLOQUES) {
      if (primera === b.abre) {
        stackBloques.push({ ...b, linea: i });
        break;
      }
      if (primera === b.cierra) {
        if (stackBloques.length === 0 || stackBloques[stackBloques.length - 1].cierra !== b.cierra) {
          agregarError(i, crearError(
            i, 0, linea.length, 'bloque_desbalanceado',
            `"${linea.split(/\s+/)[0]}" sin bloque de apertura correspondiente.`, ''
          ));
        } else {
          stackBloques.pop();
        }
        break;
      }
    }
  }
  for (const ctx of stackBloques) {
    agregarError(ctx.linea, crearError(
      ctx.linea, 0, 0, 'bloque_sin_cerrar',
      `Bloque "${ctx.etiqueta}" sin cierre (falta ${ctx.cierraLabel}).`, ''
    ));
  }

  // Paso 4: validación estructural de Si / Sino / FinSi
  validarBloquesSi(lineas, agregarError);

  // Paso 5: validación estructural de Segun / De Otro Modo / FinSegun
  validarBloquesSegun(lineas, tablaGlobal, agregarError);

  // Paso 6: validación estructural de Repetir / Hasta Que
  validarBloquesRepetir(lineas, agregarError);

  // Paso 7: validación estructural de Para / FinPara
  validarBloquesPara(lineas, tablaGlobal, agregarError);

  return { errores: todosErrores, tablaSimbolos: tablaGlobal, tablaSubprocesos, erroresPorLinea };
}


/**
 * Pre-scan: collect SubProceso/Funcion definitions so call-site
 * validation can check name and arity.
 * Returns Map<nombreLower, { nombre, aridad, tieneRetorno }>
 */
function _recolectarSubprocesos(lineas) {
  const tabla = new Map();
  for (const raw of lineas) {
    const linea = stripComment(raw.trim());
    if (!linea) continue;
    const m = linea.match(/^(?:subproceso|funcion)\s+(.+)$/i);
    if (!m) continue;
    const resto = m[1].trim();

    // Form: retorno = Nombre(params)
    const mFn = resto.match(/^(\w+)\s*=\s*(\w+)\s*\(([^)]*)\)$/);
    if (mFn) {
      const nombre = mFn[2].toLowerCase();
      const aridad = _contarParams(mFn[3]);
      tabla.set(nombre, { nombre: mFn[2], aridad, tieneRetorno: true });
      continue;
    }
    // Form: Nombre(params)
    const mVoid = resto.match(/^(\w+)\s*\(([^)]*)\)$/);
    if (mVoid) {
      const nombre = mVoid[1].toLowerCase();
      const aridad = _contarParams(mVoid[2]);
      tabla.set(nombre, { nombre: mVoid[1], aridad, tieneRetorno: false });
      continue;
    }
    // Form: Nombre (no parens)
    const mName = resto.match(/^(\w+)/);
    if (mName) {
      const nombre = mName[1].toLowerCase();
      tabla.set(nombre, { nombre: mName[1], aridad: 0, tieneRetorno: false });
    }
  }
  return tabla;
}

function _contarParams(paramStr) {
  paramStr = paramStr.trim();
  if (!paramStr) return 0;
  // Count commas at depth 0 + 1
  let count = 1;
  let depth = 0;
  for (const ch of paramStr) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return count;
}

/**
 * Register parameters declared in a SubProceso header into the local tabla.
 */
function _registrarParamsSubproceso(sig, tabla) {
  // Find the LPAREN/RPAREN range
  const lp = sig.findIndex(t => t.type === TK.LPAREN);
  const rp = sig.findIndex(t => t.type === TK.RPAREN);
  if (lp < 0 || rp < 0) return;

  const inner = sig.slice(lp + 1, rp);
  // Split by comma at depth 0 and parse each param
  const groups = [];
  let current = [];
  let depth = 0;
  for (const tk of inner) {
    if (tk.type === TK.LPAREN) { depth++; current.push(tk); }
    else if (tk.type === TK.RPAREN) { depth--; current.push(tk); }
    else if (tk.type === TK.COMMA && depth === 0) {
      groups.push(current); current = [];
    } else {
      current.push(tk);
    }
  }
  groups.push(current);

  const _POR_REF_IDENTS = new Set(['por', 'referencia', 'valor']);
  for (const group of groups) {
    if (!group.length) continue;
    // Skip 'por', 'referencia', 'valor' keywords/identifiers at start
    let idx = 0;
    while (idx < group.length && (
      group[idx].type === TK.KEYWORD ||
      (group[idx].type === TK.IDENTIFIER && _POR_REF_IDENTS.has(group[idx].value.toLowerCase()))
    )) idx++;
    // Expect: identifier [Como tipo]
    if (idx < group.length && group[idx].type === TK.IDENTIFIER) {
      const varTok = group[idx];
      let tipo = 'entero';
      const comoIdx = group.findIndex((t, i) => i > idx && t.type === TK.KEYWORD && t.value.toLowerCase() === 'como');
      if (comoIdx >= 0 && group[comoIdx + 1]) {
        tipo = group[comoIdx + 1].value.toLowerCase();
      }
      tabla.definir(varTok.value, tipo, 0);
      tabla.marcarInicializada(varTok.value);
      // Mark as array-capable so arr[i] indexing in SubProceso body passes validation
      tabla.dimensionar(varTok.value, [], 0);
    }
  }
}

// ─────────────────────────────────────────────
//  VALIDATION: Proceso / FinProceso + cross-block balance
// ─────────────────────────────────────────────

function obtenerLineasSignificativas(lineas) {
  const resultado = [];
  for (let i = 0; i < lineas.length; i++) {
    const sig = tokensSignificativos(tokenizarLinea(lineas[i]));
    if (sig.length > 0) resultado.push({ lineaIdx: i, sig });
  }
  return resultado;
}

function validarEstructuraProceso(lineas, agregarError) {
  const significativas = obtenerLineasSignificativas(lineas);
  if (significativas.length === 0) return;

  // Find the Proceso and FinProceso lines (SubProceso blocks are allowed before/after).
  let procesoEntry = null;
  let finProcesoEntry = null;

  for (const entry of significativas) {
    const tk = entry.sig[0];
    if (esKeyword(tk, 'proceso') && !procesoEntry) {
      procesoEntry = entry;
    }
    if (esKeyword(tk, 'finproceso')) {
      finProcesoEntry = entry;
    }
  }

  if (!procesoEntry) {
    const primera = significativas[0];
    const primeraTk = primera.sig[0];
    agregarError(primera.lineaIdx, crearError(
      primera.lineaIdx, primeraTk.col, primeraTk.end, 'proceso_faltante',
      'El documento debe contener "Proceso nombre_proceso".', primeraTk.value
    ));
  } else if (procesoEntry.sig.length < 2) {
    const primeraTk = procesoEntry.sig[0];
    agregarError(procesoEntry.lineaIdx, crearError(
      procesoEntry.lineaIdx, primeraTk.col, primeraTk.end, 'proceso_sin_nombre',
      'Falta el nombre del proceso.', ''
    ));
  }

  if (!finProcesoEntry) {
    const ultima = significativas[significativas.length - 1];
    const ultimaTk = ultima.sig[0];
    const lastTk = ultima.sig[ultima.sig.length - 1];
    agregarError(ultima.lineaIdx, crearError(
      ultima.lineaIdx, ultimaTk.col, lastTk.end, 'finproceso_faltante',
      'El documento debe contener "FinProceso".', ''
    ));
  } else if (finProcesoEntry.sig.length > 1) {
    const extra = finProcesoEntry.sig[1];
    const last = finProcesoEntry.sig[finProcesoEntry.sig.length - 1];
    agregarError(finProcesoEntry.lineaIdx, crearError(
      finProcesoEntry.lineaIdx, extra.col, last.end, 'finproceso_texto_extra',
      '"FinProceso" no debe tener argumentos ni texto adicional.', ''
    ));
  }
}

function validarBalanceGlobalBloques(lineas, agregarError) {
  const apertura = {
    si: { etiqueta: 'Si', cierra: 'finsi', cierraLabel: 'FinSi' },
    mientras: { etiqueta: 'Mientras', cierra: 'finmientras', cierraLabel: 'FinMientras' },
    repetir: { etiqueta: 'Repetir', cierra: 'hastaque', cierraLabel: 'HastaQue' },
    para: { etiqueta: 'Para', cierra: 'finpara', cierraLabel: 'FinPara' },
    segun: { etiqueta: 'Segun', cierra: 'finsegun', cierraLabel: 'FinSegun' },
  };
  const cierreLabel = {
    finsi: 'FinSi',
    finmientras: 'FinMientras',
    hastaque: 'HastaQue',
    finpara: 'FinPara',
    finsegun: 'FinSegun',
  };
  const stack = [];

  for (let i = 0; i < lineas.length; i++) {
    const sig = tokensSignificativos(tokenizarLinea(lineas[i]));
    if (sig.length === 0) continue;
    const primera = sig[0];
    const palabra = primera.type === TK.KEYWORD ? primera.value.toLowerCase() : null;
    const hq = detectarHastaQue(sig);
    const cierre = hq ? 'hastaque' : palabra;

    if (apertura[palabra]) {
      stack.push({ ...apertura[palabra], linea: i });
      continue;
    }

    if (!cierreLabel[cierre]) continue;

    if (stack.length === 0) {
      agregarError(i, crearError(
        i, primera.col, primera.end, 'bloque_cierre_sin_apertura',
        `"${cierreLabel[cierre]}" sin bloque de apertura correspondiente.`, primera.value
      ));
      continue;
    }

    const top = stack[stack.length - 1];
    if (top.cierra !== cierre) {
      agregarError(i, crearError(
        i, primera.col, primera.end, 'bloque_cierre_cruzado',
        `"${cierreLabel[cierre]}" intenta cerrar un bloque, pero primero debe cerrarse "${top.etiqueta}" con ${top.cierraLabel}.`, primera.value
      ));
      continue;
    }

    stack.pop();
  }

  for (const ctx of stack) {
    const longitud = lineas[ctx.linea] ? lineas[ctx.linea].length : 0;
    agregarError(ctx.linea, crearError(
      ctx.linea, 0, longitud, 'bloque_sin_cerrar',
      `Bloque "${ctx.etiqueta}" sin cierre (falta ${ctx.cierraLabel}).`, ''
    ));
  }
}

// ─────────────────────────────────────────────
//  VALIDATION: SubProceso / Funcion balance
// ─────────────────────────────────────────────

function validarBloquesSubProceso(lineas, agregarError) {
  const stack = [];

  for (let i = 0; i < lineas.length; i++) {
    const sig = tokensSignificativos(tokenizarLinea(lineas[i]));
    if (sig.length === 0) continue;
    const primera = sig[0];
    const palabra = primera.type === TK.KEYWORD ? primera.value.toLowerCase() : null;

    if (palabra === 'subproceso' || palabra === 'funcion') {
      // Validate header has at least a name
      if (sig.length < 2) {
        agregarError(i, crearError(
          i, primera.col, primera.end, 'subproceso_sin_nombre',
          `Falta el nombre del ${palabra === 'funcion' ? 'Funcion' : 'SubProceso'}.`, ''
        ));
      }
      stack.push({ lineaAbre: i, palabra });
      continue;
    }

    if (palabra === 'finsubproceso' || palabra === 'finfuncion') {
      if (stack.length === 0) {
        agregarError(i, crearError(
          i, primera.col, primera.end, 'fin_subproceso_sin_apertura',
          `"${sig[0].value}" sin un bloque "SubProceso" o "Funcion" abierto.`, sig[0].value
        ));
      } else {
        stack.pop();
      }
      if (sig.length > 1) {
        const extra = sig[1];
        const last = sig[sig.length - 1];
        agregarError(i, crearError(
          i, extra.col, last.end, 'finsubproceso_texto_extra',
          `"${sig[0].value}" no debe tener argumentos ni texto adicional.`, ''
        ));
      }
      continue;
    }
  }

  for (const ctx of stack) {
    const long = lineas[ctx.lineaAbre] ? lineas[ctx.lineaAbre].length : 0;
    agregarError(ctx.lineaAbre, crearError(
      ctx.lineaAbre, 0, long, 'subproceso_sin_cerrar',
      `Bloque "${ctx.palabra === 'funcion' ? 'Funcion' : 'SubProceso'}" sin cierre correspondiente.`, ''
    ));
  }
}

// ─────────────────────────────────────────────
//  VALIDATION: Si / Sino / FinSi
// ─────────────────────────────────────────────

/**
 * Pasada estructural sobre el documento completo.
 * Rastrea bloques Si abiertos con una pila para soportar anidación.
 * Emite errores de:
 *   - cabecera inválida (condición, Entonces, texto extra)
 *   - Sino fuera de bloque, Sino duplicado, Sino con texto extra
 *   - FinSi fuera de bloque, FinSi con texto extra
 *   - ramas vacías (entre Si/Sino y Sino/FinSi)
 *   - Si no cerrado al fin del documento
 */
function validarBloquesSi(lineas, agregarError) {
  const stack = [];

  const contarContenido = (top) => {
    if (top.tieneSino) top.contenidoFalse++;
    else top.contenidoTrue++;
  };

  for (let i = 0; i < lineas.length; i++) {
    const lineaRaw = lineas[i];
    const allTokens = tokenizarLinea(lineaRaw);
    const sig = tokensSignificativos(allTokens);
    if (sig.length === 0) continue;

    const primera = sig[0];
    const palabra = primera.type === TK.KEYWORD ? primera.value.toLowerCase() : null;

    if (palabra === 'si') {
      if (stack.length > 0) contarContenido(stack[stack.length - 1]);
      validarCabeceraSi(lineaRaw, sig, i, agregarError);
      stack.push({ lineaSi: i, tieneSino: false, contenidoTrue: 0, contenidoFalse: 0 });
      continue;
    }

    if (palabra === 'sino') {
      if (stack.length === 0) {
        agregarError(i, crearError(
          i, primera.col, primera.end, 'sino_sin_si',
          '"Sino" sin una sentencia "Si" abierta.', primera.value
        ));
      } else {
        const top = stack[stack.length - 1];
        if (top.tieneSino) {
          agregarError(i, crearError(
            i, primera.col, primera.end, 'sino_duplicado',
            'La sentencia "Si" ya contiene un bloque "Sino".', primera.value
          ));
        } else {
          if (top.contenidoTrue === 0) {
            agregarError(i, crearError(
              i, primera.col, primera.end, 'rama_verdadera_vacia',
              'Debe haber al menos una instrucción entre "Si ... Entonces" y "Sino" o "FinSi".', ''
            ));
          }
          top.tieneSino = true;
        }
      }
      if (sig.length > 1) {
        const extra = sig[1];
        const last = sig[sig.length - 1];
        agregarError(i, crearError(
          i, extra.col, last.end, 'sino_texto_extra',
          '"Sino" no debe tener argumentos ni texto adicional.', ''
        ));
      }
      continue;
    }

    if (palabra === 'finsi') {
      if (stack.length === 0) {
        agregarError(i, crearError(
          i, primera.col, primera.end, 'finsi_sin_si',
          '"FinSi" sin una sentencia "Si" abierta.', primera.value
        ));
      } else {
        const top = stack.pop();
        if (top.tieneSino) {
          if (top.contenidoFalse === 0) {
            agregarError(i, crearError(
              i, primera.col, primera.end, 'rama_falsa_vacia',
              'Debe haber al menos una instrucción entre "Sino" y "FinSi".', ''
            ));
          }
        } else {
          if (top.contenidoTrue === 0) {
            agregarError(i, crearError(
              i, primera.col, primera.end, 'rama_verdadera_vacia',
              'Debe haber al menos una instrucción entre "Si ... Entonces" y "Sino" o "FinSi".', ''
            ));
          }
        }
      }
      if (sig.length > 1) {
        const extra = sig[1];
        const last = sig[sig.length - 1];
        agregarError(i, crearError(
          i, extra.col, last.end, 'finsi_texto_extra',
          '"FinSi" no debe tener argumentos ni texto adicional.', ''
        ));
      }
      continue;
    }

    // Cualquier otra línea no vacía cuenta como instrucción real
    if (stack.length > 0) contarContenido(stack[stack.length - 1]);
  }

  for (const ctx of stack) {
    const longitud = lineas[ctx.lineaSi] ? lineas[ctx.lineaSi].length : 0;
    agregarError(ctx.lineaSi, crearError(
      ctx.lineaSi, 0, longitud, 'si_sin_cerrar',
      'Falta "FinSi" para cerrar la sentencia "Si".', ''
    ));
  }
}

function validarCabeceraSi(lineaRaw, sig, lineaIdx, agregarError) {
  const siToken = sig[0];

  let entoncesIdx = -1;
  for (let i = 1; i < sig.length; i++) {
    if (sig[i].type === TK.KEYWORD && sig[i].value.toLowerCase() === 'entonces') {
      entoncesIdx = i;
      break;
    }
  }

  const condTokens = entoncesIdx === -1 ? sig.slice(1) : sig.slice(1, entoncesIdx);

  if (condTokens.length === 0) {
    const colFin = entoncesIdx === -1 ? siToken.end : sig[entoncesIdx].end;
    agregarError(lineaIdx, crearError(
      lineaIdx, siToken.col, colFin, 'si_sin_condicion',
      'Falta la condición en la sentencia "Si".', ''
    ));
  }

  if (entoncesIdx === -1) {
    agregarError(lineaIdx, crearError(
      lineaIdx, siToken.col, sig[sig.length - 1].end, 'si_sin_entonces',
      'Falta la palabra clave "Entonces" en la sentencia "Si".', ''
    ));
    return;
  }

  if (entoncesIdx + 1 < sig.length) {
    const extra = sig[entoncesIdx + 1];
    const last = sig[sig.length - 1];
    agregarError(lineaIdx, crearError(
      lineaIdx, extra.col, last.end, 'entonces_texto_extra',
      'No debe haber texto después de "Entonces".', ''
    ));
  }

  validarComparacionesEnCondicion(
    lineaRaw, siToken.end, sig[entoncesIdx].col, lineaIdx, agregarError
  );
}

/**
 * Recorre un rango de condición respetando strings y comentarios, y
 * reporta operadores de comparación no permitidos.
 * Permitidos: ==, <>, <=, >=, !=, <, >
 * Cualquier otro (ej. =, !, =<, =>) es error. El operador "=" es asignación,
 * no comparación, por lo que tampoco es válido aquí.
 * `contexto` nombra la estructura para el mensaje (ej. "Si", "Hasta Que").
 */
function validarComparacionesEnCondicion(lineaRaw, colInicio, colFin, lineaIdx, agregarError, contexto) {
  const VALIDOS_DOBLE = new Set(['==', '<>', '<=', '>=', '!=']);
  const nombreCtx = contexto || 'Si';
  let inStr = false;
  let i = colInicio;

  while (i < colFin) {
    const ch = lineaRaw[i];
    if (ch === '"') { inStr = !inStr; i++; continue; }
    if (inStr) { i++; continue; }
    if (ch === '/' && lineaRaw[i + 1] === '/') break;

    if (ch === '<' || ch === '>' || ch === '=' || ch === '!') {
      const two = lineaRaw.substring(i, i + 2);

      if (VALIDOS_DOBLE.has(two)) {
        i += 2;
        continue;
      }

      if (ch === '<' || ch === '>') {
        i++;
        continue;
      }

      agregarError(lineaIdx, crearError(
        lineaIdx, i, i + 1, 'comparador_invalido',
        `Operador de comparación no válido en la condición del "${nombreCtx}".`, ch
      ));
      i++;
      continue;
    }

    i++;
  }
}

// ─────────────────────────────────────────────
//  VALIDATION: Segun / De Otro Modo / FinSegun
// ─────────────────────────────────────────────

/**
 * Pasada estructural sobre el documento completo para Segun.
 * Mantiene una pila para soportar anidación. Rastrea:
 *   - cabecera (expresión y palabra "Hacer")
 *   - etiquetas de caso (valores + ":")
 *   - valores duplicados dentro del mismo Segun
 *   - "De Otro Modo:" único y posterior a los casos
 *   - contenido real por cada segmento (caso o De Otro Modo)
 *   - cierre con "FinSegun"
 */
function validarBloquesSegun(lineas, tabla, agregarError) {
  const stack = [];

  for (let i = 0; i < lineas.length; i++) {
    const lineaRaw = lineas[i];
    const allTokens = tokenizarLinea(lineaRaw);
    const sig = tokensSignificativos(allTokens);
    if (sig.length === 0) continue;

    const primera = sig[0];
    const palabra = primera.type === TK.KEYWORD ? primera.value.toLowerCase() : null;

    if (palabra === 'segun') {
      if (stack.length > 0 && stack[stack.length - 1].ultimoSegmento) {
        stack[stack.length - 1].ultimoSegmento.contenido++;
      }
      validarCabeceraSegun(sig, i, tabla, agregarError);
      stack.push({
        lineaSegun: i,
        tieneDeOtroModo: false,
        casos: new Set(),
        ultimoSegmento: null,
        tieneAlgunCaso: false,
      });
      continue;
    }

    if (palabra === 'finsegun') {
      if (stack.length === 0) {
        agregarError(i, crearError(
          i, primera.col, primera.end, 'finsegun_sin_segun',
          '"FinSegun" sin una sentencia "Segun" abierta.', primera.value
        ));
      } else {
        const top = stack.pop();
        finalizarSegmentoAntesFinSegun(top, agregarError);
        if (!top.tieneAlgunCaso && !top.tieneDeOtroModo) {
          agregarError(i, crearError(
            i, primera.col, primera.end, 'segun_sin_casos',
            'La sentencia "Segun" debe tener al menos un caso o un bloque "De Otro Modo".', ''
          ));
        }
      }
      if (sig.length > 1) {
        const extra = sig[1];
        const last = sig[sig.length - 1];
        agregarError(i, crearError(
          i, extra.col, last.end, 'finsegun_texto_extra',
          '"FinSegun" no debe tener argumentos ni texto adicional.', ''
        ));
      }
      continue;
    }

    if (palabra === 'de' && esDeOtroModo(sig)) {
      if (stack.length === 0) {
        agregarError(i, crearError(
          i, primera.col, sig[2].end, 'deotromodo_sin_segun',
          '"De Otro Modo" sin una sentencia "Segun" abierta.', ''
        ));
      } else {
        const top = stack[stack.length - 1];
        finalizarSegmentoEnMedio(top, agregarError);
        if (top.tieneDeOtroModo) {
          agregarError(i, crearError(
            i, primera.col, sig[2].end, 'deotromodo_duplicado',
            'La sentencia "Segun" ya contiene un bloque "De Otro Modo".', ''
          ));
        } else {
          if (!top.tieneAlgunCaso) {
            agregarError(i, crearError(
              i, primera.col, sig[2].end, 'deotromodo_antes_casos',
              '"De Otro Modo" debe aparecer después de al menos un caso.', ''
            ));
          }
          top.tieneDeOtroModo = true;
        }
        top.ultimoSegmento = { tipo: 'deotromodo', contenido: 0, linea: i };
      }

      if (sig.length === 3) {
        agregarError(i, crearError(
          i, sig[0].col, sig[2].end, 'deotromodo_sin_colon',
          '"De Otro Modo" debe terminar con ":".', ''
        ));
      } else if (sig[3].type !== TK.COLON) {
        agregarError(i, crearError(
          i, sig[3].col, sig[sig.length - 1].end, 'deotromodo_texto_extra',
          '"De Otro Modo" no debe tener texto adicional.', ''
        ));
      } else if (sig.length > 4) {
        const extra = sig[4];
        const last = sig[sig.length - 1];
        agregarError(i, crearError(
          i, extra.col, last.end, 'deotromodo_texto_extra',
          '"De Otro Modo" no debe tener texto adicional.', ''
        ));
      }
      continue;
    }

    // Etiqueta de caso: contiene ":" y estamos dentro de un Segun abierto
    const caso = detectarEtiquetaCaso(sig);
    if (caso && stack.length > 0) {
      const top = stack[stack.length - 1];
      finalizarSegmentoEnMedio(top, agregarError);

      if (top.tieneDeOtroModo) {
        const last = sig[sig.length - 1];
        agregarError(i, crearError(
          i, primera.col, last.end, 'caso_despues_deotromodo',
          'No puede haber casos después de "De Otro Modo".', ''
        ));
      }

      validarEtiquetaCaso(sig, caso.colonIdx, i, top, agregarError);

      if (!top.tieneDeOtroModo) {
        top.tieneAlgunCaso = true;
      }
      // Inline: la instrucción después de ":" cuenta como contenido del caso.
      top.ultimoSegmento = {
        tipo: 'caso',
        contenido: caso.inline.length > 0 ? 1 : 0,
        linea: i,
      };
      continue;
    }

    // Cualquier otra línea cuenta como contenido del segmento actual
    if (stack.length > 0 && stack[stack.length - 1].ultimoSegmento) {
      stack[stack.length - 1].ultimoSegmento.contenido++;
    }
  }

  for (const ctx of stack) {
    const longitud = lineas[ctx.lineaSegun] ? lineas[ctx.lineaSegun].length : 0;
    agregarError(ctx.lineaSegun, crearError(
      ctx.lineaSegun, 0, longitud, 'segun_sin_cerrar',
      'Falta "FinSegun" para cerrar la sentencia "Segun".', ''
    ));
  }
}

function esDeOtroModo(sig) {
  if (sig.length < 3) return false;
  if (sig[0].type !== TK.KEYWORD || sig[0].value.toLowerCase() !== 'de') return false;
  if (sig[1].type !== TK.KEYWORD || sig[1].value.toLowerCase() !== 'otro') return false;
  if (sig[2].type !== TK.KEYWORD || sig[2].value.toLowerCase() !== 'modo') return false;
  return true;
}

/**
 * Detecta si una línea (tokens significativos) es una etiqueta de caso
 * de Segun, aceptando formato multilínea e inline:
 *   "1:"                       (multilínea, inline vacío)
 *   "1: Escribir ..."          (inline: una instrucción tras ":")
 *   "1, 2, 3: Escribir ..."    (varios valores + inline)
 *
 * Devuelve null si no es caso (ej. empieza con "De", no hay ":", etc.).
 * Si es caso devuelve { colonIdx, valores, inline }:
 *   - colonIdx: índice del token ":"
 *   - valores:  tokens antes de ":"
 *   - inline:   tokens después de ":" (vacío si es multilínea)
 *
 * No valida el contenido ni decide contexto (eso es responsabilidad del
 * validador estructural de Segun y del validador de línea).
 */
function detectarEtiquetaCaso(sig) {
  if (sig.length === 0) return null;
  // "De Otro Modo:" se gestiona aparte, no debe detectarse aquí.
  if (sig[0].type === TK.KEYWORD && sig[0].value.toLowerCase() === 'de') return null;
  const colonIdx = sig.findIndex(t => t.type === TK.COLON);
  if (colonIdx <= 0) return null;
  return {
    colonIdx,
    valores: sig.slice(0, colonIdx),
    inline:  sig.slice(colonIdx + 1),
  };
}

function validarCabeceraSegun(sig, lineaIdx, tabla, agregarError) {
  const segunToken = sig[0];

  let hacerIdx = -1;
  for (let i = 1; i < sig.length; i++) {
    if (sig[i].type === TK.KEYWORD && sig[i].value.toLowerCase() === 'hacer') {
      hacerIdx = i;
      break;
    }
  }

  const exprTokens = hacerIdx === -1 ? sig.slice(1) : sig.slice(1, hacerIdx);

  if (exprTokens.length === 0) {
    const colFin = hacerIdx === -1 ? segunToken.end : sig[hacerIdx].end;
    agregarError(lineaIdx, crearError(
      lineaIdx, segunToken.col, colFin, 'segun_sin_expresion',
      'Falta la expresión en la sentencia "Segun".', ''
    ));
  }

  if (exprTokens.length > 0) {
    const erroresExpr = [];
    validarExpresionTokens(exprTokens, lineaIdx, tabla, erroresExpr);
    for (const err of erroresExpr) agregarError(lineaIdx, err);
  }

  if (hacerIdx === -1) {
    agregarError(lineaIdx, crearError(
      lineaIdx, segunToken.col, sig[sig.length - 1].end, 'segun_sin_hacer',
      'Falta la palabra clave "Hacer" en la sentencia "Segun".', ''
    ));
    return;
  }

  if (hacerIdx + 1 < sig.length) {
    const extra = sig[hacerIdx + 1];
    const last = sig[sig.length - 1];
    agregarError(lineaIdx, crearError(
      lineaIdx, extra.col, last.end, 'hacer_texto_extra',
      'No debe haber texto después de "Hacer".', ''
    ));
  }
}

function validarEtiquetaCaso(sig, colonIdx, lineaIdx, top, agregarError) {
  const colonToken = sig[colonIdx];
  const valoresTokens = sig.slice(0, colonIdx);
  // Nota: el texto posterior a ":" (caso inline) se valida como una
  // instrucción normal en validarLinea, no aquí.

  if (valoresTokens.length === 0) {
    agregarError(lineaIdx, crearError(
      lineaIdx, colonToken.col, colonToken.end, 'caso_sin_valor',
      'Falta al menos un valor en el caso del "Segun".', ''
    ));
    return;
  }

  let esperandoValor = true;
  let ultimaEraComa = false;
  let ultimoTokenComa = null;
  let huboValor = false;

  for (const tk of valoresTokens) {
    if (tk.type === TK.COMMA) {
      if (esperandoValor) {
        agregarError(lineaIdx, crearError(
          lineaIdx, tk.col, tk.end, 'caso_coma_invalida',
          'Coma inválida en la lista de valores del caso.', ','
        ));
      }
      esperandoValor = true;
      ultimaEraComa = true;
      ultimoTokenComa = tk;
    } else {
      ultimaEraComa = false;
      if (esperandoValor) {
        if (esValorDeCaso(tk)) {
          const key = valorDeCasoKey(tk);
          if (top.casos.has(key)) {
            agregarError(lineaIdx, crearError(
              lineaIdx, tk.col, tk.end, 'caso_duplicado',
              'Valor de caso duplicado en la sentencia "Segun".', tk.value
            ));
          } else {
            top.casos.add(key);
          }
          huboValor = true;
        } else {
          agregarError(lineaIdx, crearError(
            lineaIdx, tk.col, tk.end, 'caso_valor_invalido',
            `Valor de caso no válido: "${tk.value}".`, tk.value
          ));
        }
        esperandoValor = false;
      } else {
        agregarError(lineaIdx, crearError(
          lineaIdx, tk.col, tk.end, 'caso_sintaxis',
          'Se esperaba una coma entre los valores del caso.', ''
        ));
      }
    }
  }

  if (ultimaEraComa) {
    agregarError(lineaIdx, crearError(
      lineaIdx, ultimoTokenComa.col, ultimoTokenComa.end, 'caso_coma_invalida',
      'Coma inválida en la lista de valores del caso.', ','
    ));
  }

  if (!huboValor) {
    agregarError(lineaIdx, crearError(
      lineaIdx, colonToken.col, colonToken.end, 'caso_sin_valor',
      'Falta al menos un valor en el caso del "Segun".', ''
    ));
  }
}

function esValorDeCaso(tk) {
  return tk.type === TK.NUMBER || tk.type === TK.STRING || tk.type === TK.IDENTIFIER;
}

function valorDeCasoKey(tk) {
  if (tk.type === TK.NUMBER) return `num:${tk.value}`;
  if (tk.type === TK.STRING) return `str:${tk.value}`;
  if (tk.type === TK.IDENTIFIER) return `id:${tk.value.toLowerCase()}`;
  return `raw:${tk.value}`;
}

function finalizarSegmentoEnMedio(top, agregarError) {
  if (!top.ultimoSegmento) return;
  if (top.ultimoSegmento.contenido > 0) return;
  const prev = top.ultimoSegmento;
  if (prev.tipo === 'caso') {
    agregarError(prev.linea, crearError(
      prev.linea, 0, 0, 'caso_vacio',
      'Debe haber al menos una instrucción después de este caso del "Segun".', ''
    ));
  }
}

function finalizarSegmentoAntesFinSegun(top, agregarError) {
  if (!top.ultimoSegmento) return;
  if (top.ultimoSegmento.contenido > 0) return;
  const prev = top.ultimoSegmento;
  if (prev.tipo === 'deotromodo') {
    agregarError(prev.linea, crearError(
      prev.linea, 0, 0, 'deotromodo_vacio',
      'Debe haber al menos una instrucción entre "De Otro Modo:" y "FinSegun".', ''
    ));
  } else if (prev.tipo === 'caso') {
    agregarError(prev.linea, crearError(
      prev.linea, 0, 0, 'ultimo_bloque_vacio',
      'Falta contenido en el último bloque del "Segun" antes de "FinSegun".', ''
    ));
  }
}

// ─────────────────────────────────────────────
//  VALIDATION: Repetir / HastaQue
// ─────────────────────────────────────────────

/**
 * Sintaxis oficial: "HastaQue <condición>".
 * Alias aceptado:   "Hasta Que <condición>" (se trata como equivalente).
 *
 * Regex sobre la línea ya sin comentario y .trim()-eada.
 * Grupo 1 = la condición cruda (aún puede contener strings y expresiones).
 */
const REGEX_HASTAQUE_LINEA = /^(?:hastaque|hasta\s+que)\s+(.+)$/i;

/**
 * Detección token-based del encabezado "HastaQue" (o alias "Hasta Que").
 * Devuelve null si la línea no es un HastaQue. Si lo es, devuelve:
 *   { forma, colInicio, colFin, condStart }
 *     - forma:     'junto' | 'separado'
 *     - colInicio: columna donde empieza la palabra clave
 *     - colFin:    columna donde termina la palabra clave (antes de la condición)
 *     - condStart: índice en `sig` donde empiezan los tokens de la condición
 */
function detectarHastaQue(sig) {
  if (sig.length === 0) return null;
  const first = sig[0];
  if (first.type !== TK.KEYWORD) return null;
  const w1 = first.value.toLowerCase();

  if (w1 === 'hastaque') {
    return { forma: 'junto', colInicio: first.col, colFin: first.end, condStart: 1 };
  }
  if (w1 === 'hasta'
      && sig.length >= 2
      && sig[1].type === TK.KEYWORD
      && sig[1].value.toLowerCase() === 'que') {
    return { forma: 'separado', colInicio: first.col, colFin: sig[1].end, condStart: 2 };
  }
  return null;
}

/**
 * Pasada estructural sobre el documento completo para Repetir.
 * Mantiene una pila para soportar anidación. Valida:
 *   - "Repetir" en línea propia, sin texto adicional
 *   - "HastaQue <condición>" (o alias "Hasta Que") con condición no vacía
 *   - operadores de comparación permitidos en la condición
 *   - al menos una instrucción real entre "Repetir" y "HastaQue"
 *   - "Hasta" incompleto sin "Que" (cabecera mal escrita)
 *   - "HastaQue" sin un "Repetir" abierto
 *   - "Repetir" sin cerrar al final del documento
 */
function validarBloquesRepetir(lineas, agregarError) {
  const stack = [];

  for (let i = 0; i < lineas.length; i++) {
    const lineaRaw = lineas[i];
    const allTokens = tokenizarLinea(lineaRaw);
    const sig = tokensSignificativos(allTokens);
    if (sig.length === 0) continue;

    const primera = sig[0];
    const palabra = primera.type === TK.KEYWORD ? primera.value.toLowerCase() : null;

    if (palabra === 'repetir') {
      if (stack.length > 0) stack[stack.length - 1].contenido++;

      if (sig.length > 1) {
        const extra = sig[1];
        const last = sig[sig.length - 1];
        agregarError(i, crearError(
          i, extra.col, last.end, 'repetir_texto_extra',
          '"Repetir" no debe tener argumentos ni texto adicional.', ''
        ));
      }

      stack.push({ lineaRepetir: i, contenido: 0 });
      continue;
    }

    const hq = detectarHastaQue(sig);
    if (hq) {
      const condTokens = sig.slice(hq.condStart);

      if (stack.length === 0) {
        const last = sig[sig.length - 1];
        agregarError(i, crearError(
          i, hq.colInicio, last.end, 'hastaque_sin_repetir',
          '"HastaQue" sin una sentencia "Repetir" abierta.', ''
        ));
      }

      if (condTokens.length === 0) {
        agregarError(i, crearError(
          i, hq.colInicio, hq.colFin, 'hastaque_sin_condicion',
          'Falta la condición en la sentencia "HastaQue".', ''
        ));
      } else {
        validarComparacionesEnCondicion(
          lineaRaw, hq.colFin, lineaRaw.length, i, agregarError, 'HastaQue'
        );
      }

      if (stack.length > 0) {
        const top = stack.pop();
        if (top.contenido === 0) {
          agregarError(i, crearError(
            i, hq.colInicio, hq.colFin, 'repetir_vacio',
            'Debe haber al menos una instrucción entre "Repetir" y "HastaQue".', ''
          ));
        }
      }
      continue;
    }

    // "Hasta" al inicio sin "Que" → cabecera mal escrita
    if (palabra === 'hasta') {
      agregarError(i, crearError(
        i, primera.col, sig[sig.length - 1].end, 'hastaque_incompleto',
        'La sentencia "HastaQue" está incompleta.', ''
      ));
      continue;
    }

    if (stack.length > 0) stack[stack.length - 1].contenido++;
  }

  for (const ctx of stack) {
    const longitud = lineas[ctx.lineaRepetir] ? lineas[ctx.lineaRepetir].length : 0;
    agregarError(ctx.lineaRepetir, crearError(
      ctx.lineaRepetir, 0, longitud, 'repetir_sin_cerrar',
      'Falta "HastaQue" para cerrar la sentencia "Repetir".', ''
    ));
  }
}

// ─────────────────────────────────────────────
//  VALIDATION: Para / FinPara
// ─────────────────────────────────────────────

/**
 * Pasada estructural sobre el documento completo para Para.
 * Mantiene una pila para soportar anidación. Valida:
 *   - cabecera: variable de control, =, expr inicial, Hasta, expr final,
 *     Con Paso opcional (sin duplicados, con expresión, no cero literal), Hacer
 *   - texto extra después de Hacer
 *   - variable de control e identificadores en expresiones definidos
 *   - al menos una instrucción real entre la cabecera y FinPara
 *   - FinPara en línea propia, sin texto extra
 *   - FinPara sin Para abierto
 *   - Para sin cerrar al final del documento
 */
function validarBloquesPara(lineas, tabla, agregarError) {
  const stack = [];

  for (let i = 0; i < lineas.length; i++) {
    const lineaRaw = lineas[i];
    const allTokens = tokenizarLinea(lineaRaw);
    const sig = tokensSignificativos(allTokens);
    if (sig.length === 0) continue;

    const primera = sig[0];
    const palabra = primera.type === TK.KEYWORD ? primera.value.toLowerCase() : null;

    if (palabra === 'para') {
      if (stack.length > 0) stack[stack.length - 1].contenido++;
      validarCabeceraPara(sig, i, tabla, agregarError);
      stack.push({ lineaPara: i, contenido: 0 });
      continue;
    }

    if (palabra === 'finpara') {
      if (stack.length === 0) {
        agregarError(i, crearError(
          i, primera.col, primera.end, 'finpara_sin_para',
          '"FinPara" sin una sentencia "Para" abierta.', primera.value
        ));
      } else {
        const top = stack.pop();
        if (top.contenido === 0) {
          agregarError(i, crearError(
            i, primera.col, primera.end, 'para_vacio',
            'Debe haber al menos una instrucción entre "Para ... Hacer" y "FinPara".', ''
          ));
        }
      }
      if (sig.length > 1) {
        const extra = sig[1];
        const last = sig[sig.length - 1];
        agregarError(i, crearError(
          i, extra.col, last.end, 'finpara_texto_extra',
          '"FinPara" no debe tener argumentos ni texto adicional.', ''
        ));
      }
      continue;
    }

    if (stack.length > 0) stack[stack.length - 1].contenido++;
  }

  for (const ctx of stack) {
    const longitud = lineas[ctx.lineaPara] ? lineas[ctx.lineaPara].length : 0;
    agregarError(ctx.lineaPara, crearError(
      ctx.lineaPara, 0, longitud, 'para_sin_cerrar',
      'Falta "FinPara" para cerrar la sentencia "Para".', ''
    ));
  }
}

function esKeyword(tk, nombre) {
  return tk && tk.type === TK.KEYWORD && tk.value.toLowerCase() === nombre;
}

function buscarKeywordEnRango(sig, desde, nombre) {
  for (let i = desde; i < sig.length; i++) {
    if (esKeyword(sig[i], nombre)) return i;
  }
  return -1;
}

function validarIdentificadoresDefinidos(tokens, lineaIdx, tabla, agregarError, tipoErr, mensaje) {
  for (const tk of tokens) {
    if (tk.type !== TK.IDENTIFIER) continue;
    if (!tabla.existeVariable(tk.value)) {
      agregarError(lineaIdx, crearError(
        lineaIdx, tk.col, tk.end, tipoErr, mensaje, tk.value
      ));
    }
  }
}

function validarCabeceraPara(sig, lineaIdx, tabla, agregarError) {
  const paraTok = sig[0];
  let idx = 1;

  // 1. Variable de control
  if (idx >= sig.length) {
    agregarError(lineaIdx, crearError(
      lineaIdx, paraTok.col, paraTok.end, 'para_sin_variable',
      'Falta la variable de control en la sentencia "Para".', ''
    ));
    return;
  }

  if (sig[idx].type !== TK.IDENTIFIER) {
    if (sig[idx].type === TK.ASSIGN) {
      agregarError(lineaIdx, crearError(
        lineaIdx, paraTok.col, sig[idx].end, 'para_sin_variable',
        'Falta la variable de control en la sentencia "Para".', ''
      ));
    } else {
      agregarError(lineaIdx, crearError(
        lineaIdx, sig[idx].col, sig[idx].end, 'para_variable_invalida',
        'Se esperaba una variable válida en la sentencia "Para".', sig[idx].value
      ));
    }
    return;
  }

  const varControl = sig[idx];
  if (!tabla.existeVariable(varControl.value)) {
    agregarError(lineaIdx, crearError(
      lineaIdx, varControl.col, varControl.end, 'para_variable_no_definida',
      'Variable de control no definida en la sentencia "Para".', varControl.value
    ));
  }
  idx++;

  // 2. Operador =
  if (idx >= sig.length || sig[idx].type !== TK.ASSIGN) {
    const col = idx < sig.length ? sig[idx].col : varControl.end;
    const end = idx < sig.length ? sig[idx].end : varControl.end;
    agregarError(lineaIdx, crearError(
      lineaIdx, varControl.col, end, 'para_sin_asignacion',
      'Falta el operador "=" en la sentencia "Para".', ''
    ));
    return;
  }
  const assignTok = sig[idx];
  idx++;

  // 3. Expresión inicial hasta "Hasta"
  const hastaIdx = buscarKeywordEnRango(sig, idx, 'hasta');
  if (hastaIdx === -1) {
    if (idx >= sig.length) {
      agregarError(lineaIdx, crearError(
        lineaIdx, assignTok.col, assignTok.end, 'para_sin_expresion_inicial',
        'Falta la expresión inicial en la sentencia "Para".', ''
      ));
    }
    agregarError(lineaIdx, crearError(
      lineaIdx, paraTok.col, sig[sig.length - 1].end, 'para_sin_hasta',
      'Falta la palabra clave "Hasta" en la sentencia "Para".', ''
    ));
    return;
  }

  const exprInicial = sig.slice(idx, hastaIdx);
  if (exprInicial.length === 0) {
    agregarError(lineaIdx, crearError(
      lineaIdx, assignTok.col, sig[hastaIdx].end, 'para_sin_expresion_inicial',
      'Falta la expresión inicial en la sentencia "Para".', ''
    ));
  } else {
    validarIdentificadoresDefinidos(
      exprInicial, lineaIdx, tabla, agregarError,
      'variable_no_definida_para', 'Variable no definida en la cabecera de la sentencia "Para".'
    );
  }
  const hastaTok = sig[hastaIdx];
  idx = hastaIdx + 1;

  // 4. Expresión final hasta "Con" o "Hacer"
  const conIdx = buscarKeywordEnRango(sig, idx, 'con');
  const hacerIdx0 = buscarKeywordEnRango(sig, idx, 'hacer');
  let finalEnd;
  if (conIdx !== -1 && (hacerIdx0 === -1 || conIdx < hacerIdx0)) {
    finalEnd = conIdx;
  } else if (hacerIdx0 !== -1) {
    finalEnd = hacerIdx0;
  } else {
    finalEnd = sig.length;
  }

  const exprFinal = sig.slice(idx, finalEnd);
  if (exprFinal.length === 0) {
    const colFin = finalEnd < sig.length ? sig[finalEnd].end : hastaTok.end;
    agregarError(lineaIdx, crearError(
      lineaIdx, hastaTok.col, colFin, 'para_sin_expresion_final',
      'Falta la expresión final en la sentencia "Para".', ''
    ));
  } else {
    validarIdentificadoresDefinidos(
      exprFinal, lineaIdx, tabla, agregarError,
      'variable_no_definida_para', 'Variable no definida en la cabecera de la sentencia "Para".'
    );
  }
  idx = finalEnd;

  // 5. Con Paso opcional (uno o más detectados; >1 dispara duplicado)
  let tienePaso = false;
  while (idx < sig.length && esKeyword(sig[idx], 'con')) {
    const conTok = sig[idx];
    if (tienePaso) {
      agregarError(lineaIdx, crearError(
        lineaIdx, conTok.col, conTok.end, 'para_con_paso_duplicado',
        'La sentencia "Para" ya contiene un bloque "Con Paso".', ''
      ));
    }
    idx++;

    if (idx >= sig.length || !esKeyword(sig[idx], 'paso')) {
      const colFin = idx < sig.length ? sig[idx].end : conTok.end;
      agregarError(lineaIdx, crearError(
        lineaIdx, conTok.col, colFin, 'con_sin_paso',
        'Después de "Con" debe ir la palabra clave "Paso".', ''
      ));
      break;
    }
    const pasoTok = sig[idx];
    idx++;

    const nextCon = buscarKeywordEnRango(sig, idx, 'con');
    const nextHacer = buscarKeywordEnRango(sig, idx, 'hacer');
    let pasoEnd;
    if (nextCon !== -1 && (nextHacer === -1 || nextCon < nextHacer)) {
      pasoEnd = nextCon;
    } else if (nextHacer !== -1) {
      pasoEnd = nextHacer;
    } else {
      pasoEnd = sig.length;
    }

    const exprPaso = sig.slice(idx, pasoEnd);
    if (exprPaso.length === 0) {
      const colFin = pasoEnd < sig.length ? sig[pasoEnd].end : pasoTok.end;
      agregarError(lineaIdx, crearError(
        lineaIdx, pasoTok.col, colFin, 'para_sin_expresion_paso',
        'Falta la expresión de paso en la sentencia "Para".', ''
      ));
    } else {
      validarIdentificadoresDefinidos(
        exprPaso, lineaIdx, tabla, agregarError,
        'variable_no_definida_para', 'Variable no definida en la cabecera de la sentencia "Para".'
      );
      if (exprPaso.length === 1 && exprPaso[0].type === TK.NUMBER) {
        const n = parseFloat(exprPaso[0].value);
        if (!isNaN(n) && n === 0) {
          agregarError(lineaIdx, crearError(
            lineaIdx, exprPaso[0].col, exprPaso[0].end, 'paso_cero',
            'El valor de "Paso" no puede ser cero.', exprPaso[0].value
          ));
        }
      }
    }

    idx = pasoEnd;
    tienePaso = true;
  }

  // 6. Hacer
  if (idx >= sig.length || !esKeyword(sig[idx], 'hacer')) {
    const last = sig[sig.length - 1];
    agregarError(lineaIdx, crearError(
      lineaIdx, paraTok.col, last.end, 'para_sin_hacer',
      'Falta la palabra clave "Hacer" en la sentencia "Para".', ''
    ));
    return;
  }
  idx++;

  // 7. Texto después de Hacer
  if (idx < sig.length) {
    const extra = sig[idx];
    const last = sig[sig.length - 1];
    agregarError(lineaIdx, crearError(
      lineaIdx, extra.col, last.end, 'hacer_texto_extra',
      'No debe haber texto después de "Hacer".', ''
    ));
  }
}

/**
 * Validates a single line given its tokens and the current symbol table.
 * Mutates tabla (adds Definir variables, marks initialized for assignments/Leer).
 * tablaSubprocesos: optional Map of known user-defined subprocesos (for call validation).
 */
function validarLinea(sig, allTokens, lineaIdx, tabla, tablaSubprocesos) {
  const errores = [];

  if (sig.length === 0) return errores;

  // ── 1. Check for unclosed strings ──
  for (const tk of allTokens) {
    if (tk.type === TK.STRING_UNCLOSED) {
      errores.push(crearError(
        lineaIdx, tk.col, tk.end,
        'string_sin_cerrar',
        'Texto sin cerrar con comillas dobles.',
        tk.value
      ));
    }
  }

  // ── 2. Check for adjacent value tokens without comma/operator (strings pegados) ──
  // This detects: "Hola""Mundo", "edad"edad, etc.
  // We look at significant tokens and check if two "value-like" tokens are adjacent
  // without an operator or comma between them.
  detectarTokensAdyacentesSinComa(sig, lineaIdx, errores);

  // If there are unclosed string errors, skip further validation for this line
  // since the token stream may be unreliable
  if (errores.some(e => e.tipo === 'string_sin_cerrar')) {
    return errores;
  }

  // ── 3. Standard instruction validation ──
  // Etiquetas de caso ("1:", "1, 2: Escribir ..."): si hay contenido inline
  // tras ":", se valida recursivamente como si fuese una línea normal.
  const casoLinea = detectarEtiquetaCaso(sig);
  if (casoLinea) {
    if (casoLinea.inline.length > 0) {
      errores.push(...validarLinea(casoLinea.inline, casoLinea.inline, lineaIdx, tabla));
    }
    return errores;
  }

  const primerToken = sig[0];
  const instruccion = primerToken.type === TK.KEYWORD ? primerToken.value.toLowerCase() : null;

  // ── Construcciones de PSeInt fuera de alcance en LiteSeInt v0.6.0 ──
  // Mensajes pedagógicos en lugar del genérico "Instrucción no reconocida".
  if (primerToken.type === TK.IDENTIFIER) {
    const fuera = CONSTRUCCIONES_FUERA_DE_ALCANCE[primerToken.value.toLowerCase()];
    if (fuera) {
      errores.push(crearError(
        lineaIdx, primerToken.col, sig[sig.length - 1].end,
        'fuera_de_alcance',
        fuera,
        primerToken.value
      ));
      return errores;
    }
  }

  switch (instruccion) {
    case 'dimension':
      validarDimension(sig, lineaIdx, tabla, errores);
      break;

    case 'definir':
      validarDefinir(sig, lineaIdx, tabla, errores);
      break;

    case 'escribir':
      validarEscribir(sig, lineaIdx, tabla, errores);
      break;

    case 'leer':
      validarLeer(sig, lineaIdx, tabla, errores);
      break;

    case 'proceso':
    case 'finproceso':
      break;

    case 'llamar':
      validarLlamar(sig, lineaIdx, tabla, tablaSubprocesos, errores);
      break;

    // SubProceso/Funcion keywords — structural validation handled separately
    case 'subproceso':
    case 'funcion':
    case 'finsubproceso':
    case 'finfuncion':
      break;

    // ── Estructuras de control — aceptadas sin validación profunda ──
    case 'si':
    case 'sino':
    case 'finsi':
    case 'mientras':
    case 'finmientras':
    case 'repetir':
    case 'hastaque':
    case 'para':
    case 'finpara':
    case 'segun':
    case 'finsegun':
    case 'de':       // De Otro Modo:
    case 'entonces': // no debería aparecer solo, pero evita falso positivo
    case 'hacer':
    case 'hasta':
    case 'que':
    case 'con':
    case 'paso':
    case 'otro':
    case 'modo':
    case 'y':
    case 'o':
    case 'no':
      break;

    default:
      // Etiqueta de caso en Segun: cualquier línea cuyo último token significativo es COLON
      if (sig[sig.length - 1].type === TK.COLON) {
        break;
      }
      if (sig.length >= 3 && sig[1].type === TK.ASSIGN) {
        validarAsignacion(sig, lineaIdx, tabla, errores);
      } else if (primerToken.type === TK.IDENTIFIER && sig[1] && sig[1].type === TK.LBRACKET) {
        validarAsignacionIndice(sig, lineaIdx, tabla, errores);
      } else if (primerToken.type === TK.IDENTIFIER) {
        if (!tabla.existeVariable(primerToken.value)) {
          errores.push(crearError(
            lineaIdx, primerToken.col, primerToken.end,
            'instruccion_no_reconocida',
            `Instrucción no reconocida: "${primerToken.value}"`,
            primerToken.value
          ));
        } else {
          errores.push(crearError(
            lineaIdx, primerToken.col, sig[sig.length - 1].end,
            'instruccion_no_reconocida',
            `Instrucción no reconocida.`,
            primerToken.value
          ));
        }
      } else {
        errores.push(crearError(
          lineaIdx, primerToken.col, sig[sig.length - 1].end,
          'instruccion_no_reconocida',
          `Instrucción no reconocida.`,
          primerToken.value
        ));
      }
      break;
  }

  return errores;
}

// ─────────────────────────────────────────────
//  DETECTION: Adjacent value tokens without comma
// ─────────────────────────────────────────────

/**
 * Checks significant tokens for two adjacent "value-like" tokens
 * that lack an operator or comma between them.
 *
 * Value-like tokens: STRING, STRING_UNCLOSED, IDENTIFIER, NUMBER
 *
 * Cases detected:
 *   "Hola""Mundo"        → STRING STRING
 *   "edad"edad           → STRING IDENTIFIER
 *   "texto"""            → STRING STRING (the "" is an empty string)
 *   nombre"hola"         → IDENTIFIER STRING
 *
 * Tokens that act as separators (and prevent this error):
 *   COMMA, OPERATOR, ASSIGN, LPAREN, RPAREN
 *
 * We skip the first token if it's a keyword (like Escribir) since
 * Escribir "hola" is valid (keyword followed by value).
 */
function detectarTokensAdyacentesSinComa(sig, lineaIdx, errores) {
  const esValor = (t) =>
    t.type === TK.STRING || t.type === TK.STRING_UNCLOSED ||
    t.type === TK.IDENTIFIER || t.type === TK.NUMBER;

  for (let i = 1; i < sig.length; i++) {
    const prev = sig[i - 1];
    const curr = sig[i];

    // Both must be value-like
    if (!esValor(prev) || !esValor(curr)) continue;

    // Skip if prev is a keyword (e.g. Escribir "hola" is fine)
    if (prev.type === TK.KEYWORD) continue;

    // These two value tokens are adjacent without separator → error
    // Mark the boundary between them
    errores.push(crearError(
      lineaIdx, prev.end, curr.col > prev.end ? curr.col : curr.end,
      'falta_coma_concatenar',
      'Falta una coma para poder concatenar.',
      ''
    ));
  }
}

// ─────────────────────────────────────────────
//  VALIDATION: Definir
// ─────────────────────────────────────────────

function validarDefinir(sig, lineaIdx, tabla, errores) {
  if (sig.length < 4) {
    errores.push(crearError(
      lineaIdx, sig[0].col, sig[sig.length - 1].end,
      'sintaxis_definir',
      'Sintaxis inválida. Use: Definir <var1>, <var2> Como <Entero|Real|Caracter|Logico>',
      ''
    ));
    return;
  }

  let comoIdx = -1;
  for (let i = 1; i < sig.length; i++) {
    if (sig[i].type === TK.KEYWORD && sig[i].value.toLowerCase() === 'como') {
      comoIdx = i;
      break;
    }
  }

  if (comoIdx === -1) {
    errores.push(crearError(
      lineaIdx, sig[0].col, sig[sig.length - 1].end,
      'sintaxis_definir',
      'Falta la palabra clave "Como" en la declaración.',
      ''
    ));
    return;
  }

  if (comoIdx + 1 >= sig.length) {
    errores.push(crearError(
      lineaIdx, sig[comoIdx].col, sig[comoIdx].end,
      'sintaxis_definir',
      'Falta el tipo de dato después de "Como". Use: Entero, Real, Caracter o Logico.',
      ''
    ));
    return;
  }

  const tipoToken = sig[comoIdx + 1];
  if (!TIPOS_VALIDOS.has(tipoToken.value.toLowerCase())) {
    errores.push(crearError(
      lineaIdx, tipoToken.col, tipoToken.end,
      'tipo_invalido',
      `Tipo de dato no reconocido: "${tipoToken.value}". Use: Entero, Real, Caracter o Logico.`,
      tipoToken.value
    ));
  }

  if (comoIdx + 2 < sig.length) {
    const extra = sig[comoIdx + 2];
    errores.push(crearError(
      lineaIdx, extra.col, sig[sig.length - 1].end,
      'sintaxis_definir',
      'Texto inesperado después del tipo de dato.',
      ''
    ));
  }

  const varTokens = sig.slice(1, comoIdx);

  if (varTokens.length === 0) {
    errores.push(crearError(
      lineaIdx, sig[0].end, sig[comoIdx].col,
      'sintaxis_definir',
      'Debe declarar al menos una variable después de "Definir".',
      ''
    ));
    return;
  }

  const tipo = TIPOS_VALIDOS.has(tipoToken.value.toLowerCase()) ? tipoToken.value.toLowerCase() : 'caracter';
  const definedInThisLine = new Set();

  let esperandoIdentificador = true;

  for (let i = 0; i < varTokens.length; i++) {
    const tk = varTokens[i];

    if (esperandoIdentificador) {
      if (tk.type === TK.COMMA) {
        errores.push(crearError(
          lineaIdx, tk.col, tk.end,
          'coma_invalida',
          'El uso de la , al Definir una variable siempre se debe declarar una variable antes y despues.',
          ','
        ));
        continue;
      }

      if (tk.type !== TK.IDENTIFIER) {
        if (tk.type === TK.KEYWORD) {
          errores.push(crearError(
            lineaIdx, tk.col, tk.end,
            'nombre_reservado',
            `"${tk.value}" es una palabra reservada y no puede usarse como variable.`,
            tk.value
          ));
        } else {
          errores.push(crearError(
            lineaIdx, tk.col, tk.end,
            'sintaxis_definir',
            `Se esperaba un nombre de variable, se encontró: "${tk.value}"`,
            tk.value
          ));
        }
        esperandoIdentificador = false;
        continue;
      }

      if (PALABRAS_RESERVADAS_SET.has(tk.value.toLowerCase())) {
        errores.push(crearError(
          lineaIdx, tk.col, tk.end,
          'nombre_reservado',
          `"${tk.value}" es una palabra reservada y no puede usarse como variable.`,
          tk.value
        ));
        esperandoIdentificador = false;
        continue;
      }

      const keyLower = tk.value.toLowerCase();

      if (definedInThisLine.has(keyLower)) {
        errores.push(crearError(
          lineaIdx, tk.col, tk.end,
          'variable_duplicada',
          `Variable "${tk.value}" ya se encuentra definida.`,
          tk.value
        ));
      } else if (tabla.existeVariable(keyLower) && tabla.obtenerTipo(keyLower) !== null) {
        errores.push(crearError(
          lineaIdx, tk.col, tk.end,
          'variable_duplicada',
          `Variable "${tk.value}" ya se encuentra definida.`,
          tk.value
        ));
      } else {
        // tabla.definir completa el tipo si la variable fue pre-registrada por Dimension
        tabla.definir(tk.value, tipo, lineaIdx);
      }

      definedInThisLine.add(keyLower);
      esperandoIdentificador = false;
    } else {
      if (tk.type === TK.COMMA) {
        if (i === varTokens.length - 1) {
          errores.push(crearError(
            lineaIdx, tk.col, tk.end,
            'coma_invalida',
            'El uso de la , al Definir una variable siempre se debe declarar una variable antes y despues.',
            ','
          ));
        }
        esperandoIdentificador = true;
      } else {
        errores.push(crearError(
          lineaIdx, tk.col, tk.end,
          'sintaxis_definir',
          `Se esperaba una coma o "Como", se encontró: "${tk.value}"`,
          tk.value
        ));
      }
    }
  }
}

// ─────────────────────────────────────────────
//  VALIDATION: Escribir
// ─────────────────────────────────────────────

function validarEscribir(sig, lineaIdx, tabla, errores) {
  if (sig.length < 2) {
    errores.push(crearError(
      lineaIdx, sig[0].col, sig[0].end,
      'sintaxis_escribir',
      'Falta la expresión después de "Escribir".',
      ''
    ));
    return;
  }

  const exprTokens = sig.slice(1);
  validarListaExpresiones(exprTokens, lineaIdx, tabla, errores);
}

// ─────────────────────────────────────────────
//  VALIDATION: Leer
// ─────────────────────────────────────────────

function validarLeer(sig, lineaIdx, tabla, errores) {
  if (sig.length < 2) {
    errores.push(crearError(
      lineaIdx, sig[0].col, sig[0].end,
      'sintaxis_leer',
      'Falta la variable después de "Leer".',
      ''
    ));
    return;
  }

  const varToken = sig[1];

  // Leer arr[i] o Leer mat[i, j]
  if (sig[2] && sig[2].type === TK.LBRACKET) {
    validarLeerIndice(sig, lineaIdx, tabla, errores);
    return;
  }

  if (sig.length > 2) {
    errores.push(crearError(
      lineaIdx, sig[2].col, sig[sig.length - 1].end,
      'sintaxis_leer',
      'Sintaxis inválida. Use: Leer <variable>',
      ''
    ));
  }

  if (varToken.type !== TK.IDENTIFIER) {
    errores.push(crearError(
      lineaIdx, varToken.col, varToken.end,
      'sintaxis_leer',
      `Se esperaba un nombre de variable después de "Leer", se encontró: "${varToken.value}"`,
      varToken.value
    ));
    return;
  }

  if (!tabla.existeVariable(varToken.value)) {
    errores.push(crearError(
      lineaIdx, varToken.col, varToken.end,
      'variable_no_definida',
      `Variable "${varToken.value}" no definida.`,
      varToken.value
    ));
    return;
  }

  tabla.marcarInicializada(varToken.value);
}

// ─────────────────────────────────────────────
//  VALIDATION: Asignación (var = expr)
// ─────────────────────────────────────────────

function validarAsignacion(sig, lineaIdx, tabla, errores) {
  const varToken = sig[0];

  if (varToken.type !== TK.IDENTIFIER) {
    errores.push(crearError(
      lineaIdx, varToken.col, varToken.end,
      'sintaxis_asignacion',
      `Se esperaba una variable antes de "=", se encontró: "${varToken.value}"`,
      varToken.value
    ));
    return;
  }

  if (!tabla.existeVariable(varToken.value)) {
    errores.push(crearError(
      lineaIdx, varToken.col, varToken.end,
      'variable_no_definida',
      `Variable "${varToken.value}" no definida. Use "Definir ${varToken.value} Como Tipo" primero.`,
      varToken.value
    ));
    return;
  }

  const exprTokens = sig.slice(2);
  if (exprTokens.length === 0) {
    errores.push(crearError(
      lineaIdx, sig[1].col, sig[1].end,
      'sintaxis_asignacion',
      'Falta la expresión después de "=".',
      ''
    ));
    return;
  }

  validarExpresionTokens(exprTokens, lineaIdx, tabla, errores);

  tabla.marcarInicializada(varToken.value);
}

// ─────────────────────────────────────────────
//  VALIDATION: Expression List (for Escribir)
// ─────────────────────────────────────────────

function validarListaExpresiones(tokens, lineaIdx, tabla, errores) {
  const grupos = [];
  let grupoActual = [];
  let nivelParen = 0;
  let nivelBracket = 0;

  // Dividimos por comas sólo en el nivel exterior (fuera de paréntesis y corchetes).
  // Las comas dentro de paréntesis son argumentos de funciones, y las de
  // corchetes son índices de arreglos.
  for (const tk of tokens) {
    if (tk.type === TK.LPAREN) {
      nivelParen++;
      grupoActual.push(tk);
      continue;
    }
    if (tk.type === TK.RPAREN) {
      nivelParen = Math.max(0, nivelParen - 1);
      grupoActual.push(tk);
      continue;
    }
    if (tk.type === TK.LBRACKET) {
      nivelBracket++;
      grupoActual.push(tk);
      continue;
    }
    if (tk.type === TK.RBRACKET) {
      nivelBracket = Math.max(0, nivelBracket - 1);
      grupoActual.push(tk);
      continue;
    }
    if (tk.type === TK.COMMA && nivelParen === 0 && nivelBracket === 0) {
      if (grupoActual.length > 0) {
        grupos.push(grupoActual);
      } else {
        errores.push(crearError(
          lineaIdx, tk.col, tk.end,
          'coma_invalida',
          'Coma sin expresión previa.',
          ','
        ));
      }
      grupoActual = [];
    } else {
      grupoActual.push(tk);
    }
  }
  if (grupoActual.length > 0) {
    grupos.push(grupoActual);
  }

  for (const grupo of grupos) {
    validarExpresionTokens(grupo, lineaIdx, tabla, errores);
  }
}

// ─────────────────────────────────────────────
//  VALIDATION: Expression tokens
// ─────────────────────────────────────────────

function validarExpresionTokens(tokens, lineaIdx, tabla, errores) {
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];

    if (tk.type === TK.IDENTIFIER) {
      const next = tokens[i + 1];
      const esLlamada = next && next.type === TK.LPAREN;
      const esIndice  = next && next.type === TK.LBRACKET;

      if (esLlamada) {
        const nombreLower = tk.value.toLowerCase();
        if (!FUNCIONES_NATIVAS_SET.has(nombreLower)) {
          // Accept user-defined subprocesos/funciones with return value
          // tablaSubprocesos is not in scope here — we tolerate unknown names
          // to avoid false positives; runtime will catch truly undefined calls.
        }
        continue;
      }

      if (esIndice) {
        // Acceso por índice: arr[i] o mat[i, j]
        if (!tabla.existeVariable(tk.value)) {
          errores.push(crearError(
            lineaIdx, tk.col, tk.end,
            'variable_no_definida',
            `Variable "${tk.value}" no definida.`,
            tk.value
          ));
        } else if (!tabla.esArreglo(tk.value)) {
          errores.push(crearError(
            lineaIdx, tk.col, next.end,
            'no_es_arreglo',
            `"${tk.value}" no es un arreglo. Declare sus dimensiones con "Dimension".`,
            tk.value
          ));
        }
        // Avanzar hasta el RBRACKET correspondiente, validando tokens internos
        let k = i + 2; // después de LBRACKET
        let depth = 0;
        const indexGroups = [];
        let currentGroup = [];
        while (k < tokens.length) {
          const t = tokens[k];
          if (t.type === TK.LBRACKET) { depth++; currentGroup.push(t); }
          else if (t.type === TK.RBRACKET) {
            if (depth === 0) { indexGroups.push(currentGroup); break; }
            depth--;
            currentGroup.push(t);
          } else if (t.type === TK.COMMA && depth === 0) {
            indexGroups.push(currentGroup);
            currentGroup = [];
          } else {
            currentGroup.push(t);
          }
          k++;
        }
        if (indexGroups.length > 0) {
          for (const group of indexGroups) {
            if (group.length === 0) {
              errores.push(crearError(lineaIdx, tokens[i + 1].col, tokens[i + 1].end,
                'indice_vacio', 'Falta el índice del arreglo.', ''));
            } else {
              validarExpresionTokens(group, lineaIdx, tabla, errores);
            }
          }
        }
        i = k; // avanzar más allá del RBRACKET
        continue;
      }

      if (FUNCIONES_NATIVAS_SET.has(tk.value.toLowerCase())) {
        errores.push(crearError(
          lineaIdx, tk.col, tk.end,
          'llamada_sin_parentesis',
          `Falta "(" para llamar a la función "${tk.value}".`,
          tk.value
        ));
        continue;
      }

      if (!tabla.existeVariable(tk.value)) {
        errores.push(crearError(
          lineaIdx, tk.col, tk.end,
          'variable_no_definida',
          `Variable "${tk.value}" no definida.`,
          tk.value
        ));
      }
    } else if (tk.type === TK.STRING || tk.type === TK.STRING_UNCLOSED ||
               tk.type === TK.NUMBER ||
               tk.type === TK.OPERATOR || tk.type === TK.LPAREN ||
               tk.type === TK.RPAREN || tk.type === TK.ASSIGN ||
               tk.type === TK.COMMA ||
               tk.type === TK.LBRACKET || tk.type === TK.RBRACKET) {
      // Tokens válidos dentro de una expresión.
    } else if (tk.type === TK.KEYWORD) {
      if (KEYWORDS_EXPR_OK.has(tk.value.toLowerCase())) continue;
      errores.push(crearError(
        lineaIdx, tk.col, tk.end,
        'token_inesperado',
        `Palabra reservada "${tk.value}" no esperada en esta expresión.`,
        tk.value
      ));
    }
  }
}

// ─────────────────────────────────────────────
//  VALIDATION: Dimension
// ─────────────────────────────────────────────

function validarDimension(sig, lineaIdx, tabla, errores) {
  const dimTok = sig[0];

  if (sig.length < 5) {
    errores.push(crearError(lineaIdx, dimTok.col, sig[sig.length - 1].end,
      'sintaxis_dimension',
      'Sintaxis inválida. Use: Dimension nombre[tamaño] o Dimension nombre[filas, columnas]',
      ''));
    return;
  }

  const nombreTok = sig[1];
  if (nombreTok.type !== TK.IDENTIFIER) {
    errores.push(crearError(lineaIdx, nombreTok.col, nombreTok.end,
      'dimension_nombre_invalido',
      'Se esperaba un nombre de variable después de "Dimension".',
      nombreTok.value));
    return;
  }

  if (sig[2].type !== TK.LBRACKET) {
    errores.push(crearError(lineaIdx, sig[2].col, sig[2].end,
      'sintaxis_dimension',
      'Se esperaba "[" después del nombre del arreglo.',
      sig[2].value));
    return;
  }

  const rbrIdx = sig.findIndex((t, idx) => idx > 2 && t.type === TK.RBRACKET);
  if (rbrIdx === -1) {
    errores.push(crearError(lineaIdx, sig[2].col, sig[sig.length - 1].end,
      'dimension_sin_cierre',
      'Falta "]" en la declaración "Dimension".',
      ''));
    return;
  }

  if (rbrIdx + 1 < sig.length) {
    errores.push(crearError(lineaIdx, sig[rbrIdx + 1].col, sig[sig.length - 1].end,
      'dimension_texto_extra',
      'Texto inesperado después del cierre "]" en "Dimension".',
      ''));
  }

  const innerTokens = sig.slice(3, rbrIdx);
  if (innerTokens.length === 0) {
    errores.push(crearError(lineaIdx, sig[2].col, sig[rbrIdx].end,
      'dimension_vacia',
      'Falta el tamaño de la dimensión.',
      ''));
    return;
  }

  // Separar dimensiones por coma
  const dimGroups = [];
  let currentGroup = [];
  for (const t of innerTokens) {
    if (t.type === TK.COMMA) {
      dimGroups.push(currentGroup);
      currentGroup = [];
    } else {
      currentGroup.push(t);
    }
  }
  dimGroups.push(currentGroup);

  if (dimGroups.length > 2) {
    errores.push(crearError(lineaIdx, sig[2].col, sig[rbrIdx].end,
      'dimension_aridad',
      'Solo se soportan arreglos de una o dos dimensiones.',
      ''));
    return;
  }

  const dimensiones = [];
  for (const group of dimGroups) {
    if (group.length === 0) {
      errores.push(crearError(lineaIdx, sig[2].col, sig[rbrIdx].end,
        'dimension_vacia', 'Falta el tamaño de la dimensión.', ''));
      dimensiones.push(1);
      continue;
    }
    if (group.length === 1 && group[0].type === TK.NUMBER) {
      const n = parseInt(group[0].value, 10);
      if (n <= 0) {
        errores.push(crearError(lineaIdx, group[0].col, group[0].end,
          'dimension_no_positiva',
          'El tamaño de la dimensión debe ser mayor que 0.',
          group[0].value));
        dimensiones.push(1);
      } else {
        dimensiones.push(n);
      }
    } else {
      // Expresión como dimensión: se valida estáticamente pero el valor
      // se evalúa en runtime. Solo validamos que los identificadores existan.
      validarExpresionTokens(group, lineaIdx, tabla, errores);
      dimensiones.push(null); // desconocido en tiempo de validación
    }
  }

  tabla.dimensionar(nombreTok.value, dimensiones, lineaIdx);
}

// ─────────────────────────────────────────────
//  VALIDATION: Llamar SubProceso(args)
// ─────────────────────────────────────────────

function validarLlamar(sig, lineaIdx, tabla, tablaSubprocesos, errores) {
  // sig[0] = 'llamar'
  if (sig.length < 2) {
    errores.push(crearError(lineaIdx, sig[0].col, sig[0].end,
      'sintaxis_llamar', 'Falta el nombre del SubProceso después de "Llamar".', ''));
    return;
  }

  const nombreTk = sig[1];
  if (nombreTk.type !== TK.IDENTIFIER) {
    errores.push(crearError(lineaIdx, nombreTk.col, nombreTk.end,
      'sintaxis_llamar', `Se esperaba un nombre de SubProceso después de "Llamar".`, nombreTk.value));
    return;
  }

  if (!tablaSubprocesos) return;
  const nombreLower = nombreTk.value.toLowerCase();
  if (!tablaSubprocesos.has(nombreLower)) {
    errores.push(crearError(lineaIdx, nombreTk.col, nombreTk.end,
      'subproceso_no_definido',
      `SubProceso "${nombreTk.value}" no está definido.`, nombreTk.value));
  }
}

// ─────────────────────────────────────────────
//  VALIDATION: AsignaciónIndice  arr[i] = expr
// ─────────────────────────────────────────────

function validarAsignacionIndice(sig, lineaIdx, tabla, errores) {
  const nombreTok = sig[0];

  if (!tabla.existeVariable(nombreTok.value)) {
    errores.push(crearError(lineaIdx, nombreTok.col, nombreTok.end,
      'variable_no_definida',
      `Variable "${nombreTok.value}" no definida.`,
      nombreTok.value));
    return;
  }

  if (!tabla.esArreglo(nombreTok.value)) {
    errores.push(crearError(lineaIdx, nombreTok.col, sig[1].end,
      'no_es_arreglo',
      `"${nombreTok.value}" no es un arreglo. Declare sus dimensiones con "Dimension".`,
      nombreTok.value));
    return;
  }

  // Buscar RBRACKET y el ASSIGN que le sigue
  const rbrIdx = sig.findIndex((t, idx) => idx > 1 && t.type === TK.RBRACKET);
  if (rbrIdx === -1) {
    errores.push(crearError(lineaIdx, sig[1].col, sig[sig.length - 1].end,
      'sintaxis_indice', 'Falta "]" en el acceso por índice.', ''));
    return;
  }

  if (!sig[rbrIdx + 1] || sig[rbrIdx + 1].type !== TK.ASSIGN) {
    errores.push(crearError(lineaIdx, nombreTok.col, sig[sig.length - 1].end,
      'sintaxis_asignacion_indice', 'Se esperaba "=" después del índice.', ''));
    return;
  }

  // Validar tokens de índice (entre [ y ])
  const indexTokens = sig.slice(2, rbrIdx);
  if (indexTokens.length === 0) {
    errores.push(crearError(lineaIdx, sig[1].col, sig[rbrIdx].end,
      'indice_vacio', 'Falta el índice del arreglo.', ''));
  } else {
    const indexGroups = _splitTokensByCommaTopLevel(indexTokens);
    for (const group of indexGroups) {
      validarExpresionTokens(group, lineaIdx, tabla, errores);
    }
  }

  // Validar expresión del RHS
  const exprTokens = sig.slice(rbrIdx + 2);
  if (exprTokens.length === 0) {
    errores.push(crearError(lineaIdx, sig[rbrIdx + 1].col, sig[rbrIdx + 1].end,
      'sintaxis_asignacion_indice', 'Falta la expresión después de "=".', ''));
  } else {
    validarExpresionTokens(exprTokens, lineaIdx, tabla, errores);
  }

  tabla.marcarInicializada(nombreTok.value);
}

// ─────────────────────────────────────────────
//  VALIDATION: LeerIndice  Leer arr[i]
// ─────────────────────────────────────────────

function validarLeerIndice(sig, lineaIdx, tabla, errores) {
  // sig[0] = 'leer', sig[1] = nombre, sig[2] = '[', ..., sig[n] = ']'
  const nombreTok = sig[1];

  if (nombreTok.type !== TK.IDENTIFIER) {
    errores.push(crearError(lineaIdx, nombreTok.col, nombreTok.end,
      'sintaxis_leer',
      `Se esperaba un nombre de variable después de "Leer", se encontró: "${nombreTok.value}"`,
      nombreTok.value));
    return;
  }

  if (!tabla.existeVariable(nombreTok.value)) {
    errores.push(crearError(lineaIdx, nombreTok.col, nombreTok.end,
      'variable_no_definida',
      `Variable "${nombreTok.value}" no definida.`,
      nombreTok.value));
    return;
  }

  if (!tabla.esArreglo(nombreTok.value)) {
    errores.push(crearError(lineaIdx, nombreTok.col, sig[2].end,
      'no_es_arreglo',
      `"${nombreTok.value}" no es un arreglo. Declare sus dimensiones con "Dimension".`,
      nombreTok.value));
    return;
  }

  const rbrIdx = sig.findIndex((t, idx) => idx > 2 && t.type === TK.RBRACKET);
  if (rbrIdx === -1) {
    errores.push(crearError(lineaIdx, sig[2].col, sig[sig.length - 1].end,
      'sintaxis_indice', 'Falta "]" en el acceso por índice.', ''));
    return;
  }

  if (rbrIdx + 1 < sig.length) {
    errores.push(crearError(lineaIdx, sig[rbrIdx + 1].col, sig[sig.length - 1].end,
      'sintaxis_leer', 'Texto inesperado después del índice en "Leer".', ''));
  }

  const indexTokens = sig.slice(3, rbrIdx);
  if (indexTokens.length === 0) {
    errores.push(crearError(lineaIdx, sig[2].col, sig[rbrIdx].end,
      'indice_vacio', 'Falta el índice del arreglo.', ''));
  } else {
    const indexGroups = _splitTokensByCommaTopLevel(indexTokens);
    for (const group of indexGroups) {
      validarExpresionTokens(group, lineaIdx, tabla, errores);
    }
  }

  tabla.marcarInicializada(nombreTok.value);
}

// Divide una lista de tokens por comas en el nivel exterior (no dentro de [] ni ())
function _splitTokensByCommaTopLevel(tokens) {
  const groups = [];
  let current = [];
  let depthParen = 0;
  let depthBracket = 0;
  for (const t of tokens) {
    if (t.type === TK.LPAREN)   { depthParen++;   current.push(t); continue; }
    if (t.type === TK.RPAREN)   { depthParen = Math.max(0, depthParen - 1); current.push(t); continue; }
    if (t.type === TK.LBRACKET) { depthBracket++; current.push(t); continue; }
    if (t.type === TK.RBRACKET) { depthBracket = Math.max(0, depthBracket - 1); current.push(t); continue; }
    if (t.type === TK.COMMA && depthParen === 0 && depthBracket === 0) {
      groups.push(current);
      current = [];
    } else {
      current.push(t);
    }
  }
  groups.push(current);
  return groups;
}

// ─────────────────────────────────────────────
//  EXTRACT VARIABLES (for autocomplete)
// ─────────────────────────────────────────────

function extraerVariablesDelCodigo(codigo) {
  const vars = [];
  const seen = new Set();
  const lineas = codigo.split('\n');

  for (const raw of lineas) {
    const tokens = tokenizarLinea(raw);
    const sig = tokensSignificativos(tokens);

    if (sig.length < 4) continue;
    if (sig[0].type !== TK.KEYWORD || sig[0].value.toLowerCase() !== 'definir') continue;

    let comoIdx = -1;
    for (let i = 1; i < sig.length; i++) {
      if (sig[i].type === TK.KEYWORD && sig[i].value.toLowerCase() === 'como') {
        comoIdx = i;
        break;
      }
    }
    if (comoIdx === -1) continue;

    for (let i = 1; i < comoIdx; i++) {
      if (sig[i].type === TK.IDENTIFIER) {
        const key = sig[i].value.toLowerCase();
        if (!seen.has(key) && !PALABRAS_RESERVADAS_SET.has(key)) {
          seen.add(key);
          vars.push(sig[i].value);
        }
      }
    }
  }

  return vars;
}

// ─────────────────────────────────────────────
//  DECORATION HELPERS
// ─────────────────────────────────────────────

function erroresADecoraciones(erroresLinea) {
  if (!erroresLinea) return [];
  return erroresLinea.map(e => ({
    col: e.columnaInicio,
    end: e.columnaFin,
    mensaje: e.mensaje,
  }));
}

function mensajesDeLinea(erroresLinea) {
  if (!erroresLinea) return '';
  return erroresLinea.map(e => e.mensaje).join('\n');
}
