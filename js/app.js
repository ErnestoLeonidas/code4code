/* ==============================================
   app.js — UI Controller
   Conecta la capa multi-lenguaje Code4Code con la interfaz de usuario.
   Depende de: Bootstrap, jQuery y la capa Code4Code
   (core/language-provider.js, core/language-registry.js,
   core/runtime-host.js) con al menos un lenguaje registrado.
   ============================================== */

// =========================================
// 0. ALMACENAMIENTO LOCAL (claves code4code:* con lectura retro-compatible)
// =========================================

// Mapa clave nueva → clave v1.x. Mismo origen en GitHub Pages, así que el
// progreso guardado por LiteSeInt 1.x se migra en la primera lectura.
const CLAVES_LEGADO = {
  'code4code:theme': 'liteseint_theme',
  'code4code:panelOrder': 'liteseint_panel_order',
  'code4code:learningPanelWidth': 'liteseint_learning_panel_width',
  'code4code:consoleEcho': 'liteseint_console_echo',
  'code4code:ejLista': 'liteseint_ej_lista',
  'code4code:exerciseProgress': 'liteseint:exerciseProgress',
  'code4code:consoleHeight': 'liteseint:consoleHeight',
};

function lsGet(clave) {
  try {
    let valor = localStorage.getItem(clave);
    if (valor === null && CLAVES_LEGADO[clave]) {
      valor = localStorage.getItem(CLAVES_LEGADO[clave]);
      // Migra una sola vez; la clave v1.x se conserva por si el estudiante
      // vuelve a abrir la app LiteSeInt archivada.
      if (valor !== null) localStorage.setItem(clave, valor);
    }
    return valor;
  } catch (e) {
    return null;
  }
}

function lsSet(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch (e) { /* sin persistencia */ }
}

// =========================================
// 1. STATE MANAGEMENT
// =========================================

let inputResolver = null;
const mobileConsoleQuery = window.matchMedia("(max-width: 768px)");
const EDITOR_HISTORY_LIMIT = 100;

const editorHistory = {
  undo: [],
  redo: [],
  applying: false,
};

let errorVisualState = {
  activo: false,
  erroresPorLinea: null,
  erroresMapa: {},
};

function resetErrorVisualState() {
  errorVisualState.activo = false;
  errorVisualState.erroresPorLinea = null;
  errorVisualState.erroresMapa = {};
}

// =========================================
// THEME SYSTEM
// =========================================

const THEME_KEY = 'code4code:theme';
const THEMES = [
  { id: 'hacker', label: 'Hacker' },
  { id: 'ocean',  label: 'Ocean'  },
  { id: 'sunset', label: 'Sunset' },
  { id: 'papel',  label: 'Papel'  },
];

function initTheme() {
  const saved = lsGet(THEME_KEY);
  const theme = THEMES.find(t => t.id === saved) || THEMES[0];
  applyTheme(theme);
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme.id);
  const nameEl = document.getElementById('themeName');
  if (nameEl) nameEl.textContent = theme.label;
  lsSet(THEME_KEY, theme.id);
}

function cycleTheme() {
  const current = document.body.getAttribute('data-theme') || 'hacker';
  const idx = THEMES.findIndex(t => t.id === current);
  const next = THEMES[(idx + 1) % THEMES.length];
  applyTheme(next);
}

// =========================================
// PANEL DRAG-TO-SWAP
// =========================================

const PANEL_ORDER_KEY = 'code4code:panelOrder';
const LEARNING_PANEL_WIDTH_KEY = 'code4code:learningPanelWidth';
const LEARNING_PANEL_MIN_PX = 320;
const LEARNING_PANEL_MAX_RATIO = 0.72;
const LEARNING_PANEL_AUTO_COLLAPSE_PX = 560;
const CONSOLE_ECHO_KEY = 'code4code:consoleEcho';

function initPanelDrag() {
  const container = document.querySelector('.main-container');
  if (!container) return;
  let dragging = null;

  container.querySelectorAll('[data-draggable]').forEach(panel => {
    const handle = panel.querySelector('.panel-drag-handle');
    if (!handle) return;

    handle.addEventListener('mousedown', () => {
      panel.setAttribute('draggable', 'true');
      const cleanup = () => {
        if (!dragging) panel.removeAttribute('draggable');
        document.removeEventListener('mouseup', cleanup);
      };
      document.addEventListener('mouseup', cleanup);
    });

    panel.addEventListener('dragstart', e => {
      dragging = panel;
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => panel.classList.add('panel-dragging'));
    });

    panel.addEventListener('dragend', () => {
      panel.removeAttribute('draggable');
      panel.classList.remove('panel-dragging');
      container.querySelectorAll('[data-draggable]').forEach(p => p.classList.remove('panel-drag-over'));
      dragging = null;
    });

    panel.addEventListener('dragover', e => {
      if (!dragging || panel === dragging) return;
      e.preventDefault();
      panel.classList.add('panel-drag-over');
    });

    panel.addEventListener('dragleave', e => {
      if (!panel.contains(e.relatedTarget)) panel.classList.remove('panel-drag-over');
    });

    panel.addEventListener('drop', e => {
      e.preventDefault();
      panel.classList.remove('panel-drag-over');
      if (!dragging || dragging === panel) return;
      const siblings = [...container.querySelectorAll('[data-draggable]')];
      const srcIdx = siblings.indexOf(dragging);
      const tgtIdx = siblings.indexOf(panel);
      if (srcIdx < tgtIdx) container.insertBefore(dragging, panel.nextSibling);
      else container.insertBefore(dragging, panel);
      updateLearningPanelBorder();
      savePanelOrder();
    });
  });
}

function updateLearningPanelBorder() {
  const container = document.querySelector('.main-container');
  const lp = document.querySelector('.learning-panel');
  if (!container || !lp) return;
  const panels = [...container.querySelectorAll('[data-draggable]')];
  lp.classList.toggle('panel-on-right', panels[0] !== lp);
}

function savePanelOrder() {
  const container = document.querySelector('.main-container');
  const lp = document.querySelector('.learning-panel');
  if (!container || !lp) return;
  const isLeft = [...container.querySelectorAll('[data-draggable]')][0] === lp;
  lsSet(PANEL_ORDER_KEY, isLeft ? 'left' : 'right');
}

function restorePanelOrder() {
  const saved = lsGet(PANEL_ORDER_KEY);
  if (!saved) return;
  const container = document.querySelector('.main-container');
  const lp = document.querySelector('.learning-panel');
  const ws = document.querySelector('.workspace-column');
  if (!container || !lp || !ws) return;
  const panels = [...container.querySelectorAll('[data-draggable]')];
  const currentlyLeft = panels[0] === lp;
  if (saved === 'right' && currentlyLeft) {
    container.appendChild(lp);
    updateLearningPanelBorder();
  } else if (saved === 'left' && !currentlyLeft) {
    container.insertBefore(lp, ws);
    updateLearningPanelBorder();
  }
}

function clampLearningPanelWidth(px) {
  const container = document.querySelector('.main-container');
  if (!container) return px;
  const total = container.getBoundingClientRect().width;
  const defaultWidth = total * 0.5;
  const min = Math.min(LEARNING_PANEL_MIN_PX, Math.max(220, total * 0.35));
  const menuMax = medirAnchoMenuLearningPanel();
  const ratioMax = total * LEARNING_PANEL_MAX_RATIO;
  const max = Math.max(defaultWidth, min, Math.min(ratioMax, menuMax));
  return Math.min(Math.max(px, min), max);
}

function medirAnchoMenuLearningPanel() {
  const header = document.querySelector('.learning-panel-header');
  if (!header) return Number.POSITIVE_INFINITY;

  const clone = header.cloneNode(true);
  clone.removeAttribute('id');
  clone.style.position = 'fixed';
  clone.style.left = '-10000px';
  clone.style.top = '-10000px';
  clone.style.width = 'max-content';
  clone.style.maxWidth = 'none';
  clone.style.visibility = 'hidden';
  clone.style.pointerEvents = 'none';

  const tabs = clone.querySelector('.learning-tabs');
  if (tabs) {
    tabs.style.overflow = 'visible';
    tabs.style.width = 'max-content';
    tabs.style.maxWidth = 'none';
  }

  document.body.appendChild(clone);
  const width = clone.getBoundingClientRect().width;
  clone.remove();

  return Math.ceil(width + 8);
}

function aplicarAnchoLearningPanel(px, opciones = {}) {
  const panel = document.querySelector('.learning-panel');
  if (!panel) return;
  const width = clampLearningPanelWidth(px);
  document.documentElement.style.setProperty('--learning-panel-w', `${width}px`);
  if (opciones.autoColapsar) {
    setEjListaVisible(width > LEARNING_PANEL_AUTO_COLLAPSE_PX);
  }
  scheduleIndentGuideRender({ remeasure: true });
}

function guardarAnchoLearningPanel(px) {
  lsSet(LEARNING_PANEL_WIDTH_KEY, String(Math.round(px)));
}

function cargarAnchoLearningPanelPersistido() {
  const v = lsGet(LEARNING_PANEL_WIDTH_KEY);
  if (!v) return;
  const px = parseInt(v, 10);
  if (Number.isFinite(px) && px > 0) aplicarAnchoLearningPanel(px);
}

function inicializarResizeLearningPanel() {
  const handle = document.getElementById('learningWidthResizeHandle');
  const panel = document.querySelector('.learning-panel');
  const container = document.querySelector('.main-container');
  if (!handle || !panel || !container) return;

  let dragging = false;

  const widthFromPointer = (clientX) => {
    const rect = container.getBoundingClientRect();
    const panelOnRight = panel.classList.contains('panel-on-right');
    return panelOnRight ? rect.right - clientX : clientX - rect.left;
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    aplicarAnchoLearningPanel(widthFromPointer(e.clientX), { autoColapsar: true });
  };

  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    guardarAnchoLearningPanel(widthFromPointer(e.clientX));
  };

  handle.addEventListener('pointerdown', (e) => {
    if (mobileConsoleQuery.matches) return;
    e.preventDefault();
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });

  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 48 : 16;
    const current = panel.getBoundingClientRect().width;
    const panelOnRight = panel.classList.contains('panel-on-right');
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      aplicarAnchoLearningPanel(current + (panelOnRight ? step : -step), { autoColapsar: true });
      guardarAnchoLearningPanel(panel.getBoundingClientRect().width);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      aplicarAnchoLearningPanel(current + (panelOnRight ? -step : step), { autoColapsar: true });
      guardarAnchoLearningPanel(panel.getBoundingClientRect().width);
    }
  });
}

// =========================================
// EXERCISE LIST TOGGLE
// =========================================

const EJ_LISTA_KEY = 'code4code:ejLista';

function initEjListaToggle() {
  setEjListaVisible(true);
  $(document).on('click', '.btn-toggle-ej-lista', () => {
    const collapsed = document.querySelector('.ej-workspace')?.classList.contains('ej-lista-colapsada');
    setEjListaVisible(collapsed);
  });
}

function setEjListaVisible(visible) {
  const workspace = document.querySelector('.ej-workspace');
  if (!workspace) return;
  workspace.classList.toggle('ej-lista-colapsada', !visible);
  document.querySelectorAll('.btn-toggle-ej-lista').forEach((btn) => {
    btn.textContent = visible ? '◀' : '▶';
    btn.title = visible ? 'Ocultar lista de ejercicios' : 'Mostrar lista de ejercicios';
    btn.setAttribute('aria-label', btn.title);
  });
  lsSet(EJ_LISTA_KEY, visible ? 'visible' : 'hidden');
}

// =========================================
// 2. EJECUCIÓN (provider activo + RuntimeHost)
// =========================================

function providerActivo() {
  return Code4Code.registro.activo();
}

// Control devuelto por provider.ejecutar(); null cuando no hay ejecución.
let controlEjecucion = null;

function crearHostDeEjecucion() {
  return Code4Code.crearRuntimeHost({
    escribir(texto, meta) {
      const tipo = meta && meta.tipo;
      if (tipo === "error") {
        const lineaIdx = meta && typeof meta.linea === "number" ? meta.linea : null;
        if (lineaIdx !== null) {
          if (!errorVisualState.erroresMapa[lineaIdx]) {
            errorVisualState.erroresMapa[lineaIdx] = texto;
          } else {
            errorVisualState.erroresMapa[lineaIdx] += "\n" + texto;
          }
          consolaImprimir(`Error en línea ${lineaIdx + 1}: ${texto}`, "error");
          marcarErrorLinea(lineaIdx, errorVisualState.erroresMapa[lineaIdx]);
          errorVisualState.activo = true;
        } else {
          consolaImprimir(texto, "error");
        }
      } else if (tipo === "sistema") {
        consolaImprimir(texto, "input-echo");
      } else {
        consolaImprimir(texto, "output");
      }
    },

    leer(nombreVar) {
      return new Promise((resolve) => {
        inputResolver = resolve;
        mostrarInputConsola(nombreVar);
      });
    },

    lineaActiva(lineaIdx) {
      resaltarLineaEjecutando(lineaIdx);
    },

    variables(evento) {
      if (!evento) return;
      if (evento.evento === "reiniciar") {
        limpiarInspector();
      } else if (evento.evento === "cambio" && evento.variable) {
        actualizarInspector(evento.variable);
      }
    },

    alCambiarEstado(estado) {
      switch (estado) {
        case "ejecutando":
          setEstado("running", "Ejecutando...");
          break;
        case "esperando-entrada":
          // La consola ya muestra la fila de entrada inline.
          break;
        case "finalizado":
          consolaImprimir("Fin de ejecución", "system");
          setEstado("", "Listo");
          finalizarEjecucionUI();
          break;
        case "detenido":
          setEstado("", "Detenido");
          finalizarEjecucionUI();
          break;
        case "error":
          setEstado("error", "Error");
          finalizarEjecucionUI();
          break;
      }
    },
  });
}

function finalizarEjecucionUI() {
  controlEjecucion = null;
  limpiarEjecucionHighlight();
  $("#btnEjecutar").prop("disabled", false);
  $("#btnDetener").hide();
}

// =========================================
// 2b. SELECTOR DE LENGUAJE
// =========================================

function initLanguageSelect() {
  const $select = $("#languageSelect");
  if (!$select.length) return;
  const registro = Code4Code.registro;

  $select.empty();
  for (const provider of registro.lista()) {
    $select.append($("<option>").val(provider.id).text(provider.nombre));
  }
  $select.val(registro.activo().id);
  $select.prop("disabled", false);

  $select.on("change", function () {
    registro.activar(this.value);
  });

  registro.onCambio((provider) => {
    $select.val(provider.id);
    $("#inputImportarPsc").attr("accept", `${provider.extension},text/plain`);
    // Fase 1: con un solo lenguaje registrado no hay más que refrescar.
    // Al sumar lenguajes (Fase 3+) aquí se recargan plantilla, ejemplos,
    // resaltado y banco de ejercicios del provider activo.
  });

  $("#inputImportarPsc").attr("accept", `${registro.activo().extension},text/plain`);
}

// =========================================
// 3. INSPECTOR DE VARIABLES (v1.7.0)
// =========================================

let _inspectorVars = {};
let _inspectorOrder = [];

function limpiarInspector() {
  _inspectorVars = {};
  _inspectorOrder = [];
  renderizarInspector(null);
}

function actualizarInspector(info) {
  const nombre = info.nombre;
  if (!Object.prototype.hasOwnProperty.call(_inspectorVars, nombre)) {
    _inspectorOrder.push(nombre);
  }
  _inspectorVars[nombre] = info;
  renderizarInspector(nombre);
}

function formatearValorInspector(valor, tipo) {
  if (tipo === 'logico') return valor === true ? 'Verdadero' : 'Falso';
  if (tipo === 'caracter') return `"${valor}"`;
  if (valor === null || valor === undefined) return '—';
  return String(valor);
}

function renderizarFilaArreglo(nombre, info, highlight) {
  const dim = info.dimensiones ? `[${info.dimensiones.join(' × ')}]` : '';
  const tipoLabel = info.tipo || '?';

  const $det = $('<details>').addClass('inspector-array');
  if (highlight) {
    $det.addClass('var-changed');
    setTimeout(() => $det.removeClass('var-changed'), 800);
  }

  const $sum = $('<summary>').addClass('inspector-array-summary');
  $sum.append($('<span>').addClass('inspector-array-chevron').text('▶'));
  $sum.append($('<span>').addClass('inspector-var-name').text(nombre));
  $sum.append($('<span>').addClass('inspector-var-type').text(tipoLabel));
  $sum.append($('<span>').addClass('inspector-var-value').text(dim));
  $det.append($sum);

  if (info.datos && info.tipo !== null) {
    const $items = $('<div>').addClass('inspector-array-items');
    if (info.dimensiones.length === 1) {
      for (let i = 1; i <= info.dimensiones[0]; i++) {
        const $item = $('<div>').addClass('inspector-array-item');
        $item.append($('<span>').addClass('inspector-array-idx').text(`[${i}]`));
        $item.append($('<span>').addClass('inspector-array-val').text(
          formatearValorInspector(info.datos[i], info.tipo)
        ));
        $items.append($item);
      }
    } else if (info.dimensiones.length === 2) {
      for (let i = 1; i <= info.dimensiones[0]; i++) {
        for (let j = 1; j <= info.dimensiones[1]; j++) {
          const $item = $('<div>').addClass('inspector-array-item');
          $item.append($('<span>').addClass('inspector-array-idx').text(`[${i},${j}]`));
          $item.append($('<span>').addClass('inspector-array-val').text(
            formatearValorInspector(info.datos[i][j], info.tipo)
          ));
          $items.append($item);
        }
      }
    }
    $det.append($items);
  }
  return $det;
}

function renderizarFilaVariable(nombre, info, highlight) {
  if (info.dimensiones) {
    return renderizarFilaArreglo(nombre, info, highlight);
  }

  const $row = $('<div>').addClass('inspector-var');
  if (highlight) {
    $row.addClass('var-changed');
    setTimeout(() => $row.removeClass('var-changed'), 800);
  }
  $row.append($('<span>').addClass('inspector-var-name').text(nombre));
  $row.append($('<span>').addClass('inspector-var-type').text(info.tipo || ''));
  const $val = $('<span>').addClass('inspector-var-value');
  if (!info.inicializada || info.tipo === null) {
    $val.addClass('inspector-var-uninit').text('sin inicializar');
  } else {
    $val.text(formatearValorInspector(info.valor, info.tipo));
  }
  $row.append($val);
  return $row;
}

function renderizarInspector(nombreCambiado) {
  const $cont = $('#inspectorVariables');
  if (!$cont.length) return;
  $cont.empty();

  if (_inspectorOrder.length === 0) {
    $cont.append(
      $('<p>').addClass('inspector-empty').text('Sin variables — ejecuta el programa para ver su estado.')
    );
    return;
  }

  for (const nombre of _inspectorOrder) {
    const info = _inspectorVars[nombre];
    $cont.append(renderizarFilaVariable(nombre, info, nombre === nombreCambiado));
  }
}

// =========================================
// TABS DE CONSOLA (v1.7.0)
// =========================================

function switchConsoleView(view) {
  $('.console-tab').removeClass('active');
  $(`.console-tab[data-console-view="${view}"]`).addClass('active');
  $('.console-view').removeClass('active');
  $(`#${view}View`).addClass('active');
  const onConsola = view === 'consola';
  $('#consolaTabActions').toggle(onConsola);
  if (view === 'diagrama' && typeof LiteSeIntDiagramaUI !== 'undefined') {
    LiteSeIntDiagramaUI.refrescarDiagrama($('#editor').val());
  }
}

function initConsoleTabs() {
  $(document).on('click', '.console-tab', function() {
    switchConsoleView(this.dataset.consoleView);
  });
}

function consolaImprimir(texto, tipo = "output") {
  $("#consola").append($("<div>").addClass(`console-line ${tipo}`).text(texto));
  scrollConsola();
}

function scrollConsola() {
  const el = document.getElementById("consola");
  el.scrollTop = el.scrollHeight;
}

function setConsoleEchoVisible(visible) {
  const consola = document.getElementById("consola");
  const btn = document.getElementById("btnToggleConsoleEcho");
  if (!consola) return;
  consola.classList.toggle("hide-input-echo", !visible);
  if (btn) {
    btn.classList.toggle("btn-toggle-console-echo-hidden", !visible);
    btn.setAttribute("aria-label", visible ? "Ocultar trazas de consola" : "Mostrar trazas de consola");
    btn.title = visible ? "Ocultar trazas de consola" : "Mostrar trazas de consola";
    btn.setAttribute(
      "data-tooltip",
      visible
        ? "Ocultar trazas:\nOculta entradas y mensajes internos de ejecución"
        : "Mostrar trazas:\nMuestra entradas y mensajes internos de ejecución",
    );
  }
  lsSet(CONSOLE_ECHO_KEY, visible ? "visible" : "hidden");
}

function initConsoleEchoToggle() {
  const btn = document.getElementById("btnToggleConsoleEcho");
  const saved = lsGet(CONSOLE_ECHO_KEY);
  setConsoleEchoVisible(saved === "visible");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const hidden = document.getElementById("consola")?.classList.contains("hide-input-echo");
    setConsoleEchoVisible(Boolean(hidden));
  });
}

function setMobileConsoleCollapsed(collapsed) {
  const shell = document.querySelector(".app-shell");
  if (!shell) return;
  shell.classList.toggle(
    "mobile-console-collapsed",
    mobileConsoleQuery.matches && collapsed,
  );
}

function toggleMobileConsoleCollapsed() {
  const shell = document.querySelector(".app-shell");
  if (!shell || !mobileConsoleQuery.matches) return;
  shell.classList.toggle("mobile-console-collapsed");
}

const ESTRUCTURA_INICIAL = providerActivo().plantillaInicial();
const PROCESO_PREFIX_LEN = "Proceso ".length; // 8

function obtenerNombreProceso() {
  const primera = $("#editor").val().split("\n")[0];
  const m = primera.match(/^Proceso\s+(.+?)\s*$/i);
  return m ? m[1] : "nombre_proceso";
}

function limpiarConsola() {
  detener();
  $("#consola").empty();
  limpiarInspector();
  invalidarErroresVisuales();
}

function limpiarConsolaConfirmando() {
  if (typeof Swal !== "undefined") {
    return liteSwal({
      icon: "warning",
      title: "¿Borrar consola?",
      text: "Se limpiarán las salidas, errores y trazas visibles. Si hay una ejecución en curso, se detendrá.",
      showCancelButton: true,
      confirmButtonText: "Borrar consola",
      cancelButtonText: "Cancelar",
    }).then((res) => {
      if (res && res.isConfirmed) {
        limpiarConsola();
        return true;
      }
      return false;
    });
  }

  if (window.confirm("¿Borrar consola?\n\nSe limpiarán las salidas, errores y trazas visibles.")) {
    limpiarConsola();
    return Promise.resolve(true);
  }
  return Promise.resolve(false);
}

function limpiarTodo() {
  const nombre = obtenerNombreProceso();
  const estructura = `Proceso ${nombre}\n\n\n\n\n\n\n\n\nFinProceso`;
  reemplazarEditorConfirmando(
    estructura,
    "Se borrará el contenido del editor y quedará solo la estructura base del proceso.",
    true,
    {
      title: "¿Borrar editor?",
      confirmButtonText: "Borrar editor",
      afterReplace(editor) {
        const pos = estructura.indexOf("\n") + 1;
        editor.setSelectionRange(pos, pos);
      },
    },
  );
}

function getEditorHistorySnapshot(editor = document.getElementById("editor")) {
  if (!editor) return null;
  return {
    value: editor.value,
    selectionStart: editor.selectionStart,
    selectionEnd: editor.selectionEnd,
    scrollTop: editor.scrollTop,
    scrollLeft: editor.scrollLeft,
  };
}

function snapshotsIguales(a, b) {
  return (
    a &&
    b &&
    a.value === b.value &&
    a.selectionStart === b.selectionStart &&
    a.selectionEnd === b.selectionEnd
  );
}

function registrarHistorialEditor(editor = document.getElementById("editor")) {
  if (!editor || editorHistory.applying) return;
  const snapshot = getEditorHistorySnapshot(editor);
  const last = editorHistory.undo[editorHistory.undo.length - 1];
  if (snapshotsIguales(last, snapshot)) return;

  editorHistory.undo.push(snapshot);
  if (editorHistory.undo.length > EDITOR_HISTORY_LIMIT) {
    editorHistory.undo.shift();
  }
  editorHistory.redo = [];
}

function restaurarSnapshotEditor(snapshot) {
  const editor = document.getElementById("editor");
  if (!editor || !snapshot) return;

  editorHistory.applying = true;
  editor.value = snapshot.value;
  const maxPos = editor.value.length;
  editor.setSelectionRange(
    Math.min(snapshot.selectionStart, maxPos),
    Math.min(snapshot.selectionEnd, maxPos),
  );
  editor.scrollTop = snapshot.scrollTop;
  editor.scrollLeft = snapshot.scrollLeft;
  editorHistory.applying = false;

  ocultarAutocompletado();
  invalidarErroresVisuales();
  quitarResalteNombreInvalido();
  actualizarLineas();
  editor.focus();
}

function deshacerEditor() {
  const editor = document.getElementById("editor");
  if (!editor || editorHistory.undo.length === 0) return false;
  const actual = getEditorHistorySnapshot(editor);
  const previo = editorHistory.undo.pop();
  editorHistory.redo.push(actual);
  restaurarSnapshotEditor(previo);
  return true;
}

function rehacerEditor() {
  const editor = document.getElementById("editor");
  if (!editor || editorHistory.redo.length === 0) return false;
  const actual = getEditorHistorySnapshot(editor);
  const siguiente = editorHistory.redo.pop();
  editorHistory.undo.push(actual);
  restaurarSnapshotEditor(siguiente);
  return true;
}

function esAtajoDeshacer(e) {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
}

function esAtajoRehacer(e) {
  const mod = e.ctrlKey || e.metaKey;
  return mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"));
}

const NOMBRE_HIGHLIGHT_ID = "nombreProcesoHighlight";

function obtenerRangoNombreProceso() {
  const primera = $("#editor").val().split("\n")[0];
  const m = primera.match(/^(Proceso\s+)(\S.*?)(\s*)$/i);
  if (!m) return null;
  const colInicio = m[1].length;
  const colFin = colInicio + m[2].length;
  return { colInicio, colFin };
}

function posicionarResalteNombre(el) {
  const rango = obtenerRangoNombreProceso();
  const editor = document.getElementById("editor");
  if (!rango || !editor) {
    el.style.display = "none";
    return;
  }
  const metrics = getIndentGuideMetrics();
  const cw = metrics ? metrics.charWidth : 7.8;
  const lh = metrics ? metrics.lineHeight : 21.45;
  const pt = metrics ? metrics.paddingTop : 8;
  const pl = metrics ? metrics.paddingLeft : 16;

  const top = pt - editor.scrollTop;
  const left = pl + rango.colInicio * cw - editor.scrollLeft;
  const width = (rango.colFin - rango.colInicio) * cw;

  el.style.display = "block";
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
  el.style.width = `${width}px`;
  el.style.height = `${lh}px`;
}

function resaltarNombreInvalido() {
  const area = document.querySelector(".editor-code-area");
  if (!area) return;
  let el = document.getElementById(NOMBRE_HIGHLIGHT_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = NOMBRE_HIGHLIGHT_ID;
    el.className = "nombre-proceso-highlight";
    area.appendChild(el);
  }
  posicionarResalteNombre(el);
}

function quitarResalteNombreInvalido() {
  const el = document.getElementById(NOMBRE_HIGHLIGHT_ID);
  if (el) el.remove();
}

const LITE_SWAL_CUSTOM_CLASS = {
  popup: "liteseint-swal",
  icon: "liteseint-swal-icon",
  title: "liteseint-swal-title",
  htmlContainer: "liteseint-swal-text",
  actions: "liteseint-swal-actions",
  confirmButton: "liteseint-swal-confirm",
  cancelButton: "liteseint-swal-cancel",
};

function liteSwal(opciones) {
  return Swal.fire({
    background: "#161b22",
    color: "#e6edf3",
    buttonsStyling: false,
    customClass: LITE_SWAL_CUSTOM_CLASS,
    ...opciones,
  });
}

function editorTieneInstruccionesDescargables(contenido) {
  const lineas = String(contenido || "").split("\n");
  return lineas.some((linea) => {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("//")) return false;
    if (/^Proceso\s+\S+/i.test(limpia)) return false;
    if (/^FinProceso$/i.test(limpia)) return false;
    return true;
  });
}

function descargar() {
  const nombre = obtenerNombreProceso();
  const contenido = $("#editor").val();
  const extension = providerActivo().extension;
  if (!editorTieneInstruccionesDescargables(contenido)) {
    liteSwal({
      icon: "warning",
      title: "No hay código para descargar",
      text: `Escribe al menos una instrucción dentro del proceso antes de guardar el archivo ${extension}.`,
      confirmButtonText: "Entendido",
    });
    return;
  }

  if (nombre === "nombre_proceso") {
    resaltarNombreInvalido();
    liteSwal({
      icon: "warning",
      title: "No se puede descargar",
      text: `Cambia "nombre_proceso" por un nombre válido para guardar el archivo ${extension}.`,
      confirmButtonText: "Entendido",
    });
    return;
  }

  const blob = new Blob([contenido], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}${extension}`;
  a.click();
  URL.revokeObjectURL(url);
}

function mostrarAlertaImportacion(icon, title, text) {
  if (typeof Swal !== "undefined") {
    liteSwal({
      icon,
      title,
      text,
      confirmButtonText: "Entendido",
    });
  } else {
    window.alert(`${title}\n\n${text}`);
  }
}

function importarArchivoPsc(file) {
  if (!file) return;
  const extension = providerActivo().extension;
  const regexExtension = new RegExp(extension.replace(".", "\\.") + "$", "i");
  if (!regexExtension.test(file.name)) {
    mostrarAlertaImportacion(
      "warning",
      "Archivo no compatible",
      `Selecciona un archivo con extensión ${extension}.`,
    );
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const contenido = String(reader.result || "").replace(/^\uFEFF/, "");
    reemplazarEditorConfirmando(
      contenido,
      `Se reemplazará el contenido del editor por el archivo "${file.name}".`,
      true,
      {
        title: `¿Importar archivo ${extension}?`,
        confirmButtonText: "Importar archivo",
      },
    );
  };
  reader.onerror = () => {
    mostrarAlertaImportacion(
      "error",
      "No se pudo importar",
      `El archivo no se pudo leer. Intenta abrir otro ${extension}.`,
    );
  };
  reader.readAsText(file);
}

// =========================================
// 4. INPUT INLINE EN CONSOLA
// =========================================

function mostrarInputConsola(nombreVar) {
  const $row = $("<div>").addClass("console-input-row");
  $row.html(`
    <span class="prompt-symbol">?</span>
    <span class="var-label">${nombreVar}:</span>
    <input type="text" class="console-input-field" id="consolaInputField"
           placeholder="Escribe un valor..." autocomplete="off" />
    <button class="console-input-send" id="consolaInputBtn">↵</button>
  `);

  $("#consola").append($row);
  scrollConsola();
  setTimeout(() => $("#consolaInputField").focus(), 50);

  $row.find("#consolaInputField").on("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmarInputConsola($row);
    }
  });
  $row.find("#consolaInputBtn").on("click", () => confirmarInputConsola($row));
}

function confirmarInputConsola($row) {
  const valor = $row.find("#consolaInputField").val();
  $row.replaceWith(
    $("<div>")
      .addClass("console-line input-echo")
      .text(`  ↳ entrada: ${valor}`),
  );
  if (inputResolver) {
    const resolver = inputResolver;
    inputResolver = null;
    resolver(valor);
  }
}

// =========================================
// 5. ERROR VISUAL SYSTEM
// =========================================

function invalidarErroresVisuales() {
  resetErrorVisualState();
  $(".line-num-row").removeClass("has-error");
  $(".line-overlay").removeClass("has-error");
  setMirrorLayerHTML("errorDecoLayer", "");
}

function limpiarEjecucionHighlight() {
  $(".line-num-row.executing").removeClass("executing");
  $(".line-overlay.executing").removeClass("executing");
}

function aplicarErroresVisuales(erroresPorLinea) {
  invalidarErroresVisuales();
  errorVisualState.activo = true;
  errorVisualState.erroresPorLinea = erroresPorLinea;

  for (const [lineaIdx, erroresLinea] of erroresPorLinea) {
    const mensajes = erroresLinea.map((e) => e.mensaje).join("\n");
    errorVisualState.erroresMapa[lineaIdx] = mensajes;
    marcarErrorLinea(lineaIdx, mensajes);
  }

  renderizarSubrayados();
}

function marcarErrorLinea(lineaIdx, mensaje) {
  const $row = $(`.line-num-row[data-line="${lineaIdx}"]`);
  $row.addClass("has-error").removeClass("executing");

  const $overlay = $(`.line-overlay[data-line="${lineaIdx}"]`);
  $overlay.removeClass("executing").addClass("has-error").attr("title", mensaje);
}

function renderizarSubrayados() {
  const texto = $("#editor").val();
  const lineas = texto.split("\n");
  const errPorLinea = errorVisualState.erroresPorLinea;

  if (!errPorLinea || errPorLinea.size === 0) {
    setMirrorLayerHTML(
      "errorDecoLayer",
      lineas.map(() => "").join("\n"),
    );
    return;
  }

  const htmlLines = lineas.map((linea, idx) => {
    const erroresLinea = errPorLinea.get(idx);
    if (!erroresLinea || erroresLinea.length === 0) {
      return " ".repeat(linea.length);
    }
    return renderErrorUnderlines(linea, erroresLinea);
  });

  setMirrorLayerHTML("errorDecoLayer", htmlLines.join("\n"));
}

function renderErrorUnderlines(linea, errores) {
  if (linea.length === 0) return "";

  const errorMap = new Array(linea.length).fill(false);
  for (const err of errores) {
    const start = Math.max(0, err.columnaInicio);
    const end = Math.min(linea.length, err.columnaFin);
    for (let i = start; i < end; i++) {
      errorMap[i] = true;
    }
  }

  let result = "";
  let i = 0;
  while (i < linea.length) {
    const isError = errorMap[i];
    let j = i;
    while (j < linea.length && errorMap[j] === isError) j++;

    const segment = escapeHtml(linea.substring(i, j));
    if (isError) {
      result += `<span class="error-underline">${segment}</span>`;
    } else {
      result += segment;
    }
    i = j;
  }

  return result;
}

// =========================================
// 6. LINE NUMBERS + OVERLAYS
// =========================================

function actualizarLineas() {
  const texto = $("#editor").val();
  const numLineas = texto.split("\n").length;
  const total = Math.max(numLineas, 10);
  const $gutter = $("#lineNumbers");
  const $overlays = $("#lineOverlays");

  $gutter.empty();
  $overlays.empty();

  for (let i = 0; i < total; i++) {
    const $row = $("<div>").addClass("line-num-row").attr("data-line", i);
    $row.append($("<span>").addClass("exec-arrow").text(">"));
    $row.append(
      $("<span>")
        .addClass("num-text")
        .text(i + 1),
    );
    $gutter.append($row);

    const $overlay = $("<div>").addClass("line-overlay").attr("data-line", i);
    $overlays.append($overlay);
  }

  if (errorVisualState.activo) {
    for (const [idx, msg] of Object.entries(errorVisualState.erroresMapa)) {
      marcarErrorLinea(parseInt(idx), msg);
    }
  }

  actualizarSyntaxHighlight();
  actualizarIndentGuides();
}

function resaltarLineaEjecutando(lineaIdx) {
  $(".line-num-row.executing").removeClass("executing");
  $(".line-overlay.executing").removeClass("executing");
  $(`.line-num-row[data-line="${lineaIdx}"]`).addClass("executing");
  $(`.line-overlay[data-line="${lineaIdx}"]`).addClass("executing");
}

$("#editor").on("scroll", function () {
  const st = this.scrollTop;
  document.getElementById("lineNumbers").scrollTop = st;
  document.getElementById("lineOverlays").scrollTop = st;
  syncEditorMirrorScroll();
  const hl = document.getElementById(NOMBRE_HIGHLIGHT_ID);
  if (hl) posicionarResalteNombre(hl);
  actualizarIndentGuides();
});

function getMirrorLayerContent(layerId) {
  const layer = document.getElementById(layerId);
  if (!layer) return null;

  let content = layer.querySelector(".editor-mirror-content");
  if (!content) {
    content = document.createElement("div");
    content.className = "editor-mirror-content";
    layer.appendChild(content);
  }

  return content;
}

function setMirrorLayerHTML(layerId, html) {
  const content = getMirrorLayerContent(layerId);
  if (!content) return;
  content.innerHTML = html;
  syncEditorMirrorScroll();
}

function syncEditorMirrorScroll() {
  const editor = document.getElementById("editor");
  if (!editor) return;

  const transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
  for (const layerId of ["syntaxLayer", "errorDecoLayer"]) {
    const content = getMirrorLayerContent(layerId);
    if (content) content.style.transform = transform;
  }
}

// =========================================
// 7. INDENT GUIDES
// =========================================

const DEFAULT_INDENT_STEP = 2;
let indentGuideRenderPending = false;
let indentGuideNeedsMeasure = true;
let resizeObserver = null;

function parseCssPx(value, fallback = 0) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getCursorLineIndex(texto, selectionStart) {
  return texto.substring(0, selectionStart).split("\n").length - 1;
}

function getIndentGuideMetrics(force = false) {
  const editor = document.getElementById("editor");
  if (!editor) return null;

  if (!force && editor._indentGuideMetrics) {
    return editor._indentGuideMetrics;
  }

  const computed = window.getComputedStyle(editor);
  const lineHeight = parseCssPx(
    computed.lineHeight,
    parseCssPx(computed.fontSize, 13) * 1.65,
  );
  const paddingTop = parseCssPx(computed.paddingTop, 8);
  const paddingLeft = parseCssPx(computed.paddingLeft, 16);
  const tabSize = Math.max(
    1,
    parseInt(
      computed.tabSize ||
        computed.getPropertyValue("tab-size") ||
        DEFAULT_INDENT_STEP,
      10,
    ) || DEFAULT_INDENT_STEP,
  );

  const measurer = document.createElement("span");
  measurer.textContent = "0".repeat(32);
  measurer.style.position = "absolute";
  measurer.style.visibility = "hidden";
  measurer.style.pointerEvents = "none";
  measurer.style.whiteSpace = "pre";
  measurer.style.fontFamily = computed.fontFamily;
  measurer.style.fontSize = computed.fontSize;
  measurer.style.fontWeight = computed.fontWeight;
  measurer.style.letterSpacing = computed.letterSpacing;
  measurer.style.lineHeight = computed.lineHeight;

  editor.parentElement.appendChild(measurer);
  const charWidth = measurer.getBoundingClientRect().width / 32;
  measurer.remove();

  const metrics = {
    charWidth: Number.isFinite(charWidth) && charWidth > 0 ? charWidth : 7.8,
    lineHeight,
    paddingTop,
    paddingLeft,
    tabSize,
  };

  editor._indentGuideMetrics = metrics;
  return metrics;
}

function getLeadingIndentColumns(linea, tabSize) {
  let width = 0;
  for (const ch of linea) {
    if (ch === " ") {
      width += 1;
    } else if (ch === "\t") {
      width += tabSize - (width % tabSize);
    } else {
      break;
    }
  }
  return width;
}

function getVisualColumns(texto, tabSize) {
  let width = 0;
  for (const ch of texto) {
    if (ch === "\t") {
      width += tabSize - (width % tabSize);
    } else {
      width += 1;
    }
  }
  return width;
}

function computeEffectiveIndents(lineas, tabSize) {
  const n = lineas.length;
  const effectiveIndents = new Array(n).fill(0);
  const actualIndents = lineas.map((linea) => {
    if (linea.trim() === "") return null;
    return getLeadingIndentColumns(linea, tabSize);
  });

  for (let i = 0; i < n; i++) {
    if (actualIndents[i] !== null) {
      effectiveIndents[i] = actualIndents[i];
      continue;
    }

    let prev = null;
    for (let j = i - 1; j >= 0; j--) {
      if (actualIndents[j] !== null) {
        prev = actualIndents[j];
        break;
      }
    }

    let next = null;
    for (let j = i + 1; j < n; j++) {
      if (actualIndents[j] !== null) {
        next = actualIndents[j];
        break;
      }
    }

    if (prev === null && next === null) {
      effectiveIndents[i] = 0;
    } else if (prev === null) {
      effectiveIndents[i] = next;
    } else if (next === null) {
      effectiveIndents[i] = prev;
    } else {
      effectiveIndents[i] = Math.min(prev, next);
    }
  }

  return effectiveIndents;
}

function getVisibleGuideColumns(indentWidth, tabSize) {
  if (indentWidth <= 0) return [];

  const cols = [];
  const maxCol = Math.ceil(indentWidth / tabSize) * tabSize;

  for (let col = tabSize; col <= maxCol; col += tabSize) {
    const guideCenter = col - tabSize / 2;
    if (guideCenter <= indentWidth) {
      cols.push(col);
    }
  }

  return cols;
}

function computeGuideSegments(visibleGuideColsByLine, tabSize) {
  const segments = [];
  const maxIndent = Math.max(
    0,
    ...visibleGuideColsByLine.map((cols) =>
      cols.length ? cols[cols.length - 1] : 0,
    ),
  );

  for (let col = tabSize; col <= maxIndent; col += tabSize) {
    let start = null;

    for (let i = 0; i < visibleGuideColsByLine.length; i++) {
      const hasGuide = visibleGuideColsByLine[i].includes(col);
      if (hasGuide && start === null) {
        start = i;
      } else if (!hasGuide && start !== null) {
        segments.push({ col, startLine: start, endLine: i - 1 });
        start = null;
      }
    }

    if (start !== null) {
      segments.push({
        col,
        startLine: start,
        endLine: visibleGuideColsByLine.length - 1,
      });
    }
  }

  return segments;
}

function getGuideX(col, metrics) {
  const visualCenterCol = col - metrics.tabSize;
  const rawX = metrics.paddingLeft + visualCenterCol * metrics.charWidth;
  return Math.round(rawX) + 0.5;
}

function renderIndentGuides() {
  const editor = document.getElementById("editor");
  const layer = document.getElementById("indentGuideLayer");
  if (!editor || !layer) return;

  const metrics = getIndentGuideMetrics(indentGuideNeedsMeasure);
  indentGuideNeedsMeasure = false;
  if (!metrics) return;

  const texto = editor.value;
  const lineas = texto.split("\n");
  const cursorLine = getCursorLineIndex(texto, editor.selectionStart);
  const currentLineText = lineas[cursorLine] || "";
  const lineStartOffset =
    texto.lastIndexOf("\n", Math.max(0, editor.selectionStart - 1)) + 1;
  const currentLinePrefix = currentLineText.substring(
    0,
    Math.max(0, editor.selectionStart - lineStartOffset),
  );
  const currentLineIndent = getLeadingIndentColumns(
    currentLineText,
    metrics.tabSize,
  );
  const effectiveIndents = computeEffectiveIndents(lineas, metrics.tabSize);
  const visibleGuideColsByLine = effectiveIndents.map((indentWidth) =>
    getVisibleGuideColumns(indentWidth, metrics.tabSize),
  );
  const segments = computeGuideSegments(
    visibleGuideColsByLine,
    metrics.tabSize,
  );
  const activeGuideLimit = Math.min(
    getVisualColumns(currentLinePrefix, metrics.tabSize),
    currentLineIndent,
  );
  const activeGuideCols = getVisibleGuideColumns(
    activeGuideLimit,
    metrics.tabSize,
  );
  const scrollTop = editor.scrollTop;
  const scrollLeft = editor.scrollLeft;

  let html = "";

  for (const segment of segments) {
    const x = getGuideX(segment.col, metrics) - scrollLeft;
    const y =
      metrics.paddingTop + segment.startLine * metrics.lineHeight - scrollTop;
    const height =
      (segment.endLine - segment.startLine + 1) * metrics.lineHeight;
    html += `<div class="indent-guide" style="left:${x.toFixed(2)}px;top:${y.toFixed(2)}px;height:${height.toFixed(2)}px"></div>`;
  }

  if (
    cursorLine >= 0 &&
    cursorLine < lineas.length &&
    activeGuideCols.length > 0
  ) {
    const activeY =
      metrics.paddingTop + cursorLine * metrics.lineHeight - scrollTop;
    for (const col of activeGuideCols) {
      const x = getGuideX(col, metrics) - scrollLeft;
      html += `<div class="indent-guide active" style="left:${x.toFixed(2)}px;top:${activeY.toFixed(2)}px;height:${metrics.lineHeight.toFixed(2)}px"></div>`;
    }
  }

  layer.innerHTML = html;
}

function scheduleIndentGuideRender({ remeasure = false } = {}) {
  if (remeasure) {
    indentGuideNeedsMeasure = true;
    const editor = document.getElementById("editor");
    if (editor) delete editor._indentGuideMetrics;
  }

  if (indentGuideRenderPending) return;
  indentGuideRenderPending = true;

  requestAnimationFrame(() => {
    indentGuideRenderPending = false;
    renderIndentGuides();
  });
}

function actualizarIndentGuides(options) {
  scheduleIndentGuideRender(options);
}

$("#editor").on("click keyup mouseup", function () {
  actualizarIndentGuides();
});

// =========================================
// 8. SYNTAX HIGHLIGHTING
// =========================================

function actualizarSyntaxHighlight() {
  const texto = $("#editor").val();
  const lineas = texto.split("\n");
  const userVars = DocErrores.extraerVariablesDelCodigo(texto);
  const userVarsSet = new Set(userVars.map((v) => v.toLowerCase()));

  let depth = 0;
  const htmlLines = lineas.map((linea) => {
    const r = resaltarLinea_syntax(linea, userVarsSet, depth);
    depth = r.depth;
    return r.html;
  });
  setMirrorLayerHTML("syntaxLayer", htmlLines.join("\n"));
}

function resaltarLinea_syntax(linea, userVarsSet, depth = 0) {
  if (linea === "") return { html: "", depth };

  const tokens = DocErrores.tokenizarLinea(linea);
  let result = "";

  for (const tk of tokens) {
    const escaped = escapeHtml(tk.value);
    switch (tk.type) {
      case DocErrores.TK.KEYWORD:
        result += `<span class="sh-keyword">${escaped}</span>`;
        break;
      case DocErrores.TK.STRING:
      case DocErrores.TK.STRING_UNCLOSED:
        result += `<span class="sh-string">${escaped}</span>`;
        break;
      case DocErrores.TK.NUMBER:
        result += `<span class="sh-number">${escaped}</span>`;
        break;
      case DocErrores.TK.COMMENT:
        result += `<span class="sh-comment">${escaped}</span>`;
        break;
      case DocErrores.TK.ASSIGN:
        result += `<span class="sh-assign">${escaped}</span>`;
        break;
      case DocErrores.TK.OPERATOR:
        result += `<span class="sh-operator">${escaped}</span>`;
        break;
      case DocErrores.TK.LPAREN:
        result += `<span class="sh-bracket-${depth % 3}">${escaped}</span>`;
        depth++;
        break;
      case DocErrores.TK.RPAREN:
        depth = Math.max(0, depth - 1);
        result += `<span class="sh-bracket-${depth % 3}">${escaped}</span>`;
        break;
      case DocErrores.TK.IDENTIFIER:
        if (userVarsSet.has(tk.value.toLowerCase())) {
          result += `<span class="sh-variable">${escaped}</span>`;
        } else {
          result += `<span class="sh-plain">${escaped}</span>`;
        }
        break;
      default:
        result += `<span class="sh-plain">${escaped}</span>`;
        break;
    }
  }

  return { html: result, depth };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resaltarCodigo(codigo) {
  const vars = DocErrores.extraerVariablesDelCodigo(codigo);
  const userVarsSet = new Set(vars.map(v => v.toLowerCase()));
  let depth = 0;
  return codigo.split("\n").map(linea => {
    const { html, depth: d } = resaltarLinea_syntax(linea, userVarsSet, depth);
    depth = d;
    return html;
  }).join("\n");
}

// =========================================
// 9. AUTOCOMPLETE
// =========================================

let acIndice = -1;

$("#editor").on("input", function () {
  if (errorVisualState.activo) {
    invalidarErroresVisuales();
  }
  quitarResalteNombreInvalido();
  actualizarLineas();
  mostrarAutocompletado();
});

$("#editor").on("paste", function () {
  setTimeout(() => {
    if (errorVisualState.activo) {
      invalidarErroresVisuales();
    }
    actualizarLineas();
  }, 10);
});

function getLineIndices(texto, selStart, selEnd) {
  const beforeStart = texto.substring(0, selStart);
  const beforeEnd = texto.substring(0, selEnd);
  const lineIdxStart = beforeStart.split("\n").length - 1;
  const lineIdxEnd = beforeEnd.split("\n").length - 1;
  return { lineIdxStart, lineIdxEnd };
}

function insertarTabEnCaret(editor) {
  const s = editor.selectionStart;
  const en = editor.selectionEnd;
  const v = editor.value;
  const lastNL = v.lastIndexOf("\nFinProceso");

  if (s < PROCESO_PREFIX_LEN || s > lastNL || en > lastNL) return;

  registrarHistorialEditor(editor);

  editor.value = v.substring(0, s) + "  " + v.substring(en);
  editor.selectionStart = editor.selectionEnd = s + 2;
  actualizarLineas();
}

function tabularLineas(editor) {
  const s = editor.selectionStart;
  const en = editor.selectionEnd;
  const v = editor.value;
  const lastNL = v.lastIndexOf("\nFinProceso");

  if (s < PROCESO_PREFIX_LEN || s > lastNL || en > lastNL) return;
  const { lineIdxStart, lineIdxEnd } = getLineIndices(v, s, en);
  const lineas = v.split("\n");
  const firstProcLine = 1;
  const lastProcLine = lineas.length - 2;

  const startIdx = Math.max(lineIdxStart, firstProcLine);
  const endIdx = Math.min(lineIdxEnd, lastProcLine);
  if (startIdx > endIdx) return;
  registrarHistorialEditor(editor);

  let positionCounter = 0;
  let offsetInStartLine = 0,
    offsetInEndLine = 0;
  for (let i = 0; i < lineas.length; i++) {
    if (i === lineIdxStart) offsetInStartLine = s - positionCounter;
    if (i === lineIdxEnd) offsetInEndLine = en - positionCounter;
    positionCounter += lineas[i].length + 1;
  }

  for (let i = startIdx; i <= endIdx; i++) {
    lineas[i] = "  " + lineas[i];
  }

  positionCounter = 0;
  let newSelStart = 0,
    newSelEnd = 0;
  for (let i = 0; i < lineas.length; i++) {
    if (i === lineIdxStart) {
      newSelStart =
        positionCounter +
        offsetInStartLine +
        (i >= startIdx && i <= endIdx ? 2 : 0);
    }
    if (i === lineIdxEnd) {
      newSelEnd =
        positionCounter +
        offsetInEndLine +
        (i >= startIdx && i <= endIdx ? 2 : 0);
    }
    positionCounter += lineas[i].length + 1;
  }

  editor.value = lineas.join("\n");
  editor.selectionStart = newSelStart;
  editor.selectionEnd = newSelEnd;
  actualizarLineas();
}

function destabularLineas(editor) {
  const s = editor.selectionStart;
  const en = editor.selectionEnd;
  const v = editor.value;
  const lastNL = v.lastIndexOf("\nFinProceso");

  if (s < PROCESO_PREFIX_LEN || s > lastNL || en > lastNL) return;

  const { lineIdxStart, lineIdxEnd } = getLineIndices(v, s, en);
  const lineas = v.split("\n");
  const firstProcLine = 1;
  const lastProcLine = lineas.length - 2;

  const startIdx = Math.max(lineIdxStart, firstProcLine);
  const endIdx = Math.min(lineIdxEnd, lastProcLine);

  let positionCounter = 0;
  let offsetInStartLine = 0,
    offsetInEndLine = 0;
  for (let i = 0; i < lineas.length; i++) {
    if (i === lineIdxStart) offsetInStartLine = s - positionCounter;
    if (i === lineIdxEnd) offsetInEndLine = en - positionCounter;
    positionCounter += lineas[i].length + 1;
  }

  const removalsPerLine = new Array(lineas.length).fill(0);
  let huboCambio = false;
  for (let i = startIdx; i <= endIdx; i++) {
    if (lineas[i].startsWith("  ")) {
      lineas[i] = lineas[i].substring(2);
      removalsPerLine[i] = 2;
      huboCambio = true;
    } else if (lineas[i].startsWith("\t")) {
      lineas[i] = lineas[i].substring(1);
      removalsPerLine[i] = 1;
      huboCambio = true;
    }
  }

  if (!huboCambio) return;
  registrarHistorialEditor(editor);

  positionCounter = 0;
  let newSelStart = 0,
    newSelEnd = 0;
  for (let i = 0; i < lineas.length; i++) {
    if (i === lineIdxStart) {
      newSelStart = Math.max(
        positionCounter + offsetInStartLine - removalsPerLine[i],
        positionCounter,
      );
    }
    if (i === lineIdxEnd) {
      newSelEnd = Math.max(
        positionCounter + offsetInEndLine - removalsPerLine[i],
        positionCounter,
      );
    }
    positionCounter += lineas[i].length + 1;
  }

  editor.value = lineas.join("\n");
  editor.selectionStart = newSelStart;
  editor.selectionEnd = newSelEnd;
  actualizarLineas();
}

$("#editor").on("keydown", function (e) {
  const $dd = $("#autocompleteDropdown");
  const visible = $dd.hasClass("visible");

  if (esAtajoDeshacer(e)) {
    e.preventDefault();
    deshacerEditor();
    return;
  }

  if (esAtajoRehacer(e)) {
    e.preventDefault();
    rehacerEditor();
    return;
  }

  if (visible) {
    const items = $dd.find(".autocomplete-item");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      acIndice = Math.min(acIndice + 1, items.length - 1);
      actualizarSeleccionAC(items);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      acIndice = Math.max(acIndice - 1, 0);
      actualizarSeleccionAC(items);
      return;
    }
    if (e.key === "Tab" || e.key === "Enter") {
      if (acIndice >= 0 && acIndice < items.length) {
        e.preventDefault();
        insertarAutocompletado($(items[acIndice]).data("texto"));
        ocultarAutocompletado();
        return;
      }
    }
    if (e.key === "Escape") {
      ocultarAutocompletado();
      return;
    }
  }

  if (e.key === "Tab" && !visible) {
    e.preventDefault();
    if (e.shiftKey) {
      destabularLineas(this);
    } else {
      const s = this.selectionStart;
      const en = this.selectionEnd;
      const seleccionMultilinea =
        s !== en && this.value.substring(s, en).includes("\n");
      if (seleccionMultilinea) {
        tabularLineas(this);
      } else {
        insertarTabEnCaret(this);
      }
    }
  }
});

function mostrarAutocompletado() {
  const editor = document.getElementById("editor");
  const cur = editor.selectionStart;
  const txt = editor.value;

  // Los DATOS (contexto de cursor, candidatos, filtro por prefijo y orden)
  // los decide el provider activo vía js/editor/autocomplete.js; aquí solo
  // queda el render del dropdown. Devuelve [] cuando no amerita sugerir
  // (dentro de cadena/comentario, prefijo corto, sin coincidencias).
  const contexto = Code4CodeAutocomplete.contextoDesdePosicion(txt, cur);
  const candidatos = Code4CodeAutocomplete.obtenerCandidatos(
    providerActivo(),
    contexto,
  );

  if (!candidatos.length) {
    ocultarAutocompletado();
    return;
  }

  const $dd = $("#autocompleteDropdown").empty();
  acIndice = 0;

  candidatos.forEach((item, idx) => {
    const $it = $("<div>")
      .addClass("autocomplete-item")
      .attr("data-texto", item.texto)
      .html(
        `<span>${item.texto}</span><span class="kw-badge">${item.detalle || item.tipo}</span>`,
      )
      .on("click", () => {
        insertarAutocompletado(item.texto);
        ocultarAutocompletado();
      });
    if (idx === 0) $it.addClass("selected");
    $dd.append($it);
  });

  posicionarDropdown(cur);
  $dd.addClass("visible");
}

function posicionarDropdown(cursorPos) {
  const editor = document.getElementById("editor");
  const $dd = $("#autocompleteDropdown");
  const txt = editor.value.substring(0, cursorPos);
  const lineas = txt.split("\n");
  const lnIdx = lineas.length - 1;
  const col = lineas[lineas.length - 1].length;
  const wr = document.querySelector(".editor-wrapper").getBoundingClientRect();
  const metrics = getIndentGuideMetrics();
  const gutter = document.getElementById("lineNumbers");
  const lineHeight = metrics ? metrics.lineHeight : 21.45;
  const paddingTop = metrics ? metrics.paddingTop : 8;
  const paddingLeft = metrics ? metrics.paddingLeft : 16;
  const charWidth = metrics ? metrics.charWidth : 7.8;
  const gutterWidth = gutter ? gutter.offsetWidth : 45;

  const top = (lnIdx + 1) * lineHeight + paddingTop - editor.scrollTop;
  const left = col * charWidth + gutterWidth + paddingLeft - editor.scrollLeft;

  $dd.css({
    top: Math.min(top, wr.height - 190) + "px",
    left: Math.min(left, wr.width - 170) + "px",
  });
}

function insertarAutocompletado(palabra) {
  const editor = document.getElementById("editor");
  const cur = editor.selectionStart;
  const txt = editor.value;

  let ini = cur - 1;
  while (ini >= 0 && /[\wáéíóúüñÁÉÍÓÚÜÑ]/.test(txt[ini])) ini--;
  ini++;

  registrarHistorialEditor(editor);
  editor.value = txt.substring(0, ini) + palabra + " " + txt.substring(cur);
  const pos = ini + palabra.length + 1;
  editor.selectionStart = editor.selectionEnd = pos;
  editor.focus();
  actualizarLineas();
}

function actualizarSeleccionAC(items) {
  items.removeClass("selected");
  $(items[acIndice]).addClass("selected");
}

function ocultarAutocompletado() {
  $("#autocompleteDropdown").removeClass("visible");
  acIndice = -1;
}

$(document).on("click", function (e) {
  if (!$(e.target).closest("#editor, #autocompleteDropdown").length)
    ocultarAutocompletado();
});

// =========================================
// 10. CONTROLES PRINCIPALES
// =========================================

function setEstado(estado, texto) {
  $("#statusDot").removeClass("running error").addClass(estado);
  $("#statusText").text(texto);
}

function validarYDecorar() {
  const codigo = $("#editor").val();
  const errores = providerActivo().validar(codigo);
  if (errores.length > 0) {
    aplicarErroresVisuales(agruparErroresPorLinea(errores));
  } else {
    invalidarErroresVisuales();
  }
}

function agruparErroresPorLinea(errores) {
  const porLinea = new Map();
  for (const err of errores) {
    if (!porLinea.has(err.linea)) porLinea.set(err.linea, []);
    porLinea.get(err.linea).push(err);
  }
  return porLinea;
}

function ejecutar() {
  if (controlEjecucion) return;

  setMobileConsoleCollapsed(false);
  limpiarConsola();
  limpiarEjecucionHighlight();
  actualizarLineas();

  const codigo = $("#editor").val();
  if (codigo.trim() === "") return;

  const provider = providerActivo();
  const errores = provider.validar(codigo);

  if (errores.length > 0) {
    for (const err of errores) {
      consolaImprimir(
        `Error en línea ${err.linea + 1}: ${err.mensaje}`,
        "error",
      );
    }
    aplicarErroresVisuales(agruparErroresPorLinea(errores));
    setEstado("error", "Error");
    return;
  }

  $("#btnEjecutar").prop("disabled", true);
  $("#btnDetener").show();

  consolaImprimir("Inicio de ejecución", "system");

  // El cierre del ciclo (Listo/Detenido/Error, botones, resaltado) lo maneja
  // alCambiarEstado del host; ver crearHostDeEjecucion().
  controlEjecucion = provider.ejecutar(codigo, crearHostDeEjecucion());
}

function detener() {
  const control = controlEjecucion;
  if (control) {
    consolaImprimir("Ejecución detenida por el usuario.", "system");
    control.detener();
  }
  if (inputResolver) {
    const r = inputResolver;
    inputResolver = null;
    r("");
  }
  $("#btnEjecutar").prop("disabled", false);
  $("#btnDetener").hide();
  limpiarEjecucionHighlight();
}

// =========================================
// 11. EJEMPLOS
// =========================================

const EJEMPLOS = {
  hola: `// Mi primer programa
  Escribir "Hola mundo"
  `,

  saludo: `// Programa de saludo personalizado
  Definir nombre Como Caracter
  Escribir "¿Cómo te llamas?"
  Leer nombre
  Escribir "¡Hola, ", nombre, "! Bienvenido."  // saludo final
  `,

  notas: `// Calculadora de promedio de notas
  Definir nota1 Como Real
  Definir nota2 Como Real
  Definir promedio Como Real

  Escribir "Ingresa la primera nota:"
  Leer nota1
  Escribir "Ingresa la segunda nota:"
  Leer nota2

  promedio = (nota1 + nota2) / 2  // calcula promedio

  Escribir "El promedio es: ", promedio
  `,

  multivar: `// Ejemplo con múltiples variables en una línea
  Definir nombre, apellido, ciudad Como Caracter
  Definir edad Como Entero

  Escribir "Ingresa tu nombre:"
  Leer nombre
  Escribir "Ingresa tu apellido:"
  Leer apellido
  Escribir "Ingresa tu ciudad:"
  Leer ciudad
  Escribir "Ingresa tu edad:"
  Leer edad

  // Mostrar resultados
  Escribir "--- Datos ingresados ---"
  Escribir "Nombre: ", nombre, " ", apellido
  Escribir "Ciudad: ", ciudad
  Escribir "Edad: ", edad
  `,

  mayor: `// Determina cuál de dos números es mayor
  Definir a, b Como Real

  Escribir "Ingresa el primer número:"
  Leer a
  Escribir "Ingresa el segundo número:"
  Leer b

  Si a > b Entonces
    Escribir "El mayor es: ", a
  Sino
    Si b > a Entonces
      Escribir "El mayor es: ", b
    Sino
      Escribir "Los dos números son iguales."
    FinSi
  FinSi
  `,
  contador: `// Suma los números del 1 al N ingresado por el usuario
  Definir n, i, suma Como Entero

  Escribir "¿Hasta qué número sumar?"
  Leer n
  suma = 0
  i = 1

  Mientras i <= n Hacer
    suma = suma + i
    i = i + 1
  FinMientras

  Escribir "La suma de 1 a ", n, " es: ", suma
  `,

  tabla: `// Tabla de multiplicar de un número
  Definir num, i Como Entero

  Escribir "¿De qué número quieres la tabla?"
  Leer num

  Para i = 1 Hasta 10 Hacer
    Escribir num, " x ", i, " = ", num * i
  FinPara
  `,

  logico: `// Ejemplo del tipo Logico con Verdadero, Falso y No
  Definir activo, permitido Como Logico

  activo = Verdadero
  permitido = Falso

  Si activo Y No permitido Entonces
    Escribir "Acceso parcial: activo pero sin permiso"
  Sino
    Escribir "Otro estado"
  FinSi

  // Negación sobre variable
  permitido = No permitido
  Escribir "permitido ahora vale: ", permitido
  `,

  texto: `// Funciones nativas de texto: Longitud, Mayusculas, Minusculas
  Definir nombre, normalizado Como Caracter
  Definir largo Como Entero

  Escribir "Ingresa tu nombre:"
  Leer nombre

  normalizado = Mayusculas(nombre)
  largo = Longitud(normalizado)

  Escribir "En mayúsculas: ", normalizado
  Escribir "Tiene ", largo, " caracteres"

  Si Longitud(nombre) > 0 Entonces
    Escribir "En minúsculas: ", Minusculas(nombre)
  FinSi

  // Llamadas anidadas en una sola expresión
  Escribir "Largo del nombre en mayúsculas: ", Longitud(Mayusculas(nombre))
  `,

  numerico: `// Operadores y funciones numéricas: mod, ^, menos unario, Abs, Redon, Trunc
  Definir n, resto Como Entero
  Definir base, resultado Como Real

  Escribir "Ingresa un número entero:"
  Leer n

  resto = n mod 2
  Si resto == 0 Entonces
    Escribir n, " es par"
  Sino
    Escribir n, " es impar"
  FinSi

  base = -3.6
  Escribir "Abs(", base, ") = ", Abs(base)
  Escribir "Redon(", base, ") = ", Redon(base)
  Escribir "Trunc(", base, ") = ", Trunc(base)

  resultado = 2 * -3
  Escribir "2 * -3 = ", resultado

  resultado = 2 ^ -3
  Escribir "2 ^ -3 = ", resultado

  resultado = 2 ^ 10
  Escribir "2 ^ 10 = ", resultado
  `,

  arreglo: `// Arreglo de notas: declaración, carga, suma y promedio
  Dimension notas[5]
  Definir notas Como Real
  Definir i Como Entero
  Definir suma, promedio Como Real

  suma = 0
  Para i = 1 Hasta 5 Hacer
    Escribir "Ingresa la nota ", i, ":"
    Leer notas[i]
    suma = suma + notas[i]
  FinPara

  promedio = suma / 5
  Escribir "Promedio: ", promedio
  `,

  matriz: `// Matriz 3x3: carga y suma de la diagonal principal
  Dimension m[3, 3]
  Definir m Como Entero
  Definir i, j, diagonal Como Entero

  Para i = 1 Hasta 3 Hacer
    Para j = 1 Hasta 3 Hacer
      Escribir "m[", i, ",", j, "] = "
      Leer m[i, j]
    FinPara
  FinPara

  diagonal = 0
  Para i = 1 Hasta 3 Hacer
    diagonal = diagonal + m[i, i]
  FinPara
  Escribir "Suma diagonal: ", diagonal
  `,

  diasemana: `// Nombre del día según su número (1=Lunes ... 7=Domingo)
  Definir dia Como Entero

  Escribir "Ingresa el número del día (1-7):"
  Leer dia

  Segun dia Hacer
    1: Escribir "Lunes"
    2: Escribir "Martes"
    3: Escribir "Miércoles"
    4: Escribir "Jueves"
    5: Escribir "Viernes"
    6, 7:
      Escribir "Fin de semana"
    De Otro Modo:
      Escribir "Número inválido. Ingresa del 1 al 7."
  FinSegun
  `,
};

function cargarEjemplo(nombre) {
  if (EJEMPLOS[nombre]) {
    const nombreProceso = obtenerNombreProceso();
    const usaProcesoGenerico = nombreProceso === "nombre_proceso";
    return reemplazarEditorConfirmando(
      `Proceso ${nombreProceso}\n${EJEMPLOS[nombre]}\nFinProceso`,
      "Se reemplazará el contenido del editor por el ejemplo seleccionado.",
      !usaProcesoGenerico,
      {
        title: "¿Cargar ejemplo?",
        confirmButtonText: "Cargar ejemplo",
        omitirConfirmacion: usaProcesoGenerico,
      },
    );
  }
  return Promise.resolve(false);
}

// =========================================
// 11.b BANCO DE EJERCICIOS Y DOCUMENTACION (panel de aprendizaje)
// =========================================

const NIVELES_LITESEINT = [
  {
    id: 1,
    titulo: "Primeros programas",
    objetivo: "Escribir programas lineales que declaran variables, leen datos y muestran resultados paso a paso.",
    foco: "Las instrucciones corren de arriba a abajo. No hay decisiones ni ciclos: solo declarar, leer, calcular y escribir.",
    antes: null,
    comandosClave: ["Proceso", "FinProceso", "Definir", "Leer", "Escribir", "="],
    siguiente: "Avanza cuando puedas escribir un programa que pida dos datos, haga un cálculo con ellos y muestre el resultado.",
  },
  {
    id: 2,
    titulo: "Expresiones y fórmulas",
    objetivo: "Traducir enunciados a fórmulas y separar con claridad la entrada, el proceso y la salida antes de codificar.",
    foco: "El desafío no es la sintaxis sino identificar qué datos se necesitan, qué se calcula y qué se muestra.",
    antes: "Dominar N1: declarar variables, leer datos del usuario y mostrar resultados.",
    comandosClave: ["+", "-", "*", "/", "mod", "^", "Abs", "Redon", "Trunc"],
    siguiente: "Avanza cuando puedas leer un enunciado, identificar entrada/proceso/salida y traducirlo a código sin ayuda.",
  },
  {
    id: 3,
    titulo: "Decisiones",
    objetivo: "Hacer que el programa elija entre dos o más caminos según condiciones lógicas.",
    foco: "Comparar valores, combinar condiciones con Y/O/No, y usar Segun cuando los casos son valores fijos.",
    antes: "Dominar N2: operadores y fórmulas.",
    comandosClave: ["Si", "Entonces", "Sino", "FinSi", "Segun", "FinSegun", "Y", "O", "No"],
    siguiente: "Avanza cuando puedas probar tus condiciones con dos valores distintos y predecir el camino que tomará el programa.",
  },
  {
    id: 4,
    titulo: "Repetición",
    objetivo: "Automatizar tareas que se repiten y controlar con precisión cuándo termina un ciclo.",
    foco: "Cada ciclo tiene su caso ideal: Para cuando sabes cuántas veces, Mientras cuando no sabes, Repetir cuando necesitas ejecutar al menos una vez.",
    antes: "Dominar N3: condiciones y decisiones.",
    comandosClave: ["Mientras", "FinMientras", "Repetir", "HastaQue", "Para", "FinPara"],
    siguiente: "Avanza cuando puedas elegir el ciclo correcto para cada tipo de problema y detectar un ciclo infinito antes de ejecutar.",
  },
  {
    id: 5,
    titulo: "Desafíos",
    objetivo: "Resolver problemas completos con menor guía, combinando ciclos, decisiones y patrones de conteo y acumulación.",
    foco: "Aplicar lo aprendido sin plantilla: leer el enunciado, diseñar la solución y probarla con distintos datos.",
    antes: "Dominar N4: ciclos y sus patrones básicos.",
    comandosClave: ["Si", "Mientras", "Para", "Repetir", "Definir", "Leer", "Escribir"],
    siguiente: "Avanza cuando puedas resolver un desafío sin consultar el código de referencia.",
  },
  {
    id: 6,
    titulo: "Decisiones anidadas",
    objetivo: "Escribir condiciones anidadas correctas para clasificar datos con múltiples rangos y categorías.",
    foco: "Si dentro de Sino, combinaciones de Y y O, y verificar siempre los valores límite de cada rango.",
    antes: "Dominar N3 y N4: decisiones y ciclos.",
    comandosClave: ["Si", "Sino", "FinSi", "Y", "O", "==", "!=", ">=", "<="],
    siguiente: "Avanza cuando puedas identificar todos los casos posibles de un enunciado y escribir una condición para cada uno.",
  },
  {
    id: 7,
    titulo: "Menú y acumulación",
    objetivo: "Construir programas completos con menú de opciones, acumulación de datos por categoría y resumen al final.",
    foco: "Ciclo persistente con Mientras, selección de opción con Segun y variables de conteo y suma separadas por caso.",
    antes: "Dominar N4 y N6: ciclos y decisiones anidadas.",
    comandosClave: ["Mientras", "FinMientras", "Segun", "FinSegun", "De Otro Modo"],
    siguiente: "Este es el nivel final. Resolver todos los ejercicios implica dominar el lenguaje completo de LiteSeInt.",
  },
];

const NIVELES_VISIBLES = [1, 2, 3, 4, 5, 6, 7];

const DOC_COMANDOS = [
  {
    nombre: "Proceso / FinProceso",
    sintaxis: "Proceso nombre\n  instrucciones\nFinProceso",
    ejemplo: "Proceso saludar\n  Escribir \"Hola, mundo\"\nFinProceso",
    descripcion: "Marca el inicio y el fin del programa. Todo el código que escribas va dentro de este bloque; sin él LiteSeInt no puede validar ni ejecutar nada.",
    detalle: "Usa siempre este bloque, incluso en programas de dos líneas. El nombre no puede tener espacios. Las instrucciones van indentadas adentro para mejorar la legibilidad.",
    errores: "Olvidar `FinProceso`, escribir instrucciones antes de `Proceso`, o usar un nombre con espacios como `Mi Programa`.",
    ejercicios: ["n1-001", "n1-002"],
  },
  {
    nombre: "Definir",
    sintaxis: "Definir variable Como Entero|Real|Caracter|Logico\nDefinir a, b, c Como Entero",
    ejemplo: "Definir edad Como Entero\nDefinir promedio Como Real\nDefinir nombre Como Caracter\nDefinir activo Como Logico",
    descripcion: "Crea una variable con un nombre y un tipo. Hasta que no la declares, LiteSeInt no sabe que existe y cualquier uso genera error.",
    detalle: "Puedes declarar varias variables del mismo tipo en una línea separándolas con comas: `Definir a, b Como Entero`. No es posible cambiar el tipo después de declarar.",
    errores: "Usar `Cadena` en lugar de `Caracter`, declarar la misma variable dos veces, o usar una palabra reservada como nombre.",
    ejercicios: ["n1-003", "n1-004"],
  },
  {
    nombre: "Tipos de dato",
    sintaxis: "Entero   // número sin decimales\nReal     // número con decimales\nCaracter // texto entre comillas dobles\nLogico   // Verdadero o Falso",
    ejemplo: "Definir cantidad Como Entero\nDefinir precio Como Real\nDefinir ciudad Como Caracter\nDefinir aprobado Como Logico\n\ncantidad = 5\nprecio = 19.99\nciudad = \"Santiago\"\naprobado = Verdadero",
    descripcion: "Cada variable guarda exactamente un tipo de dato. Elegir el tipo correcto desde el principio evita errores al calcular, comparar o mostrar valores.",
    detalle: "Usa `Entero` para contadores, edades y cantidades sin parte decimal. Usa `Real` para precios, promedios y medidas con decimales. Usa `Caracter` para nombres, palabras o cualquier texto. Usa `Logico` para banderas de sí/no o estados booleanos.",
    errores: "Guardar texto en una variable `Entero`, usar `Cadena` (no existe en LiteSeInt), o intentar asignar `Verdadero` a una variable `Real`.",
    ejercicios: ["n1-003", "n1-004", "n1-005"],
  },
  {
    nombre: "Asignación",
    sintaxis: "variable = expresion",
    ejemplo: "Definir precio, cantidad, total, descuento Como Real\nprecio = 1500\ncantidad = 3\ntotal = precio * cantidad\ndescuento = total * 0.10\ntotal = total - descuento\nEscribir \"Total con descuento: \", total",
    descripcion: "Calcula la expresión del lado derecho y guarda el resultado en la variable. La variable debe existir (declarada con `Definir`) antes de asignarle valor.",
    detalle: "El signo `=` asigna; el doble `==` compara. No son intercambiables: `x = 5` guarda 5 en x, mientras que `x == 5` pregunta si x vale 5. Confundirlos es el error más frecuente al empezar.",
    errores: "Usar `<-` (sintaxis de PSeInt clásico, no válida aquí), asignar a una variable no declarada, o guardar texto en una variable numérica.",
    ejercicios: ["n1-006", "n1-007"],
  },
  {
    nombre: "Leer",
    sintaxis: "Leer variable",
    ejemplo: "Definir edad Como Entero\nDefinir nombre Como Caracter\nEscribir \"Ingresa tu nombre:\"\nLeer nombre\nEscribir \"Ingresa tu edad:\"\nLeer edad\nEscribir \"Hola \", nombre, \", tienes \", edad, \" años.\"",
    descripcion: "Detiene el programa, muestra un cursor de entrada en la consola y guarda lo que el usuario escribe en la variable indicada.",
    detalle: "Pon siempre un `Escribir` descriptivo antes de cada `Leer` para que el usuario sepa qué ingresar. Si el dato no coincide con el tipo de la variable (texto donde se espera número), LiteSeInt reporta el error en tiempo de ejecución.",
    errores: "Leer una variable no declarada, ingresar texto donde se espera un número, o intentar leer varias variables en una sola línea.",
    ejercicios: ["n1-005", "n2-001"],
  },
  {
    nombre: "Escribir",
    sintaxis: "Escribir expresion\nEscribir expresion, expresion, ...",
    ejemplo: "Escribir \"Resultado:\"\nEscribir \"Total: \", total\nEscribir \"Nombre: \", nombre, \" — Edad: \", edad\nEscribir \"Área: \", base * altura / 2",
    descripcion: "Imprime uno o varios valores en la consola y salta a la siguiente línea automáticamente.",
    detalle: "Separa texto fijo, variables y expresiones con comas. El texto literal va entre comillas dobles. No uses `+` para combinar texto con variables; usa comas. Cada `Escribir` es una línea nueva en la consola.",
    errores: "Olvidar las comillas en el texto fijo, dejar una coma al final sin nada después, o imprimir una variable que todavía no recibió ningún valor.",
    ejercicios: ["n1-001", "n1-002"],
  },
  {
    nombre: "Operadores aritméticos",
    sintaxis: "a + b   // suma\na - b   // resta\na * b   // multiplicación\na / b   // división real\na mod b // resto de la división entera\na ^ b   // potencia",
    ejemplo: "Definir a, b Como Real\nLeer a\nLeer b\nEscribir \"Suma: \", a + b\nEscribir \"Producto: \", a * b\nEscribir \"División: \", a / b\nEscribir \"Módulo: \", a mod b\nEscribir \"Potencia: \", a ^ 2",
    descripcion: "Realizan los cálculos matemáticos básicos. Se combinan en expresiones y se puede usar paréntesis para forzar el orden de evaluación.",
    detalle: "Precedencia de mayor a menor: `^` → menos unario → `*`, `/`, `mod` → `+`, `-`. Usa paréntesis cuando tengas dudas. `mod` devuelve el resto de la división entera y solo funciona escrito en minúsculas.",
    errores: "Dividir por cero, escribir `MOD` en mayúsculas, omitir un operando, o intentar operar texto con números.",
    ejercicios: ["n1-006", "n1-008", "n1-018"],
  },
  {
    nombre: "Operadores relacionales",
    sintaxis: "a == b   // igual a\na != b   // distinto de (también <>)\na < b    // menor que\na > b    // mayor que\na <= b   // menor o igual que\na >= b   // mayor o igual que",
    ejemplo: "Si edad >= 18 Entonces\n  Escribir \"Mayor de edad\"\nFinSi\n\nSi nota != 0 Y nota < 4.0 Entonces\n  Escribir \"Reprobado\"\nFinSi",
    descripcion: "Comparan dos valores y producen `Verdadero` o `Falso`. Son la base de toda condición: sin ellos no hay decisiones ni ciclos.",
    detalle: "Usa siempre `==` para comparar igualdad, nunca `=` dentro de una condición. `!=` y `<>` hacen lo mismo; elige uno y sé consistente en todo el programa.",
    errores: "Usar `=` para comparar dentro de una condición, comparar un número con texto, o dejar la condición vacía.",
    ejercicios: ["n3-001", "n3-006", "n3-014"],
  },
  {
    nombre: "Operadores lógicos",
    sintaxis: "condicion1 Y condicion2  // ambas verdaderas\ncondicion1 O condicion2  // al menos una verdadera\nNo condicion             // invierte el resultado",
    ejemplo: "// Rango: ambas condiciones deben cumplirse\nSi edad >= 18 Y edad <= 65 Entonces\n  Escribir \"En edad de trabajar\"\nFinSi\n\n// Alternativa: basta con una\nSi nota < 4.0 O faltas > 10 Entonces\n  Escribir \"Reprobado\"\nFinSi\n\n// Negación de una variable lógica\nSi No aprobado Entonces\n  Escribir \"Debe rendir el examen\"\nFinSi",
    descripcion: "Conectan condiciones para formar reglas más complejas. Con ellos puedes verificar rangos, alternativas y negaciones en una sola condición.",
    detalle: "Usa `Y` para verificar que todo se cumpla (rangos, combinaciones). Usa `O` cuando basta con que una condición sea verdadera. Usa `No` para invertir el valor lógico de una variable o una condición. Nunca escribas `&&` ni `||`; no son válidos en LiteSeInt.",
    errores: "Escribir `&&` o `||` en lugar de `Y` y `O`, omitir los operandos de comparación en cada lado, o aplicar `No` a una expresión compleja sin paréntesis.",
    ejercicios: ["n3-023", "n3-024", "n3-026"],
  },
  {
    nombre: "Si / Sino / FinSi",
    sintaxis: "Si condicion Entonces\n  instrucciones\nSino\n  instrucciones\nFinSi",
    ejemplo: "Si nota >= 4.0 Entonces\n  Escribir \"Aprobado\"\nSino\n  Escribir \"Reprobado\"\nFinSi",
    ejemplo2: "// Si anidado: tres categorías distintas\nSi nota >= 6.0 Entonces\n  Escribir \"Sobresaliente\"\nSino\n  Si nota >= 4.0 Entonces\n    Escribir \"Aprobado\"\n  Sino\n    Escribir \"Reprobado\"\n  FinSi\nFinSi",
    descripcion: "Permite que el programa tome un camino u otro según si una condición es verdadera o falsa.",
    detalle: "`Sino` es opcional: úsalo solo cuando hay dos caminos. Para tres o más categorías, anida un `Si` dentro del `Sino`, o bien usa `Segun` si los casos son valores fijos de una misma variable. Cada `Si` necesita su propio `FinSi` al mismo nivel de indentación.",
    errores: "Usar `=` en lugar de `==` para comparar, olvidar la palabra `Entonces`, escribir `SiNo` junto (no válido), o cruzar cierres de bloques anidados.",
    ejercicios: ["n3-001", "n3-002", "n3-016"],
  },
  {
    nombre: "Mientras / FinMientras",
    sintaxis: "Mientras condicion Hacer\n  instrucciones\nFinMientras",
    ejemplo: "Definir i Como Entero\ni = 1\nMientras i <= 10 Hacer\n  Escribir i\n  i = i + 1\nFinMientras",
    ejemplo2: "// Menú que repite hasta que el usuario elige Salir\nDefinir opcion Como Entero\nopcion = 0\nMientras opcion != 3 Hacer\n  Escribir \"1. Sumar  2. Restar  3. Salir\"\n  Leer opcion\nFinMientras",
    descripcion: "Repite un bloque mientras una condición sea verdadera. Si la condición es falsa desde el primer momento, el bloque no se ejecuta ni una vez.",
    detalle: "Úsalo cuando no sabes cuántas repeticiones habrá antes de empezar. Dentro del ciclo, actualiza siempre la variable que controla la condición; si no cambia, el ciclo nunca termina. Cuando necesitas ejecutar el cuerpo al menos una vez, prefiere `Repetir/HastaQue`.",
    errores: "No actualizar la variable de control dentro del ciclo (ciclo infinito), olvidar `Hacer`, o cerrar con `FinMientras` en el nivel equivocado.",
    ejercicios: ["n4-001", "n4-002", "n4-007"],
  },
  {
    nombre: "Repetir / HastaQue",
    sintaxis: "Repetir\n  instrucciones\nHastaQue condicion",
    ejemplo: "Definir clave Como Caracter\nRepetir\n  Escribir \"Ingresa la clave:\"\n  Leer clave\nHastaQue clave == \"ok\"",
    descripcion: "Ejecuta un bloque al menos una vez y luego decide si debe repetirse. Se detiene cuando la condición pasa a ser verdadera.",
    detalle: "Es la opción natural para validar entradas: el cuerpo siempre corre antes de evaluar. La condición funciona al revés que en `Mientras`: aquí significa \"terminar cuando sea verdadero\", no \"continuar mientras sea verdadero\". Ese contraste es fácil de confundir al principio.",
    errores: "Invertir la lógica de la condición respecto a `Mientras`, olvidar `HastaQue`, o dejar el cuerpo del ciclo sin ninguna instrucción.",
    ejercicios: ["n4-021", "n4-022"],
  },
  {
    nombre: "Para / FinPara",
    sintaxis: "Para i = inicio Hasta fin [Con Paso paso] Hacer\n  instrucciones\nFinPara",
    ejemplo: "// Contar del 1 al 5\nPara i = 1 Hasta 5 Hacer\n  Escribir i\nFinPara",
    ejemplo2: "// Cuenta regresiva con paso negativo\nPara i = 10 Hasta 1 Con Paso -1 Hacer\n  Escribir i\nFinPara\n\n// Múltiplos de 3\nPara i = 3 Hasta 30 Con Paso 3 Hacer\n  Escribir i\nFinPara",
    descripcion: "Repite un bloque con un contador que avanza automáticamente. Es el ciclo indicado cuando sabes exactamente cuántas repeticiones habrá antes de ejecutar.",
    detalle: "Sin `Con Paso`, el contador avanza de 1 en 1. Para contar hacia atrás, usa un paso negativo. Evita modificar el contador dentro del ciclo: el `Para` lo maneja solo y cambiarlo manualmente produce comportamiento inesperado.",
    errores: "Usar paso cero, modificar el contador manualmente dentro del ciclo, olvidar `Hacer`, u olvidar `FinPara`.",
    ejercicios: ["n4-041", "n4-042", "n4-047"],
  },
  {
    nombre: "Segun / FinSegun",
    sintaxis: "Segun expresion Hacer\n  valor: instruccion\n  valor1, valor2: instruccion\n  De Otro Modo:\n    instruccion\nFinSegun",
    ejemplo: "Definir dia Como Entero\nLeer dia\nSegun dia Hacer\n  1: Escribir \"Lunes\"\n  2: Escribir \"Martes\"\n  3: Escribir \"Miércoles\"\n  6, 7: Escribir \"Fin de semana\"\n  De Otro Modo:\n    Escribir \"Día desconocido\"\nFinSegun",
    descripcion: "Elige entre múltiples caminos según el valor de una expresión. Es más legible que varios `Si` anidados cuando los casos son valores concretos de una misma variable.",
    detalle: "Cada caso lleva `:` al final de su valor. Puedes agrupar varios valores en un caso separándolos con coma: `6, 7: Escribir \"Fin de semana\"`. `De Otro Modo:` captura cualquier valor que no coincida con los demás y su cuerpo va en la línea siguiente.",
    errores: "Olvidar los dos puntos `:` después de cada valor, repetir el mismo valor en dos casos, o cerrar con `FinSegun` en el nivel equivocado.",
    ejercicios: ["n3-031", "n3-032", "n3-033"],
  },
  {
    nombre: "Funciones numéricas",
    sintaxis: "Abs(x)    // valor absoluto\nRedon(x)  // redondeo al entero más cercano\nTrunc(x)  // parte entera, sin redondear",
    ejemplo: "Definir n Como Real\nLeer n\nEscribir \"Absoluto: \",   Abs(n)\nEscribir \"Redondeado: \", Redon(n)\nEscribir \"Truncado: \",   Trunc(n)",
    descripcion: "Transforman valores numéricos dentro de una expresión. Se pueden usar directamente en `Escribir`, en asignaciones o anidadas con otras funciones.",
    detalle: "`Abs(x)` devuelve x sin signo: Abs(-5) = 5. `Redon(x)` redondea al entero más cercano: Redon(2.5) = 3. `Trunc(x)` elimina los decimales sin redondear: Trunc(2.9) = 2. Úsalas cuando una fórmula exija esos ajustes.",
    errores: "Llamar la función sin paréntesis, pasar texto donde se espera un número, o dejar el argumento vacío: `Abs()`.",
    ejercicios: ["n2-017", "n2-010", "n2-006"],
  },
  {
    nombre: "Funciones de texto",
    sintaxis: "Longitud(texto)    // número de caracteres\nMayusculas(texto)  // todo en mayúsculas\nMinusculas(texto)  // todo en minúsculas",
    ejemplo: "Definir nombre Como Caracter\nLeer nombre\nEscribir \"Caracteres: \", Longitud(nombre)\nEscribir \"Mayúsculas: \", Mayusculas(nombre)\nEscribir \"Minúsculas: \", Minusculas(nombre)",
    descripcion: "Transforman o analizan cadenas de texto (variables de tipo `Caracter`). Permiten contar caracteres, normalizar capitalización y preparar el texto para comparaciones.",
    detalle: "`Longitud` es útil para validar que el usuario ingresó algo. `Mayusculas` y `Minusculas` son clave al comparar entradas: `\"ok\"` y `\"OK\"` son distintas en LiteSeInt, así que normalizar antes de comparar evita falsos negativos.",
    errores: "Aplicar estas funciones a una variable numérica, llamarlas sin paréntesis, o dejar el argumento vacío.",
    ejercicios: ["n1-005", "n2-002"],
  },
  {
    nombre: "Comentarios",
    sintaxis: "// texto explicativo",
    ejemplo: "// Calcula el promedio de tres notas\nDefinir n1, n2, n3, promedio Como Real\nLeer n1\nLeer n2\nLeer n3\npromedio = (n1 + n2 + n3) / 3  // resultado final\nEscribir \"Promedio: \", promedio",
    descripcion: "Anotaciones para el programador que LiteSeInt ignora completamente. No afectan la ejecución ni generan errores.",
    detalle: "Escríbelos para explicar el *por qué* de una decisión no obvia, no para repetir lo que ya expresa el código. Un comentario como `// suma los valores` agrega poco si ya está `total = a + b + c`; uno como `// usamos Trunc para evitar redondeo acumulado` sí aporta.",
    errores: "Creer que un comentario corrige un error: si la instrucción es incorrecta, el comentario no cambia nada. El programa ignora todo lo que va después de `//` en esa línea.",
    ejercicios: ["n1-006", "n1-008"],
  },
];

const DOC_ERRORES_COMUNES = [
  {
    titulo: "Falta Proceso o FinProceso",
    categoria: "Estructura",
    sintoma: "El validador dice: 'El documento debe comenzar con \"Proceso nombre_proceso\".' o 'El documento debe terminar con \"FinProceso\".'",
    causa: "Escribir instrucciones sueltas sin envolverlas en un bloque `Proceso ... FinProceso`.",
    arreglo: "Todo programa debe abrir con `Proceso nombre` y cerrar con `FinProceso`. El nombre identifica al programa y no puede quedar vacío.",
    ejemploMal: "Escribir \"Hola\"",
    ejemplo: "Proceso miPrograma\n  Escribir \"Hola\"\nFinProceso",
  },
  {
    titulo: "Bloque sin cerrar",
    categoria: "Estructura",
    sintoma: "El validador dice: 'Bloque \"Si\" sin cierre (falta FinSi).' o lo equivalente para `Mientras`, `Para` o `Segun`.",
    causa: "Abrir una estructura de control y olvidar su cierre correspondiente.",
    arreglo: "Cierra cada estructura con la palabra exacta: `FinSi`, `FinMientras`, `FinPara` o `FinSegun`. La indentación ayuda a verlo.",
    ejemploMal: "Proceso p\n  Definir edad Como Entero\n  edad = 20\n  Si edad >= 18 Entonces\n    Escribir \"Mayor\"\nFinProceso",
    ejemplo: "Proceso p\n  Definir edad Como Entero\n  edad = 20\n  Si edad >= 18 Entonces\n    Escribir \"Mayor\"\n  FinSi\nFinProceso",
  },
  {
    titulo: "Cierre cruzado de bloques",
    categoria: "Estructura",
    sintoma: "El validador dice: '\"FinX\" intenta cerrar un bloque, pero primero debe cerrarse \"Y\" con FinY.'",
    causa: "Cerrar el bloque externo antes que el interno, mezclando los `FinX`.",
    arreglo: "Cierra siempre primero el bloque más interno. La indentación debe coincidir entre apertura y cierre.",
    ejemploMal: "Proceso p\n  Definir a Como Entero\n  a = 1\n  Si a > 0 Entonces\n    Mientras a < 10 Hacer\n      a = a + 1\n    FinSi\n  FinMientras\nFinProceso",
    ejemplo: "Proceso p\n  Definir a Como Entero\n  a = 1\n  Si a > 0 Entonces\n    Mientras a < 10 Hacer\n      a = a + 1\n    FinMientras\n  FinSi\nFinProceso",
  },
  {
    titulo: "Falta HastaQue",
    categoria: "Estructura",
    sintoma: "El validador dice: 'Bloque \"Repetir\" sin cierre (falta HastaQue).'",
    causa: "Abrir un `Repetir` sin escribir la condición de salida con `Hasta Que`.",
    arreglo: "Cierra siempre con `Hasta Que <condicion>`. La condición indica cuándo dejar de repetir.",
    ejemploMal: "Proceso p\n  Definir x Como Entero\n  Repetir\n    Leer x\nFinProceso",
    ejemplo: "Proceso p\n  Definir x Como Entero\n  Repetir\n    Leer x\n  Hasta Que x > 0\nFinProceso",
  },
  {
    titulo: "Variable no definida",
    categoria: "Variables",
    sintoma: "Mensaje: `Variable \"X\" no definida.`",
    causa: "Usar una variable sin haberla declarado antes con `Definir`.",
    arreglo: "Declara la variable con `Definir <nombre> Como <Tipo>` antes de leerla, asignarle valor o escribirla.",
    ejemploMal: "Proceso p\n  Leer edad\n  Escribir edad\nFinProceso",
    ejemplo: "Proceso p\n  Definir edad Como Entero\n  Leer edad\n  Escribir edad\nFinProceso",
  },
  {
    titulo: "Variable no inicializada",
    categoria: "Variables",
    sintoma: "Al ejecutar, mensaje: `Variable \"X\" no inicializada.`",
    causa: "Declarar una variable y usarla en una expresión antes de asignarle un valor.",
    arreglo: "Asigna un valor inicial antes de operar. Los contadores y acumuladores parten en cero.",
    ejemploMal: "Proceso p\n  Definir suma Como Entero\n  suma = suma + 1\nFinProceso",
    ejemplo: "Proceso p\n  Definir suma Como Entero\n  suma = 0\n  suma = suma + 1\nFinProceso",
  },
  {
    titulo: "Palabra reservada como variable",
    categoria: "Variables",
    sintoma: "Mensaje: `\"X\" es una palabra reservada y no puede usarse como variable.`",
    causa: "Usar como nombre de variable una palabra del lenguaje (`Si`, `Para`, `Definir`, `Mientras`, etc.).",
    arreglo: "Cambia el nombre por uno descriptivo y distinto a las palabras clave del lenguaje.",
    ejemploMal: "Proceso p\n  Definir Para Como Entero\nFinProceso",
    ejemplo: "Proceso p\n  Definir cantidad Como Entero\n  cantidad = 5\nFinProceso",
  },
  {
    titulo: "Variable ya definida",
    categoria: "Variables",
    sintoma: "Mensaje: `Variable \"X\" ya se encuentra definida.`",
    causa: "Declarar dos veces la misma variable con `Definir`.",
    arreglo: "Define cada variable una sola vez. Si necesitas reiniciar su valor, usa una asignación con `=`.",
    ejemploMal: "Proceso p\n  Definir edad Como Entero\n  Definir edad Como Entero\nFinProceso",
    ejemplo: "Proceso p\n  Definir edad Como Entero\n  edad = 0\nFinProceso",
  },
  {
    titulo: "Tipo incompatible al Leer",
    categoria: "Variables",
    sintoma: "Al ejecutar, mensaje: `El valor ingresado para \"X\" no corresponde al tipo Entero/Real/Logico.`",
    causa: "Ingresar texto donde se esperaba un número, o un valor distinto a `Verdadero`/`Falso` para tipos `Logico`.",
    arreglo: "Ingresa un valor del tipo declarado: enteros sin decimales, reales con punto y lógicos como `Verdadero` o `Falso`.",
    ejemplo: "Proceso p\n  Definir edad Como Entero\n  Leer edad\n  Escribir \"Edad: \", edad\nFinProceso",
  },
  {
    titulo: "Texto sin cerrar",
    categoria: "Expresiones",
    sintoma: "Subrayado desde la comilla de apertura hasta el final de la línea. Mensaje: `Texto sin cerrar con comillas dobles.`",
    causa: "Abrir un texto con `\"` y olvidar cerrarlo en la misma línea.",
    arreglo: "Cierra siempre con otra comilla doble dentro de la misma línea.",
    ejemploMal: "Proceso p\n  Escribir \"Hola mundo\nFinProceso",
    ejemplo: "Proceso p\n  Escribir \"Hola mundo\"\nFinProceso",
  },
  {
    titulo: "Paréntesis o argumentos incompletos",
    categoria: "Expresiones",
    sintoma: "Al ejecutar: `Paréntesis desbalanceados`, `Llamada a \"X\" sin cerrar con \")\"` o `Argumento vacío antes de \")\".`",
    causa: "Olvidar cerrar un paréntesis, dejar una función sin argumentos o usar `Redon(, 2)`.",
    arreglo: "Cierra cada `(` con su `)`. Cada función necesita los argumentos completos.",
    ejemploMal: "Proceso p\n  Definir x Como Entero\n  x = Abs(-5\nFinProceso",
    ejemplo: "Proceso p\n  Definir x Como Entero\n  x = Abs(-5)\nFinProceso",
  },
  {
    titulo: "Operador incompleto",
    categoria: "Expresiones",
    sintoma: "Al ejecutar: `Falta operando después de \"+\"` o `Falta operando antes de \")\"`.",
    causa: "Dejar un operador (`+`, `-`, `*`, `/`, `mod`, `^`) sin uno de sus operandos.",
    arreglo: "Cada operador binario necesita un valor a la izquierda y otro a la derecha.",
    ejemploMal: "Proceso p\n  Definir total Como Entero\n  total = 1 +\nFinProceso",
    ejemplo: "Proceso p\n  Definir total Como Entero\n  total = 1 + 2\nFinProceso",
  },
  {
    titulo: "Confusión entre = y ==",
    categoria: "Expresiones",
    sintoma: "El validador dice: `Operador de comparación no válido en la condición del \"Si\".`",
    causa: "Usar `=` (asignación) dentro de una condición, donde se necesita el comparador `==`.",
    arreglo: "Usa `=` para asignar valores y `==` para comparar igualdad. Para 'distinto' usa `!=` o `<>`.",
    ejemploMal: "Proceso p\n  Definir edad Como Entero\n  edad = 18\n  Si edad = 18 Entonces\n    Escribir \"Mayor\"\n  FinSi\nFinProceso",
    ejemplo: "Proceso p\n  Definir edad Como Entero\n  edad = 18\n  Si edad == 18 Entonces\n    Escribir \"Mayor\"\n  FinSi\nFinProceso",
  },
  {
    titulo: "Sintaxis PSeInt no soportada",
    categoria: "Expresiones",
    sintoma: "Errores en código que se parece a PSeInt clásico: tipo no reconocido, operador inválido, palabra desconocida.",
    causa: "Usar `<-`, `Cadena`, `SiNo`, `MOD` o `DIV`, que no pertenecen al dialecto LiteSeInt.",
    arreglo: "Usa `=` para asignar, `Caracter` para texto, `Sino` para la rama alternativa y `mod` en minúscula. Para división entera usa `Trunc(a / b)`.",
    ejemploMal: "Proceso p\n  Definir nombre Como Cadena\n  nombre <- \"Ana\"\nFinProceso",
    ejemplo: "Proceso p\n  Definir nombre Como Caracter\n  nombre = \"Ana\"\nFinProceso",
  },
  {
    titulo: "Ciclo infinito",
    categoria: "Ciclos",
    sintoma: "Al ejecutar: `Bucle infinito: más de N iteraciones.` La ejecución se detiene.",
    causa: "La variable que controla la condición no se actualiza dentro del cuerpo del ciclo.",
    arreglo: "Actualiza dentro del ciclo la variable que controla la condición. Para `Mientras`, suma o resta; para `Repetir`, modifica antes del `Hasta Que`.",
    ejemploMal: "Proceso p\n  Definir i Como Entero\n  i = 0\n  Mientras i < 5 Hacer\n    Escribir i\n  FinMientras\nFinProceso",
    ejemplo: "Proceso p\n  Definir i Como Entero\n  i = 0\n  Mientras i < 5 Hacer\n    Escribir i\n    i = i + 1\n  FinMientras\nFinProceso",
  },
  {
    titulo: "Paso cero en Para",
    categoria: "Ciclos",
    sintoma: "El validador dice: `El valor de \"Paso\" no puede ser cero.`",
    causa: "Indicar `Con Paso 0`, lo que dejaría al ciclo sin avanzar.",
    arreglo: "Usa un paso distinto de cero. Positivo para subir, negativo para bajar. Sin `Con Paso`, avanza de uno en uno.",
    ejemploMal: "Proceso p\n  Definir i Como Entero\n  Para i = 1 Hasta 10 Con Paso 0 Hacer\n    Escribir i\n  FinPara\nFinProceso",
    ejemplo: "Proceso p\n  Definir i Como Entero\n  Para i = 1 Hasta 10 Con Paso 1 Hacer\n    Escribir i\n  FinPara\nFinProceso",
  },
];

const PROGRESO_KEY = "code4code:exerciseProgress";
const ESTADOS_PROGRESO = ["pendiente", "en-curso", "completado"];
const ESTADO_LABEL = {
  "pendiente": "Pendiente",
  "en-curso": "En curso",
  "completado": "Completado",
};

let progresoEjercicios = {};
let ejercicioSeleccionadoId = null;

async function cargarBancoEjerciciosDesdeJson() {
  if (!window.EjerciciosLiteSeInt || !window.EjerciciosLiteSeInt.cargarDesdeJson) {
    throw new Error("No se cargó js/ejercicios-data.js antes de js/app.js.");
  }
  await window.EjerciciosLiteSeInt.cargarDesdeJson();
}

function cargarProgreso() {
  try {
    const raw = lsGet(PROGRESO_KEY);
    progresoEjercicios = raw ? JSON.parse(raw) : {};
    if (typeof progresoEjercicios !== "object" || progresoEjercicios === null) {
      progresoEjercicios = {};
    }
  } catch (_) {
    progresoEjercicios = {};
  }
}

function guardarProgreso() {
  try {
    lsSet(PROGRESO_KEY, JSON.stringify(progresoEjercicios));
  } catch (_) {
    /* ignorar */
  }
}

function estadoEjercicio(id) {
  const v = progresoEjercicios[id];
  return ESTADOS_PROGRESO.includes(v) ? v : "pendiente";
}

function setEstadoEjercicio(id, estado) {
  if (!ESTADOS_PROGRESO.includes(estado)) return;
  if (estado === "pendiente") {
    delete progresoEjercicios[id];
  } else {
    progresoEjercicios[id] = estado;
  }
  guardarProgreso();
}

function ejerciciosVisibles() {
  if (!window.EjerciciosLiteSeInt) return [];
  return window.EjerciciosLiteSeInt.listarAdaptados().filter(
    (e) => NIVELES_VISIBLES.includes(e.nivelLiteSeInt),
  );
}

function ejerciciosPorIds(ids) {
  if (!window.EjerciciosLiteSeInt) return [];
  return ids
    .map((id) => window.EjerciciosLiteSeInt.porId(id))
    .filter(Boolean)
    .filter((e) => e.estadoAdaptacion === "adaptado");
}

function crearLinkEjercicio(ejercicio) {
  return $("<button>")
    .addClass("learning-doc-exercise")
    .attr("type", "button")
    .text(`${ejercicio.numero || ejercicio.id} · ${ejercicio.titulo}`)
    .on("click", () => {
      cambiarVistaAprendizaje("ejercicios");
      seleccionarEjercicio(ejercicio.id);
    });
}

const GRADO_AYUDA_LABEL = {
  "guiado": "Guiado",
  "con-pista": "Con pista",
  "practica": "Práctica",
  "desafio": "Desafío",
};

const GRADO_AYUDA_DESCRIPCION = {
  "guiado": "Observa el ejemplo, predice la salida y confirma qué hace cada instrucción.",
  "con-pista": "Resuelve con apoyo: identifica datos, completa pasos clave y usa la pista si te bloqueas.",
  "practica": "Resuelve el problema con poca ayuda y luego compara tu salida con la esperada.",
  "desafio": "Construye la solución completa, prueba casos normales y revisa casos borde.",
};

function textoGradoAyuda(grado) {
  return GRADO_AYUDA_DESCRIPCION[grado] || "Lee el enunciado, separa entrada/proceso/salida y prueba tu solución.";
}

function renderizarDocsComandos() {
  const $cont = $("#learningViewComandos");
  if (!$cont.length) return;
  $cont.empty();
  $cont.append($("<p>").addClass("learning-doc-intro").text(
    "Guía de comandos soportados por LiteSeInt: qué hace cada uno, cuándo usarlo, ejemplo mínimo, errores típicos y ejercicios para practicar.",
  ));

  DOC_COMANDOS.forEach((doc) => {
    const $card = $("<article>").addClass("learning-doc-card");

    const $trigger = $("<button>")
      .addClass("learning-doc-trigger")
      .attr("type", "button");
    $trigger.append($("<span>").text(doc.nombre));
    $trigger.append($("<span>").addClass("doc-chevron").text("▾"));
    $trigger.on("click", () => $card.toggleClass("is-open"));

    const $body = $("<div>").addClass("learning-doc-body");
    $body.append($("<p>").text(doc.descripcion));
    if (doc.detalle) {
      $body.append($("<div>").addClass("learning-doc-label").text("Cuándo usarlo"));
      $body.append($("<p>").text(doc.detalle));
    }
    $body.append($("<div>").addClass("learning-doc-label").text("Sintaxis"));
    $body.append($("<pre>").addClass("doc-pre-highlighted").html(resaltarCodigo(doc.sintaxis)));
    $body.append($("<div>").addClass("learning-doc-label").text("Ejemplo"));
    $body.append($("<pre>").addClass("doc-pre-highlighted").html(resaltarCodigo(doc.ejemplo)));
    if (doc.ejemplo2) {
      $body.append($("<div>").addClass("learning-doc-label").text("Otro ejemplo"));
      $body.append($("<pre>").addClass("doc-pre-highlighted").html(resaltarCodigo(doc.ejemplo2)));
    }
    if (doc.errores) {
      $body.append($("<div>").addClass("learning-doc-label").text("Errores típicos"));
      $body.append($("<p>").addClass("learning-doc-note").text(doc.errores));
    }
    const ejercicios = ejerciciosPorIds(doc.ejercicios);
    if (ejercicios.length) {
      const $recs = $("<div>").addClass("learning-doc-recs");
      $recs.append($("<div>").addClass("learning-doc-label").text("Practicar con"));
      ejercicios.forEach((e) => $recs.append(crearLinkEjercicio(e)));
      $body.append($recs);
    }

    $card.append($trigger);
    $card.append($body);
    $cont.append($card);
  });
}

function renderizarRutaEstudiante() {
  const $cont = $("#learningViewRuta");
  if (!$cont.length) return;
  $cont.empty();
  $cont.append($("<p>").addClass("learning-doc-intro").text(
    "Ruta de N1 a N7. Cada nivel describe qué aprender, qué comandos usar y cuándo es momento de avanzar.",
  ));

  NIVELES_LITESEINT.forEach((nivel) => {
    const ejercicios = ejerciciosVisibles().filter((e) => e.nivelLiteSeInt === nivel.id);
    const completados = ejercicios.filter((e) => estadoEjercicio(e.id) === "completado").length;
    const pct = ejercicios.length > 0 ? Math.round((completados / ejercicios.length) * 100) : 0;

    const comenzar = ejercicios
      .filter((e) => e.gradoAyuda === "guiado" || e.gradoAyuda === "con-pista")
      .filter((e) => e.dificultad === "basico")
      .slice(0, 2);
    const practicar = ejercicios
      .filter((e) => e.gradoAyuda === "practica")
      .slice(0, 2);
    const desafiar = ejercicios
      .filter((e) => e.gradoAyuda === "desafio")
      .slice(0, 1);

    const $card = $("<article>").addClass("learning-route-card");
    $card.append($("<div>").addClass("learning-route-num").text(`N${nivel.id}`));

    const $right = $("<div>").addClass("learning-route-right");
    const $trigger = $("<button>").addClass("learning-route-trigger").attr("type", "button");
    $trigger.append($("<span>").text(nivel.titulo));
    $trigger.append($("<span>").addClass("doc-chevron").text("▾"));
    $trigger.on("click", () => $card.toggleClass("is-open"));
    $right.append($trigger);

    const $body = $("<div>").addClass("learning-route-body");

    if (nivel.antes) {
      $body.append($("<p>").addClass("route-antes").text(`Antes: ${nivel.antes}`));
    }

    if (nivel.objetivo) $body.append($("<p>").text(nivel.objetivo));

    if (nivel.foco) {
      $body.append($("<div>").addClass("learning-doc-label").text("Foco"));
      $body.append($("<p>").text(nivel.foco));
    }

    if (nivel.comandosClave && nivel.comandosClave.length) {
      const $cmds = $("<div>").addClass("route-commands");
      nivel.comandosClave.forEach((cmd) => {
        $cmds.append($("<span>").addClass("route-cmd-badge").text(cmd));
      });
      $body.append($cmds);
    }

    const $prog = $("<div>").addClass("route-progress-wrap");
    $prog.append($("<div>").addClass("route-progress-text").text(
      `${completados} / ${ejercicios.length} completados`,
    ));
    const $bar = $("<div>").addClass("route-progress-bar");
    $bar.append($("<div>").addClass("route-progress-fill").css("width", `${pct}%`));
    $prog.append($bar);
    $body.append($prog);

    const agregarGrupo = (label, lista) => {
      if (!lista.length) return;
      const $recs = $("<div>").addClass("learning-doc-recs");
      $recs.append($("<div>").addClass("learning-doc-label").text(label));
      lista.forEach((e) => $recs.append(crearLinkEjercicio(e)));
      $body.append($recs);
    };
    agregarGrupo("Para comenzar", comenzar);
    agregarGrupo("Para practicar", practicar);
    agregarGrupo("Para desafiar", desafiar);

    if (nivel.siguiente) {
      $body.append($("<div>").addClass("learning-doc-label").text("Cuándo avanzar"));
      $body.append($("<p>").addClass("learning-doc-note").text(nivel.siguiente));
    }

    $right.append($body);
    $card.append($right);
    $cont.append($card);
  });
}

function renderizarErroresComunes() {
  const $cont = $("#learningViewErrores");
  if (!$cont.length) return;
  $cont.empty();
  $cont.append($("<p>").addClass("learning-doc-intro").text(
    "Guía de errores frecuentes: cómo reconocer el síntoma, por qué ocurre y cuál es la corrección más directa en el dialecto LiteSeInt.",
  ));

  const categorias = ["Estructura", "Variables", "Expresiones", "Ciclos"];
  categorias.forEach((cat) => {
    const items = DOC_ERRORES_COMUNES.filter((e) => e.categoria === cat);
    if (!items.length) return;
    $cont.append($("<div>").addClass("learning-doc-cat-label").text(cat));

    items.forEach((err) => {
      const $card = $("<article>").addClass("learning-doc-card");
      const $trigger = $("<button>").addClass("learning-doc-trigger").attr("type", "button");
      $trigger.append($("<span>").text(err.titulo));
      $trigger.append($("<span>").addClass("doc-chevron").text("▾"));
      $trigger.on("click", () => $card.toggleClass("is-open"));

      const $body = $("<div>").addClass("learning-doc-body");
      if (err.sintoma) $body.append($("<p>").append($("<b>").text("Síntoma: ")).append(document.createTextNode(err.sintoma)));
      $body.append($("<p>").append($("<b>").text("Causa: ")).append(document.createTextNode(err.causa)));
      $body.append($("<p>").append($("<b>").text("Corrección: ")).append(document.createTextNode(err.arreglo)));

      if (err.ejemploMal) {
        $body.append($("<div>").addClass("learning-doc-label learning-doc-label-bad").text("Ejemplo incorrecto"));
        $body.append($("<pre>").addClass("doc-pre-highlighted doc-pre-bad").html(resaltarCodigo(err.ejemploMal)));
      }
      $body.append($("<div>").addClass("learning-doc-label learning-doc-label-good").text(err.ejemploMal ? "Corrección" : "Ejemplo"));
      $body.append($("<pre>").addClass("doc-pre-highlighted").html(resaltarCodigo(err.ejemplo)));

      $card.append($trigger);
      $card.append($body);
      $cont.append($card);
    });
  });
}

function renderizarAprendizajeIntegrado() {
  renderizarDocsComandos();
  renderizarRutaEstudiante();
  renderizarErroresComunes();
}

function cambiarVistaAprendizaje(view) {
  $(".learning-tab").toggleClass("active", false);
  $(`.learning-tab[data-learning-view="${view}"]`).addClass("active");
  $(".learning-view").removeClass("active");
  $(`[data-learning-panel-view="${view}"]`).addClass("active");
  $("#btnToggleEjListaHeader").toggle(view === "ejercicios");
}

function initLearningTabs() {
  $(document).on("click", ".learning-tab", function () {
    cambiarVistaAprendizaje(this.dataset.learningView);
  });
}

function poblarFiltroNivel() {
  const group = document.getElementById('ejFiltroNivelGroup');
  if (!group) return;
  const activeVal = group.querySelector('.ej-pill.active')?.dataset.val ?? '';
  group.innerHTML = '';

  const label = document.createElement('span');
  label.className = 'ej-filter-label';
  label.textContent = 'Nivel:';
  group.appendChild(label);

  const allBtn = document.createElement('button');
  allBtn.className = 'ej-pill' + (activeVal === '' ? ' active' : '');
  allBtn.dataset.filter = 'nivel';
  allBtn.dataset.val = '';
  allBtn.textContent = 'Todo';
  group.appendChild(allBtn);

  const presentes = new Set(ejerciciosVisibles().map((e) => e.nivelLiteSeInt));
  for (const n of NIVELES_LITESEINT) {
    if (!presentes.has(n.id)) continue;
    const btn = document.createElement('button');
    btn.className = 'ej-pill' + (activeVal === String(n.id) ? ' active' : '');
    btn.dataset.filter = 'nivel';
    btn.dataset.val = String(n.id);
    btn.textContent = `N${n.id}`;
    group.appendChild(btn);
  }
}

function aplicarFiltros(lista) {
  const nivel = document.querySelector('#ejFiltroNivelGroup .ej-pill.active')?.dataset.val ?? '';
  const dif   = document.querySelector('#ejFiltroDifGroup .ej-pill.active')?.dataset.val ?? '';
  const estado = document.querySelector('#ejFiltroEstadoGroup .ej-pill.active')?.dataset.val ?? '';
  return lista.filter((e) => {
    if (nivel !== '' && String(e.nivelLiteSeInt) !== nivel) return false;
    if (dif   !== '' && e.dificultad !== dif) return false;
    if (estado !== '' && estadoEjercicio(e.id) !== estado) return false;
    return true;
  });
}

function renderizarResumenProgreso() {
  const $cont = $("#ejProgresoResumen");
  if (!$cont.length) return;
  const visibles = ejerciciosVisibles();
  const total = visibles.length;
  const conteo = {
    "completado": 0,
    "en-curso": 0,
    "pendiente": 0,
  };
  for (const e of visibles) {
    const st = estadoEjercicio(e.id);
    conteo[st] = (conteo[st] || 0) + 1;
  }
  const completados = conteo.completado;
  const enCurso = conteo["en-curso"];
  const pendientes = conteo.pendiente;
  const tooltip = [
    `Completados: ${completados}`,
    `En progreso: ${enCurso}`,
    `Pendientes: ${pendientes}`,
    `Total: ${total}`,
  ].join("\n");
  const crearTramo = (cantidad, estado, etiqueta) => {
    const proporcion = total > 0 ? cantidad / total : 0;
    const ancho = proporcion * 100;
    return `<span class="ej-progress-segment ${estado}" style="--seg-width:${ancho}%" aria-label="${etiqueta}: ${cantidad}"><span>${cantidad}</span></span>`;
  };

  $cont
    .attr("title", tooltip)
    .attr("data-tooltip", tooltip)
    .html(
      `<div class="ej-progress-head">` +
        `<span class="ej-progress-label">progreso:</span>` +
        `<button class="btn-toggle-ej-lista" id="btnToggleEjListaProgress" type="button" title="Ocultar lista de ejercicios" aria-label="Ocultar lista de ejercicios">◀</button>` +
      `</div>` +
      `<div class="ej-progress-modern-bar" aria-label="${tooltip}">` +
        crearTramo(completados, "done", "Completados") +
        crearTramo(enCurso, "running", "En curso") +
        crearTramo(pendientes, "pending", "Pendientes") +
      `</div>`,
    );

  const collapsed = document.querySelector('.ej-workspace')?.classList.contains('ej-lista-colapsada');
  setEjListaVisible(!collapsed);
}

function renderizarListaEjercicios() {
  const $lista = $("#ejList");
  if (!$lista.length) return;
  const visibles = aplicarFiltros(ejerciciosVisibles());
  $lista.empty();

  if (visibles.length === 0) {
    $lista.append(
      $("<li>")
        .addClass("ej-empty")
        .text("No hay ejercicios con esos filtros."),
    );
    return;
  }

  visibles.forEach((e) => {
    const estado = estadoEjercicio(e.id);
    const $item = $("<li>")
      .addClass("ej-item")
      .addClass(`estado-${estado}`)
      .attr("data-id", e.id)
      .attr("role", "button")
      .attr("tabindex", "0");
    if (e.id === ejercicioSeleccionadoId) $item.addClass("selected");

    const $content = $("<div>").addClass("ej-item-content");
    const $head = $("<div>").addClass("ej-item-head");
    $head.append($("<span>").addClass("ej-item-numero").text(e.numero));
    $head.append($("<span>").addClass("ej-item-dif").addClass(`dif-${e.dificultad}`).text(e.dificultad));
    $head.append($("<span>").addClass(`ej-item-estado est-${estado}`).text(ESTADO_LABEL[estado]));
    $content.append($head);
    $content.append($("<p>").addClass("ej-item-titulo").text(e.titulo));
    const conceptos = (e.conceptos || []).slice(0, 4).join(" · ");
    if (conceptos) {
      $content.append($("<p>").addClass("ej-item-conceptos").text(conceptos));
    }

    $item.append($content);
    $lista.append($item);
  });
}

function renderizarEstadoCargaEjercicios(mensaje) {
  $("#ejList").empty().append($("<li>").addClass("ej-empty").text(mensaje));
  $("#ejProgresoResumen").empty();
}

function mostrarDetalleEjercicio(id) {
  const $det = $("#ejDetail");
  if (!$det.length) return;
  const e = window.EjerciciosLiteSeInt
    ? window.EjerciciosLiteSeInt.porId(id)
    : null;
  if (!e) {
    $det.html('<p class="ej-detail-empty">Selecciona un ejercicio para ver su enunciado.</p>');
    return;
  }

  ejercicioSeleccionadoId = e.id;
  const estado = estadoEjercicio(e.id);

  $det.empty();
  const $tags = $("<div>").addClass("ej-detail-tags");
  $tags.append($("<span>").addClass("ej-tag ej-tag-numero").text(e.numero));
  $tags.append($("<span>").addClass(`ej-tag ej-tag-dif dif-${e.dificultad}`).text(e.dificultad));
  $tags.append($("<span>").addClass(`ej-tag est-${estado}`).text(ESTADO_LABEL[estado]));
  if (e.codigoReferencia) {
    const $btnRef = $("<button>")
      .addClass("ej-ref-code-btn")
      .attr("type", "button")
      .attr("aria-label", "Ver código de referencia y reemplazar el editor")
      .attr("data-tooltip", "Ver código de referencia:\nReemplaza el contenido del editor previa confirmación")
      .html(`
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      `)
      .on("click", () => cargarCodigoReferencia(e));
    $tags.append($btnRef);
  }
  $det.append($tags);

  if (e.conceptos && e.conceptos.length) {
    const $cs = $("<p>").addClass("ej-conceptos-list");
    $cs.append($("<span>").addClass("ej-section-label").text("Conceptos: "));
    $cs.append(document.createTextNode(e.conceptos.join(", ")));
    $det.append($cs);
  }

  $det.append($("<h4>").text(e.panelTitulo || e.titulo));

  const $enunciadoBox = $("<section>").addClass("ej-enunciado-box");
  $enunciadoBox.append($("<p>").addClass("ej-section-label").text("Enunciado"));
  const $enunciado = $("<p>").addClass("ej-enunciado");
  if (e.enunciadoHtml) $enunciado.html(e.enunciadoHtml);
  else $enunciado.text(e.enunciado);
  $enunciadoBox.append($enunciado);
  const ayudaLabel = GRADO_AYUDA_LABEL[e.gradoAyuda] || e.gradoAyuda;
  $enunciadoBox.append(
    $("<p>")
      .addClass("ej-enunciado-guia")
      .append($("<b>").text(`${ayudaLabel}: `))
      .append(document.createTextNode(textoGradoAyuda(e.gradoAyuda))),
  );
  $det.append($enunciadoBox);

  const crearEps = () => {
    if (!e.entradaProcesoSalida) return null;
    const eps = e.entradaProcesoSalida;
    const $eps = $("<div>").addClass("ej-eps");
    $eps.append($("<p>").addClass("ej-section-label").text("Entrada · Proceso · Salida"));
    if (eps.entrada) $eps.append($("<div>").addClass("ej-eps-row").html('<b>E:</b> ').append(document.createTextNode(eps.entrada)));
    if (eps.proceso) $eps.append($("<div>").addClass("ej-eps-row").html('<b>P:</b> ').append(document.createTextNode(eps.proceso)));
    if (eps.salida) $eps.append($("<div>").addClass("ej-eps-row").html('<b>S:</b> ').append(document.createTextNode(eps.salida)));
    return $eps;
  };

  if (e.entradaProcesoSalida) {
    if (e.pista) {
      const $pista = $("<details>").addClass("ej-pista");
      $pista.append($("<summary>").text("Ver pista"));
      const $pistaTexto = $("<p>");
      if (e.pistaHtml) $pistaTexto.html(e.pistaHtml);
      else $pistaTexto.text(e.pista);
      $pista.append($pistaTexto);
      $pista.append(crearEps());
      $det.append($pista);
    } else {
      $det.append(crearEps());
    }
  } else if (e.pista) {
    const $pista = $("<details>").addClass("ej-pista");
    $pista.append($("<summary>").text("Ver pista"));
    const $pistaTexto = $("<p>");
    if (e.pistaHtml) $pistaTexto.html(e.pistaHtml);
    else $pistaTexto.text(e.pista);
    $pista.append($pistaTexto);
    $det.append($pista);
  }

  if (e.salidaEsperada) {
    const $se = $("<div>").addClass("ej-salida");
    $se.append($("<p>").addClass("ej-section-label").text("Salida esperada"));
    $se.append($("<pre>").text(e.salidaEsperada));
    $det.append($se);
  }

  // Estado del ejercicio
  const $estado = $("<div>").addClass("ej-estado-control");
  $estado.append($("<p>").addClass("ej-section-label").text("Marcar como"));
  for (const st of ESTADOS_PROGRESO) {
    const $b = $("<button>")
      .addClass("ej-btn-estado")
      .addClass(`est-${st}`)
      .toggleClass("selected", st === estado)
      .text(ESTADO_LABEL[st])
      .on("click", () => {
        setEstadoEjercicio(e.id, st);
        renderizarListaEjercicios();
        renderizarResumenProgreso();
        renderizarRutaEstudiante();
        mostrarDetalleEjercicio(e.id);
      });
    $estado.append($b);
  }
  $det.append($estado);
}

function plantillaInicial(ejercicio) {
  const nombre = (ejercicio.titulo || "ejercicio")
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9]/, "p_$&") || "ejercicio";
  return `Proceso ${nombre}\n  // ${ejercicio.titulo}\n  // Enunciado: revisa el panel de aprendizaje.\n\n\nFinProceso`;
}

function reemplazarEditorConfirmando(nuevoCodigo, mensaje, siempreConfirmar = false, opciones = {}) {
  const editor = document.getElementById("editor");
  if (!editor) return Promise.resolve(false);
  const actual = editor.value;
  const limpio = actual.trim();
  const placeholder = ESTRUCTURA_INICIAL.trim();

  const reemplazar = () => {
    registrarHistorialEditor();
    editor.value = nuevoCodigo;
    limpiarConsola();
    actualizarLineas();
    if (typeof opciones.afterReplace === "function") {
      opciones.afterReplace(editor);
    }
    editor.focus();
  };

  if (opciones.omitirConfirmacion) {
    reemplazar();
    return Promise.resolve(true);
  }

  if (!siempreConfirmar && (limpio === "" || limpio === placeholder)) {
    reemplazar();
    return Promise.resolve(true);
  }

  if (typeof Swal !== "undefined") {
    return liteSwal({
      icon: opciones.icon || "warning",
      title: opciones.title || "¿Reemplazar el código actual?",
      text: mensaje,
      showCancelButton: true,
      confirmButtonText: opciones.confirmButtonText || "Reemplazar",
      cancelButtonText: opciones.cancelButtonText || "Cancelar",
    }).then((res) => {
      if (res && res.isConfirmed) {
        reemplazar();
        return true;
      }
      return false;
    });
  }

  if (window.confirm(mensaje + "\n\n¿Reemplazar el código actual?")) {
    reemplazar();
    return Promise.resolve(true);
  }
  return Promise.resolve(false);
}

function cargarPlantillaEjercicio(ejercicio) {
  reemplazarEditorConfirmando(
    plantillaInicial(ejercicio),
    "Se reemplazará el contenido del editor por una plantilla en blanco para este ejercicio.",
    false,
    {
      title: "¿Cargar plantilla?",
      confirmButtonText: "Cargar plantilla",
    },
  );
}

function cargarCodigoReferencia(ejercicio) {
  if (!ejercicio.codigoReferencia) return;
  reemplazarEditorConfirmando(
    ejercicio.codigoReferencia,
    "Se reemplazará el contenido del editor por el código de referencia. Se recomienda intentar resolver el ejercicio antes de mirar la solución.",
    true,
    {
      title: "¿Ver código de referencia?",
      confirmButtonText: "Ver referencia",
    },
  );
}

function seleccionarEjercicio(id) {
  ejercicioSeleccionadoId = id;
  $(".ej-item").removeClass("selected");
  $(`.ej-item[data-id="${id}"]`).addClass("selected");
  mostrarDetalleEjercicio(id);
}

async function inicializarBancoEjercicios() {
  cargarProgreso();
  renderizarEstadoCargaEjercicios("Cargando ejercicios desde JSON...");
  try {
    await cargarBancoEjerciciosDesdeJson();
  } catch (err) {
    console.error(err);
    renderizarEstadoCargaEjercicios("No se pudieron cargar los ejercicios desde los archivos JSON.");
    $("#ejDetail").html(
      '<p class="ej-detail-empty">Revisa que la página se esté sirviendo desde un servidor local y que el archivo JSON exista.</p>',
    );
    return;
  }
  poblarFiltroNivel();
  renderizarListaEjercicios();
  renderizarResumenProgreso();
  renderizarAprendizajeIntegrado();

  $(document).on("click", ".ej-pill", function () {
    const filter = this.dataset.filter;
    const groupId = filter === 'nivel' ? 'ejFiltroNivelGroup'
                  : filter === 'dif'   ? 'ejFiltroDifGroup'
                  : 'ejFiltroEstadoGroup';
    document.querySelectorAll(`#${groupId} .ej-pill`).forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    renderizarListaEjercicios();
  });
}

// =========================================
// 11.c CONSOLA REDIMENSIONABLE
// =========================================

const CONSOLE_HEIGHT_KEY = "code4code:consoleHeight";
const CONSOLE_MIN_PX = 96;

function clampConsoleHeight(px) {
  const workspace = document.querySelector(".workspace-column");
  if (!workspace) return px;
  const total = workspace.getBoundingClientRect().height;
  const handle = document.getElementById("consoleResizeHandle");
  const handleH = handle ? handle.getBoundingClientRect().height : 6;
  const editorMin = 120;
  const max = Math.max(CONSOLE_MIN_PX, total - editorMin - handleH);
  return Math.min(Math.max(px, CONSOLE_MIN_PX), max);
}

function aplicarAlturaConsola(px) {
  const panel = document.getElementById("consolePanel");
  if (!panel) return;
  const altura = clampConsoleHeight(px);
  panel.style.height = `${altura}px`;
  scheduleIndentGuideRender({ remeasure: true });
}

function cargarAlturaConsolaPersistida() {
  const v = lsGet(CONSOLE_HEIGHT_KEY);
  if (!v) return;
  const px = parseInt(v, 10);
  if (Number.isFinite(px) && px > 0) aplicarAlturaConsola(px);
}

function guardarAlturaConsola(px) {
  lsSet(CONSOLE_HEIGHT_KEY, String(Math.round(px)));
}

function inicializarResizeConsola() {
  const handle = document.getElementById("consoleResizeHandle");
  const panel = document.getElementById("consolePanel");
  if (!handle || !panel) return;

  let dragging = false;
  let startY = 0;
  let startH = 0;

  const onPointerMove = (e) => {
    if (!dragging) return;
    const delta = startY - e.clientY;
    aplicarAlturaConsola(startH + delta);
  };

  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    const final = panel.getBoundingClientRect().height;
    guardarAlturaConsola(final);
  };

  handle.addEventListener("pointerdown", (e) => {
    if (mobileConsoleQuery.matches) return;
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startH = panel.getBoundingClientRect().height;
    handle.classList.add("dragging");
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });

  handle.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 32 : 8;
    const current = panel.getBoundingClientRect().height;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      aplicarAlturaConsola(current + step);
      guardarAlturaConsola(panel.getBoundingClientRect().height);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      aplicarAlturaConsola(current - step);
      guardarAlturaConsola(panel.getBoundingClientRect().height);
    }
  });
}

// =========================================
// 12. INIT
// =========================================

$(document).ready(function () {
  const editor = document.getElementById("editor");
  editor.value = ESTRUCTURA_INICIAL;
  actualizarLineas();
  initLanguageSelect();
  initTheme();
  restorePanelOrder();
  cargarAnchoLearningPanelPersistido();
  initPanelDrag();
  inicializarResizeLearningPanel();
  initEjListaToggle();
  initLearningTabs();
  initConsoleTabs();

  if (typeof LiteSeIntDiagramaUI !== 'undefined') {
    LiteSeIntDiagramaUI.inicializarDiagrama();
  }

  document.addEventListener('liteseint:diagramEdit', function (e) {
    const editor = document.getElementById('editor');
    if (editor && e.detail && e.detail.codigo) {
      editor.value = e.detail.codigo;
      actualizarLineas();
      validarYDecorar();
    }
  });

  const pos = ESTRUCTURA_INICIAL.indexOf("\n") + 1;
  editor.setSelectionRange(pos, pos);
  editor.focus();
  actualizarIndentGuides({ remeasure: true });

  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      actualizarIndentGuides({ remeasure: true });
    });
    resizeObserver.observe(editor);
    const editorArea = editor.parentElement;
    if (editorArea) resizeObserver.observe(editorArea);
  }

  window.addEventListener("resize", () => {
    actualizarIndentGuides({ remeasure: true });
    const panel = document.querySelector('.learning-panel');
    if (panel && !mobileConsoleQuery.matches) {
      aplicarAnchoLearningPanel(panel.getBoundingClientRect().width, { autoColapsar: true });
    }
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      actualizarIndentGuides({ remeasure: true });
    });
  }

  editor.addEventListener("beforeinput", function (e) {
    if (e.inputType === "historyUndo") {
      e.preventDefault();
      deshacerEditor();
      return;
    }
    if (e.inputType === "historyRedo") {
      e.preventDefault();
      rehacerEditor();
      return;
    }

    const val = this.value;
    const s = this.selectionStart;
    const se = this.selectionEnd;
    const lastNL = val.lastIndexOf("\nFinProceso");
    if (lastNL < 0) return;

    const isBackward = ['deleteContentBackward','deleteWordBackward','deleteSoftLineBackward','deleteHardLineBackward'].includes(e.inputType);
    const isForward  = ['deleteContentForward','deleteWordForward','deleteSoftLineForward','deleteHardLineForward'].includes(e.inputType);

    let rStart = s;
    let rEnd = se;
    if (isBackward && s === se) rStart = s - 1;
    if (isForward && s === se) rEnd = se + 1;

    if (rStart < PROCESO_PREFIX_LEN || rEnd > lastNL) {
      e.preventDefault();
      return;
    }

    registrarHistorialEditor(this);
  });

  $("#btnEjecutar").on("click", ejecutar);
  $("#btnDetener").on("click", detener);
  $("#btnLimpiarConsola").on("click", limpiarConsolaConfirmando);
  $("#btnLimpiarTodo").on("click", limpiarTodo);
  $("#btnDescargar").on("click", descargar);
  $("#btnImportar").on("click", () => {
    const input = document.getElementById("inputImportarPsc");
    if (input) input.click();
  });
  $("#inputImportarPsc").on("change", function () {
    const file = this.files && this.files[0];
    importarArchivoPsc(file);
    this.value = "";
  });
  $("#btnTheme").on("click", cycleTheme);
  initConsoleEchoToggle();
  $(".console-header").on("click", function (e) {
    if ($(e.target).closest(".console-header-actions, button").length) return;
    toggleMobileConsoleCollapsed();
  });

  const handleMobileConsoleChange = () => {
    if (!mobileConsoleQuery.matches) {
      setMobileConsoleCollapsed(false);
    }
  };

  if (mobileConsoleQuery.addEventListener) {
    mobileConsoleQuery.addEventListener("change", handleMobileConsoleChange);
  } else if (mobileConsoleQuery.addListener) {
    mobileConsoleQuery.addListener(handleMobileConsoleChange);
  }

  $("#ejemplosSelect").on("change", function () {
    const nombre = $(this).val();
    if (!nombre) return;
    cargarEjemplo(nombre).finally(() => {
      $(this).val("");
    });
  });

  // Banco de ejercicios: filtros, listado, detalle y progreso local
  inicializarBancoEjercicios();
  $(document).on("click", ".ej-item", function () {
    const id = $(this).attr("data-id");
    if (id) seleccionarEjercicio(id);
  });
  $(document).on("keydown", ".ej-item", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const id = $(this).attr("data-id");
      if (id) seleccionarEjercicio(id);
    }
  });
  $("#learningPanelToggle").on("click", function (e) {
    e.stopPropagation();
    $("#learningPanel").toggleClass("collapsed");
  });

  // Consola redimensionable
  inicializarResizeConsola();
  cargarAlturaConsolaPersistida();
  window.addEventListener("resize", () => {
    const panel = document.getElementById("consolePanel");
    if (panel) {
      aplicarAlturaConsola(panel.getBoundingClientRect().height);
    }
  });
});
