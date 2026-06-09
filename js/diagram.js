/**
 * ============================================================
 *  diagram.js — NS Diagram Renderer (v1.9.0)
 * ============================================================
 *  Renders Nassi-Shneiderman diagrams from a DiagramaNodo tree
 *  produced by LiteSeIntDiagrama.astADiagrama().
 *
 *  Public API (attached to window):
 *    LiteSeIntDiagramaUI.inicializarDiagrama()
 *    LiteSeIntDiagramaUI.refrescarDiagrama(codigo)
 *
 *  Depends on: core/ast.js, core/parser.js, core/diagram-mapper.js
 * ============================================================
 */

(function () {
  'use strict';

  // ── Layout constants ─────────────────────────────────────────
  var ROW  = 26;   // standard row height (px)
  var PAD  = 6;    // horizontal text padding (px)
  var IND  = 10;   // loop body left-indent (px)
  var FS   = 11;   // font size (px) — must match .ns-label in CSS
  var CH   = 6.3;  // approx char width at FS px JetBrains Mono

  function _clip(text, w) {
    var max = Math.max(3, Math.floor((w - PAD * 2) / CH));
    return text.length <= max ? text : text.slice(0, max - 1) + '…';
  }

  // ── Height calculator (pure, no DOM) ─────────────────────────

  function _alturaBloque(nodos, w) {
    return nodos.reduce(function (s, n) { return s + _altura(n, w); }, 0);
  }

  function _altura(nodo, w) {
    if (!nodo) return 0;
    switch (nodo.tipo) {
      case 'Leaf':
      case 'Io':
      case 'Desconocido':
        return ROW;

      case 'Si': {
        var wH = Math.floor(w / 2);
        var hT = Math.max(ROW, _alturaBloque((nodo.hijos[0] || {hijos:[]}).hijos, wH));
        var hF = Math.max(ROW, _alturaBloque((nodo.hijos[1] || {hijos:[]}).hijos, w - wH));
        return ROW * 2 + Math.max(hT, hF);
      }

      case 'BucleMientras':
      case 'BuclePara':
        return ROW + Math.max(ROW, _alturaBloque(nodo.hijos, w - IND));

      case 'BucleRepetir':
        return Math.max(ROW, _alturaBloque(nodo.hijos, w - IND)) + ROW;

      case 'Segun': {
        var n   = nodo.hijos.length || 1;
        var wC  = Math.floor(w / n);
        var hC  = Math.max.apply(null, nodo.hijos.map(function (c) {
          return Math.max(ROW, _alturaBloque(c.hijos, wC));
        }));
        return ROW + ROW + hC;
      }

      case 'Proceso':
      case 'SubProceso':
        return ROW + Math.max(ROW, _alturaBloque(nodo.hijos, w)) + ROW;

      case 'Programa':
        return _alturaBloque(nodo.hijos, w);

      default:
        return ROW;
    }
  }

  // ── SVG helpers ──────────────────────────────────────────────

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function _el(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function _rect(g, x, y, w, h, cls) {
    g.appendChild(_el('rect', { x: x, y: y, width: Math.max(1, w), height: Math.max(1, h), 'class': cls }));
  }

  function _txt(g, x, y, text, cls) {
    var el = _el('text', { x: x, y: y + ROW - 8, 'class': cls || 'ns-label' });
    el.textContent = text;
    g.appendChild(el);
  }

  function _vline(g, x, y1, y2) {
    g.appendChild(_el('line', { x1: x, y1: y1, x2: x, y2: y2, 'class': 'ns-line' }));
  }

  // ── Renderer ─────────────────────────────────────────────────

  function _renderBloque(g, nodos, x, y, w, onEdit) {
    var cy = y;
    nodos.forEach(function (n) {
      _renderNodo(g, n, x, cy, w, onEdit);
      cy += _altura(n, w);
    });
  }

  function _renderNodo(g, nodo, x, y, w, onEdit) {
    switch (nodo.tipo) {

      case 'Io':
      case 'Leaf':
      case 'Desconocido': {
        var cls = { Io: 'ns-io', Desconocido: 'ns-unknown' }[nodo.tipo] || 'ns-leaf';
        _rect(g, x, y, w, ROW, cls);
        _txt(g, x + PAD, y, _clip(nodo.etiqueta, w), 'ns-label');
        if (nodo.editable) _editHit(g, nodo, x, y, w, ROW, onEdit);
        break;
      }

      case 'Si': {
        var wL = Math.floor(w / 2);
        var wR = w - wL;
        var hijoV = (nodo.hijos[0] || {hijos:[]});
        var hijoF = (nodo.hijos[1] || {hijos:[]});
        var hT = Math.max(ROW, _alturaBloque(hijoV.hijos, wL));
        var hF = Math.max(ROW, _alturaBloque(hijoF.hijos, wR));
        var hMax = Math.max(hT, hF);

        // header
        _rect(g, x, y, w, ROW, 'ns-si-head');
        _txt(g, x + PAD, y, 'Si ' + _clip(nodo.etiqueta, w - 40), 'ns-label');
        if (nodo.editable) _editHit(g, nodo, x, y, w, ROW, onEdit);

        // diagonal lines inside header
        g.appendChild(_el('line', { x1: x, y1: y, x2: x + wL, y2: y + ROW, 'class': 'ns-line' }));
        g.appendChild(_el('line', { x1: x + wL, y1: y + ROW, x2: x + w, y2: y, 'class': 'ns-line' }));

        // branch label row
        var yBL = y + ROW;
        _rect(g, x, yBL, wL, ROW, 'ns-si-rama');
        _txt(g, x + PAD, yBL, 'V', 'ns-rama-lbl');
        _rect(g, x + wL, yBL, wR, ROW, 'ns-si-rama');
        _txt(g, x + wL + PAD, yBL, 'F', 'ns-rama-lbl');

        // bodies
        var yB = yBL + ROW;
        _rect(g, x, yB, wL, hMax, 'ns-si-body');
        _renderBloque(g, hijoV.hijos, x, yB, wL, onEdit);
        _rect(g, x + wL, yB, wR, hMax, 'ns-si-body');
        _renderBloque(g, hijoF.hijos, x + wL, yB, wR, onEdit);
        _vline(g, x + wL, yBL, yB + hMax);
        break;
      }

      case 'BucleMientras':
      case 'BuclePara': {
        var wB = w - IND;
        var hCuerpo = Math.max(ROW, _alturaBloque(nodo.hijos, wB));
        _rect(g, x, y, w, ROW, 'ns-loop-head');
        _txt(g, x + PAD, y, '⟳ ' + _clip(nodo.etiqueta, w - 30), 'ns-label');
        if (nodo.editable) _editHit(g, nodo, x, y, w, ROW, onEdit);
        _rect(g, x + IND, y + ROW, wB, hCuerpo, 'ns-loop-body');
        _renderBloque(g, nodo.hijos, x + IND, y + ROW, wB, onEdit);
        break;
      }

      case 'BucleRepetir': {
        var wBR = w - IND;
        var hCuerpoR = Math.max(ROW, _alturaBloque(nodo.hijos, wBR));
        _rect(g, x + IND, y, wBR, hCuerpoR, 'ns-loop-body');
        _renderBloque(g, nodo.hijos, x + IND, y, wBR, onEdit);
        _rect(g, x, y + hCuerpoR, w, ROW, 'ns-loop-head');
        _txt(g, x + PAD, y + hCuerpoR, '⟳ ' + _clip(nodo.etiqueta, w - 30), 'ns-label');
        if (nodo.editable) _editHit(g, nodo, x, y + hCuerpoR, w, ROW, onEdit);
        break;
      }

      case 'Segun': {
        var nRamas = nodo.hijos.length || 1;
        var wRama  = Math.floor(w / nRamas);
        var hCasos = Math.max.apply(null, nodo.hijos.map(function (c) {
          return Math.max(ROW, _alturaBloque(c.hijos, wRama));
        }));

        _rect(g, x, y, w, ROW, 'ns-segun-head');
        _txt(g, x + PAD, y, 'Segun ' + _clip(nodo.etiqueta, w - 60), 'ns-label');
        if (nodo.editable) _editHit(g, nodo, x, y, w, ROW, onEdit);

        var yLbl = y + ROW;
        var cx   = x;
        nodo.hijos.forEach(function (caso, i) {
          var wC = (i === nRamas - 1) ? (x + w - cx) : wRama;
          _rect(g, cx, yLbl, wC, ROW, 'ns-caso-lbl');
          _txt(g, cx + PAD, yLbl, _clip(caso.etiqueta, wC), 'ns-label-dim');
          _rect(g, cx, yLbl + ROW, wC, hCasos, 'ns-si-body');
          _renderBloque(g, caso.hijos, cx, yLbl + ROW, wC, onEdit);
          if (i < nRamas - 1) _vline(g, cx + wC, yLbl, yLbl + ROW + hCasos);
          cx += wC;
        });
        break;
      }

      case 'Proceso':
      case 'SubProceso': {
        var hBody = Math.max(ROW, _alturaBloque(nodo.hijos, w));
        _rect(g, x, y, w, ROW, 'ns-proc-head');
        _txt(g, x + PAD, y, _clip(nodo.etiqueta, w - 10), 'ns-label-bold');
        _rect(g, x, y + ROW, w, hBody, 'ns-proc-body');
        _renderBloque(g, nodo.hijos, x, y + ROW, w, onEdit);
        _rect(g, x, y + ROW + hBody, w, ROW, 'ns-proc-head');
        var finLabel = nodo.tipo === 'SubProceso' ? 'FinSubProceso' : 'FinProceso';
        _txt(g, x + PAD, y + ROW + hBody, finLabel, 'ns-label-bold');
        break;
      }

      case 'Programa': {
        var cy = y;
        nodo.hijos.forEach(function (h) {
          _renderNodo(g, h, x, cy, w, onEdit);
          cy += _altura(h, w);
        });
        break;
      }
    }
  }

  function _editHit(g, nodo, x, y, w, h, onEdit) {
    var hit = _el('rect', {
      x: x, y: y,
      width: Math.max(1, w), height: Math.max(1, h),
      'class': 'ns-edit-hit',
    });
    hit.addEventListener('click', function (e) {
      e.stopPropagation();
      if (onEdit) onEdit(nodo, x, y, w, h);
    });
    g.appendChild(hit);
  }

  // ── Public renderer ──────────────────────────────────────────

  function _crearSVG(diagrama, W, onEdit) {
    var H = _altura(diagrama.raiz, W);
    var svg = _el('svg', {
      width: W, height: Math.max(H, 20),
      viewBox: '0 0 ' + W + ' ' + Math.max(H, 20),
      'class': 'ns-diagram',
    });
    _renderNodo(svg, diagrama.raiz, 0, 0, W, onEdit);
    return svg;
  }

  // ── Edit overlay ─────────────────────────────────────────────

  function _mostrarInput(contenedor, nodo, svgX, svgY, svgW, svgH, onConfirm) {
    var svg = contenedor.querySelector('svg.ns-diagram');
    if (!svg) return;
    var svgRect  = svg.getBoundingClientRect();
    var contRect = contenedor.getBoundingClientRect();
    var scaleX   = svgRect.width  / (parseFloat(svg.getAttribute('width'))  || svgRect.width);
    var scaleY   = svgRect.height / (parseFloat(svg.getAttribute('height')) || svgRect.height);

    var input = document.createElement('input');
    input.type = 'text';
    input.value = nodo.etiqueta || '';
    input.className = 'ns-edit-input';
    Object.assign(input.style, {
      position: 'absolute',
      left:   (svgRect.left - contRect.left + svgX * scaleX) + 'px',
      top:    (svgRect.top  - contRect.top  + svgY * scaleY) + 'px',
      width:  (svgW * scaleX) + 'px',
      height: (svgH * scaleY) + 'px',
      zIndex: '200',
    });

    contenedor.appendChild(input);
    input.focus();
    input.select();

    var done = false;
    function commit() {
      if (done) return;
      done = true;
      var val = input.value.trim();
      input.remove();
      if (val && val !== nodo.etiqueta) onConfirm(val);
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter')  { commit(); }
      if (e.key === 'Escape') { done = true; input.remove(); }
    });
    input.addEventListener('blur', commit);
  }

  // ── State & public API ───────────────────────────────────────

  var _lastCodigo = '';

  function inicializarDiagrama() {
    var contenedor = document.getElementById('diagramaView');
    if (contenedor) {
      contenedor.style.position = 'relative';
      contenedor.style.overflow = 'auto';
    }
  }

  function refrescarDiagrama(codigo) {
    var contenedor = document.getElementById('diagramaView');
    if (!contenedor) return;

    _lastCodigo = codigo || '';

    contenedor.innerHTML = '';
    contenedor.style.position = 'relative';

    if (!_lastCodigo.trim()) {
      contenedor.innerHTML = '<div class="inspector-placeholder">El diagrama aparece aquí cuando hay código.</div>';
      return;
    }

    var ast;
    try { ast = LiteSeIntParser.parsearPrograma(_lastCodigo); }
    catch (e) {
      contenedor.innerHTML = '<div class="inspector-placeholder">Error al leer el código.</div>';
      return;
    }

    var diagrama;
    try { diagrama = LiteSeIntDiagrama.astADiagrama(ast); }
    catch (e) {
      contenedor.innerHTML = '<div class="inspector-placeholder">No se pudo generar el diagrama.</div>';
      return;
    }

    var W = contenedor.clientWidth || 400;

    function onEdit(nodo, x, y, w, h) {
      _mostrarInput(contenedor, nodo, x, y, w, h, function (nuevoValor) {
        if (nodo._nodoAST && nodo._campoAST && nodo._nodoAST[nodo._campoAST] !== undefined) {
          nodo._nodoAST[nodo._campoAST] = nuevoValor;
        }
        nodo.etiqueta = nuevoValor;
        var nuevoCodigo = LiteSeIntDiagrama.astACodigo(ast);
        document.dispatchEvent(new CustomEvent('liteseint:diagramEdit', { detail: { codigo: nuevoCodigo } }));
      });
    }

    var svg = _crearSVG(diagrama, W, onEdit);
    contenedor.appendChild(svg);
  }

  window.LiteSeIntDiagramaUI = {
    inicializarDiagrama: inicializarDiagrama,
    refrescarDiagrama:   refrescarDiagrama,
  };
})();
