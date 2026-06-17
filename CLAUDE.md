# CLAUDE.md — Guía de trabajo para Code4Code

Este archivo orienta a Claude Code (y a cualquier colaborador) en las
sesiones de desarrollo sobre este repositorio.

## Contexto

Code4Code es la evolución de LiteSeInt: una app web educativa 100%
client-side (HTML/CSS/JS vanilla, sin build step ni backend) que está
migrando a una arquitectura multi-lenguaje (LiteSeInt → PSeInt → Python).
El plan maestro vive en `ROADMAP.md`; **léelo antes de tocar código** e
identifica en qué fase está el proyecto.

## Reglas de oro

1. **`npm test` en verde en cada commit.** La suite
   (`tests/run-tests.js` + `tests/contract-tests.js`) es la red de
   seguridad del refactor. Si una prueba falla, se arregla antes de seguir.
2. **Regresión cero para el estudiante.** Ningún cambio de arquitectura
   puede degradar la experiencia 1.x (editor, consola, ejercicios,
   variables, diagrama) hasta que su reemplazo alcance paridad.
3. **El núcleo `core/liteseint/` está congelado.** Solo se toca para
   corregir bugs con prueba de regresión incluida. La evolución del
   lenguaje LiteSeInt terminó en 1.0.
4. **La UI habla con providers, no con núcleos.** Todo acceso de
   `js/app.js` a un lenguaje debe pasar por `Code4Code.registro` (contrato
   en `core/language-provider.js`) y la ejecución por
   `core/runtime-host.js`. No agregar dependencias directas nuevas.
5. **Sin dependencias de build.** Nada de bundlers, transpiladores ni
   frameworks. Scripts clásicos + CDN, como hasta ahora.
6. La Fase 1 cerró el cableado de `core/liteseint/provider.js` (ya no hay
   `TODO(FASE1)`); las pruebas de integración del provider viven en
   `tests/contract-tests.js`.

## Estado de las fases (actualizar al avanzar)

- [x] Fase 0 — Renombrado y estructura `core/liteseint/` (este kit).
- [x] Fase 1 — Cierre: `js/app.js` cableado al registro/host, selector
      `#languageSelect` activo, claves `liteseint:*` → `code4code:*` con
      lectura retro-compatible, ejercicios en `json/liteseint/`
      (`v2.0.0-beta`). El resaltado y el autocompletado del editor siguen
      usando `DocErrores` directo: se migran al extraer el editor en Fase 2.
- [x] Fase 2 — Editor propio mejorado (extraer a `js/editor/`). Completado:
      resaltado (`js/editor/highlight.js`), autocompletado (`js/editor/autocomplete.js`),
      pares/autocierre (`js/editor/pairs.js`), búsqueda/reemplazo (`js/editor/search.js`),
      historial undo/redo con agrupación (`js/editor/history.js`), plegado por
      keywords y por indentación Python (`js/editor/folding.js`), gutter con números
      de línea y badges de error (`js/editor/gutter.js`). Barra de símbolos táctiles
      adaptable por lenguaje. 6 temas CSS con selector cíclico. Debounce 30 ms en
      resaltado. Suites: editor 12, autocomplete 10, pairs 20, search 13, history 21,
      folding 19, gutter 12. `js/app.js` ya no usa `DocErrores` ni `LiteSeInt`.
      Pendiente: núcleo del editor unificado (app.js aún gestiona el textarea directamente).
- [x] Fase 3a — Lenguaje PSeInt, perfil estricto (`v2.3.5-beta`). Implementado:
      diseño del objeto `perfil`, `Algoritmo/Proceso … FinAlgoritmo/FinProceso`,
      asignación `<-` (y `=` como comparador), `Escribir`/`Escribir Sin Saltar`/
      `Leer` multivariable, estructuras `Si/Sino`, `Segun`, `Mientras`,
      `Repetir…HastaQue`, `Para…Con Paso`, arreglos `Dimension` 1D/2D,
      `SubProceso`/`Funcion` con retorno y paso por referencia, 19 funciones nativas
      + instrucción procedimental `Ordenar(arr[, n])`, validador con mensajes PSeInt,
      correcciones de coerción implícita de tipos (runtime 43/43, validator 25/25),
      aviso de migración bidireccional, documentación de comandos PSeInt en el panel
      de aprendizaje, provider registrado en `index.html`, suites de tests propias
      (builtins 61, runtime 43, validator 25, golden tests 37, contract-tests incluidos).
- [x] Fase 3b — Perfil flexible y banco de ejercicios PSeInt completo (`v2.3.5-beta`).
      Implementado: selector de perfil (presets *Estricto*/*Flexible*) visible solo en
      PSeInt, `configurarPerfil`/`obtenerPerfil` en el provider, elección persistida
      en `localStorage`; `Definir` opcional en modo flexible; asignación con `=`
      en perfil flexible; palabras opcionales `Entonces` y `Hacer` en el parser;
      perfil embebido en el archivo descargado (`// Perfil: Estricto`) y detectado
      al importar; banco N1–N7 completo en `json/pseint/` (110 ejercicios);
      `Dimension` base-0 en perfil flexible; documentación de perfiles en el panel;
      golden tests duplicados por preset (golden 34-37: mismo programa en
      Estricto y Flexible).
- [x] Fase 4 — Python con Pyodide (`core/python/`), funcional (`v2.3.5-beta`).
      Hecho: tokenizador Python (37 keywords + 22 builtins en autocompletado),
      Web Worker con Pyodide 0.26.2, bridge con RuntimeHost, provider completo,
      panel stdin `#pythonStdinPanel`, barra de símbolos táctiles adaptable,
      28 pruebas de tokenizador, 10 pruebas de contrato, banco N1–N7 en `json/python/`
      (110 ejercicios) con metadatos completos (`numero`, `modulo`, `conceptos`,
      `pista`, `entradaProcesoSalida`); inspector de variables Python; tracebacks
      mejorados; validación de sintaxis con `compile()` antes de ejecutar.
      Pendiente: testing de ejecución real (requiere browser), mejoras de rendimiento.
- [x] Fase 5 — Ejercicios multi-lenguaje (`v2.3.6-beta`).
      Implementado: progreso separado por lenguaje en `localStorage`; datos de
      ejercicios PSeInt/Python cargados correctamente; vista de progreso
      comparado por lenguaje en la pestaña Rutas (`renderizarProgresoComparado`);
      mapa de equivalencias `json/multi/mapa.json` (55 entradas LiteSeInt/PSeInt/
      Python, N1–N7) con cargador `js/ejercicios-multi-data.js` y botones "Ver en
      otros lenguajes" en el panel de detalle del ejercicio; 6 pruebas del mapa en
      suite total; bancos validados (LiteSeInt 245, PSeInt 110, Python 110 ejercicios).
      Ruta modular N1–N7 para PSeInt y Python: tarjetas colapsables con conceptos,
      barra de progreso y enlaces a ejercicios agrupados por gradoAyuda
      (`renderizarRutaModular` en `js/app.js`). Constantes `MODULOS_ORDEN` y
      `MODULOS_TITULO` reutilizables por cualquier lenguaje.
      Pendiente: esquema multi-lenguaje unificado (un enunciado, N soluciones).

## Tareas típicas y dónde mirar

- Cableado Fase 1: `core/liteseint/provider.js` (TODOs), `js/app.js`
  (puntos donde hoy invoca `DocErrores` y el runtime directamente),
  `core/runtime-host.js` (callbacks que la UI debe proveer).
- Claves de almacenamiento: buscar `localStorage` en `js/app.js`
  (`liteseint:exerciseProgress`, altura de consola, etc.). La clave del
  lenguaje activo ya es `code4code:lenguaje` (ver
  `core/language-registry.js`).
- Nuevos lenguajes: implementar el contrato completo, registrar con
  `Code4Code.registro.registrar(...)`, cargar el script en `index.html`
  después de la capa multi-lenguaje, y hacer pasar
  `tests/contract-tests.js` extendido con el provider real.

## Convenciones

- Código y comentarios en español, siguiendo el estilo del núcleo original.
- Commits pequeños, un tema por commit, mensaje en español con prefijo de
  fase: `fase1: cablea validación vía provider`.
- Actualizar `CHANGELOG.md` y la versión visible (`index.html`,
  `package.json`) al cerrar cada hito.
