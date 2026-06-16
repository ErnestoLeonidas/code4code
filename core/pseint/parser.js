/**
 * ============================================================
 *  core/pseint/parser.js — Construcción del AST PSeInt
 * ============================================================
 *  parsearPSeInt(codigo, perfil) → { ast, errores }
 *
 *  Estrategia:
 *  1. Divide el código en líneas.
 *  2. Itera línea a línea con un índice mutable.
 *  3. Detecta el primer token/keyword de cada línea para identificar
 *     la instrucción y delegar a parsers de bloque recursivos.
 *  4. El texto de expresiones (condiciones, argumentos) se almacena
 *     tal cual en el nodo; el evaluador de expresiones lo procesa.
 *  5. Errores se recopilan en `errores` pero el parser sigue adelante
 *     (tolerante).
 *
 *  Depende de (en scope global cuando se carga como script clásico):
 *  - DocErroresPSeInt: { TK, tokenizarLinea }  (core/pseint/tokenizer.js)
 *  - nodoPrograma, nodoDefinir, … nodoDesconocido  (core/pseint/ast.js)
 *
 *  Script clásico — NO módulo ES. Compatible con browser y Node.
 * ============================================================
 */

/* global DocErroresPSeInt,
          locDeLinea, nodoPrograma,
          nodoDefinir, nodoAsignar, nodoLeer, nodoEscribir, nodoDimension,
          nodoSi, nodoMientras, nodoPara, nodoRepetir,
          nodoSegun, nodoCaso, nodoSubProceso, nodoRetornar, nodoLlamar,
          nodoOrdenar, nodoDesconocido, module */

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quita comentarios de línea (//) respetando strings entre comillas.
 * @param {string} linea
 * @returns {string} línea sin comentario, con trim()
 */
function _stripCommentPSeInt(linea) {
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    if (linea[i] === '"') {
      enComillas = !enComillas;
    } else if (!enComillas && linea[i] === '/' && linea[i + 1] === '/') {
      return linea.substring(0, i).trim();
    }
  }
  return linea.trim();
}

/**
 * Normaliza una línea para comparaciones insensibles a mayúsculas.
 * Devuelve la versión limpia (sin comentario, sin espacios extra) en
 * minúsculas, pero también conserva el original para loc.
 */
function _normalizar(lineaRaw) {
  return _stripCommentPSeInt(lineaRaw).toLowerCase();
}

/**
 * Obtiene el primer token de contenido de una línea normalizada.
 * Usa el tokenizador PSeInt para identificar keywords vs identificadores.
 */
function _primerToken(lineaNorm) {
  // Acceso seguro al tokenizador (global en browser, inyectado en tests)
  const tkFn = (typeof DocErroresPSeInt !== 'undefined')
    ? DocErroresPSeInt.tokenizarLinea
    : null;

  if (tkFn) {
    const tokens = tkFn(lineaNorm);
    if (tokens.length > 0) return tokens[0].valor.toLowerCase();
  }
  // Fallback: primera palabra
  const m = lineaNorm.match(/^\s*(\S+)/);
  return m ? m[1] : '';
}

/**
 * Extrae el texto entre un keyword de apertura y el final de la línea,
 * con trim. P.ej. para "mientras i < 10 hacer" y keyword "mientras":
 *   → "i < 10 hacer"
 */
function _restoDeLinea(linea, keyword) {
  return linea.substring(keyword.length).trim();
}

/**
 * Elimina la(s) palabra(s) del sufijo de la línea (e.g. " hacer", " entonces").
 */
function _quitarSufijo(texto, sufijo) {
  const re = new RegExp('\\s+' + sufijo + '$', 'i');
  return texto.replace(re, '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Parsers de instrucciones simples
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intenta parsear una línea como instrucción simple (no bloque).
 * @param {string} lineaNorm  - línea normalizada (lowercase, sin comentario)
 * @param {string} lineaRaw   - línea original (para loc y texto)
 * @param {number} idx        - índice de línea (0-based)
 * @returns {object|null}     - nodo AST o null si no se reconoció
 */
function _parsearLineaSimple(lineaNorm, lineaRaw, idx) {
  const loc = locDeLinea(idx, lineaRaw);
  const linea = _stripCommentPSeInt(lineaRaw); // texto limpio con capitalización original

  // Definir x Como Entero
  if (/^definir\s+/i.test(linea)) {
    return nodoDefinir(linea, loc);
  }

  // Dimension arr[n]
  if (/^dimension\s+/i.test(linea)) {
    return nodoDimension(linea, loc);
  }

  // Leer x, y
  if (/^leer\s+/i.test(linea)) {
    return nodoLeer(linea, loc);
  }

  // Escribir ...
  if (/^escribir\s+/i.test(linea)) {
    return nodoEscribir(linea, loc);
  }

  // Retornar valor
  if (/^retornar\s*/i.test(linea)) {
    return nodoRetornar(linea, loc);
  }

  // Llamar SubProceso(...)
  if (/^llamar\s+/i.test(linea)) {
    return nodoLlamar(linea, loc);
  }

  // Ordenar(arreglo) o Ordenar(arreglo, n)
  if (/^ordenar\s*\(/i.test(linea)) {
    return nodoOrdenar(linea, loc);
  }

  // Asignación: variable <- expresion  (también arr[i] <- expr)
  if (/<-/.test(linea)) {
    return nodoAsignar(linea, loc);
  }

  // Asignación flexible: variable = expresion (si el perfil lo permite)
  // Solo si '=' no está al inicio (no es comparación)
  // Se detecta: hay una palabra antes del '='
  const asigIgualMatch = linea.match(/^[\wáéíóúüñÁÉÍÓÚÜÑ_][\wáéíóúüñÁÉÍÓÚÜÑ_\[\]]*\s*=(?!=)\s*.+/);
  if (asigIgualMatch) {
    return nodoAsignar(linea, loc);
  }

  // Nodo desconocido (el runtime reportará error)
  return nodoDesconocido(linea, loc);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Parser principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsea código PSeInt y devuelve un AST y lista de errores.
 *
 * @param {string} codigo  - código fuente completo
 * @param {object} [perfil] - opciones del perfil
 *   perfil.asignacionConIgual = false (por defecto, perfil estricto)
 * @returns {{ ast: object, errores: Array<{linea, mensaje}> }}
 */
function parsearPSeInt(codigo, perfil) {
  perfil = perfil || { asignacionConIgual: false };

  const lineas = codigo.split('\n');
  const errores = [];
  const subprocesos = {};
  const cuerpoRaiz = [];

  // Estado del parser
  let idx = 0;                  // cursor de línea actual
  let nombreAlgoritmo = 'Principal';
  let dentroAlgoritmo = false;  // true cuando estamos dentro de Algoritmo/Proceso
  let dentroSubProceso = false; // true cuando estamos dentro de SubProceso/Funcion
  let spActual = null;          // nodo SubProceso siendo construido

  /**
   * Agrega un error no fatal.
   */
  function agregarError(linea, mensaje) {
    errores.push({ linea, mensaje });
  }

  /**
   * Parsea un bloque de instrucciones hasta encontrar uno de los keywords
   * de cierre especificados (en minúsculas).
   *
   * @param {Array<string>} keywordsCierre  - palabras que cierran el bloque
   * @param {Array}         bloque          - array destino de nodos
   * @returns {string} el keyword de cierre encontrado (o '' si se llegó al final)
   */
  function parsearBloque(keywordsCierre, bloque) {
    while (idx < lineas.length) {
      const lineaRaw = lineas[idx];
      const lineaNorm = _normalizar(lineaRaw);

      // Línea vacía o solo comentario
      if (lineaNorm === '') {
        idx++;
        continue;
      }

      const primerTk = _primerToken(lineaNorm);

      // ── FinAlgoritmo / FinProceso ──
      if (primerTk === 'finalgoritmo' || primerTk === 'finproceso') {
        if (keywordsCierre.indexOf(primerTk) >= 0) {
          idx++;
          return primerTk;
        }
        // Si no era esperado aquí, igual cerramos para no quedar colgados
        idx++;
        return primerTk;
      }

      // ── Cierre genérico ──
      if (keywordsCierre.indexOf(primerTk) >= 0) {
        idx++;
        return primerTk;
      }

      // ── Si / Entonces ──
      if (primerTk === 'si') {
        const loc = locDeLinea(idx, lineaRaw);
        // Extraer condición: "si <condicion> entonces"
        let condicionTexto = _restoDeLinea(lineaNorm, 'si');
        condicionTexto = _quitarSufijo(condicionTexto, 'entonces');
        idx++;
        const entonces = [];
        const cierreSi = parsearBloque(['sino', 'finsi'], entonces);
        let sino = null;
        if (cierreSi === 'sino') {
          sino = [];
          parsearBloque(['finsi'], sino);
        }
        bloque.push(nodoSi(condicionTexto, entonces, sino, loc));
        continue;
      }

      // ── Mientras / Hacer / FinMientras ──
      if (primerTk === 'mientras') {
        const loc = locDeLinea(idx, lineaRaw);
        let condicionTexto = _restoDeLinea(lineaNorm, 'mientras');
        condicionTexto = _quitarSufijo(condicionTexto, 'hacer');
        idx++;
        const cuerpoMientras = [];
        parsearBloque(['finmientras'], cuerpoMientras);
        bloque.push(nodoMientras(condicionTexto, cuerpoMientras, loc));
        continue;
      }

      // ── Para / FinPara ──
      if (primerTk === 'para') {
        const loc = locDeLinea(idx, lineaRaw);
        // Guardar texto completo de la cabecera del Para (sin la palabra "para")
        const textoParaRaw = _stripCommentPSeInt(lineaRaw);
        // texto sin "Para" inicial y sin "Hacer" final
        let textoPara = _restoDeLinea(textoParaRaw, textoParaRaw.match(/^para\s+/i)[0]);
        textoPara = _quitarSufijo(textoPara, 'hacer');
        idx++;
        const cuerpoPara = [];
        parsearBloque(['finpara'], cuerpoPara);
        // Guardamos la línea original completa en el nodo para que el runtime la evalúe
        bloque.push(nodoPara(_stripCommentPSeInt(lineaRaw), cuerpoPara, loc));
        continue;
      }

      // ── Repetir / Hasta Que ──
      if (primerTk === 'repetir') {
        const loc = locDeLinea(idx, lineaRaw);
        idx++;
        const cuerpoRepetir = [];
        // Clausura "hastaque" o "hasta que"
        const cierreRep = parsearBloque(['hastaque', 'hasta'], cuerpoRepetir);

        // La condición puede estar en la misma línea de cierre o fue consumida
        // Si el cierre fue 'hasta', buscamos 'que' en la misma línea
        // En realidad el tokenizador separa "hasta" y "que" pero el lineaNorm
        // cuando llega acá ya fue consumida. Retrocedemos para leer la condición.
        // Sin embargo parsearBloque ya avanzó idx. Necesitamos leer la condición
        // del Hasta Que antes de consumir la línea.
        // Replanteamos: miramos la línea de cierre que quedó en idx-1.
        const lineaCierre = lineas[idx - 1];
        const lineaCierreNorm = _normalizar(lineaCierre);
        let condRepetir = '';

        const matchHQ1 = lineaCierreNorm.match(/^hasta\s+que\s+(.+)$/i);
        const matchHQ2 = lineaCierreNorm.match(/^hastaque\s+(.+)$/i);
        if (matchHQ1) {
          condRepetir = _stripCommentPSeInt(lineaCierre).replace(/^hasta\s+que\s+/i, '').trim();
        } else if (matchHQ2) {
          condRepetir = _stripCommentPSeInt(lineaCierre).replace(/^hastaque\s+/i, '').trim();
        } else if (lineaCierreNorm === 'hasta' || lineaCierreNorm === 'hastaque') {
          // Condición puede estar en la misma línea pero sin texto, o split en dos líneas
          // Miramos la siguiente línea si fuera "que <condicion>"
          if (idx < lineas.length) {
            const sigNorm = _normalizar(lineas[idx]);
            const mQue = sigNorm.match(/^que\s+(.+)$/);
            if (mQue) {
              condRepetir = _stripCommentPSeInt(lineas[idx]).replace(/^que\s+/i, '').trim();
              idx++;
            }
          }
        }

        bloque.push(nodoRepetir(cuerpoRepetir, condRepetir, loc));
        continue;
      }

      // ── Segun / FinSegun ──
      if (primerTk === 'segun') {
        const loc = locDeLinea(idx, lineaRaw);
        // Extraer variable: "segun <variable> hacer"
        let varTexto = _restoDeLinea(lineaNorm, 'segun');
        varTexto = _quitarSufijo(varTexto, 'hacer');
        idx++;
        const casos = [];
        let otro = null;

        // Parsear casos hasta FinSegun
        while (idx < lineas.length) {
          const casoRaw = lineas[idx];
          const casoNorm = _normalizar(casoRaw);

          if (casoNorm === '') { idx++; continue; }

          if (casoNorm === 'finsegun') { idx++; break; }

          // "De Otro Modo:" con contenido opcional en la misma línea
          // Ejemplos: "De Otro Modo:"  o  "De Otro Modo: Escribir x"
          const matchDeOtro = casoNorm.match(/^de\s+otro\s+modo\s*:\s*(.*)$/);
          if (matchDeOtro) {
            idx++;
            otro = [];
            // Si hay instrucción en la misma línea tras ':'
            const instrOtroInline = matchDeOtro[1].trim();
            if (instrOtroInline) {
              const textoOtroRaw = _stripCommentPSeInt(casoRaw).replace(/^de\s+otro\s+modo\s*:\s*/i, '');
              const instrOtroNodo = _parsearLineaSimple(instrOtroInline, textoOtroRaw, idx - 1);
              if (instrOtroNodo) otro.push(instrOtroNodo);
            }
            // Parsear hasta FinSegun
            parsearBloque(['finsegun'], otro);
            break;
          }

          // Etiquetas de caso: "1:" o "1, 2, 3:" (puede tener instrucción en la misma línea)
          // Nota: aseguramos que la etiqueta no sea "De Otro Modo" (ya manejado arriba)
          const matchCaso = casoNorm.match(/^([^:]+):\s*(.*)$/);
          if (matchCaso) {
            // Usar casoRaw para preservar capitalización de strings en las etiquetas
            const casoStripped = _stripCommentPSeInt(casoRaw);
            const matchCasoRaw = casoStripped.match(/^([^:]+):\s*(.*)$/);
            const valoresTexto = (matchCasoRaw ? matchCasoRaw[1] : matchCaso[1]).trim();
            const valores = valoresTexto.split(',').map(function(v) { return v.trim(); });
            const casoLoc = locDeLinea(idx, casoRaw);
            idx++;
            const cuerpoCaso = [];

            // Si hay instrucción en la misma línea de la etiqueta
            const instrInline = matchCaso[2].trim();
            if (instrInline) {
              const instrNorm = instrInline.toLowerCase();
              // Verificar que no sea un keyword de cierre
              if (instrNorm !== 'finsegun') {
                const textoInlineRaw = _stripCommentPSeInt(casoRaw).replace(/^[^:]+:\s*/, '');
                const instrNodo = _parsearLineaSimple(instrInline, textoInlineRaw, idx - 1);
                if (instrNodo) cuerpoCaso.push(instrNodo);
              }
            }

            // Parsear más instrucciones hasta otro caso, De Otro Modo o FinSegun
            // sin consumir la línea de cierre
            while (idx < lineas.length) {
              const sigRaw = lineas[idx];
              const sigNorm = _normalizar(sigRaw);

              if (sigNorm === '') { idx++; continue; }
              if (sigNorm === 'finsegun') break;
              // "De Otro Modo:" con o sin contenido posterior
              if (/^de\s+otro\s+modo\s*:/.test(sigNorm)) break;
              // Nueva etiqueta de caso (número o texto seguido de ':')
              if (/^[^:]+:/.test(sigNorm)) break;

              // Instrucción del cuerpo de este caso
              const instrNodo2 = _parsearLineaSimple(sigNorm, _stripCommentPSeInt(sigRaw), idx);
              if (instrNodo2) cuerpoCaso.push(instrNodo2);
              idx++;
            }

            casos.push(nodoCaso(valores, cuerpoCaso, casoLoc));
            continue;
          }

          // Línea no reconocida dentro de Segun — saltarla con error
          agregarError(idx, 'Línea no reconocida dentro de Segun: ' + casoNorm);
          idx++;
        }

        bloque.push(nodoSegun(varTexto, casos, otro, loc));
        continue;
      }

      // ── SubProceso dentro de bloque principal (no debería, pero toleramos) ──
      if (primerTk === 'subproceso' || primerTk === 'funcion') {
        // Esto debería estar a nivel top, no dentro de un bloque;
        // parseamos como subproceso anidado pero lo reportamos como error
        agregarError(idx, 'SubProceso/Funcion debe estar fuera del bloque Algoritmo.');
        idx++;
        // Consumir hasta FinSubProceso/FinFuncion
        while (idx < lineas.length) {
          const tn = _normalizar(lineas[idx]);
          idx++;
          if (tn === 'finsubproceso' || tn === 'finfuncion') break;
        }
        continue;
      }

      // ── Instrucción simple ──
      const nodoSimple = _parsearLineaSimple(lineaNorm, lineaRaw, idx);
      if (nodoSimple) bloque.push(nodoSimple);
      idx++;
    }

    return ''; // fin de archivo sin encontrar cierre
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Bucle principal: busca Algoritmo/Proceso y SubProcesos a nivel top
  // ─────────────────────────────────────────────────────────────────────────

  while (idx < lineas.length) {
    const lineaRaw = lineas[idx];
    const lineaNorm = _normalizar(lineaRaw);

    if (lineaNorm === '') { idx++; continue; }

    const primerTk = _primerToken(lineaNorm);

    // ── Algoritmo <nombre> o Proceso <nombre> ──
    if (primerTk === 'algoritmo' || primerTk === 'proceso') {
      const mNombre = lineaNorm.match(/^(?:algoritmo|proceso)\s+(\S+)/);
      if (mNombre) nombreAlgoritmo = mNombre[1];
      dentroAlgoritmo = true;
      idx++;

      // Parsear el cuerpo hasta FinAlgoritmo/FinProceso
      parsearBloque(['finalgoritmo', 'finproceso'], cuerpoRaiz);
      dentroAlgoritmo = false;
      continue;
    }

    // ── SubProceso <nombre>(<params>) a nivel top ──
    if (primerTk === 'subproceso' || primerTk === 'funcion') {
      const loc = locDeLinea(idx, lineaRaw);
      const lineaLimpia = _stripCommentPSeInt(lineaRaw);

      // Extraer nombre y parámetros del encabezado
      // Formas soportadas:
      //   SubProceso nombre(params)
      //   SubProceso retorno <- nombre(params)
      let nombreSP = 'desconocido';
      let paramTexto = '';

      // Con valor de retorno: SubProceso varRetorno <- Nombre(params)
      let varRetorno = null;
      const matchRetorno = lineaLimpia.match(/^(?:subproceso|funcion)\s+(\w+)\s*<-\s*(\w+)\s*\(([^)]*)\)/i);
      if (matchRetorno) {
        varRetorno = matchRetorno[1].toLowerCase();
        nombreSP = matchRetorno[2].toLowerCase();
        paramTexto = matchRetorno[3].trim();
      } else {
        // Sin valor de retorno: SubProceso Nombre(params) o SubProceso Nombre()
        const matchSimple = lineaLimpia.match(/^(?:subproceso|funcion)\s+(\w+)\s*\(([^)]*)\)/i);
        if (matchSimple) {
          nombreSP = matchSimple[1].toLowerCase();
          paramTexto = matchSimple[2].trim();
        } else {
          // Sin paréntesis: SubProceso Nombre
          const matchSoloNombre = lineaLimpia.match(/^(?:subproceso|funcion)\s+(\w+)/i);
          if (matchSoloNombre) nombreSP = matchSoloNombre[1].toLowerCase();
        }
      }

      dentroSubProceso = true;
      idx++;
      const cuerpSP = [];
      parsearBloque(['finsubproceso', 'finfuncion'], cuerpSP);
      dentroSubProceso = false;

      const spNodo = nodoSubProceso(nombreSP, paramTexto, cuerpSP, loc);
      if (varRetorno) spNodo.varRetorno = varRetorno;
      subprocesos[nombreSP] = spNodo;
      continue;
    }

    // Línea fuera de cualquier bloque reconocido
    if (!dentroAlgoritmo && !dentroSubProceso) {
      // Ignorar silenciosamente (puede ser espacio en blanco o comentario ya filtrado)
      idx++;
      continue;
    }

    idx++;
  }

  // Detectar si nunca se abrió un bloque Algoritmo/Proceso
  if (cuerpoRaiz.length === 0 && Object.keys(subprocesos).length === 0) {
    // Revisar si hubo al menos una línea no vacía; si sí, el bloque faltó
    const hayContenido = lineas.some(function(l) { return _normalizar(l) !== ''; });
    if (hayContenido) {
      // Solo agregar error si no hay FinAlgoritmo (si nunca se cerró)
      const tieneAbre = lineas.some(function(l) {
        const n = _normalizar(l);
        return n.startsWith('algoritmo') || n.startsWith('proceso');
      });
      if (!tieneAbre) {
        agregarError(0, 'Se esperaba "Algoritmo <nombre>" o "Proceso <nombre>" al inicio del programa.');
      }
    }
  } else {
    // Verificar si había un Algoritmo/Proceso abierto pero nunca cerrado
    const tieneAbre = lineas.some(function(l) {
      const n = _normalizar(l);
      return n.startsWith('algoritmo') || n.startsWith('proceso');
    });
    const tieneCierre = lineas.some(function(l) {
      const n = _normalizar(l);
      return n === 'finalgoritmo' || n === 'finproceso';
    });
    if (tieneAbre && !tieneCierre) {
      agregarError(lineas.length - 1, 'Falta "FinAlgoritmo" o "FinProceso" al final del programa.');
    }
  }

  const locPrograma = {
    linea: 0,
    columnaInicio: 0,
    columnaFin: lineas.length > 0 ? lineas[0].length : 0,
  };

  return {
    ast: nodoPrograma(cuerpoRaiz, subprocesos, locPrograma, nombreAlgoritmo),
    errores: errores,
  };
}

// ─────────────────────────────────────────────
//  Exportación CommonJS (Node.js / tests)
// ─────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parsearPSeInt };
}
