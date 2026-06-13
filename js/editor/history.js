/**
 * Code4Code — js/editor/history.js
 * ================================
 * Historial undo/redo con agrupación de ediciones del editor propio
 * (Fase 2). Módulo puro, sin DOM: opera sobre un objeto `historial`
 * (pilas de estados) y sobre "snapshots" planos que el editor captura del
 * textarea ({ value, selectionStart, selectionEnd, scrollTop, scrollLeft }).
 *
 * Mejora respecto del undo simple 1.x: los tecleos y borrados contiguos se
 * agrupan en un solo paso de deshacer (escribir una palabra = un Ctrl+Z),
 * rompiendo el grupo al cambiar de tipo de edición, al saltar el caret, al
 * cruzar el límite palabra/espacio o tras una pausa de tecleo.
 *
 * El cableado con el textarea (#editor) y los atajos (Ctrl+Z, Ctrl+Y,
 * Ctrl+Shift+Z) viven en js/app.js: ahí se capturan los snapshots, se
 * construye el contexto de cada edición y se restaura la vista.
 */
(function (raiz) {
  'use strict';

  // Pausa (ms) entre ediciones que rompe la agrupación de tecleo: pasado
  // este intervalo, la siguiente pulsación inicia un nuevo paso de deshacer.
  var PAUSA_MS = 600;

  // Límite por defecto de estados guardados en la pila de deshacer.
  var LIMITE = 100;

  // Tipos de edición que pueden agruparse entre sí (tecleo y borrado
  // contiguos). El resto (saltos de línea, pegado, ediciones estructurales)
  // forman siempre un paso discreto.
  var AGRUPABLES = { insertar: true, 'borrar-atras': true, 'borrar-adelante': true };

  /** Clasifica un inputType del evento beforeinput en una categoría propia. */
  function clasificar(inputType) {
    switch (inputType) {
      case 'insertText':
      case 'insertCompositionText':
        return 'insertar';
      case 'insertLineBreak':
      case 'insertParagraph':
        return 'salto';
      case 'insertFromPaste':
      case 'insertFromDrop':
        return 'pegar';
      case 'deleteContentBackward':
      case 'deleteWordBackward':
      case 'deleteSoftLineBackward':
      case 'deleteHardLineBackward':
        return 'borrar-atras';
      case 'deleteContentForward':
      case 'deleteWordForward':
      case 'deleteSoftLineForward':
      case 'deleteHardLineForward':
        return 'borrar-adelante';
      default:
        return 'otro';
    }
  }

  /** ¿El texto es íntegramente espacios en blanco (no vacío)? */
  function esEspacio(texto) {
    return !!texto && /^\s+$/.test(texto);
  }

  /**
   * Construye el contexto de una edición a partir del evento beforeinput.
   * `selStart`/`selEnd` son la selección ANTES de aplicar la edición.
   * `tiempo` es inyectable para pruebas deterministas (por defecto, ahora).
   */
  function contexto(inputType, selStart, selEnd, data, tiempo) {
    return {
      tipo: clasificar(inputType),
      selStart: selStart,
      selEnd: selEnd,
      data: data == null ? null : String(data),
      tiempo: typeof tiempo === 'number' ? tiempo : Date.now()
    };
  }

  /**
   * ¿La nueva edición `actual` continúa el mismo paso de deshacer que la
   * anterior `previa`? Solo se agrupan tecleos/borrados contiguos del mismo
   * tipo, sin selección, dentro de la ventana de tiempo y sin cruzar el
   * límite palabra/espacio (para que deshacer respete las palabras).
   */
  function debeAgrupar(previa, actual, pausaMs) {
    if (!previa || !actual) return false;
    if (actual.selStart !== actual.selEnd) return false;   // reemplazo de selección: discreto
    if (!AGRUPABLES[actual.tipo]) return false;
    if (previa.tipo !== actual.tipo) return false;
    if (typeof pausaMs !== 'number') pausaMs = PAUSA_MS;
    if (actual.tiempo - previa.tiempo > pausaMs) return false;

    if (actual.tipo === 'insertar') {
      var avance = previa.data ? previa.data.length : 1;
      if (actual.selStart !== previa.selStart + avance) return false;
      // Romper el grupo al cambiar de clase de carácter (palabra ↔ espacio).
      if (esEspacio(previa.data) !== esEspacio(actual.data)) return false;
      return true;
    }
    if (actual.tipo === 'borrar-atras') {
      return actual.selStart === previa.selStart - 1;
    }
    // borrar-adelante: el caret no se mueve entre borrados contiguos.
    return actual.selStart === previa.selStart;
  }

  /** Igualdad de snapshots por contenido y selección (ignora el scroll). */
  function sonIguales(a, b) {
    return !!a && !!b && a.value === b.value &&
      a.selectionStart === b.selectionStart &&
      a.selectionEnd === b.selectionEnd;
  }

  /** Crea un historial vacío. */
  function crear(limite, pausaMs) {
    return {
      undo: [],
      redo: [],
      limite: typeof limite === 'number' ? limite : LIMITE,
      pausaMs: typeof pausaMs === 'number' ? pausaMs : PAUSA_MS,
      ultima: null
    };
  }

  /**
   * Registra el estado `snapshot` (capturado ANTES de la edición) en el
   * historial. Si la edición agrupa con la anterior, no apila un nuevo paso
   * (conserva el ancla del grupo); si no, apila un límite nuevo. Un `ctx`
   * ausente (ediciones estructurales) fuerza siempre un paso discreto.
   * Cualquier edición efectiva invalida la pila de rehacer.
   * @returns {object} el mismo historial, mutado.
   */
  function registrar(hist, snapshot, ctx) {
    if (!ctx) {
      ctx = {
        tipo: 'otro',
        selStart: snapshot.selectionStart,
        selEnd: snapshot.selectionEnd,
        data: null,
        tiempo: Date.now()
      };
    }
    if (debeAgrupar(hist.ultima, ctx, hist.pausaMs)) {
      hist.ultima = ctx;
      hist.redo = [];
      return hist;
    }
    var top = hist.undo[hist.undo.length - 1];
    if (sonIguales(top, snapshot)) {
      hist.ultima = ctx;
      return hist;               // estado idéntico: no duplicar (rehacer intacto)
    }
    hist.undo.push(snapshot);
    if (hist.undo.length > hist.limite) hist.undo.shift();
    hist.redo = [];
    hist.ultima = ctx;
    return hist;
  }

  /**
   * Deshace: devuelve { snapshot } con el estado previo a restaurar (o
   * snapshot null si no hay). `actual` (estado vigente) pasa a rehacer.
   * Rompe la agrupación en curso.
   */
  function deshacer(hist, actual) {
    if (hist.undo.length === 0) return { snapshot: null };
    var previo = hist.undo.pop();
    hist.redo.push(actual);
    hist.ultima = null;
    return { snapshot: previo };
  }

  /** Rehace: devuelve { snapshot } con el siguiente estado (o null). */
  function rehacer(hist, actual) {
    if (hist.redo.length === 0) return { snapshot: null };
    var siguiente = hist.redo.pop();
    hist.undo.push(actual);
    hist.ultima = null;
    return { snapshot: siguiente };
  }

  /** Rompe la agrupación: la próxima edición iniciará un paso nuevo. */
  function reiniciarGrupo(hist) {
    hist.ultima = null;
  }

  var Code4CodeHistory = {
    PAUSA_MS: PAUSA_MS,
    LIMITE: LIMITE,
    clasificar: clasificar,
    contexto: contexto,
    debeAgrupar: debeAgrupar,
    sonIguales: sonIguales,
    crear: crear,
    registrar: registrar,
    deshacer: deshacer,
    rehacer: rehacer,
    reiniciarGrupo: reiniciarGrupo
  };

  raiz.Code4CodeHistory = Code4CodeHistory;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code4CodeHistory;
  }
})(typeof window !== 'undefined' ? window : globalThis);
