/**
 * ============================================================
 *  doc_errores.js — Aggregator (compatibilidad pública)
 * ============================================================
 *  Reexpone como objeto `DocErrores` lo declarado en:
 *  - tokenizer.js (capa léxica)
 *  - validator.js (validación estática y tabla de símbolos)
 *
 *  Los consumidores externos (frontend/js/app.js, core/LiteSeInt.js,
 *  tests/run-tests.js) siguen usando `DocErrores.X` sin cambios.
 *
 *  Este archivo debe cargarse DESPUÉS de tokenizer.js y validator.js.
 * ============================================================
 */

const DocErrores = {
  TK,
  PALABRAS_RESERVADAS_SET,
  TIPOS_VALIDOS,
  FUNCIONES_NATIVAS_SET,
  tokenizarLinea,
  tokensSignificativos,
  cursorContext,
  crearError,
  TablaSimbolos,
  validarDocumento,
  validarLinea,
  extraerVariablesDelCodigo,
  erroresADecoraciones,
  mensajesDeLinea,
  stripComment,
  REGEX_HASTAQUE_LINEA,
  detectarHastaQue,
  detectarEtiquetaCaso,
};
