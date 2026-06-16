/**
 * ============================================================
 *  core/pseint/validator.js — Validación Estática PSeInt
 * ============================================================
 *  validarPSeInt(codigo, perfil) → Array<{linea, mensaje}>
 *
 *  Estrategia:
 *  1. Llama a parsearPSeInt() para obtener el AST y los errores
 *     sintácticos que el parser ya detecta.
 *  2. Camina el AST para detectar errores semánticos adicionales:
 *     - Variables usadas sin definir (cuando hay al menos un Definir)
 *     - Variables definidas dos veces
 *     - Asignación con índice a variable no dimensionada
 *     - Llamadas a funciones inexistentes (no builtin ni subproceso)
 *
 *  El validador es TOLERANTE: siempre devuelve todos los errores
 *  encontrados, nunca lanza excepción.
 *
 *  Dependencias (globals del scope al cargar como script clásico):
 *  - parsearPSeInt   (core/pseint/parser.js)
 *  - BUILTINS_PSEINT (core/pseint/builtins.js)
 *  - TablaPSeInt     (core/pseint/symbol-table.js)
 *  - TIPOS_PSEINT    (core/pseint/symbol-table.js)
 *
 *  Script clásico — NO módulo ES. Compatible con browser y Node.
 * ============================================================
 */

/* global parsearPSeInt, BUILTINS_PSEINT, TablaPSeInt, TIPOS_PSEINT, module */

// ─────────────────────────────────────────────
//  Tipos de datos válidos en Definir
// ─────────────────────────────────────────────

const _TIPOS_PSEINT_SET = new Set(['entero', 'real', 'caracter', 'cadena', 'logico']);

// ─────────────────────────────────────────────
//  Helpers para recorrer el AST
// ─────────────────────────────────────────────

/**
 * Extrae el nombre de variable de una instrucción Definir.
 * "Definir x, y Como Entero" → ['x', 'y']
 * Devuelve { nombres: string[], tipo: string }
 */
function _parsearDefinir(texto) {
  const m = texto.match(/^definir\s+(.+)\s+como\s+(\S+)\s*$/i);
  if (!m) return { nombres: [], tipo: '' };
  const tipo = m[2].trim().toLowerCase();
  const nombres = m[1].split(',').map(function(n) { return n.trim().toLowerCase(); }).filter(Boolean);
  return { nombres, tipo };
}

/**
 * Extrae el nombre del arreglo de "Dimension arr[n]" → 'arr'
 */
function _parsearDimension(texto) {
  const m = texto.match(/^dimension\s+([\wáéíóúüñÁÉÍÓÚÜÑ_]+)\s*\[/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Extrae la variable de la parte izquierda de una asignación.
 * Reconoce:  var <- expr  y  arr[i] <- expr
 * Devuelve { nombre: string, tieneIndice: boolean } o null.
 */
function _parsearLadoIzqAsignar(texto) {
  // Flecha
  const mFlecha = texto.match(/^([\wáéíóúüñÁÉÍÓÚÜÑ_]+)\s*(\[([^\]]+)\])?\s*<-/i);
  if (mFlecha) {
    return { nombre: mFlecha[1].toLowerCase(), tieneIndice: !!mFlecha[2] };
  }
  // Igual (perfil flexible)
  const mIgual = texto.match(/^([\wáéíóúüñÁÉÍÓÚÜÑ_]+)\s*(\[([^\]]+)\])?\s*=(?!=)/i);
  if (mIgual) {
    return { nombre: mIgual[1].toLowerCase(), tieneIndice: !!mIgual[2] };
  }
  return null;
}

/**
 * Extrae los nombres de variable(s) de una instrucción Leer.
 * "Leer x, y" → ['x', 'y']
 */
function _parsearLeer(texto) {
  const m = texto.match(/^leer\s+(.+)$/i);
  if (!m) return [];
  return m[1].split(',').map(function(n) {
    // Extraer nombre base sin índices (arr[i] → arr)
    return n.trim().toLowerCase().replace(/\[.*$/, '');
  }).filter(Boolean);
}

/**
 * Extrae el nombre de función de una llamada en una expresión.
 * Busca patrones "nombre(" que no sean keywords.
 * Devuelve array de nombres en minúsculas.
 */
// Palabras que pueden aparecer seguidas de '(' sin ser funciones (operadores, etc.)
var _KEYWORDS_NO_FUNCION = new Set([
  'y', 'o', 'no', 'mod', 'div', 'si', 'mientras', 'para', 'segun', 'repetir',
  'escribir', 'leer', 'definir', 'llamar', 'retornar', 'funcion', 'subproceso',
]);

function _extraerLlamadasFuncion(texto) {
  // Eliminar strings entre comillas dobles para no detectar patrones dentro de ellos.
  const sinStrings = texto.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const resultado = [];
  const re = /([\wáéíóúüñÁÉÍÓÚÜÑ_]+)\s*\(/gi;
  let m;
  while ((m = re.exec(sinStrings)) !== null) {
    const nombre = m[1].toLowerCase();
    if (!_KEYWORDS_NO_FUNCION.has(nombre)) {
      resultado.push(nombre);
    }
  }
  return resultado;
}

/**
 * Extrae el nombre de la función de "Llamar NombreSP()" o "Llamar NombreSP".
 */
function _parsearLlamar(texto) {
  const m = texto.match(/^llamar\s+([\wáéíóúüñÁÉÍÓÚÜÑ_]+)/i);
  return m ? m[1].toLowerCase() : null;
}

// ─────────────────────────────────────────────
//  Contexto de análisis semántico
// ─────────────────────────────────────────────

/**
 * Estado compartido durante el recorrido del AST.
 * @typedef {{
 *   errores: Array<{linea: number, mensaje: string}>,
 *   tablaGlobal: TablaPSeInt,
 *   hayDefinir: boolean,
 *   arreglosDimensionados: Set<string>,
 *   subprocesos: Object
 * }} ContextoAnalisis
 */

function _agregarError(ctx, linea, mensaje) {
  ctx.errores.push({ linea: linea + 1, mensaje });
}

// ─────────────────────────────────────────────
//  Validación de llamadas a funciones
// ─────────────────────────────────────────────

/**
 * Comprueba que cada llamada "nombre(" en `texto` corresponda a un builtin
 * o a un subproceso definido en el programa.
 * Las palabras-clave que llevan paréntesis en expresiones (ninguna en PSeInt)
 * no se contemplan aquí.
 */
function _validarLlamadasEnTexto(texto, linea, ctx) {
  if (!texto) return;
  const llamadas = _extraerLlamadasFuncion(texto);
  for (let i = 0; i < llamadas.length; i++) {
    const nombre = llamadas[i];
    const enBuiltins = typeof BUILTINS_PSEINT !== 'undefined' && BUILTINS_PSEINT[nombre.toUpperCase()];
    const enSubprocesos = ctx.subprocesos && ctx.subprocesos[nombre];
    if (!enBuiltins && !enSubprocesos) {
      _agregarError(ctx, linea, 'Función o subproceso "' + nombre + '" no está definido.');
    }
  }
}

// ─────────────────────────────────────────────
//  Recorrido del AST
// ─────────────────────────────────────────────

/**
 * Primer paso: recolecta todas las declaraciones Definir y Dimension del
 * programa (cuerpo raíz y subprocesos) para saber:
 * - si el usuario usó al menos un Definir (activa las verificaciones de scope)
 * - qué variables tienen tipo
 * - qué arreglos están dimensionados
 *
 * Rellena ctx.tablaGlobal, ctx.hayDefinir y ctx.arreglosDimensionados.
 */
function _recolectarDeclaraciones(nodos, ctx) {
  for (let i = 0; i < nodos.length; i++) {
    const nodo = nodos[i];
    if (!nodo) continue;

    if (nodo.tipo === 'Definir') {
      const parsed = _parsearDefinir(nodo.texto);
      for (let j = 0; j < parsed.nombres.length; j++) {
        const nombre = parsed.nombres[j];
        if (ctx.tablaGlobal.existeVariable(nombre)) {
          // Será detectado como duplicado en la fase de validación
        } else {
          ctx.tablaGlobal.definir(nombre, parsed.tipo, nodo.loc.linea);
        }
        ctx.hayDefinir = true;
      }
      continue;
    }

    if (nodo.tipo === 'Dimension') {
      const nombre = _parsearDimension(nodo.texto);
      if (nombre) {
        ctx.arreglosDimensionados.add(nombre);
        // Pre-registrar en tabla por si se Dimensiona antes de Definir
        if (!ctx.tablaGlobal.existeVariable(nombre)) {
          ctx.tablaGlobal.definir(nombre, null, nodo.loc.linea);
        }
      }
      continue;
    }

    // Recursivo en bloques de control
    _recolectarEnBloque(nodo, ctx);
  }
}

function _recolectarEnBloque(nodo, ctx) {
  if (!nodo) return;
  switch (nodo.tipo) {
    case 'Si':
      if (nodo.entonces) _recolectarDeclaraciones(nodo.entonces, ctx);
      if (nodo.sino)     _recolectarDeclaraciones(nodo.sino, ctx);
      break;
    case 'Mientras':
    case 'Para':
    case 'Repetir':
      if (nodo.cuerpo) _recolectarDeclaraciones(nodo.cuerpo, ctx);
      break;
    case 'Segun':
      if (nodo.casos) {
        for (let i = 0; i < nodo.casos.length; i++) {
          if (nodo.casos[i].cuerpo) _recolectarDeclaraciones(nodo.casos[i].cuerpo, ctx);
        }
      }
      if (nodo.otro) _recolectarDeclaraciones(nodo.otro, ctx);
      break;
  }
}

/**
 * Segundo paso: camina los nodos validando semántica.
 * Usa una tabla local para el scope del subproceso cuando aplica.
 */
function _validarNodos(nodos, ctx, tablaLocal) {
  for (let i = 0; i < nodos.length; i++) {
    const nodo = nodos[i];
    if (!nodo) continue;
    _validarNodo(nodo, ctx, tablaLocal);
  }
}

function _tablaActiva(ctx, tablaLocal) {
  return tablaLocal || ctx.tablaGlobal;
}

function _validarNodo(nodo, ctx, tablaLocal) {
  if (!nodo) return;
  const linea = nodo.loc ? nodo.loc.linea : 0;
  const tabla = _tablaActiva(ctx, tablaLocal);

  switch (nodo.tipo) {

    case 'Definir': {
      const parsed = _parsearDefinir(nodo.texto);
      const vistos = new Set();
      for (let j = 0; j < parsed.nombres.length; j++) {
        const nombre = parsed.nombres[j];
        // Duplicado dentro de la misma línea
        if (vistos.has(nombre)) {
          _agregarError(ctx, linea, 'Variable "' + nombre + '" ya estaba definida (declaración duplicada).');
          continue;
        }
        vistos.add(nombre);
        // Duplicado respecto a la tabla actual
        if (tabla.existeVariable(nombre) && tabla.obtenerTipo(nombre) !== null) {
          _agregarError(ctx, linea, 'Variable "' + nombre + '" ya estaba definida (declaración duplicada).');
        } else {
          tabla.definir(nombre, parsed.tipo, linea);
        }
      }
      break;
    }

    case 'Dimension': {
      const nombre = _parsearDimension(nodo.texto);
      if (nombre) {
        ctx.arreglosDimensionados.add(nombre);
        if (!tabla.existeVariable(nombre)) {
          tabla.definir(nombre, null, linea);
        }
      }
      break;
    }

    case 'Asignar': {
      // Aviso de migración: en perfil estricto, = es comparador y no asignación
      const textoNodo = nodo.texto || '';
      if (ctx.perfil && ctx.perfil.asignacionConIgual === false) {
        const usaFlecha = /\s*<-\s*/.test(textoNodo);
        if (!usaFlecha) {
          _agregarError(ctx, linea,
            'En PSeInt (perfil estricto) la asignación se escribe con "<-", no con "=". ' +
            'Ejemplo: x <- 5. El signo "=" siempre es un comparador.');
        }
      }
      const liz = _parsearLadoIzqAsignar(nodo.texto);
      if (liz) {
        // Variable no definida (solo si hay al menos un Definir en el programa
        // Y estamos en perfil estricto — en perfil flexible las variables se
        // crean automáticamente en el primer uso).
        const perfilFlexible = ctx.perfil && ctx.perfil.asignacionConIgual === true;
        if (!perfilFlexible && ctx.hayDefinir && !tabla.existeVariable(liz.nombre) && !ctx.tablaGlobal.existeVariable(liz.nombre)) {
          _agregarError(ctx, linea, 'Variable "' + liz.nombre + '" usada sin definir.');
        }
        // Asignación con índice pero sin Dimension
        if (liz.tieneIndice && !ctx.arreglosDimensionados.has(liz.nombre)) {
          _agregarError(ctx, linea, 'Variable "' + liz.nombre + '" usada como arreglo pero no fue declarada con Dimension.');
        }
        if (tabla.existeVariable(liz.nombre)) {
          tabla.inicializar(liz.nombre);
        }
      }
      // Validar llamadas a funciones en la expresión lado derecho
      _validarLlamadasEnExpresion(nodo.texto, linea, ctx);
      break;
    }

    case 'Leer': {
      const vars = _parsearLeer(nodo.texto);
      const perfilFlexibleLeer = ctx.perfil && ctx.perfil.asignacionConIgual === true;
      for (let j = 0; j < vars.length; j++) {
        const nombre = vars[j];
        if (!perfilFlexibleLeer && ctx.hayDefinir && !tabla.existeVariable(nombre) && !ctx.tablaGlobal.existeVariable(nombre)) {
          _agregarError(ctx, linea, 'Variable "' + nombre + '" usada sin definir.');
        }
        if (tabla.existeVariable(nombre)) {
          tabla.inicializar(nombre);
        }
      }
      break;
    }

    case 'Escribir': {
      _validarLlamadasEnExpresion(nodo.texto, linea, ctx);
      break;
    }

    case 'Retornar': {
      _validarLlamadasEnExpresion(nodo.texto, linea, ctx);
      break;
    }

    case 'Llamar': {
      const nombreSP = _parsearLlamar(nodo.texto);
      if (nombreSP) {
        const enBuiltins = typeof BUILTINS_PSEINT !== 'undefined' && BUILTINS_PSEINT[nombreSP.toUpperCase()];
        const enSubprocesos = ctx.subprocesos && ctx.subprocesos[nombreSP];
        if (!enBuiltins && !enSubprocesos) {
          _agregarError(ctx, linea, 'Subproceso "' + nombreSP + '" no está definido.');
        }
      }
      break;
    }

    case 'Si': {
      _validarLlamadasEnExpresion(nodo.condicion, linea, ctx);
      if (nodo.entonces) _validarNodos(nodo.entonces, ctx, tablaLocal);
      if (nodo.sino)     _validarNodos(nodo.sino, ctx, tablaLocal);
      break;
    }

    case 'Mientras': {
      _validarLlamadasEnExpresion(nodo.condicion, linea, ctx);
      if (nodo.cuerpo) _validarNodos(nodo.cuerpo, ctx, tablaLocal);
      break;
    }

    case 'Para': {
      _validarLlamadasEnExpresion(nodo.texto, linea, ctx);
      if (nodo.cuerpo) _validarNodos(nodo.cuerpo, ctx, tablaLocal);
      break;
    }

    case 'Repetir': {
      if (nodo.cuerpo) _validarNodos(nodo.cuerpo, ctx, tablaLocal);
      _validarLlamadasEnExpresion(nodo.condicion, linea, ctx);
      break;
    }

    case 'Segun': {
      _validarLlamadasEnExpresion(nodo.variable, linea, ctx);
      if (nodo.casos) {
        for (let i = 0; i < nodo.casos.length; i++) {
          const caso = nodo.casos[i];
          if (caso.cuerpo) _validarNodos(caso.cuerpo, ctx, tablaLocal);
        }
      }
      if (nodo.otro) _validarNodos(nodo.otro, ctx, tablaLocal);
      break;
    }

    case 'Desconocido': {
      // Instrucción no reconocida: intentar detectar llamadas a función igualmente
      _validarLlamadasEnExpresion(nodo.texto, linea, ctx);
      break;
    }

    default:
      break;
  }
}

/**
 * Valida llamadas a función en el texto de una expresión,
 * ignorando la parte del lado izquierdo en asignaciones.
 */
function _validarLlamadasEnExpresion(texto, linea, ctx) {
  if (!texto) return;
  // En asignaciones, extraer solo el lado derecho
  let exprTexto = texto;
  const mFlecha = texto.match(/<-\s*(.+)$/i);
  if (mFlecha) {
    exprTexto = mFlecha[1];
  } else {
    // Asignación con '='
    const mIgual = texto.match(/^[\wáéíóúüñÁÉÍÓÚÜÑ_][\wáéíóúüñÁÉÍÓÚÜÑ_\[\]]*\s*=(?!=)\s*(.+)$/i);
    if (mIgual) exprTexto = mIgual[1];
  }
  _validarLlamadasEnTexto(exprTexto, linea, ctx);
}

/**
 * Valida los subprocesos del programa.
 * Cada subproceso tiene su propio scope pero puede llamar a otros
 * subprocesos y builtins del programa.
 */
function _validarSubprocesos(subprocesos, ctx) {
  if (!subprocesos) return;
  const nombres = Object.keys(subprocesos);
  for (let i = 0; i < nombres.length; i++) {
    const sp = subprocesos[nombres[i]];
    if (!sp || !sp.cuerpo) continue;

    // Crear tabla local para este subproceso
    const tablaLocal = new TablaPSeInt();

    // Registrar variable de retorno (sin tipo) para que el validador
    // no la marque como "no definida". El tipo lo asigna el Definir
    // explícito dentro del cuerpo, si existe, sin error de duplicado
    // (el chequeo de duplicados solo aplica cuando tipo !== null).
    if (sp.varRetorno) {
      tablaLocal.definir(sp.varRetorno, null, sp.loc ? sp.loc.linea : 0);
      tablaLocal.inicializar(sp.varRetorno);
    }

    // Registrar parámetros si los hay
    if (sp.paramTexto) {
      const params = sp.paramTexto.split(',');
      for (let j = 0; j < params.length; j++) {
        const param = params[j].trim();
        if (!param) continue;
        // Param puede tener forma "nombre Como Tipo" o solo "nombre"
        const mParam = param.match(/([\wáéíóúüñÁÉÍÓÚÜÑ_]+)\s+como\s+(\S+)$/i);
        const mSimple = param.match(/([\wáéíóúüñÁÉÍÓÚÜÑ_]+)$/i);
        if (mParam) {
          tablaLocal.definir(mParam[1].toLowerCase(), mParam[2].toLowerCase(), sp.loc ? sp.loc.linea : 0);
        } else if (mSimple) {
          tablaLocal.definir(mSimple[1].toLowerCase(), 'entero', sp.loc ? sp.loc.linea : 0);
        }
        // Los parámetros cuentan como "hay definir" para validar variables dentro
      }
    }

    // Pre-recolectar Definir/Dimension para saber si el SP usa Definir y
    // resolver arreglos (usa tablaLocal como tabla de pre-scan).
    const ctxPreScan = {
      errores: [],              // descartar errores del pre-scan
      tablaGlobal: tablaLocal,
      hayDefinir: tablaLocal.variables.size > 0,
      arreglosDimensionados: new Set(ctx.arreglosDimensionados),
      subprocesos: ctx.subprocesos,
      perfil: ctx.perfil || {},
    };
    _recolectarDeclaraciones(sp.cuerpo, ctxPreScan);
    if (ctx.hayDefinir) ctxPreScan.hayDefinir = true;

    // Tabla limpia para la validación (igual que hace el cuerpo principal),
    // pero con params y varRetorno ya registrados.
    const tablaValidacion = new TablaPSeInt();
    const paramsComoArreglos = new Set(ctxPreScan.arreglosDimensionados);
    if (sp.varRetorno) {
      tablaValidacion.definir(sp.varRetorno, null, sp.loc ? sp.loc.linea : 0);
      tablaValidacion.inicializar(sp.varRetorno);
    }
    if (sp.paramTexto) {
      const params = sp.paramTexto.split(',');
      for (let j = 0; j < params.length; j++) {
        const param = params[j].trim();
        if (!param) continue;
        const mParam = param.match(/([\wáéíóúüñÁÉÍÓÚÜÑ_]+)\s+como\s+(\S+)$/i);
        const mSimple = param.match(/([\wáéíóúüñÁÉÍÓÚÜÑ_]+)$/i);
        const nomParam = (mParam ? mParam[1] : mSimple ? mSimple[1] : '').toLowerCase();
        if (mParam) tablaValidacion.definir(nomParam, mParam[2].toLowerCase(), sp.loc ? sp.loc.linea : 0);
        else if (mSimple && nomParam) tablaValidacion.definir(nomParam, 'entero', sp.loc ? sp.loc.linea : 0);
        // Los parámetros pueden ser arreglos pasados por referencia
        if (nomParam) paramsComoArreglos.add(nomParam);
      }
    }

    const ctxLocal = {
      errores: ctx.errores,
      tablaGlobal: tablaValidacion,
      hayDefinir: ctxPreScan.hayDefinir,
      arreglosDimensionados: paramsComoArreglos,
      subprocesos: ctx.subprocesos,
      perfil: ctx.perfil || {},
    };

    _validarNodos(sp.cuerpo, ctxLocal, null);
  }
}

// ─────────────────────────────────────────────
//  Validación estructural de bloques en el texto fuente
//  (complementa al parser que es tolerante a bloques sin cierre)
// ─────────────────────────────────────────────

/**
 * Normaliza una línea: quita comentario // y trim, devuelve en minúsculas.
 */
function _normalizarLinea(linea) {
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    if (linea[i] === '"') {
      enComillas = !enComillas;
    } else if (!enComillas && linea[i] === '/' && linea[i + 1] === '/') {
      return linea.substring(0, i).trim().toLowerCase();
    }
  }
  return linea.trim().toLowerCase();
}

/**
 * Comprueba que los bloques Si/FinSi, Mientras/FinMientras, etc.
 * estén correctamente balanceados en el código fuente.
 * Emite errores en ctx para los bloques sin cierre.
 */
function _validarBloquesFuente(codigo, ctx) {
  const lineas = codigo.split('\n');

  // Tabla de bloques que se deben balancear
  const ABRE = {
    'si': { cierra: 'finsi', etiqueta: 'Si', cierraEtiqueta: 'FinSi' },
    'mientras': { cierra: 'finmientras', etiqueta: 'Mientras', cierraEtiqueta: 'FinMientras' },
    'para': { cierra: 'finpara', etiqueta: 'Para', cierraEtiqueta: 'FinPara' },
    'repetir': { cierra: 'hastaque', etiqueta: 'Repetir', cierraEtiqueta: 'HastaQue' },
    'segun': { cierra: 'finsegun', etiqueta: 'Segun', cierraEtiqueta: 'FinSegun' },
    'subproceso': { cierra: 'finsubproceso', etiqueta: 'SubProceso', cierraEtiqueta: 'FinSubProceso' },
    'funcion': { cierra: 'finfuncion', etiqueta: 'Funcion', cierraEtiqueta: 'FinFuncion' },
  };
  const CIERRE_SET = new Set([
    'finsi', 'finmientras', 'finpara', 'hastaque', 'finsegun',
    'finsubproceso', 'finfuncion',
  ]);
  // Para "hasta que" separado necesitamos detectarlo también
  const CIERRE_HASTAQUE_SEPARADO = 'hasta';

  const stack = [];

  for (let i = 0; i < lineas.length; i++) {
    const norm = _normalizarLinea(lineas[i]);
    if (norm === '') continue;

    // Primera palabra de la línea
    const primera = norm.split(/\s+/)[0];

    // "Hasta Que" (cuando está separado): la primera palabra es "hasta"
    // y la segunda es "que" — lo tratamos como el cierre de Repetir
    let esCierreHastaQue = false;
    if (primera === 'hasta') {
      const partes = norm.split(/\s+/);
      if (partes.length >= 2 && partes[1] === 'que') {
        esCierreHastaQue = true;
      }
    }
    // "HastaQue" como palabra única
    const cierreEfectivo = (primera === 'hastaque' || esCierreHastaQue) ? 'hastaque' : primera;

    if (ABRE[primera]) {
      stack.push({ def: ABRE[primera], linea: i });
      continue;
    }

    if (CIERRE_SET.has(cierreEfectivo)) {
      if (stack.length === 0) {
        // Cierre sin apertura: ya lo detecta el parser, no duplicamos
        continue;
      }
      const top = stack[stack.length - 1];
      if (top.def.cierra === cierreEfectivo) {
        stack.pop();
      } else {
        // Cierre cruzado: tampoco duplicamos, el parser lo detecta
        stack.pop();
      }
    }
  }

  // Bloques sin cerrar
  for (let i = 0; i < stack.length; i++) {
    const item = stack[i];
    _agregarError(ctx, item.linea,
      'Bloque "' + item.def.etiqueta + '" sin cierre (falta ' + item.def.cierraEtiqueta + ').'
    );
  }
}

// ─────────────────────────────────────────────
//  Función principal exportada
// ─────────────────────────────────────────────

/**
 * Valida código PSeInt estáticamente.
 *
 * @param {string} codigo   - código fuente completo
 * @param {object} [perfil] - opciones de perfil (se pasa a parsearPSeInt)
 * @returns {Array<{linea: number, mensaje: string}>}
 *   linea es 1-based.
 *   Array vacío → sin errores estáticos detectados.
 */
function validarPSeInt(codigo, perfil) {
  const errores = [];

  try {
    // ── Paso 1: parsear y recoger errores del parser ──
    let resultadoParser;
    try {
      resultadoParser = parsearPSeInt(codigo, perfil);
    } catch (e) {
      errores.push({ linea: 1, mensaje: 'Error interno al parsear: ' + e.message });
      return errores;
    }

    // Convertir errores del parser (son 0-based en `linea` del parser según
    // la implementación, que usa idx directamente → 1-based al sumar 1).
    const erroresParser = resultadoParser.errores || [];
    for (let i = 0; i < erroresParser.length; i++) {
      const ep = erroresParser[i];
      // El parser almacena linea como índice 0-based en algunos casos o
      // como mensaje directo sin linea específica (linea = 0 = primera línea).
      errores.push({
        linea: (typeof ep.linea === 'number' ? ep.linea + 1 : 1),
        mensaje: ep.mensaje || ep.message || String(ep),
      });
    }

    // ── Paso 2: validación estructural de bloques en el fuente ──
    // El parser es tolerante a bloques sin cerrar; hacemos un barrido propio.
    _validarBloquesFuente(codigo, { errores });

    // ── Paso 3: análisis semántico del AST ──
    const ast = resultadoParser.ast;
    if (!ast) return errores;

    const subprocesos = ast.subprocesos || {};

    // Contexto global de análisis
    const ctx = {
      errores,
      tablaGlobal: new TablaPSeInt(),
      hayDefinir: false,
      arreglosDimensionados: new Set(),
      subprocesos,
      perfil: perfil || {},
    };

    // Primera pasada: recolectar declaraciones del cuerpo principal
    if (ast.cuerpo && ast.cuerpo.length > 0) {
      _recolectarDeclaraciones(ast.cuerpo, ctx);
    }

    // Segunda pasada: validar semántica del cuerpo principal
    if (ast.cuerpo && ast.cuerpo.length > 0) {
      // Resetear la tabla para la validación (la pre-recolección ya la llenó)
      // No reseteamos: la tabla ya tiene las definiciones. En la validación
      // detectamos duplicados mirando si ya existe con tipo al momento de
      // procesar cada nodo Definir.
      // Para detectar duplicados correctamente, usamos una tabla limpia en la validación:
      const tablaValidacion = new TablaPSeInt();
      const ctxValidacion = {
        errores,
        tablaGlobal: tablaValidacion,
        hayDefinir: ctx.hayDefinir,
        arreglosDimensionados: ctx.arreglosDimensionados,
        subprocesos,
        perfil: perfil || {},
      };
      _validarNodos(ast.cuerpo, ctxValidacion, null);
    }

    // Tercera pasada: validar subprocesos
    _validarSubprocesos(subprocesos, ctx);

  } catch (e) {
    // El validador nunca lanza; capturamos cualquier error inesperado
    errores.push({ linea: 1, mensaje: 'Error interno en el validador: ' + e.message });
  }

  return errores;
}

// ─────────────────────────────────────────────
//  Exportación CommonJS (Node.js / tests)
// ─────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validarPSeInt };
}
