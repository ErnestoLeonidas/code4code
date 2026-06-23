/**
 * scripts/generar-unificados.js
 * ==============================
 * Genera json/multi/ejercicios.json a partir de mapa.json y los tres bancos
 * de ejercicios individuales. Se ejecuta UNA sola vez y el resultado se
 * versiona como archivo estático.
 *
 * Uso: node scripts/generar-unificados.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NIVELES = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7'];

// ── Carga de bancos ──────────────────────────────────────────────────────────

function cargarBanco(lenguaje) {
  const indice = {};
  NIVELES.forEach(function (n) {
    const ruta = path.join(ROOT, 'json', lenguaje, n + '.json');
    if (!fs.existsSync(ruta)) return;
    const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    // LiteSeInt usa "exercises"; PSeInt y Python usan "ejercicios"
    const lista = datos.exercises || datos.ejercicios || [];
    lista.forEach(function (e) {
      if (e.id) indice[e.id.toLowerCase()] = e;
    });
  });
  return indice;
}

const bancos = {
  liteseint: cargarBanco('liteseint'),
  pseint: cargarBanco('pseint'),
  python: cargarBanco('python'),
};

// ── Mapa ─────────────────────────────────────────────────────────────────────

const mapa = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'json/multi/mapa.json'), 'utf8')
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function slug(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quitar tildes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Limpia el enunciado de terminología de lenguaje concreto. */
function normalizarEnunciado(enunciado, lenguaje) {
  if (!enunciado) return '';
  if (lenguaje === 'python') {
    // Python ya es neutro; solo normalizar mencionss de print/input evidentes
    return enunciado;
  }
  if (lenguaje === 'liteseint') {
    return enunciado
      .replace(/\bProceso\b/g, 'programa')
      .replace(/\bFinProceso\b/g, 'fin del programa')
      .replace(/\bEscribir\b/g, 'mostrar')
      .replace(/\bLeer\b/g, 'leer');
  }
  if (lenguaje === 'pseint') {
    return enunciado
      .replace(/\bAlgoritmo\b/g, 'programa')
      .replace(/\bFinAlgoritmo\b/g, 'fin del programa');
  }
  return enunciado;
}

/** Elige el enunciado más neutro: Python → LiteSeInt → PSeInt. */
function elegirEnunciado(ejercicios) {
  for (const lang of ['python', 'liteseint', 'pseint']) {
    const e = ejercicios[lang];
    if (e && e.enunciado) {
      return normalizarEnunciado(e.enunciado, lang);
    }
  }
  return '';
}

/** Elige el título más corto / descriptivo. */
function elegirTitulo(ejercicios) {
  for (const lang of ['liteseint', 'python', 'pseint']) {
    const e = ejercicios[lang];
    if (e && e.titulo) return e.titulo;
  }
  return '';
}

/** Conceptos: unión de todos, deduplicados. Preferir Python (más generales). */
function elegirConceptos(ejercicios) {
  const vistos = new Set();
  const res = [];
  for (const lang of ['python', 'liteseint', 'pseint']) {
    const e = ejercicios[lang];
    if (!e || !Array.isArray(e.conceptos)) continue;
    e.conceptos.forEach(function (c) {
      const k = (c || '').toLowerCase().trim();
      if (k && !vistos.has(k)) { vistos.add(k); res.push(c); }
    });
  }
  return res;
}

/** Dificultad y gradoAyuda: primer disponible. */
function elegirCampo(ejercicios, campo) {
  for (const lang of ['liteseint', 'pseint', 'python']) {
    const e = ejercicios[lang];
    if (e && e[campo]) return e[campo];
  }
  return '';
}

// ── Generación ───────────────────────────────────────────────────────────────

const contador = { N1: 0, N2: 0, N3: 0, N4: 0, N5: 0, N6: 0, N7: 0 };

const ejerciciosUnificados = mapa.mapas.map(function (entrada) {
  const ids = entrada.ids || {};
  const modulo = entrada.modulo || 'N1';

  // Recuperar ejercicios de cada banco
  const ejercicios = {};
  Object.keys(ids).forEach(function (lang) {
    const idOrig = (ids[lang] || '').toLowerCase();
    const banco = bancos[lang];
    if (banco && banco[idOrig]) ejercicios[lang] = banco[idOrig];
  });

  // ID unificado: mu-n1-001 …
  contador[modulo] = (contador[modulo] || 0) + 1;
  const seq = String(contador[modulo]).padStart(3, '0');
  const id = 'mu-' + modulo.toLowerCase() + '-' + seq;

  // Datos compartidos
  const titulo = elegirTitulo(ejercicios);
  const enunciado = elegirEnunciado(ejercicios);
  const conceptos = elegirConceptos(ejercicios);
  const dificultad = elegirCampo(ejercicios, 'dificultad');
  const gradoAyuda = elegirCampo(ejercicios, 'gradoAyuda');

  // Datos por lenguaje
  const lenguajes = {};
  Object.keys(ids).forEach(function (lang) {
    const e = ejercicios[lang];
    if (!e) return;
    const entrada_lang = { idOriginal: e.id };
    if (e.codigoReferencia) entrada_lang.codigoReferencia = e.codigoReferencia;
    if (e.salidaEsperada !== undefined) entrada_lang.salidaEsperada = e.salidaEsperada;
    if (e.pista) entrada_lang.pista = e.pista;
    if (e.entradaProcesoSalida) entrada_lang.entradaProcesoSalida = e.entradaProcesoSalida;
    lenguajes[lang] = entrada_lang;
  });

  return {
    id: id,
    concepto: entrada.concepto,
    modulo: modulo,
    titulo: titulo,
    dificultad: dificultad,
    gradoAyuda: gradoAyuda,
    conceptos: conceptos,
    enunciado: enunciado,
    lenguajes: lenguajes,
  };
});

const salida = {
  version: '2.0.0',
  generado: new Date().toISOString().slice(0, 10),
  descripcion: 'Ejercicios multi-lenguaje unificados: un enunciado compartido con soluciones en cada lenguaje.',
  total: ejerciciosUnificados.length,
  ejercicios: ejerciciosUnificados,
};

const rutaSalida = path.join(ROOT, 'json/multi/ejercicios.json');
fs.writeFileSync(rutaSalida, JSON.stringify(salida, null, 2), 'utf8');

console.log('Generados ' + ejerciciosUnificados.length + ' ejercicios unificados.');
console.log('Distribucion por modulo:');
Object.keys(contador).forEach(function (m) {
  if (contador[m] > 0) console.log('  ' + m + ': ' + contador[m]);
});
console.log('Guardado en: ' + rutaSalida);

// Verificación básica
let sinEnunciado = 0, sinLenguajes = 0;
ejerciciosUnificados.forEach(function (e) {
  if (!e.enunciado) sinEnunciado++;
  if (Object.keys(e.lenguajes).length < 2) sinLenguajes++;
});
if (sinEnunciado > 0) console.warn('ADVERTENCIA: ' + sinEnunciado + ' ejercicios sin enunciado');
if (sinLenguajes > 0) console.warn('ADVERTENCIA: ' + sinLenguajes + ' ejercicios con menos de 2 lenguajes');
