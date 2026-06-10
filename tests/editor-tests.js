/**
 * Code4Code — tests/editor-tests.js
 * =================================
 * Pruebas del editor propio (Fase 2): módulo de resaltado de sintaxis
 * js/editor/highlight.js dirigido por el provider activo.
 *
 * Carga los scripts reales en un contexto vm, CADA archivo como script
 * separado y en el mismo orden que index.html. Así se reproduce la
 * semántica del navegador: DocErrores/LiteSeInt son declaraciones léxicas
 * de script clásico (visibles como identificadores libres, NO como
 * propiedades de globalThis), por lo que aquí no se asignan a mano.
 *
 * Los HTML esperados se fijaron byte a byte contra la salida del
 * resaltado v1.x (sección 8 de js/app.js antes de la extracción).
 *
 * Uso: node tests/editor-tests.js
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

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

function asegurarIgual(real, esperado, mensaje) {
  if (real !== esperado) {
    throw new Error((mensaje || 'no coincide') +
      '\n      esperado: ' + JSON.stringify(esperado) +
      '\n      real:     ' + JSON.stringify(real));
  }
}

/**
 * Carga capa multi-lenguaje + núcleo LiteSeInt + provider + highlight en
 * un contexto aislado, cada archivo como script separado y en el mismo
 * orden que index.html (sin asignar DocErrores/LiteSeInt a globalThis).
 */
function cargarEditorEnContexto() {
  const raizRepo = path.join(__dirname, '..');
  const ctx = { console, setTimeout, clearTimeout, Promise };
  vm.createContext(ctx);
  [
    'core/language-provider.js',
    'core/language-registry.js',
    'core/runtime-host.js',
    'core/liteseint/tokenizer.js',
    'core/liteseint/symbol-table.js',
    'core/liteseint/validator.js',
    'core/liteseint/doc_errores.js',
    'core/liteseint/ast.js',
    'core/liteseint/parser.js',
    'core/liteseint/expression-evaluator.js',
    'core/liteseint/runtime.js',
    'core/liteseint/diagram-mapper.js',
    'core/liteseint/provider.js',
    'js/editor/highlight.js'
  ].forEach((rel) => {
    vm.runInContext(fs.readFileSync(path.join(raizRepo, rel), 'utf8'), ctx, {
      filename: rel
    });
  });
  return ctx;
}

function main() {
  console.log('Pruebas del editor Code4Code (resaltado de sintaxis, Fase 2)');

  const ctx = cargarEditorEnContexto();
  const Resaltador = ctx.Code4CodeHighlight;
  const provider = ctx.Code4Code.registro.activo();
  const resaltar = (codigo) => Resaltador.resaltarCodigo(provider, codigo);

  prueba('el módulo expone Code4CodeHighlight como global de script clásico', () => {
    asegurar(Resaltador && typeof Resaltador.resaltarCodigo === 'function');
    asegurar(typeof Resaltador.resaltarLinea === 'function');
    asegurar(typeof Resaltador.escapeHtml === 'function');
    asegurar(provider && provider.id === 'liteseint', 'provider activo: LiteSeInt');
  });

  prueba('palabra clave y cadena (sh-keyword / sh-string)', () => {
    asegurarIgual(
      resaltar('Escribir "hola"'),
      '<span class="sh-keyword">Escribir</span>' +
      '<span class="sh-plain"> </span>' +
      '<span class="sh-string">&quot;hola&quot;</span>'
    );
  });

  prueba('número y asignación (sh-number / sh-assign)', () => {
    asegurarIgual(
      resaltar('x = 5'),
      '<span class="sh-plain">x</span>' +
      '<span class="sh-plain"> </span>' +
      '<span class="sh-assign">=</span>' +
      '<span class="sh-plain"> </span>' +
      '<span class="sh-number">5</span>'
    );
  });

  prueba('comentario (sh-comment) con escape de su contenido', () => {
    asegurarIgual(
      resaltar('// comentario con <tags> & "comillas"'),
      '<span class="sh-comment">// comentario con &lt;tags&gt; &amp; &quot;comillas&quot;</span>'
    );
  });

  prueba('profundidad de paréntesis encadenada entre líneas (sh-bracket-0/1/2)', () => {
    asegurarIgual(
      resaltar('(((\n(\n))))'),
      '<span class="sh-bracket-0">(</span>' +
      '<span class="sh-bracket-1">(</span>' +
      '<span class="sh-bracket-2">(</span>' +
      '\n' +
      '<span class="sh-bracket-0">(</span>' +
      '\n' +
      '<span class="sh-bracket-0">)</span>' +
      '<span class="sh-bracket-2">)</span>' +
      '<span class="sh-bracket-1">)</span>' +
      '<span class="sh-bracket-0">)</span>'
    );
  });

  prueba('resaltarLinea acepta y devuelve la profundidad acumulada', () => {
    const vars = Resaltador.variablesDeUsuario(provider, '');
    const r1 = Resaltador.resaltarLinea(provider, '((', vars, 0);
    asegurarIgual(r1.depth, 2, 'profundidad tras "(("');
    const r2 = Resaltador.resaltarLinea(provider, '(', vars, r1.depth);
    asegurarIgual(r2.html, '<span class="sh-bracket-2">(</span>');
    asegurarIgual(r2.depth, 3);
    const r3 = Resaltador.resaltarLinea(provider, '', vars, r2.depth);
    asegurarIgual(r3.html, '', 'línea vacía produce HTML vacío');
    asegurarIgual(r3.depth, 3, 'línea vacía conserva la profundidad');
  });

  prueba('variable de usuario (sh-variable) vs identificador no declarado (sh-plain)', () => {
    asegurarIgual(
      resaltar('Proceso p\n  Definir total Como Entero\n  Escribir total, otra\nFinProceso'),
      '<span class="sh-keyword">Proceso</span>' +
      '<span class="sh-plain"> </span>' +
      '<span class="sh-plain">p</span>' +
      '\n' +
      '<span class="sh-plain">  </span>' +
      '<span class="sh-keyword">Definir</span>' +
      '<span class="sh-plain"> </span>' +
      '<span class="sh-variable">total</span>' +
      '<span class="sh-plain"> </span>' +
      '<span class="sh-keyword">Como</span>' +
      '<span class="sh-plain"> </span>' +
      '<span class="sh-keyword">Entero</span>' +
      '\n' +
      '<span class="sh-plain">  </span>' +
      '<span class="sh-keyword">Escribir</span>' +
      '<span class="sh-plain"> </span>' +
      '<span class="sh-variable">total</span>' +
      '<span class="sh-plain">,</span>' +
      '<span class="sh-plain"> </span>' +
      '<span class="sh-plain">otra</span>' +
      '\n' +
      '<span class="sh-keyword">FinProceso</span>'
    );
  });

  prueba('escape de HTML en cadenas: < > & "', () => {
    asegurarIgual(
      resaltar('Escribir "a<b & c>d"'),
      '<span class="sh-keyword">Escribir</span>' +
      '<span class="sh-plain"> </span>' +
      '<span class="sh-string">&quot;a&lt;b &amp; c&gt;d&quot;</span>'
    );
  });

  prueba('escapeHtml escapa & < > " en orden correcto', () => {
    asegurarIgual(
      Resaltador.escapeHtml('<a href="x">&'),
      '&lt;a href=&quot;x&quot;&gt;&amp;'
    );
    asegurarIgual(Resaltador.escapeHtml('&amp;'), '&amp;amp;', 'no doble-escapa por orden');
  });

  prueba('extraerVariables del provider devuelve las variables del usuario', () => {
    const vars = provider.extraerVariables(
      'Proceso p\n  Definir total, acum Como Entero\nFinProceso');
    asegurar(Array.isArray(vars), 'debe devolver un arreglo');
    asegurar(vars.indexOf('total') !== -1, 'vars: ' + vars.join(','));
    asegurar(vars.indexOf('acum') !== -1, 'vars: ' + vars.join(','));
  });

  prueba('provider sin extraerVariables: se trata como lista vacía', () => {
    const minimo = {
      tokenizarLinea: (l) => ({
        tokens: [{ tipo: 'identificador', texto: String(l) }]
      })
    };
    asegurarIgual(
      Resaltador.resaltarCodigo(minimo, 'total'),
      '<span class="sh-plain">total</span>',
      'sin extraerVariables ningún identificador es sh-variable'
    );
  });

  prueba('regresión: plantilla inicial del editor (líneas vacías intactas)', () => {
    asegurarIgual(
      resaltar(provider.plantillaInicial()),
      '<span class="sh-keyword">Proceso</span>' +
      '<span class="sh-plain"> </span>' +
      '<span class="sh-plain">nombre_proceso</span>' +
      '\n\n\n\n\n\n\n\n\n' +
      '<span class="sh-keyword">FinProceso</span>'
    );
  });

  console.log('\n' + (total - fallas) + '/' + total + ' pruebas OK');
  if (fallas > 0) process.exit(1);
}

main();
