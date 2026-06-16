/**
 * ============================================================
 *  core/pseint/runtime.js — Intérprete de PSeInt (Fase 3)
 * ============================================================
 *  Ejecuta un AST producido por parsearPSeInt() a través de un
 *  RuntimeHost (o host mock en tests). Sigue el mismo patrón
 *  que core/liteseint/runtime.js adaptado al AST PSeInt.
 *
 *  Script clásico — NO módulo ES. Compatible con browser y Node.
 *
 *  Dependencias globales (en scope antes de cargar este archivo):
 *  - parsearPSeInt       (core/pseint/parser.js)
 *  - ScopeChainPSeInt    (core/pseint/symbol-table.js)
 *  - coercionarValor     (core/pseint/symbol-table.js)
 *  - TIPOS_PSEINT        (core/pseint/symbol-table.js)
 *  - BUILTINS_PSEINT     (core/pseint/builtins.js)
 *  - EvaluadorPSeInt     (core/pseint/expression-evaluator.js)
 * ============================================================
 */

/* global parsearPSeInt, ScopeChainPSeInt, coercionarValor, TIPOS_PSEINT,
          BUILTINS_PSEINT, EvaluadorPSeInt, module */

'use strict';

// ---------------------------------------------------------------------------
//  Excepción de control interna para Retornar
// ---------------------------------------------------------------------------
class _RetornarExcepcion {
  constructor(valor) {
    this.valor = valor;
    this.esRetornar = true;
  }
}

// ---------------------------------------------------------------------------
//  RuntimePSeInt
// ---------------------------------------------------------------------------

class RuntimePSeInt {
  static MAX_PASOS       = 100_000;
  static MAX_PROFUNDIDAD = 256;

  /**
   * @param {object} [perfil]
   *   perfil.asignacionConIgual = false  → perfil estricto (default)
   */
  constructor(perfil) {
    this._perfil = Object.assign({ asignacionConIgual: false, indicesDesde0: false }, perfil || {});
  }

  // ── API pública ────────────────────────────────────────────────────────────

  /**
   * Ejecuta código PSeInt. El host es el RuntimeHost de Code4Code o un
   * objeto mock con la misma interfaz.
   *
   * El método devuelve SINCRÓNICAMENTE un objeto { detener() } antes de que
   * la ejecución termine, de modo que la UI puede detenerla en cualquier
   * momento.
   *
   * @param {string} codigo
   * @param {object} host   { escribir, leer, lineaActiva, variables }
   * @returns {{ detener: function }}
   */
  async ejecutar(codigo, host) {
    let detenido = false;
    let pasos = 0;

    const control = {
      detener: () => { detenido = true; },
    };

    // Capturar perfil para que las funciones anidadas puedan accederlo
    // (las closures anidadas no tienen acceso a this de la clase)
    const perfil = this._perfil;

    // Parsear
    const { ast, errores: erroresParser } = parsearPSeInt(codigo, perfil);

    if (erroresParser.length > 0) {
      for (const e of erroresParser) {
        host.escribir(`Error (línea ${e.linea + 1}): ${e.mensaje}`, 'error');
      }
      return control;
    }

    // Estado de ejecución
    const scopes     = new ScopeChainPSeInt();
    const arreglos   = new Map();           // clave→ { datos, dimensiones }
    const evaluador  = new EvaluadorPSeInt(scopes, BUILTINS_PSEINT, ast.subprocesos, perfil);
    evaluador.setArreglos(arreglos);

    const callStack = [];   // para detectar recursión excesiva

    // ── Snapshot de variables para el inspector ──────────────────────────────
    function publicarVariables() {
      const tabla = scopes.actual().listar().map(([clave, entrada]) => ({
        nombre: entrada.nombreOriginal || clave,
        tipo: entrada.tipo,
        valor: evaluador._valores.has(clave) ? evaluador._valores.get(clave) : undefined,
        inicializada: entrada.inicializada,
      }));
      try { host.variables(tabla); } catch (_) { /* UI no debe romper runtime */ }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function exigirVivo() {
      if (detenido) throw new Error('DETENIDO');
    }

    function contarPaso(lineaIdx) {
      exigirVivo();
      pasos++;
      if (pasos > RuntimePSeInt.MAX_PASOS) {
        throw new Error(`Bucle infinito detectado: más de ${RuntimePSeInt.MAX_PASOS} pasos.`);
      }
      try { host.lineaActiva(lineaIdx); } catch (_) { /* no romper */ }
    }

    function valorDefault(tipo) {
      switch (tipo) {
        case TIPOS_PSEINT.ENTERO:   return 0;
        case TIPOS_PSEINT.REAL:     return 0.0;
        case TIPOS_PSEINT.CADENA:   return '';
        case TIPOS_PSEINT.CARACTER: return '';
        case TIPOS_PSEINT.LOGICO:   return false;
        default:                    return null;
      }
    }

    // Inicializa un arreglo multidimensional con valor por defecto.
    function initDatos(dimensiones, defVal) {
      if (dimensiones.length === 1) {
        return new Array(dimensiones[0] + 1).fill(null).map(() => defVal);
      }
      return Array.from({ length: dimensiones[0] + 1 }, () =>
        new Array(dimensiones[1] + 1).fill(null).map(() => defVal)
      );
    }

    // Formatea valores para Escribir
    function formatear(v) {
      if (v === true)  return 'Verdadero';
      if (v === false) return 'Falso';
      if (v === null || v === undefined) return '';
      return String(v);
    }

    // Separa args por coma respetando paréntesis y strings
    function separarArgs(texto) {
      const partes = [];
      let actual = '';
      let prof = 0;
      let enStr = false;
      for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (c === '"') { enStr = !enStr; actual += c; continue; }
        if (enStr) { actual += c; continue; }
        if (c === '(' || c === '[') { prof++; actual += c; continue; }
        if (c === ')' || c === ']') { prof--; actual += c; continue; }
        if (c === ',' && prof === 0) { partes.push(actual.trim()); actual = ''; }
        else actual += c;
      }
      if (actual.trim()) partes.push(actual.trim());
      return partes;
    }

    // ── Ejecutores de nodos ───────────────────────────────────────────────────

    async function ejecutarBloque(nodos) {
      for (const nodo of nodos) {
        exigirVivo();
        await ejecutarNodo(nodo);
      }
    }

    async function ejecutarNodo(nodo) {
      exigirVivo();
      const lineaIdx = nodo.loc ? nodo.loc.linea : 0;

      try {
        switch (nodo.tipo) {

          case 'Definir':
            contarPaso(lineaIdx);
            ejecutarDefinir(nodo, lineaIdx);
            publicarVariables();
            break;

          case 'Dimension':
            contarPaso(lineaIdx);
            ejecutarDimension(nodo, lineaIdx);
            publicarVariables();
            break;

          case 'Asignar':
            contarPaso(lineaIdx);
            await ejecutarAsignar(nodo, lineaIdx);
            publicarVariables();
            break;

          case 'Leer':
            contarPaso(lineaIdx);
            await ejecutarLeer(nodo, lineaIdx);
            publicarVariables();
            break;

          case 'Escribir':
            contarPaso(lineaIdx);
            ejecutarEscribir(nodo, lineaIdx);
            break;

          case 'Si':
            await ejecutarSi(nodo);
            break;

          case 'Mientras':
            await ejecutarMientras(nodo);
            break;

          case 'Para':
            await ejecutarPara(nodo);
            break;

          case 'Repetir':
            await ejecutarRepetir(nodo);
            break;

          case 'Segun':
            await ejecutarSegun(nodo);
            break;

          case 'Retornar':
            ejecutarRetornar(nodo, lineaIdx);
            break;

          case 'Llamar':
            contarPaso(lineaIdx);
            await ejecutarLlamar(nodo, lineaIdx);
            publicarVariables();
            break;

          case 'Desconocido':
            throw new Error(`Instrucción no reconocida: "${nodo.texto}"`);

          default:
            // Nodos de estructura que el parser emite a nivel de bloque
            // (Programa, Caso, SubProceso) no llegan aquí como nodos sueltos.
            break;
        }
      } catch (e) {
        if (e.esRetornar) throw e;  // propagar Retornar
        if (e.message === 'DETENIDO') throw e;
        throw e;
      }
    }

    // ── Definir ──────────────────────────────────────────────────────────────

    function ejecutarDefinir(nodo, lineaIdx) {
      // Texto: "Definir x, y Como Entero"
      const linea = nodo.texto.trim();
      const m = linea.match(/^definir\s+(.+?)\s+como\s+(\w+)\s*$/i);
      if (!m) throw new Error(`Sintaxis inválida en Definir: "${linea}"`);

      const nombres = m[1].split(',').map(n => n.trim());
      const tipoRaw = m[2];

      // Normalizar tipo PSeInt
      const tipoPSeInt = _normalizarTipo(tipoRaw);

      for (const nombre of nombres) {
        if (!nombre) throw new Error('Nombre de variable vacío en Definir.');
        scopes.definir(nombre, tipoPSeInt, lineaIdx);
        // No inicializamos valor aún (la variable existe pero no tiene valor)
      }
    }

    function _normalizarTipo(raw) {
      switch (raw.toLowerCase()) {
        case 'entero':   return TIPOS_PSEINT.ENTERO;
        case 'real':     return TIPOS_PSEINT.REAL;
        case 'caracter': return TIPOS_PSEINT.CARACTER;
        case 'cadena':   return TIPOS_PSEINT.CADENA;
        case 'logico':   return TIPOS_PSEINT.LOGICO;
        default:
          throw new Error(`Tipo desconocido: "${raw}". Use Entero, Real, Caracter, Cadena o Logico.`);
      }
    }

    /**
     * Infiere el tipo PSeInt de un valor JS (para perfil flexible).
     * - number entero → Entero
     * - number con decimales → Real
     * - string → Cadena
     * - boolean → Logico
     */
    function _inferirTipo(valor) {
      if (typeof valor === 'boolean') return TIPOS_PSEINT.LOGICO;
      if (typeof valor === 'number') {
        return Number.isInteger(valor) ? TIPOS_PSEINT.ENTERO : TIPOS_PSEINT.REAL;
      }
      if (typeof valor === 'string') return TIPOS_PSEINT.CADENA;
      return TIPOS_PSEINT.CADENA; // fallback
    }

    // ── Dimension ─────────────────────────────────────────────────────────────

    function ejecutarDimension(nodo, lineaIdx) {
      // Texto: "Dimension arr[10]" o "Dimension mat[3,4]"
      const linea = nodo.texto.trim();
      const m = linea.match(/^dimension\s+(\w+)\s*\[(.+)\]\s*$/i);
      if (!m) throw new Error(`Sintaxis inválida en Dimension: "${linea}"`);

      const nombre = m[1];
      const dimStrs = m[2].split(',').map(s => s.trim());
      const dimensiones = dimStrs.map((ds, di) => {
        const val = evaluador.evaluar(ds);
        if (typeof val !== 'number' || val <= 0) {
          throw new Error(`Dimensión ${di + 1} de "${nombre}" debe ser número positivo.`);
        }
        return Math.trunc(val);
      });

      const clave = nombre.toLowerCase();
      // Obtener tipo si ya fue Definido
      const entrada = scopes.lookup(nombre);
      const tipo = entrada ? entrada.tipo : null;
      const defVal = tipo ? valorDefault(tipo) : 0;
      const datos = initDatos(dimensiones, defVal);

      arreglos.set(clave, { datos, dimensiones });
      // Marcar en scope si ya existe
      if (entrada) {
        scopes.inicializar(nombre);
      } else {
        // Pre-registrar sin tipo hasta que se haga Definir
        scopes.definir(nombre, null, lineaIdx);
      }
      evaluador.setArreglos(arreglos);
    }

    // ── Asignar ───────────────────────────────────────────────────────────────

    async function ejecutarAsignar(nodo, lineaIdx) {
      const linea = nodo.texto.trim();

      // Asignación con flecha: var <- expr  o  arr[i] <- expr
      // Asignación con =: var = expr  (perfil flexible)
      let partes = null;
      const mFlecha = linea.match(/^(.+?)\s*<-\s*(.+)$/);
      if (mFlecha) {
        partes = { izq: mFlecha[1].trim(), der: mFlecha[2].trim() };
      } else {
        // = solo si no es comparación (perfil flexible, el parser ya filtró el strict)
        const mIgual = linea.match(/^([\wáéíóúüñÁÉÍÓÚÜÑ_][\wáéíóúüñÁÉÍÓÚÜÑ_]*)\s*=(?!=)\s*(.+)$/);
        if (mIgual) partes = { izq: mIgual[1].trim(), der: mIgual[2].trim() };
      }

      if (!partes) throw new Error(`Sintaxis de asignación inválida: "${linea}"`);

      const { izq, der } = partes;

      // ¿Acceso a arreglo?  arr[i] <- expr
      const mIndice = izq.match(/^(\w+)\s*\[(.+)\]$/);
      if (mIndice) {
        const nombre = mIndice[1];
        const clave  = nombre.toLowerCase();
        const arr = arreglos.get(clave);
        if (!arr) throw new Error(`"${nombre}" no es un arreglo.`);

        const dimStrs = mIndice[2].split(',').map(s => s.trim());
        const indices = dimStrs.map((ds) => {
          const val = evaluador.evaluar(ds);
          if (typeof val !== 'number') throw new Error(`Índice de "${nombre}" debe ser numérico.`);
          return Math.trunc(val);
        });
        const valor = evaluador.evaluar(der);
        evaluador._setElementoArreglo(arr, indices, valor, nombre);
        scopes.inicializar(nombre);
        return;
      }

      // Asignación escalar
      const nombre = izq;
      const clave  = nombre.toLowerCase();

      // Llamada a subproceso con retorno:  var <- SubProceso(args)
      const mFn = der.match(/^([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ_][\wáéíóúüñÁÉÍÓÚÜÑ]*)\s*\(([^)]*)\)$/);
      if (mFn) {
        const nombreFn = mFn[1].toLowerCase();
        if (ast.subprocesos && ast.subprocesos[nombreFn]) {
          const sp = ast.subprocesos[nombreFn];
          const args = separarArgs(mFn[2]);
          const retVal = await ejecutarSubproceso(sp, args, lineaIdx, true);
          const entrada = scopes.lookup(nombre);
          const tipo = entrada ? entrada.tipo : null;
          const valorFinal = tipo ? coercionarValor(retVal, tipo) : retVal;
          evaluador.setValor(nombre, valorFinal);
          if (entrada) scopes.inicializar(nombre);
          return;
        }
      }

      const valorExpr = evaluador.evaluar(der);
      let entrada = scopes.lookup(nombre);
      if (!entrada) {
        // En perfil flexible, crear la variable automáticamente con tipo inferido
        if (perfil.asignacionConIgual === true) {
          const tipoInferido = _inferirTipo(valorExpr);
          scopes.definir(nombre, tipoInferido, lineaIdx);
          entrada = scopes.lookup(nombre);
        } else {
          throw new Error(`Variable "${nombre}" no definida. Use "Definir ${nombre} Como Tipo" primero.`);
        }
      }
      const valorFinal = entrada.tipo ? coercionarValor(valorExpr, entrada.tipo) : valorExpr;
      evaluador.setValor(nombre, valorFinal);
      scopes.inicializar(nombre);
    }

    // ── Leer ──────────────────────────────────────────────────────────────────

    async function ejecutarLeer(nodo, lineaIdx) {
      // Texto: "Leer x, y"  — permite múltiples variables separadas por coma
      const linea = nodo.texto.trim();
      const resto = linea.replace(/^leer\s+/i, '');
      const nombres = separarArgs(resto);

      for (const nombre of nombres) {
        if (!nombre) continue;
        const nombreLimpio = nombre.trim();
        let entrada = scopes.lookup(nombreLimpio);
        if (!entrada) {
          // En perfil flexible, crear la variable automáticamente como Cadena
          // (el tipo real se infiere tras leer; lo dejamos como Cadena por defecto
          // ya que el input del usuario siempre llega como string).
          if (perfil.asignacionConIgual === true) {
            scopes.definir(nombreLimpio, TIPOS_PSEINT.CADENA, 0);
            entrada = scopes.lookup(nombreLimpio);
          } else {
            throw new Error(`Variable "${nombreLimpio}" no definida. Use Definir antes de Leer.`);
          }
        }
        exigirVivo();
        const valorStr = await host.leer(nombreLimpio);
        exigirVivo();

        const tipo = entrada.tipo;
        let valorFinal;
        try {
          valorFinal = tipo ? coercionarValor(valorStr, tipo) : valorStr;
        } catch (_) {
          valorFinal = valorStr; // coerción falló: guardar como string
        }
        evaluador.setValor(nombreLimpio, valorFinal);
        scopes.inicializar(nombreLimpio);
      }
    }

    // ── Escribir ──────────────────────────────────────────────────────────────

    function ejecutarEscribir(nodo, lineaIdx) {
      // Texto: "Escribir expr1, expr2, ..."
      //        "Escribir Sin Saltar expr"
      const linea = nodo.texto.trim();

      let sinSaltar = false;
      let contenido;

      const mSinSaltar = linea.match(/^escribir\s+sin\s+saltar\s+(.+)$/i);
      if (mSinSaltar) {
        sinSaltar = true;
        contenido = mSinSaltar[1].trim();
      } else {
        contenido = linea.replace(/^escribir\s+/i, '').trim();
      }

      const partes = separarArgs(contenido);
      let salida = '';
      for (const parte of partes) {
        const val = evaluador.evaluar(parte.trim());
        salida += formatear(val);
      }

      const tipo = sinSaltar ? 'output-inline' : 'output';
      host.escribir(salida, tipo);
    }

    // ── Si ────────────────────────────────────────────────────────────────────

    async function ejecutarSi(nodo) {
      const lineaIdx = nodo.loc ? nodo.loc.linea : 0;
      contarPaso(lineaIdx);
      exigirVivo();

      const cond = evaluador.evaluarCondicion(nodo.condicion);
      if (cond) {
        await ejecutarBloque(nodo.entonces);
      } else if (nodo.sino !== null) {
        await ejecutarBloque(nodo.sino);
      }
    }

    // ── Mientras ──────────────────────────────────────────────────────────────

    async function ejecutarMientras(nodo) {
      const lineaIdx = nodo.loc ? nodo.loc.linea : 0;

      while (true) {
        contarPaso(lineaIdx);
        exigirVivo();
        if (!evaluador.evaluarCondicion(nodo.condicion)) break;
        await ejecutarBloque(nodo.cuerpo);
      }
    }

    // ── Para ──────────────────────────────────────────────────────────────────

    async function ejecutarPara(nodo) {
      const lineaIdx = nodo.loc ? nodo.loc.linea : 0;

      // Texto: "Para i <- 1 Hasta 10 Con Paso 1 Hacer"
      //  o     "Para i <- inicio Hasta fin Hacer"  (paso implícito 1)
      const linea = nodo.texto.trim();
      // Capturar:  variable  <-  desde  Hasta  fin  [Con Paso  paso]
      const m = linea.match(
        /^para\s+([\wáéíóúüñÁÉÍÓÚÜÑ_]+)\s*<-\s*(.+?)\s+hasta\s+(.+?)(?:\s+con\s+paso\s+(.+?))?\s*(?:hacer\s*)?$/i
      );
      if (!m) throw new Error(`Sintaxis de Para inválida: "${linea}"`);

      const varNombre = m[1].trim();
      const desdeExpr = m[2].trim();
      const hastaExpr = m[3].trim();
      const pasoExpr  = m[4] ? m[4].trim() : '1';

      let entrada = scopes.lookup(varNombre);
      if (!entrada) {
        // En perfil flexible, crear la variable de iteración automáticamente como Entero
        if (perfil.asignacionConIgual === true) {
          scopes.definir(varNombre, TIPOS_PSEINT.ENTERO, lineaIdx);
          entrada = scopes.lookup(varNombre);
        } else {
          throw new Error(`Variable "${varNombre}" no definida. Use "Definir ${varNombre} Como Entero" antes del Para.`);
        }
      }

      let desde = evaluador.evaluar(desdeExpr);
      const hasta = evaluador.evaluar(hastaExpr);
      const paso  = evaluador.evaluar(pasoExpr);

      if (paso === 0) throw new Error('El paso del Para no puede ser cero.');

      evaluador.setValor(varNombre, desde);
      scopes.inicializar(varNombre);
      publicarVariables();

      const avanza = paso > 0
        ? () => evaluador.getValor(varNombre) <= hasta
        : () => evaluador.getValor(varNombre) >= hasta;

      while (true) {
        contarPaso(lineaIdx);
        exigirVivo();
        if (!avanza()) break;

        await ejecutarBloque(nodo.cuerpo);

        const actual = evaluador.getValor(varNombre);
        evaluador.setValor(varNombre, actual + paso);
        publicarVariables();
      }
    }

    // ── Repetir ───────────────────────────────────────────────────────────────

    async function ejecutarRepetir(nodo) {
      const lineaIdx = nodo.loc ? nodo.loc.linea : 0;

      if (!nodo.condicion) throw new Error('Bloque Repetir sin Hasta Que.');

      do {
        exigirVivo();
        await ejecutarBloque(nodo.cuerpo);
        contarPaso(lineaIdx);
        exigirVivo();
      } while (!evaluador.evaluarCondicion(nodo.condicion));
    }

    // ── Segun ─────────────────────────────────────────────────────────────────

    async function ejecutarSegun(nodo) {
      const lineaIdx = nodo.loc ? nodo.loc.linea : 0;
      contarPaso(lineaIdx);
      exigirVivo();

      const valorVar = evaluador.evaluar(nodo.variable);
      let ejecutado = false;

      for (const caso of nodo.casos) {
        if (ejecutado) break;
        for (const v of caso.valores) {
          const valorCaso = evaluador.evaluar(v.trim());
          // eslint-disable-next-line eqeqeq
          if (valorVar == valorCaso) {
            await ejecutarBloque(caso.cuerpo);
            ejecutado = true;
            break;
          }
        }
      }

      if (!ejecutado && nodo.otro !== null) {
        await ejecutarBloque(nodo.otro);
      }
    }

    // ── Retornar ──────────────────────────────────────────────────────────────

    function ejecutarRetornar(nodo, lineaIdx) {
      // Texto: "Retornar <expr>"
      const linea = nodo.texto.trim();
      const resto = linea.replace(/^retornar\s*/i, '').trim();
      const valor = resto ? evaluador.evaluar(resto) : undefined;
      throw new _RetornarExcepcion(valor);
    }

    // ── Llamar ────────────────────────────────────────────────────────────────

    async function ejecutarLlamar(nodo, lineaIdx) {
      // Texto: "Llamar SubProceso(args)"
      const linea = nodo.texto.trim();
      const m = linea.match(/^llamar\s+(\w+)\s*\(([^)]*)\)\s*$/i);
      if (!m) throw new Error(`Sintaxis inválida en Llamar: "${linea}"`);
      const nombreFn = m[1].toLowerCase();
      if (!ast.subprocesos || !ast.subprocesos[nombreFn]) {
        throw new Error(`SubProceso "${m[1]}" no definido.`);
      }
      const sp = ast.subprocesos[nombreFn];
      const args = separarArgs(m[2]);
      await ejecutarSubproceso(sp, args, lineaIdx, false);
    }

    // ── SubProceso (llamada) ──────────────────────────────────────────────────

    async function ejecutarSubproceso(sp, argsRaw, lineaIdx, esperaRetorno) {
      if (callStack.length >= RuntimePSeInt.MAX_PROFUNDIDAD) {
        throw new Error(`Desbordamiento de pila en "${sp.nombre}".`);
      }
      callStack.push(sp.nombre);

      // Evaluar argumentos en el scope llamador
      const argsEval = argsRaw.map((expr) => {
        if (!expr || !expr.trim()) return undefined;
        return evaluador.evaluar(expr.trim());
      });

      // Guardar contexto del llamador
      const scopesOuter = scopes._pilaScopes.slice();
      const valoresOuter = new Map(evaluador._valores);
      const arreglosOuter = new Map(arreglos);

      // Nuevo scope para el subproceso
      scopes._pilaScopes = [new (ScopeChainPSeInt)()._pilaScopes[0].constructor()];
      // Usamos push() para crear scope local
      scopes.push();
      evaluador._valores = new Map();

      // Parsear parámetros (si el nodo los tiene en paramTexto)
      const params = _parsearParams(sp.paramTexto || '');

      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        const val = i < argsEval.length ? argsEval[i] : undefined;
        scopes.definir(param.nombre, param.tipo || null, lineaIdx);
        if (val !== undefined) {
          evaluador.setValor(param.nombre, val);
          scopes.inicializar(param.nombre);
        }
      }

      let retVal;
      try {
        await ejecutarBloque(sp.cuerpo);
      } catch (e) {
        if (e instanceof _RetornarExcepcion) {
          retVal = e.valor;
        } else if (e.esRetornar) {
          retVal = e.valor;
        } else {
          // Restaurar antes de propagar
          scopes._pilaScopes = scopesOuter;
          evaluador._valores = valoresOuter;
          callStack.pop();
          throw e;
        }
      }

      // Restaurar contexto llamador
      scopes._pilaScopes = scopesOuter;
      evaluador._valores = valoresOuter;
      // Restaurar arreglos (no se exponen al subproceso por ahora)
      callStack.pop();

      return retVal;
    }

    function _parsearParams(paramTexto) {
      if (!paramTexto || !paramTexto.trim()) return [];
      const partes = paramTexto.split(',').map(p => p.trim()).filter(Boolean);
      return partes.map(p => {
        // "nombre Como Tipo" o solo "nombre"
        const m = p.match(/^(\w+)(?:\s+como\s+(\w+))?$/i);
        if (!m) return { nombre: p, tipo: null };
        return { nombre: m[1], tipo: m[2] ? _normalizarTipo(m[2]) : null };
      });
    }

    // ── Ejecución principal ───────────────────────────────────────────────────

    // Registrar subprocesos en el evaluador si los hay
    // (ya disponibles en ast.subprocesos — pasados al constructor del evaluador)

    try {
      await ejecutarBloque(ast.cuerpo);
    } catch (e) {
      if (e.message !== 'DETENIDO') {
        host.escribir(`Error: ${e.message}`, 'error');
      }
    }

    return control;
  }
}

// ---------------------------------------------------------------------------
// Exportación CommonJS (Node.js / tests)
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RuntimePSeInt;
}
