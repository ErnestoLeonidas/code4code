/**
 * Code4Code — tests/history-tests.js
 * ==================================
 * Pruebas del módulo puro de historial undo/redo con agrupación de
 * ediciones del editor (js/editor/history.js). Sin DOM: snapshots planos
 * y contextos de edición construidos a mano.
 *
 * Uso: node tests/history-tests.js
 */
'use strict';

const path = require('path');
const Hist = require(path.join(__dirname, '..', 'js', 'editor', 'history.js'));

let total = 0;
let fallas = 0;

function prueba(nombre, fn) {
  total += 1;
  try {
    fn();
    console.log('  ✔ ' + nombre);
  } catch (e) {
    fallas += 1;
    console.error('  ✘ ' + nombre + ' → ' + e.message);
  }
}

function asegurar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'aserción fallida');
}

function igual(real, esperado, mensaje) {
  const r = JSON.stringify(real);
  const e = JSON.stringify(esperado);
  if (r !== e) {
    throw new Error((mensaje || 'valores distintos') + '\n    real:     ' + r +
      '\n    esperado: ' + e);
  }
}

/** Snapshot mínimo del editor (el scroll no afecta al historial). */
function snap(value, sel) {
  return { value: value, selectionStart: sel, selectionEnd: sel, scrollTop: 0, scrollLeft: 0 };
}

/** Contexto de una edición de tecleo/borrado. */
function ctx(tipoInput, selStart, data, tiempo, selEnd) {
  return Hist.contexto(tipoInput, selStart,
    selEnd == null ? selStart : selEnd, data, tiempo);
}

console.log('Pruebas de historial undo/redo del editor');

// ---- clasificar ----
prueba('clasificar agrupa los inputType en categorías propias', () => {
  igual(Hist.clasificar('insertText'), 'insertar');
  igual(Hist.clasificar('insertCompositionText'), 'insertar');
  igual(Hist.clasificar('insertLineBreak'), 'salto');
  igual(Hist.clasificar('insertFromPaste'), 'pegar');
  igual(Hist.clasificar('deleteContentBackward'), 'borrar-atras');
  igual(Hist.clasificar('deleteWordForward'), 'borrar-adelante');
  igual(Hist.clasificar('formatBold'), 'otro');
});

// ---- debeAgrupar ----
prueba('la primera edición nunca agrupa (sin contexto previo)', () => {
  asegurar(!Hist.debeAgrupar(null, ctx('insertText', 0, 'a', 100)));
});

prueba('tecleos contiguos del mismo tipo dentro de la ventana agrupan', () => {
  const a = ctx('insertText', 0, 'h', 100);
  const b = ctx('insertText', 1, 'o', 150);
  asegurar(Hist.debeAgrupar(a, b), 'esperaba agrupar tecleos contiguos');
});

prueba('cambiar de tipo (insertar → borrar) rompe el grupo', () => {
  const a = ctx('insertText', 1, 'o', 100);
  const b = ctx('deleteContentBackward', 2, null, 150);
  asegurar(!Hist.debeAgrupar(a, b));
});

prueba('una pausa larga rompe el grupo', () => {
  const a = ctx('insertText', 0, 'h', 100);
  const b = ctx('insertText', 1, 'o', 100 + Hist.PAUSA_MS + 1);
  asegurar(!Hist.debeAgrupar(a, b));
});

prueba('un salto del caret (inserción no contigua) rompe el grupo', () => {
  const a = ctx('insertText', 0, 'h', 100);
  const b = ctx('insertText', 5, 'o', 150);   // el caret no avanzó +1
  asegurar(!Hist.debeAgrupar(a, b));
});

prueba('una selección en la nueva edición la vuelve discreta', () => {
  const a = ctx('insertText', 0, 'h', 100);
  const b = ctx('insertText', 1, 'o', 150, 4); // selStart 1, selEnd 4
  asegurar(!Hist.debeAgrupar(a, b));
});

prueba('cruzar el límite palabra ↔ espacio rompe el grupo', () => {
  const a = ctx('insertText', 3, 'a', 100);    // letra
  const b = ctx('insertText', 4, ' ', 150);    // espacio
  asegurar(!Hist.debeAgrupar(a, b));
  // dos espacios sí agrupan entre sí
  const c = ctx('insertText', 5, ' ', 200);
  asegurar(Hist.debeAgrupar(b, c));
});

prueba('borrados hacia atrás contiguos agrupan; no contiguos no', () => {
  const a = ctx('deleteContentBackward', 5, null, 100);
  asegurar(Hist.debeAgrupar(a, ctx('deleteContentBackward', 4, null, 150)));
  asegurar(!Hist.debeAgrupar(a, ctx('deleteContentBackward', 2, null, 150)));
});

prueba('borrados hacia adelante contiguos mantienen el caret', () => {
  const a = ctx('deleteContentForward', 3, null, 100);
  asegurar(Hist.debeAgrupar(a, ctx('deleteContentForward', 3, null, 150)));
  asegurar(!Hist.debeAgrupar(a, ctx('deleteContentForward', 4, null, 150)));
});

prueba('saltos de línea y pegados nunca agrupan', () => {
  const a = ctx('insertText', 0, 'h', 100);
  asegurar(!Hist.debeAgrupar(a, ctx('insertLineBreak', 1, null, 120)));
  asegurar(!Hist.debeAgrupar(a, ctx('insertFromPaste', 1, 'xy', 120)));
});

// ---- registrar: agrupación de un tecleo de palabra ----
prueba('escribir una palabra deja un único paso de deshacer', () => {
  const h = Hist.crear();
  // beforeinput captura el estado ANTES de cada tecla:
  Hist.registrar(h, snap('', 0), ctx('insertText', 0, 'h', 100));
  Hist.registrar(h, snap('h', 1), ctx('insertText', 1, 'o', 140));
  Hist.registrar(h, snap('ho', 2), ctx('insertText', 2, 'l', 180));
  Hist.registrar(h, snap('hol', 3), ctx('insertText', 3, 'a', 220));
  igual(h.undo.length, 1, 'la palabra debe ser un solo paso');
  igual(h.undo[0].value, '', 'el ancla del grupo es el estado vacío inicial');
});

prueba('una pausa entre tecleos abre un segundo paso', () => {
  const h = Hist.crear();
  Hist.registrar(h, snap('', 0), ctx('insertText', 0, 'a', 100));
  Hist.registrar(h, snap('a', 1), ctx('insertText', 1, 'b', 100 + Hist.PAUSA_MS + 50));
  igual(h.undo.length, 2);
});

prueba('una edición estructural (sin contexto) es siempre un paso discreto', () => {
  const h = Hist.crear();
  Hist.registrar(h, snap('', 0), ctx('insertText', 0, 'a', 100));
  Hist.registrar(h, snap('a', 1), ctx('insertText', 1, 'b', 130)); // agrupa
  igual(h.undo.length, 1);
  Hist.registrar(h, snap('ab', 2));                                 // sin ctx → discreto
  igual(h.undo.length, 2);
  // y el siguiente tecleo no agrupa con la edición estructural
  Hist.registrar(h, snap('ab  ', 4), ctx('insertText', 4, 'c', 160));
  igual(h.undo.length, 3);
});

prueba('un snapshot idéntico al tope no se duplica y conserva rehacer', () => {
  const h = Hist.crear();
  h.undo = [snap('x', 1)];
  h.redo = [snap('y', 1)];
  Hist.registrar(h, snap('x', 1));   // idéntico al tope
  igual(h.undo.length, 1, 'no debe duplicar');
  igual(h.redo.length, 1, 'rehacer intacto en deduplicación');
});

prueba('una edición efectiva invalida la pila de rehacer', () => {
  const h = Hist.crear();
  h.undo = [snap('a', 1)];
  h.redo = [snap('z', 1)];
  Hist.registrar(h, snap('b', 1), ctx('insertText', 1, 'c', 100));
  igual(h.redo.length, 0);
});

prueba('el límite descarta los pasos más antiguos', () => {
  const h = Hist.crear(2);
  Hist.registrar(h, snap('1', 0));
  Hist.registrar(h, snap('2', 0));
  Hist.registrar(h, snap('3', 0));
  igual(h.undo.length, 2);
  igual([h.undo[0].value, h.undo[1].value], ['2', '3']);
});

// ---- deshacer / rehacer ----
prueba('deshacer devuelve el estado previo y mueve el actual a rehacer', () => {
  const h = Hist.crear();
  Hist.registrar(h, snap('', 0), ctx('insertText', 0, 'a', 100));
  const r = Hist.deshacer(h, snap('a', 1));
  igual(r.snapshot.value, '');
  igual(h.undo.length, 0);
  igual(h.redo.length, 1);
  igual(h.redo[0].value, 'a');
});

prueba('deshacer sin historial devuelve snapshot null y no toca rehacer', () => {
  const h = Hist.crear();
  const r = Hist.deshacer(h, snap('a', 1));
  igual(r.snapshot, null);
  igual(h.redo.length, 0);
});

prueba('rehacer reaplica el estado deshecho', () => {
  const h = Hist.crear();
  Hist.registrar(h, snap('', 0), ctx('insertText', 0, 'a', 100));
  Hist.deshacer(h, snap('a', 1));
  const r = Hist.rehacer(h, snap('', 0));
  igual(r.snapshot.value, 'a');
  igual(h.undo.length, 1);
  igual(h.redo.length, 0);
});

prueba('deshacer rompe el grupo: el siguiente tecleo abre un paso nuevo', () => {
  const h = Hist.crear();
  Hist.registrar(h, snap('', 0), ctx('insertText', 0, 'a', 100));
  Hist.deshacer(h, snap('a', 1));        // ultima = null
  Hist.rehacer(h, snap('', 0));          // vuelve a 'a' en pantalla
  Hist.registrar(h, snap('a', 1), ctx('insertText', 1, 'b', 130));
  igual(h.undo.length, 2, 'no debe agrupar a través de un undo/redo');
});

console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
if (fallas > 0) process.exit(1);
