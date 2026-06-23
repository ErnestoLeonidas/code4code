/**
 * Code4Code — js/editor/ayudas.js
 * ===============================
 * "Ayudas de código" del editor propio (estilo Pylance), MULTILENGUAJE.
 *
 * Módulo PURO (sin DOM): recibe un catálogo de símbolos del lenguaje activo
 * y el texto/posición del editor, y responde lo necesario para:
 *   - Autocompletado enriquecido (texto + tipo + firma + descripción).
 *   - Hover/tooltip de documentación (símbolo bajo el cursor).
 *   - Ayuda de firma (qué función se está llamando y en qué argumento).
 *
 * Está pensado para reutilizarse en los tres lenguajes (Python primero,
 * luego LiteSeInt y PSeInt): cada provider expone su catálogo mediante
 * `provider.catalogoAyudas()` y la UI (js/app.js) consume estas funciones.
 *
 * Forma de un símbolo del catálogo:
 *   {
 *     nombre:      'print',
 *     tipo:        'función' | 'builtin' | 'método' | 'tipo' | 'keyword' | 'constante',
 *     firma:       'print(*valores, sep=" ", end="\\n")',
 *     descripcion: 'Muestra uno o más valores en la consola.',
 *     params:      [{ nombre: 'valores', descripcion: '...' }, ...],
 *     retorno:     'None',
 *     ejemplo:     'print("Hola", "mundo")'
 *   }
 * Solo `nombre` es obligatorio; el resto es opcional.
 *
 * Carga: script global en el navegador (window.Code4CodeAyudas) y módulo
 * CommonJS en Node para las pruebas (tests/ayudas-tests.js).
 */
(function (raiz) {
  'use strict';

  var RE_IDENT = /[A-Za-z0-9_áéíóúüñÁÉÍÓÚÜÑ]/;

  function esIdentChar(c) {
    return !!c && RE_IDENT.test(c);
  }

  /** Normaliza un símbolo aplicando valores por defecto. */
  function _normalizar(s) {
    return {
      nombre: String(s.nombre),
      tipo: s.tipo || 'símbolo',
      firma: s.firma || '',
      descripcion: s.descripcion || '',
      params: Array.isArray(s.params) ? s.params : [],
      retorno: s.retorno || '',
      ejemplo: s.ejemplo || ''
    };
  }

  /**
   * Construye un catálogo indexado a partir de una lista de símbolos.
   * @param {Array<object>} simbolos
   * @returns {{ porNombre: object, lista: Array<object> }}
   */
  function crearCatalogo(simbolos) {
    var porNombre = Object.create(null);
    var lista = [];
    (simbolos || []).forEach(function (s) {
      if (!s || !s.nombre) return;
      var sim = _normalizar(s);
      porNombre[sim.nombre.toLowerCase()] = sim;
      lista.push(sim);
    });
    return { porNombre: porNombre, lista: lista };
  }

  /**
   * Devuelve el símbolo con ese nombre (case-insensitive) o null.
   */
  function buscar(catalogo, nombre) {
    if (!catalogo || !nombre) return null;
    return catalogo.porNombre[String(nombre).toLowerCase()] || null;
  }

  /**
   * Candidatos de autocompletado enriquecidos para un prefijo.
   * @returns {Array<{texto, tipo, detalle, descripcion}>}
   *   `detalle` es la firma corta (lo que ya pinta la kw-badge del dropdown).
   */
  function completar(catalogo, prefijo, limite) {
    if (!catalogo) return [];
    var p = String(prefijo || '').toLowerCase();
    if (!p) return [];
    var max = typeof limite === 'number' ? limite : 50;
    var res = [];
    for (var i = 0; i < catalogo.lista.length && res.length < max; i++) {
      var s = catalogo.lista[i];
      var n = s.nombre.toLowerCase();
      if (n.indexOf(p) === 0 && n !== p) {
        res.push({
          texto: s.nombre,
          tipo: s.tipo,
          detalle: s.firma || s.tipo,
          descripcion: s.descripcion
        });
      }
    }
    // Orden: primero los que más se parecen (prefijo exacto ya filtrado),
    // luego alfabético para estabilidad.
    res.sort(function (a, b) { return a.texto.localeCompare(b.texto); });
    return res;
  }

  /**
   * Identificador que cubre el carácter en `offset` (el que está bajo el
   * ratón en un hover). Si ese carácter no forma parte de un identificador,
   * devuelve null. `offset` es el índice del carácter, no una posición de
   * caret entre caracteres.
   * @returns {{ palabra: string, inicio: number, fin: number } | null}
   */
  function palabraEn(texto, offset) {
    texto = String(texto == null ? '' : texto);
    var n = texto.length;
    if (offset < 0 || offset >= n) return null;
    if (!esIdentChar(texto[offset])) return null;

    var inicio = offset;
    while (inicio > 0 && esIdentChar(texto[inicio - 1])) inicio--;
    var fin = offset;
    while (fin < n && esIdentChar(texto[fin])) fin++;

    return { palabra: texto.slice(inicio, fin), inicio: inicio, fin: fin };
  }

  /**
   * Contexto de llamada para la ayuda de firma: explora hacia atrás desde el
   * offset buscando el "(" de la llamada que envuelve al cursor y devuelve el
   * nombre de la función y el índice del argumento actual (contando comas de
   * nivel superior). Salta cadenas, paréntesis/corchetes/llaves anidados.
   * @returns {{ nombre: string, argIndice: number } | null}
   */
  function contextoLlamada(texto, offset) {
    texto = String(texto == null ? '' : texto);
    if (offset > texto.length) offset = texto.length;
    if (offset < 0) offset = 0;

    var depth = 0;        // anidamiento de ()[]{} a la derecha (hacia la izq.)
    var argIndice = 0;    // comas de nivel superior vistas
    var i = offset - 1;

    while (i >= 0) {
      var c = texto[i];

      // Saltar cadenas hacia atrás (aproximado: hasta la comilla del mismo tipo)
      if (c === '"' || c === "'") {
        var q = c;
        i--;
        while (i >= 0 && texto[i] !== q) i--;
        i--;
        continue;
      }

      if (c === ')' || c === ']' || c === '}') { depth++; i--; continue; }

      if (c === '(') {
        if (depth === 0) {
          // Apertura de la llamada actual: leer el identificador previo
          var j = i - 1;
          while (j >= 0 && /\s/.test(texto[j])) j--;
          var fin = j + 1;
          while (j >= 0 && esIdentChar(texto[j])) j--;
          var nombre = texto.slice(j + 1, fin);
          if (!nombre) return null;        // '(' de agrupación, no de llamada
          return { nombre: nombre, argIndice: argIndice };
        }
        depth--; i--; continue;
      }

      if (c === '[' || c === '{') {
        if (depth === 0) return null;      // dentro de lista/dict, no de llamada
        depth--; i--; continue;
      }

      if (c === ',' && depth === 0) { argIndice++; i--; continue; }

      // Fin de sentencia sin paréntesis abierto: no hay llamada
      if (c === '\n' && depth === 0) return null;

      i--;
    }
    return null;
  }

  var Code4CodeAyudas = {
    crearCatalogo: crearCatalogo,
    buscar: buscar,
    completar: completar,
    palabraEn: palabraEn,
    contextoLlamada: contextoLlamada
  };

  raiz.Code4CodeAyudas = Code4CodeAyudas;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code4CodeAyudas;
  }
})(typeof window !== 'undefined' ? window : globalThis);
