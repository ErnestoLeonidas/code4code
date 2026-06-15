/* ==============================================
   ejercicios-pseint-data.js — Banco de ejercicios PSeInt
   Carga los ejercicios normalizados desde json/pseint/N*.json
   (mismo patrón que ejercicios-data.js para LiteSeInt).
   ============================================== */

(function (global) {
  'use strict';

  const ESTADOS_VALIDOS = ['adaptado', 'requiere-decision', 'excluido-temporal'];
  const DIFICULTADES_VALIDAS = ['basico', 'intermedio', 'avanzado'];
  const GRADOS_VALIDOS = ['guiado', 'con-pista', 'practica', 'desafio'];

  const EJERCICIOS_JSON_PATHS = [
    'json/pseint/N1.json',
    'json/pseint/N2.json',
  ];

  const EJERCICIOS = [];
  let cargaPromise = null;

  function normalizarEjercicio(ejercicio, experience, path) {
    return {
      ...ejercicio,
      origen: ejercicio.origen || path,
      modulo: ejercicio.modulo || (experience && experience.label) || '',
      experiencia: ejercicio.experiencia || (experience && experience.titulo) || '',
      conceptos: Array.isArray(ejercicio.conceptos) ? ejercicio.conceptos : [],
      entradaProcesoSalida:
        ejercicio.entradaProcesoSalida || { entrada: '', proceso: '', salida: '' },
      salidaEsperada: ejercicio.salidaEsperada || '',
      pista: ejercicio.pista || '',
      codigoReferencia: ejercicio.codigoReferencia || '',
      estadoAdaptacion: ejercicio.estadoAdaptacion || 'adaptado',
      motivoExclusion: ejercicio.motivoExclusion || '',
    };
  }

  function instalarBanco(ejercicios) {
    EJERCICIOS.splice(0, EJERCICIOS.length, ...ejercicios);
    return EJERCICIOS;
  }

  function ejerciciosDesdeData(data, path) {
    const experience = data && data.experience ? data.experience : {};
    const items = data && Array.isArray(data.exercises) ? data.exercises : [];
    return items.map((item) => normalizarEjercicio(item, experience, path));
  }

  async function cargarDesdeJson(opciones) {
    const forzar = opciones && opciones.force;
    if (cargaPromise && !forzar) return cargaPromise;

    cargaPromise = (async () => {
      if (typeof global.fetch !== 'function') {
        throw new Error('No hay fetch disponible para cargar los ejercicios JSON.');
      }

      const ejercicios = [];
      for (const path of EJERCICIOS_JSON_PATHS) {
        const resp = await global.fetch(path, { cache: 'no-store' });
        if (!resp.ok) {
          throw new Error(`No se pudo cargar ${path} (${resp.status})`);
        }
        const data = await resp.json();
        ejercicios.push(...ejerciciosDesdeData(data, path));
      }

      instalarBanco(ejercicios);
      return EJERCICIOS;
    })();

    return cargaPromise;
  }

  function listarAdaptados() {
    return EJERCICIOS.filter((e) => e.estadoAdaptacion === 'adaptado');
  }

  function porId(id) {
    return EJERCICIOS.find((e) => e.id === id) || null;
  }

  function porNivel(nivel) {
    return EJERCICIOS.filter(
      (e) => e.estadoAdaptacion === 'adaptado' && e.nivelPSeInt === nivel,
    );
  }

  global.EjerciciosPSeInt = {
    EJERCICIOS,
    EJERCICIOS_JSON_PATHS,
    ESTADOS_VALIDOS,
    DIFICULTADES_VALIDAS,
    GRADOS_VALIDOS,
    cargarDesdeJson,
    ejerciciosDesdeData,
    instalarBanco,
    listarAdaptados,
    porId,
    porNivel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
