/**
 * Code4Code — js/editor/codemirror-python.js
 * ============================================
 * Controlador de CodeMirror 5 para el lenguaje Python.
 *
 * Inspirado en ejemplo_pyodide/assets/js/pyodide-runner.js, pero adaptado a
 * la arquitectura de Code4Code:
 *
 *   - CodeMirror solo se usa cuando el lenguaje activo es Python. Para
 *     LiteSeInt y PSeInt sigue el editor propio (textarea + capas).
 *   - La CONSOLA es la del proyecto: este módulo NO toca la ejecución. Solo
 *     reemplaza la SUPERFICIE de edición. El `#editor` (textarea) sigue siendo
 *     la fuente de verdad del código; CodeMirror lo mantiene sincronizado con
 *     `cm.save()` para que `ejecutar()`, `validar()`, importar/exportar y el
 *     resto de app.js sigan leyendo `$("#editor").val()` sin cambios.
 *   - El TEMA se mantiene: el tema `cm-s-c4c` (en css/styles.css) consume las
 *     mismas variables CSS (`--bg-editor`, `--syntax-*`, `--bracket-*`, …) que
 *     el editor propio, por lo que CodeMirror hereda la paleta ayu de Python y
 *     cualquiera de los 6 temas globales.
 *
 * Sincronización (sin bucles):
 *   - CM → textarea: en cada `change` llamamos `cm.save()`.
 *   - textarea → CM: `sincronizarDesdeTextarea()` (lo invoca app.js tras
 *     escrituras programáticas: plantillas, ejemplos, importar, reset). Solo
 *     actúa si el contenido difiere, evitando reentradas.
 *
 * Exporta `Code4CodeCM` como global de window.
 */
(function (raiz) {
  'use strict';

  var _cm = null;          // instancia de CodeMirror o null
  var _activo = false;     // ¿CodeMirror gobierna el editor ahora?
  var _syncing = false;    // guarda contra bucles de sincronización
  var _lineaActivaCM = -1; // índice 0-based de la línea activa en ejecución

  function _panel() {
    return document.querySelector('.editor-panel');
  }

  function _textarea() {
    return document.getElementById('editor');
  }

  /** ¿Está cargada la librería CodeMirror? */
  function disponible() {
    return typeof raiz.CodeMirror !== 'undefined';
  }

  /** ¿Está CodeMirror gobernando el editor en este momento? */
  function activo() {
    return _activo;
  }

  /** Devuelve la instancia (para diagnóstico/tests). */
  function instancia() {
    return _cm;
  }

  /**
   * Activa CodeMirror sobre el textarea #editor. Idempotente.
   * Devuelve true si CodeMirror quedó activo.
   */
  function activar() {
    if (_activo) return true;
    if (!disponible()) return false;

    var textarea = _textarea();
    var panel = _panel();
    if (!textarea) return false;

    _cm = raiz.CodeMirror.fromTextArea(textarea, {
      mode: 'python',
      theme: 'c4c',
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      lineWrapping: true,
      viewportMargin: Infinity,
      gutters: ['CodeMirror-linenumbers', 'cm-c4c-errors'],
      extraKeys: {
        'Ctrl-Enter': _ejecutarDesdeCM,
        'Cmd-Enter': _ejecutarDesdeCM,
      },
    });

    // CM → textarea en cada cambio: la fuente de verdad del código sigue
    // siendo el textarea, que lee el resto de app.js (ejecutar, validar…).
    _cm.on('change', function () {
      if (_syncing) return;
      _syncing = true;
      try { _cm.save(); } finally { _syncing = false; }
    });

    if (panel) panel.classList.add('cm-active');

    // CodeMirror mide su geometría al construirse: forzamos un refresco en el
    // siguiente frame por si el panel cambió de tamaño durante la activación.
    raiz.requestAnimationFrame(function () {
      if (_cm) _cm.refresh();
    });

    _activo = true;
    return true;
  }

  /**
   * Desactiva CodeMirror y restaura el textarea propio. Idempotente.
   * Tras llamar, app.js debe repintar sus capas (actualizarLineas, etc.).
   */
  function desactivar() {
    if (!_activo || !_cm) {
      _activo = false;
      return;
    }
    var panel = _panel();
    // toTextArea() vuelca el contenido de CM al textarea y elimina su DOM.
    _syncing = true;
    try { _cm.toTextArea(); } finally { _syncing = false; }
    _cm = null;
    _activo = false;
    _lineaActivaCM = -1;
    if (panel) panel.classList.remove('cm-active');
  }

  /**
   * Empuja el contenido del textarea a CodeMirror si difieren. Lo llama app.js
   * tras escribir `editor.value` de forma programática (plantillas, ejemplos,
   * importar, reset). Conserva el cursor al final para imitar una carga nueva.
   */
  function sincronizarDesdeTextarea() {
    if (!_activo || !_cm || _syncing) return;
    var textarea = _textarea();
    if (!textarea) return;
    if (_cm.getValue() === textarea.value) return;
    _syncing = true;
    try {
      _cm.setValue(textarea.value);
    } finally {
      _syncing = false;
    }
  }

  /** Refresca la geometría de CM (tras cambio de tema, resize o mostrar panel). */
  function refrescar() {
    if (_activo && _cm) _cm.refresh();
  }

  /** Devuelve el foco al editor de código activo. */
  function enfocar() {
    if (_activo && _cm) _cm.focus();
  }

  /**
   * Inserta texto en la posición del cursor (lo usa la barra de símbolos
   * táctiles cuando CM está activo). Soporta envolver la selección.
   * @param {string} apertura  texto antes de la selección
   * @param {string} [cierre]  texto después (para pares)
   */
  function insertarTexto(apertura, cierre) {
    if (!_activo || !_cm) return false;
    cierre = cierre || '';
    var sel = _cm.getSelection();
    if (cierre && sel) {
      _cm.replaceSelection(apertura + sel + cierre);
    } else if (cierre) {
      var cur = _cm.getCursor();
      _cm.replaceSelection(apertura + cierre);
      _cm.setCursor(cur); // cursor entre el par
    } else {
      _cm.replaceSelection(apertura);
    }
    _cm.focus();
    return true;
  }

  // ── Gutter de errores ─────────────────────────────────────────────────────

  /** Limpia todos los marcadores de error del gutter de CM. Idempotente. */
  function limpiarErrores() {
    if (!_activo || !_cm) return;
    _cm.clearGutter('cm-c4c-errors');
  }

  /**
   * Muestra errores en el gutter de CM.
   * @param {Array<{linea: number, mensaje: string}>} errores  Numeración 1-based.
   */
  function mostrarErrores(errores) {
    if (!_activo || !_cm) return;
    _cm.clearGutter('cm-c4c-errors');
    if (!errores || errores.length === 0) return;
    for (var i = 0; i < errores.length; i++) {
      var err = errores[i];
      if (!err || typeof err.linea !== 'number') continue;
      var lineaIdx = err.linea - 1;
      if (lineaIdx < 0) continue;
      var badge = document.createElement('span');
      badge.className = 'cm-c4c-error-badge';
      badge.textContent = '!';
      badge.title = err.mensaje || '';
      _cm.setGutterMarker(lineaIdx, 'cm-c4c-errors', badge);
    }
  }

  // ── Resaltado de línea activa durante ejecución ───────────────────────────

  /**
   * Resalta la línea activa (1-based) en CM. 0 o negativo = solo quitar.
   * @param {number} linea
   */
  function marcarLineaActiva(linea) {
    if (!_activo || !_cm) return;
    if (_lineaActivaCM >= 0) {
      _cm.removeLineClass(_lineaActivaCM, 'background', 'cm-c4c-linea-activa');
    }
    _lineaActivaCM = (linea > 0) ? linea - 1 : -1;
    if (_lineaActivaCM >= 0) {
      _cm.addLineClass(_lineaActivaCM, 'background', 'cm-c4c-linea-activa');
    }
  }

  /** Elimina el resaltado de línea activa en CM. */
  function limpiarLineaActiva() {
    marcarLineaActiva(0);
  }

  function _ejecutarDesdeCM() {
    var btn = document.getElementById('btnEjecutar');
    if (btn && !btn.disabled) btn.click();
  }

  var Code4CodeCM = {
    disponible: disponible,
    activo: activo,
    instancia: instancia,
    activar: activar,
    desactivar: desactivar,
    sincronizarDesdeTextarea: sincronizarDesdeTextarea,
    refrescar: refrescar,
    enfocar: enfocar,
    insertarTexto: insertarTexto,
    limpiarErrores: limpiarErrores,
    mostrarErrores: mostrarErrores,
    marcarLineaActiva: marcarLineaActiva,
    limpiarLineaActiva: limpiarLineaActiva,
  };

  raiz.Code4CodeCM = Code4CodeCM;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code4CodeCM;
  }
})(typeof window !== 'undefined' ? window : globalThis);
