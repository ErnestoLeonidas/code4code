/**
 * Code4Code — core/language-provider.js
 * =====================================
 * Contrato común que debe cumplir todo lenguaje soportado por Code4Code
 * (LiteSeInt, PSeInt, Python, ...). La UI (js/app.js) solo debe hablar
 * con providers a través de este contrato y del registro
 * (core/language-registry.js); nunca con un núcleo de lenguaje directo.
 *
 * Patrón de carga: script global en el navegador (window.Code4Code)
 * y módulo CommonJS en Node para las pruebas (tests/contract-tests.js).
 *
 * Ver ROADMAP.md — Fase 1.
 */
(function (raiz) {
  'use strict';

  var Code4Code = raiz.Code4Code || {};

  /** Capacidades opcionales que un provider puede declarar. */
  var CAPACIDADES = Object.freeze({
    /** El runtime reporta variables en vivo (pestaña Variables). */
    INSPECTOR_VARIABLES: 'inspector-variables',
    /** El lenguaje puede generar diagrama Nassi-Shneiderman (pestaña Diagrama). */
    DIAGRAMA_NS: 'diagrama-ns',
    /** El lenguaje aporta banco de ejercicios propio. */
    EJERCICIOS: 'ejercicios',
    /** El lenguaje aporta documentación de comandos embebida. */
    DOCUMENTACION: 'documentacion'
  });

  /**
   * Campos y funciones que TODO provider debe implementar.
   *
   * id               string  identificador único ('liteseint' | 'pseint' | 'python')
   * nombre           string  nombre visible en la UI
   * extension        string  extensión de archivo ('.psc', '.py')
   * plantillaInicial function(): string        código inicial del editor
   * tokenizarLinea   function(linea, estado?): { tokens: [{tipo, texto}], estado? }
   *                          tokens para el resaltado del editor propio
   * validar          function(codigo): [{ linea, mensaje, tipo? }]
   *                          validación estática; lista vacía si no hay errores
   * ejecutar         function(codigo, host): { detener: function() }
   *                          ejecuta usando el RuntimeHost para todo I/O
   */
  var CAMPOS_REQUERIDOS = ['id', 'nombre', 'extension'];
  var FUNCIONES_REQUERIDAS = ['plantillaInicial', 'tokenizarLinea', 'validar', 'ejecutar'];

  /**
   * Funciones opcionales:
   *
   * autocompletar      function(contexto): [{ texto, tipo, detalle? }]
   * reglasIndentacion  function(): { aperturas: [string], cierres: [string],
   *                                  intermedios?: [string] }
   * ejemplos           function(): [{ id, nombre, grupo, codigo }]
   * documentacion      function(): objeto con comandos/ruta/errores
   * capacidades        array de valores de CAPACIDADES
   */

  /**
   * Valida que un objeto cumpla el contrato de provider.
   * @returns {string[]} lista de problemas; vacía si el contrato se cumple.
   */
  function validarProvider(provider) {
    var problemas = [];
    if (!provider || typeof provider !== 'object') {
      return ['El provider debe ser un objeto.'];
    }
    CAMPOS_REQUERIDOS.forEach(function (campo) {
      if (typeof provider[campo] !== 'string' || provider[campo].length === 0) {
        problemas.push('Falta el campo de texto requerido "' + campo + '".');
      }
    });
    FUNCIONES_REQUERIDAS.forEach(function (fn) {
      if (typeof provider[fn] !== 'function') {
        problemas.push('Falta la función requerida "' + fn + '".');
      }
    });
    if (provider.extension && provider.extension.charAt(0) !== '.') {
      problemas.push('La extensión debe comenzar con punto (ej: ".psc").');
    }
    if (provider.capacidades !== undefined && !Array.isArray(provider.capacidades)) {
      problemas.push('"capacidades" debe ser un arreglo de CAPACIDADES.');
    }
    return problemas;
  }

  /**
   * Crea (valida y congela) un provider a partir de su definición.
   * Lanza Error si la definición no cumple el contrato.
   */
  function crearProvider(definicion) {
    var problemas = validarProvider(definicion);
    if (problemas.length > 0) {
      throw new Error(
        'Provider inválido (' + (definicion && definicion.id ? definicion.id : '?') + '): ' +
        problemas.join(' ')
      );
    }
    if (!definicion.capacidades) definicion.capacidades = [];
    return Object.freeze(definicion);
  }

  /** Consulta si un provider declara una capacidad opcional. */
  function tieneCapacidad(provider, capacidad) {
    return !!(provider && Array.isArray(provider.capacidades) &&
      provider.capacidades.indexOf(capacidad) !== -1);
  }

  Code4Code.CAPACIDADES = CAPACIDADES;
  Code4Code.validarProvider = validarProvider;
  Code4Code.crearProvider = crearProvider;
  Code4Code.tieneCapacidad = tieneCapacidad;

  raiz.Code4Code = Code4Code;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code4Code;
  }
})(typeof window !== 'undefined' ? window : globalThis);
