/**
 * Code4Code — core/language-registry.js
 * =====================================
 * Registro central de lenguajes. La UI obtiene de aquí el provider activo
 * y se suscribe a cambios de lenguaje. La selección se persiste en
 * localStorage bajo la clave 'code4code:lenguaje'.
 *
 * Depende de core/language-provider.js (debe cargarse antes).
 */
(function (raiz) {
  'use strict';

  var Code4Code = raiz.Code4Code;
  if (!Code4Code || typeof Code4Code.validarProvider !== 'function') {
    throw new Error('language-registry.js requiere cargar antes language-provider.js');
  }

  var CLAVE_LENGUAJE = 'code4code:lenguaje';

  /**
   * Crea un registro de lenguajes.
   * @param {object} [opciones]
   * @param {Storage|object} [opciones.storage] - inyectable para pruebas;
   *        por defecto usa localStorage si está disponible.
   */
  function crearRegistro(opciones) {
    opciones = opciones || {};
    var storage = opciones.storage !== undefined
      ? opciones.storage
      : (typeof raiz.localStorage !== 'undefined' ? raiz.localStorage : null);

    var providers = {};   // id -> provider
    var orden = [];       // ids en orden de registro
    var idActivo = null;
    var suscriptores = [];

    function leerPersistido() {
      if (!storage) return null;
      try { return storage.getItem(CLAVE_LENGUAJE); } catch (e) { return null; }
    }

    function persistir(id) {
      if (!storage) return;
      try { storage.setItem(CLAVE_LENGUAJE, id); } catch (e) { /* sin persistencia */ }
    }

    function notificar(provider) {
      suscriptores.forEach(function (cb) {
        try { cb(provider); } catch (e) {
          if (raiz.console) raiz.console.error('Suscriptor de cambio de lenguaje falló:', e);
        }
      });
    }

    var registro = {
      /**
       * Registra un provider (valida el contrato). El primero registrado, o el
       * persistido en localStorage si coincide, queda como activo.
       */
      registrar: function (definicion) {
        var provider = Code4Code.crearProvider(definicion);
        if (providers[provider.id]) {
          throw new Error('Ya existe un lenguaje registrado con id "' + provider.id + '".');
        }
        providers[provider.id] = provider;
        orden.push(provider.id);

        if (idActivo === null) {
          var persistido = leerPersistido();
          idActivo = provider.id; // primer registrado = default
          if (persistido && persistido === provider.id) idActivo = persistido;
        } else {
          var preferido = leerPersistido();
          if (preferido === provider.id) idActivo = provider.id;
        }
        return provider;
      },

      obtener: function (id) { return providers[id] || null; },

      lista: function () {
        return orden.map(function (id) { return providers[id]; });
      },

      activo: function () { return idActivo ? providers[idActivo] : null; },

      /** Activa un lenguaje por id, persiste y notifica a los suscriptores. */
      activar: function (id) {
        if (!providers[id]) {
          throw new Error('Lenguaje desconocido: "' + id + '".');
        }
        if (idActivo === id) return providers[id];
        idActivo = id;
        persistir(id);
        notificar(providers[id]);
        return providers[id];
      },

      /** Suscribe un callback (provider) => void; devuelve función para anular. */
      onCambio: function (cb) {
        suscriptores.push(cb);
        return function () {
          var i = suscriptores.indexOf(cb);
          if (i !== -1) suscriptores.splice(i, 1);
        };
      }
    };

    return registro;
  }

  Code4Code.CLAVE_LENGUAJE = CLAVE_LENGUAJE;
  Code4Code.crearRegistro = crearRegistro;

  // Registro global por defecto de la aplicación.
  Code4Code.registro = crearRegistro();

  raiz.Code4Code = Code4Code;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Code4Code;
  }
})(typeof window !== 'undefined' ? window : globalThis);
