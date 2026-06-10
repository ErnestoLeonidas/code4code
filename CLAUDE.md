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
- [ ] Fase 2 — Editor propio mejorado (extraer a `js/editor/`).
- [ ] Fase 3 — Lenguaje PSeInt (`core/pseint/`), perfiles estricto/flexible.
- [ ] Fase 4 — Python con Pyodide (`core/python/`), en Web Worker.
- [ ] Fase 5 — Ejercicios multi-lenguaje.

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
