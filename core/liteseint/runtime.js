/**
 * ============================================================
 *  LiteSeInt.js — Motor de Intérprete de Pseudocódigo v2.0
 * ============================================================
 *  Core independiente de la UI.
 *  Depende de doc_errores.js para validación y tokenización.
 *
 *  Tipos soportados: Entero, Real, Caracter, Logico
 *  Instrucciones: Definir, Escribir, Leer, Asignación (=)
 *  Estructuras de control: Si/FinSi, Mientras/FinMientras,
 *    Repetir/HastaQue, Para/FinPara, Segun/FinSegun
 * ============================================================
 */

class LiteSeInt {

  static MAX_ITERACIONES = 100_000;
  static MAX_PROFUNDIDAD_LLAMADA = 256;

  constructor(callbacks = {}) {
    this.callbacks = {
      onEscribir:       callbacks.onEscribir       || (() => {}),
      onLeer:           callbacks.onLeer           || (() => Promise.resolve('')),
      onError:          callbacks.onError          || (() => {}),
      onLineaActiva:    callbacks.onLineaActiva    || (() => {}),
      onSistema:        callbacks.onSistema        || (() => {}),
      onFin:            callbacks.onFin            || (() => {}),
      onVariableChanged: callbacks.onVariableChanged || (() => {}),
      onScopeEntered:   callbacks.onScopeEntered   || (() => {}),
      onScopeExited:    callbacks.onScopeExited    || (() => {}),
    };

    /** @type {Object.<string, {tipo: string, valor: *, inicializada: boolean}>} */
    this.variables = {};
    /** @type {Object.<string, Object>} SubProceso/Funcion definitions from AST */
    this.subprocesos = {};
    /** @type {Array<{nombre: string, linea: number}>} Call stack frames */
    this.callStack = [];

    this.ejecutando = false;
    this.detencionSolicitada = false;
    this.errores = [];
    this.velocidadPausa = 100;
  }

  // ===========================================================
  //  API PÚBLICA
  // ===========================================================

  _notificarCambioVariable(nombre) {
    const v = this.variables[nombre];
    if (!v) return;
    this.callbacks.onVariableChanged({ nombre, ...v });
  }

  async ejecutar(codigo, validacionPrevia = null) {
    this.variables = {};
    this.subprocesos = {};
    this.callStack = [];
    this.errores = [];
    this.ejecutando = true;
    this.detencionSolicitada = false;

    this.callbacks.onScopeEntered({});
    const validacion = validacionPrevia || DocErrores.validarDocumento(codigo);

    if (validacion.errores.length > 0) {
      for (const err of validacion.errores) {
        this.errores.push(err);
        this.callbacks.onError(err.linea, err.mensaje);
      }
      this.ejecutando = false;
      this.callbacks.onFin();
      return {
        exito: false,
        errores: this.errores,
        erroresPorLinea: validacion.erroresPorLinea,
      };
    }

    let ast;
    try {
      ast = LiteSeIntParser.parsearPrograma(codigo);
    } catch (err) {
      const mensaje = err.message || String(err);
      const errorObj = DocErrores.crearError(0, 0, 0, 'parse_error', mensaje, '');
      this.errores.push(errorObj);
      this.callbacks.onError(0, mensaje);
      this.ejecutando = false;
      this.callbacks.onFin();
      return { exito: false, errores: this.errores, erroresPorLinea: new Map() };
    }

    if (ast.subprocesos) {
      this.subprocesos = ast.subprocesos;
    }

    try {
      await this._ejecutarBloque(ast.cuerpo);
    } catch (err) {
      const mensaje = err.message || String(err);
      const lineaErr = err.lineaIdx !== undefined ? err.lineaIdx : 0;
      const errorObj = DocErrores.crearError(lineaErr, 0, 0, 'runtime', mensaje, '');
      this.errores.push(errorObj);
      this.callbacks.onError(lineaErr, mensaje);
    }

    const detenido = this.detencionSolicitada;
    this.ejecutando = false;
    this.callbacks.onScopeExited({});
    this.callbacks.onFin();

    return {
      exito: this.errores.length === 0 && !detenido,
      detenido,
      errores: this.errores,
      erroresPorLinea: new Map(),
    };
  }

  detener() {
    if (this.ejecutando) {
      this.detencionSolicitada = true;
    }
    this.ejecutando = false;
  }

  getVariables() {
    return { ...this.variables };
  }


  // ===========================================================
  //  EJECUTOR DE BLOQUES
  // ===========================================================

  async _ejecutarBloque(nodos) {
    for (const nodo of nodos) {
      if (!this.ejecutando) break;
      await this._ejecutarNodo(nodo);
    }
  }

  async _ejecutarNodo(nodo) {
    if (!this.ejecutando) return;
    const lineaIdx = nodo.loc.linea;
    try {
      switch (nodo.tipo) {
        case 'Definir':
          this.callbacks.onLineaActiva(lineaIdx);
          await this._pausa(this.velocidadPausa);
          return this._ejecutarDefinir(nodo.texto, lineaIdx);

        case 'Escribir':
          this.callbacks.onLineaActiva(lineaIdx);
          await this._pausa(this.velocidadPausa);
          return this._ejecutarEscribir(nodo.texto, lineaIdx);

        case 'Leer':
          this.callbacks.onLineaActiva(lineaIdx);
          return await this._ejecutarLeer(nodo.texto, lineaIdx);

        case 'Dimension':
          this.callbacks.onLineaActiva(lineaIdx);
          await this._pausa(this.velocidadPausa);
          return this._ejecutarDimension(nodo, lineaIdx);

        case 'AsignarIndice':
          this.callbacks.onLineaActiva(lineaIdx);
          await this._pausa(this.velocidadPausa);
          return this._ejecutarAsignarIndice(nodo, lineaIdx);

        case 'LeerIndice':
          this.callbacks.onLineaActiva(lineaIdx);
          return await this._ejecutarLeerIndice(nodo, lineaIdx);

        case 'Asignar':
          this.callbacks.onLineaActiva(lineaIdx);
          await this._pausa(this.velocidadPausa);
          return await this._ejecutarAsignacion(nodo.texto, lineaIdx);

        case 'Llamar':
          this.callbacks.onLineaActiva(lineaIdx);
          await this._pausa(this.velocidadPausa);
          return await this._ejecutarLlamar(nodo, lineaIdx);

        case 'Si':
          return await this._ejecutarSi(nodo);

        case 'Mientras':
          return await this._ejecutarMientras(nodo);

        case 'Repetir':
          return await this._ejecutarRepetir(nodo);

        case 'Para':
          return await this._ejecutarPara(nodo);

        case 'Segun':
          return await this._ejecutarSegun(nodo);

        case 'Desconocido':
          this.callbacks.onLineaActiva(lineaIdx);
          throw new Error(`Instrucción no reconocida: "${nodo.texto}"`);
      }
    } catch (err) {
      if (err.lineaIdx === undefined) err.lineaIdx = lineaIdx;
      throw err;
    }
  }

  // ===========================================================
  //  EJECUTORES DE ESTRUCTURAS
  // ===========================================================

  async _ejecutarSi(nodo) {
    const lineaIdx = nodo.loc.linea;
    this.callbacks.onLineaActiva(lineaIdx);
    await this._pausa(this.velocidadPausa);
    if (!this.ejecutando) return;

    const cond = this._evaluarCondicion(nodo.condicion, lineaIdx);
    if (cond) {
      await this._ejecutarBloque(nodo.entonces);
    } else if (nodo.sino !== null) {
      await this._ejecutarBloque(nodo.sino);
    }
  }

  async _ejecutarMientras(nodo) {
    const lineaIdx = nodo.loc.linea;
    let iter = 0;
    while (this.ejecutando) {
      this.callbacks.onLineaActiva(lineaIdx);
      await this._pausa(this.velocidadPausa);
      if (!this.ejecutando) break;

      if (!this._evaluarCondicion(nodo.condicion, lineaIdx)) break;

      await this._ejecutarBloque(nodo.cuerpo);
      iter++;
      if (iter >= LiteSeInt.MAX_ITERACIONES) {
        throw new Error(`Bucle infinito: más de ${LiteSeInt.MAX_ITERACIONES} iteraciones.`);
      }
    }
  }

  async _ejecutarRepetir(nodo) {
    if (nodo.condicion === null) {
      throw new Error('Bloque Repetir sin HastaQue correspondiente.');
    }
    const lineaHastaQue = nodo.locHastaQue.linea;
    let iter = 0;
    do {
      if (!this.ejecutando) break;
      await this._ejecutarBloque(nodo.cuerpo);
      if (!this.ejecutando) break;

      this.callbacks.onLineaActiva(lineaHastaQue);
      await this._pausa(this.velocidadPausa);

      iter++;
      if (iter >= LiteSeInt.MAX_ITERACIONES) {
        throw new Error(`Bucle infinito: más de ${LiteSeInt.MAX_ITERACIONES} iteraciones.`);
      }
    } while (this.ejecutando && !this._evaluarCondicion(nodo.condicion, lineaHastaQue));
  }

  async _ejecutarPara(nodo) {
    const varNombre = nodo.variable;

    if (!this.variables.hasOwnProperty(varNombre)) {
      throw new Error(
        `Variable "${nodo.variableOriginal}" no definida. ` +
        `Use "Definir ${nodo.variableOriginal} Como Entero" antes del Para.`
      );
    }

    const lineaIdx = nodo.loc.linea;
    const desde = this._evaluarExpresion(nodo.desde, lineaIdx);
    const hasta  = this._evaluarExpresion(nodo.hasta,  lineaIdx);
    const paso   = this._evaluarExpresion(nodo.paso,   lineaIdx);

    if (paso === 0) throw new Error('El paso del bucle Para no puede ser cero.');

    this.variables[varNombre].valor = desde;
    this.variables[varNombre].inicializada = true;
    this._notificarCambioVariable(varNombre);

    const avanza = paso > 0
      ? () => this.variables[varNombre].valor <= hasta
      : () => this.variables[varNombre].valor >= hasta;

    let iter = 0;
    while (this.ejecutando && avanza()) {
      this.callbacks.onLineaActiva(lineaIdx);
      await this._pausa(this.velocidadPausa);
      if (!this.ejecutando) break;

      await this._ejecutarBloque(nodo.cuerpo);

      this.variables[varNombre].valor += paso;
      this._notificarCambioVariable(varNombre);
      iter++;
      if (iter >= LiteSeInt.MAX_ITERACIONES) {
        throw new Error(`Bucle infinito: más de ${LiteSeInt.MAX_ITERACIONES} iteraciones.`);
      }
    }
  }

  async _ejecutarSegun(nodo) {
    const lineaIdx = nodo.loc.linea;
    this.callbacks.onLineaActiva(lineaIdx);
    await this._pausa(this.velocidadPausa);
    if (!this.ejecutando) return;

    const valor = this._evaluarExpresion(nodo.expresion, lineaIdx);

    let ejecutado = false;
    for (const caso of nodo.casos) {
      if (ejecutado) break;
      for (const v of caso.valores) {
        const valorCaso = this._evaluarExpresion(v.trim(), lineaIdx);
        // loose equality para comparar números y strings sin importar tipo
        if (valor == valorCaso) {
          await this._ejecutarBloque(caso.cuerpo);
          ejecutado = true;
          break;
        }
      }
    }

    if (!ejecutado && nodo.otro !== null) {
      await this._ejecutarBloque(nodo.otro);
    }
  }


  // ===========================================================
  //  HANDLERS (lógica interna sin cambios)
  // ===========================================================

  _ejecutarDefinir(linea, lineaIdx) {
    const match = linea.match(/^definir\s+(.+?)\s+como\s+(entero|real|caracter|logico)\s*$/i);
    if (!match) {
      throw new Error('Sintaxis inválida. Use: Definir <var1>, <var2> Como <Entero|Real|Caracter|Logico>');
    }

    const listaVars = match[1];
    const tipo = match[2].toLowerCase();
    const nombres = listaVars.split(',').map(n => n.trim().toLowerCase());

    for (const nombre of nombres) {
      if (nombre === '') {
        throw new Error('Nombre de variable vacío en la declaración.');
      }
      if (DocErrores.PALABRAS_RESERVADAS_SET.has(nombre)) {
        throw new Error(`"${nombre}" es una palabra reservada y no puede usarse como variable.`);
      }
      if (this.variables.hasOwnProperty(nombre)) {
        const v = this.variables[nombre];
        if (v.tipo === null && Array.isArray(v.dimensiones)) {
          // Pre-registrado por Dimension — completar con tipo e inicializar datos
          v.tipo = tipo;
          v.datos = this._initArrayDatos(v.dimensiones, this._valorDefault(tipo));
          v.inicializada = true;
          this._notificarCambioVariable(nombre);
          continue;
        }
        throw new Error(`Variable "${nombre}" ya se encuentra definida.`);
      }

      this.variables[nombre] = {
        tipo,
        valor: this._valorDefault(tipo),
        inicializada: false,
      };
      this._notificarCambioVariable(nombre);
    }
  }

  _encontrarPosAsignacion(linea) {
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

  async _ejecutarAsignacion(linea, lineaIdx) {
    const pos = this._encontrarPosAsignacion(linea);
    if (pos < 0) {
      throw new Error('Sintaxis de asignación inválida. Use: variable = valor');
    }

    const nombre = linea.substring(0, pos).trim().toLowerCase();
    const expresion = linea.substring(pos + 1).trim();

    if (!this.variables.hasOwnProperty(nombre)) {
      throw new Error(`Variable "${nombre}" no definida. Use "Definir ${nombre} Como Tipo" primero.`);
    }

    // Check if RHS is a lone user-defined subproceso/funcion call.
    const fnMatch = expresion.match(/^([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ_][\wáéíóúüñÁÉÍÓÚÜÑ]*)\s*\(([^)]*)\)$/);
    if (fnMatch && this.subprocesos && this.subprocesos.hasOwnProperty(fnMatch[1].toLowerCase())) {
      const sp = this.subprocesos[fnMatch[1].toLowerCase()];
      const argsRaw = this._splitArgsPorComas(fnMatch[2]);
      await this._ejecutarSubProcesoCall(sp, argsRaw, lineaIdx, nombre);
      return;
    }

    const valor = this._evaluarExpresion(expresion, lineaIdx);
    this.variables[nombre].valor = this._convertirTipo(valor, this.variables[nombre].tipo);
    this.variables[nombre].inicializada = true;
    this._notificarCambioVariable(nombre);
  }

  _ejecutarEscribir(linea, lineaIdx) {
    const contenido = linea.replace(/^escribir\s+/i, '');
    const partes = this._separarPorComas(contenido);
    let salida = '';

    for (const parte of partes) {
      salida += this._formatearSalida(this._evaluarExpresion(parte.trim(), lineaIdx));
    }

    this.callbacks.onEscribir(salida);
  }

  async _ejecutarLeer(linea, lineaIdx) {
    const match = linea.match(/^leer\s+(\w+)\s*$/i);
    if (!match) {
      throw new Error('Sintaxis inválida. Use: Leer <variable>');
    }

    const nombre = match[1].toLowerCase();

    if (!this.variables.hasOwnProperty(nombre)) {
      throw new Error(`Variable "${nombre}" no definida. Debe definirla antes de usar Leer.`);
    }

    const valorIngresado = await this.callbacks.onLeer(nombre);

    if (!this.ejecutando) return;

    const tipo = this.variables[nombre].tipo;

    if (!this._validarEntradaTipo(valorIngresado, tipo)) {
      const tipoLabel = tipo.charAt(0).toUpperCase() + tipo.slice(1);
      throw new Error(
        `El valor ingresado para "${nombre}" no corresponde al tipo ${tipoLabel}.`
      );
    }

    this.variables[nombre].valor = this._convertirTipo(valorIngresado, tipo);
    this.variables[nombre].inicializada = true;
    this._notificarCambioVariable(nombre);

    this.callbacks.onSistema(`  ↳ ${nombre} = ${valorIngresado}`);
  }


  // ===========================================================
  //  SUBPROCESOS / FUNCIONES
  // ===========================================================

  /** Split an argument string by commas, respecting nested parens and strings. */
  _splitArgsPorComas(str) {
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

  async _ejecutarLlamar(nodo, lineaIdx) {
    const nombre = nodo.nombre;
    if (!this.subprocesos || !this.subprocesos.hasOwnProperty(nombre)) {
      throw Object.assign(
        new Error(`SubProceso "${nodo.nombreOriginal}" no definido.`),
        { lineaIdx }
      );
    }
    const sp = this.subprocesos[nombre];
    await this._ejecutarSubProcesoCall(sp, nodo.args, lineaIdx, nodo.varRetorno);
  }

  async _ejecutarSubProcesoCall(sp, argsRaw, lineaIdx, varRetornoExterno) {
    if (this.callStack.length >= LiteSeInt.MAX_PROFUNDIDAD_LLAMADA) {
      throw Object.assign(
        new Error(`Desbordamiento de pila: profundidad máxima (${LiteSeInt.MAX_PROFUNDIDAD_LLAMADA}) alcanzada en "${sp.nombreOriginal}".`),
        { lineaIdx }
      );
    }

    // Evaluate arguments in the CALLER's scope
    const argsEvaluados = argsRaw.map((argExpr, idx) => {
      if (!argExpr || !argExpr.trim()) return undefined;
      try {
        return this._evaluarExpresion(argExpr.trim(), lineaIdx);
      } catch (err) {
        throw Object.assign(
          new Error(`Error en argumento ${idx + 1} de "${sp.nombreOriginal}": ${err.message}`),
          { lineaIdx }
        );
      }
    });

    // Save caller's variable scope
    const outerVariables = this.variables;

    // Push a call stack frame
    this.callStack.push({ nombre: sp.nombreOriginal, linea: lineaIdx });

    // Build inner scope from parameters
    const innerVariables = {};
    const refs = []; // by-reference scalar params

    for (let i = 0; i < sp.params.length; i++) {
      const param = sp.params[i];
      const argVal = i < argsEvaluados.length ? argsEvaluados[i] : this._valorDefault(param.tipo || 'entero');
      const argExpr = argsRaw[i] ? argsRaw[i].trim() : null;
      const argNameLower = argExpr && /^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ_][\wáéíóúüñÁÉÍÓÚÜÑ]*$/.test(argExpr)
        ? argExpr.toLowerCase() : null;
      const outerVar = argNameLower && outerVariables.hasOwnProperty(argNameLower)
        ? outerVariables[argNameLower] : null;

      if (outerVar && outerVar.dimensiones) {
        // Arrays are always by reference: share the datos array object
        innerVariables[param.nombre] = {
          tipo: outerVar.tipo,
          valor: null,
          inicializada: outerVar.inicializada,
          dimensiones: outerVar.dimensiones,
          datos: outerVar.datos,
        };
        refs.push({ tipo: 'array', paramNombre: param.nombre, outerKey: argNameLower });
      } else if (param.porReferencia && outerVar) {
        innerVariables[param.nombre] = {
          tipo: param.tipo || outerVar.tipo,
          valor: argVal,
          inicializada: true,
        };
        refs.push({ tipo: 'scalar', paramNombre: param.nombre, outerKey: argNameLower });
      } else {
        innerVariables[param.nombre] = {
          tipo: param.tipo || 'caracter',
          valor: argVal,
          inicializada: argVal !== undefined,
        };
      }
    }

    // Add return variable to inner scope if the subproceso has one
    if (sp.retorno) {
      innerVariables[sp.retorno] = {
        tipo: 'caracter',
        valor: null,
        inicializada: false,
      };
    }

    // Switch to inner scope
    this.variables = innerVariables;
    this.callbacks.onScopeEntered({ nombre: sp.nombreOriginal });

    // Execute the subproceso body
    await this._ejecutarBloque(sp.cuerpo);

    // Capture return value before restoring scope
    let retVal = undefined;
    if (sp.retorno && innerVariables.hasOwnProperty(sp.retorno) && innerVariables[sp.retorno].inicializada) {
      retVal = innerVariables[sp.retorno].valor;
    }

    // Restore caller's scope
    this.callbacks.onScopeExited({ nombre: sp.nombreOriginal });
    this.callStack.pop();
    this.variables = outerVariables;

    // Apply by-reference back-copies and notify
    for (const ref of refs) {
      if (ref.tipo === 'scalar') {
        outerVariables[ref.outerKey].valor = innerVariables[ref.paramNombre].valor;
        this._notificarCambioVariable(ref.outerKey);
      }
      // Array refs share the datos object — no copy needed; notify outer variable
      if (ref.tipo === 'array') {
        this._notificarCambioVariable(ref.outerKey);
      }
    }

    // Assign return value to caller's variable
    if (varRetornoExterno && retVal !== undefined) {
      const varNombre = varRetornoExterno.toLowerCase();
      if (!outerVariables.hasOwnProperty(varNombre)) {
        throw Object.assign(
          new Error(`Variable "${varRetornoExterno}" no definida.`),
          { lineaIdx }
        );
      }
      outerVariables[varNombre].valor = this._convertirTipo(retVal, outerVariables[varNombre].tipo);
      outerVariables[varNombre].inicializada = true;
      this._notificarCambioVariable(varNombre);
    }

    return retVal;
  }

  // ===========================================================
  //  ARREGLOS Y MATRICES
  // ===========================================================

  _initArrayDatos(dimensiones, valorDefault) {
    if (dimensiones.length === 1) {
      return new Array(dimensiones[0] + 1).fill(null).map(() => valorDefault);
    }
    return Array.from({ length: dimensiones[0] + 1 }, () =>
      new Array(dimensiones[1] + 1).fill(null).map(() => valorDefault)
    );
  }

  _getArrayElement(nombre, indices) {
    const v = this.variables[nombre];
    if (indices.length === 1) return v.datos[indices[0]];
    return v.datos[indices[0]][indices[1]];
  }

  _setArrayElement(nombre, indices, valor) {
    const v = this.variables[nombre];
    if (indices.length === 1) {
      v.datos[indices[0]] = valor;
    } else {
      v.datos[indices[0]][indices[1]] = valor;
    }
  }

  _validarIndices(nodo, indices) {
    const v = this.variables[nodo.nombre.toLowerCase()];
    if (!v || !v.dimensiones) {
      throw new Error(`"${nodo.nombre}" no es un arreglo dimensionado. Use "Dimension" para declararlo.`);
    }
    if (indices.length !== v.dimensiones.length) {
      throw new Error(`Arreglo "${nodo.nombre}" tiene ${v.dimensiones.length} dimensión(es), se usaron ${indices.length}.`);
    }
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const max = v.dimensiones[i];
      if (idx < 1 || idx > max) {
        throw new Error(`Índice ${idx} fuera de rango [1..${max}] en "${nodo.nombre}".`);
      }
    }
  }

  _ejecutarDimension(nodo, lineaIdx) {
    const nombre = nodo.nombre.toLowerCase();
    const dimensiones = nodo.dimensiones.map((d, dimIdx) => {
      if (typeof d === 'number') return d;
      const val = this._evaluarExpresion(String(d), lineaIdx);
      if (typeof val !== 'number' || val <= 0) {
        throw Object.assign(
          new Error(`El tamaño de la dimensión ${dimIdx + 1} debe ser un número positivo.`),
          { lineaIdx }
        );
      }
      return Math.trunc(val);
    });

    if (this.variables.hasOwnProperty(nombre)) {
      const v = this.variables[nombre];
      if (Array.isArray(v.dimensiones)) {
        throw Object.assign(
          new Error(`El arreglo "${nodo.nombre}" ya fue dimensionado.`),
          { lineaIdx }
        );
      }
      // Definir vino antes — agregar dimensiones ahora
      v.dimensiones = dimensiones;
      v.datos = this._initArrayDatos(dimensiones, this._valorDefault(v.tipo));
      v.inicializada = true;
      this._notificarCambioVariable(nombre);
    } else {
      // Definir vendrá después — pre-registrar
      this.variables[nombre] = {
        tipo: null,
        valor: null,
        inicializada: false,
        dimensiones,
        datos: null,
      };
      this._notificarCambioVariable(nombre);
    }
  }

  _ejecutarAsignarIndice(nodo, lineaIdx) {
    const nombre = nodo.nombre.toLowerCase();
    if (!this.variables.hasOwnProperty(nombre)) {
      throw Object.assign(
        new Error(`Variable "${nodo.nombre}" no definida. Use "Definir" y "Dimension" primero.`),
        { lineaIdx }
      );
    }
    const v = this.variables[nombre];
    if (!v.dimensiones) {
      throw Object.assign(
        new Error(`"${nodo.nombre}" no es un arreglo dimensionado. Use "Dimension" para declararlo.`),
        { lineaIdx }
      );
    }
    if (v.tipo === null) {
      throw Object.assign(
        new Error(`Tipo de "${nodo.nombre}" no definido. Use "Definir ${nodo.nombre} Como Tipo" después de "Dimension".`),
        { lineaIdx }
      );
    }

    const indices = nodo.indices.map(idxExpr => {
      const val = this._evaluarExpresion(idxExpr, lineaIdx);
      if (typeof val !== 'number') {
        throw Object.assign(
          new Error(`El índice del arreglo "${nodo.nombre}" debe ser numérico.`),
          { lineaIdx }
        );
      }
      return Math.trunc(val);
    });

    this._validarIndices(nodo, indices);

    const valor = this._evaluarExpresion(nodo.expresion, lineaIdx);
    this._setArrayElement(nombre, indices, this._convertirTipo(valor, v.tipo));
    v.inicializada = true;
    this._notificarCambioVariable(nombre);
  }

  async _ejecutarLeerIndice(nodo, lineaIdx) {
    const nombre = nodo.nombre.toLowerCase();
    if (!this.variables.hasOwnProperty(nombre)) {
      throw Object.assign(
        new Error(`Variable "${nodo.nombre}" no definida.`),
        { lineaIdx }
      );
    }
    const v = this.variables[nombre];
    if (!v.dimensiones) {
      throw Object.assign(
        new Error(`"${nodo.nombre}" no es un arreglo.`),
        { lineaIdx }
      );
    }
    if (v.tipo === null) {
      throw Object.assign(
        new Error(`Tipo de "${nodo.nombre}" no definido. Use "Definir ${nodo.nombre} Como Tipo".`),
        { lineaIdx }
      );
    }

    const indices = nodo.indices.map(idxExpr => {
      const val = this._evaluarExpresion(idxExpr, lineaIdx);
      return Math.trunc(val);
    });
    this._validarIndices(nodo, indices);

    const valorIngresado = await this.callbacks.onLeer(nombre);
    if (!this.ejecutando) return;

    if (!this._validarEntradaTipo(valorIngresado, v.tipo)) {
      const tipoLabel = v.tipo.charAt(0).toUpperCase() + v.tipo.slice(1);
      throw Object.assign(
        new Error(`El valor ingresado para "${nodo.nombre}" no corresponde al tipo ${tipoLabel}.`),
        { lineaIdx }
      );
    }

    this._setArrayElement(nombre, indices, this._convertirTipo(valorIngresado, v.tipo));
    v.inicializada = true;
    this._notificarCambioVariable(nombre);
    this.callbacks.onSistema(`  ↳ ${nodo.nombre}[${nodo.indices.join(', ')}] = ${valorIngresado}`);
  }

  // ===========================================================
  //  UTILIDADES
  // ===========================================================

  _validarEntradaTipo(valor, tipo) {
    switch (tipo) {
      case 'entero':
        return /^-?\d+$/.test(valor.trim());
      case 'real':
        return /^-?\d+(\.\d+)?$/.test(valor.trim());
      case 'caracter':
        return true;
      case 'logico': {
        const v = String(valor).trim().toLowerCase();
        return v === 'verdadero' || v === 'falso' || v === 'true' || v === 'false';
      }
      default:
        return true;
    }
  }

  _convertirTipo(valor, tipo) {
    switch (tipo) {
      case 'entero': {
        const n = parseInt(valor, 10);
        if (isNaN(n)) throw new Error(`No se puede convertir "${valor}" a Entero.`);
        return n;
      }
      case 'real': {
        const n = parseFloat(valor);
        if (isNaN(n)) throw new Error(`No se puede convertir "${valor}" a Real.`);
        return n;
      }
      case 'caracter':
        return String(valor);
      case 'logico': {
        if (typeof valor === 'boolean') return valor;
        const v = String(valor).trim().toLowerCase();
        if (v === 'verdadero' || v === 'true')  return true;
        if (v === 'falso'     || v === 'false') return false;
        throw new Error(`No se puede convertir "${valor}" a Logico.`);
      }
      default:
        return valor;
    }
  }

  _valorDefault(tipo) {
    switch (tipo) {
      case 'entero':   return 0;
      case 'real':     return 0.0;
      case 'caracter': return '';
      case 'logico':   return false;
      default:         return null;
    }
  }

  // Formatea el valor para Escribir. Los booleanos se muestran como
  // "Verdadero" / "Falso" (forma oficial del lenguaje), no "true"/"false".
  _formatearSalida(v) {
    if (v === true)  return 'Verdadero';
    if (v === false) return 'Falso';
    return String(v);
  }

  _separarPorComas(texto) {
    const partes = [];
    let actual = '';
    let dentroComillas = false;
    let nivelParen = 0;
    let nivelBracket = 0;

    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (c === '"') {
        dentroComillas = !dentroComillas;
        actual += c;
      } else if (!dentroComillas && c === '(') {
        nivelParen++;
        actual += c;
      } else if (!dentroComillas && c === ')') {
        nivelParen--;
        actual += c;
      } else if (!dentroComillas && c === '[') {
        nivelBracket++;
        actual += c;
      } else if (!dentroComillas && c === ']') {
        nivelBracket--;
        actual += c;
      } else if (c === ',' && !dentroComillas && nivelParen === 0 && nivelBracket === 0) {
        partes.push(actual);
        actual = '';
      } else {
        actual += c;
      }
    }
    if (actual.trim() !== '') partes.push(actual);
    return partes;
  }

  _pausa(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


  static PALABRAS_RESERVADAS = [
    { texto: 'SubProceso',    tipo: 'estructura' },
    { texto: 'FinSubProceso', tipo: 'estructura' },
    { texto: 'Funcion',       tipo: 'estructura' },
    { texto: 'FinFuncion',    tipo: 'estructura' },
    { texto: 'Llamar',        tipo: 'instrucción' },
    { texto: 'Proceso',     tipo: 'estructura' },
    { texto: 'FinProceso',  tipo: 'estructura' },
    { texto: 'Definir',     tipo: 'instrucción' },
    { texto: 'Dimension',   tipo: 'instrucción' },
    { texto: 'Escribir',    tipo: 'instrucción' },
    { texto: 'Leer',        tipo: 'instrucción' },
    { texto: 'Como',        tipo: 'palabra clave' },
    { texto: 'Entero',      tipo: 'tipo' },
    { texto: 'Real',        tipo: 'tipo' },
    { texto: 'Caracter',    tipo: 'tipo' },
    { texto: 'Logico',      tipo: 'tipo' },
    { texto: 'Verdadero',   tipo: 'literal' },
    { texto: 'Falso',       tipo: 'literal' },
    { texto: 'Si',          tipo: 'estructura' },
    { texto: 'Entonces',    tipo: 'palabra clave' },
    { texto: 'Sino',        tipo: 'estructura' },
    { texto: 'FinSi',       tipo: 'estructura' },
    { texto: 'Mientras',    tipo: 'estructura' },
    { texto: 'Hacer',       tipo: 'palabra clave' },
    { texto: 'FinMientras', tipo: 'estructura' },
    { texto: 'Repetir',     tipo: 'estructura' },
    { texto: 'HastaQue',    tipo: 'estructura' },
    { texto: 'Para',        tipo: 'estructura' },
    { texto: 'Hasta',       tipo: 'palabra clave' },
    { texto: 'Con',         tipo: 'palabra clave' },
    { texto: 'Paso',        tipo: 'palabra clave' },
    { texto: 'FinPara',     tipo: 'estructura' },
    { texto: 'Segun',       tipo: 'estructura' },
    { texto: 'FinSegun',    tipo: 'estructura' },
    { texto: 'Y',           tipo: 'operador' },
    { texto: 'O',           tipo: 'operador' },
    { texto: 'No',          tipo: 'operador' },
    { texto: 'mod',         tipo: 'operador' },
    { texto: 'Abs',         tipo: 'función' },
    { texto: 'Redon',       tipo: 'función' },
    { texto: 'Trunc',       tipo: 'función' },
    { texto: 'Longitud',    tipo: 'función' },
    { texto: 'Mayusculas',  tipo: 'función' },
    { texto: 'Minusculas',  tipo: 'función' },
  ];

  static PALABRAS_RESERVADAS_SET = DocErrores.PALABRAS_RESERVADAS_SET;

  static stripComment(linea) {
    return DocErrores.stripComment(linea);
  }

  static extraerVariablesDelCodigo(codigo) {
    return DocErrores.extraerVariablesDelCodigo(codigo);
  }
}

// ============================================================
//  MIXIN: evaluador de expresiones y condiciones
//
//  Inyecta los métodos del pipeline aritmético + condicional
//  desde core/expression-evaluator.js. Debe correr DESPUÉS de
//  declarar la clase. Las metadatos _OPERADORES y
//  _FUNCIONES_NATIVAS se atan como estáticos para preservar
//  el contrato `LiteSeInt._OPERADORES[...]` que usan los
//  métodos por nombre.
// ============================================================
Object.assign(LiteSeInt.prototype, LiteSeIntExprEval.mixin);
LiteSeInt._OPERADORES = LiteSeIntExprEval.OPERADORES;
LiteSeInt._FUNCIONES_NATIVAS = LiteSeIntExprEval.FUNCIONES_NATIVAS;
