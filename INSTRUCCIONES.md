# INSTRUCCIONES — Completar y publicar Code4Code

Este paquete contiene la **Fase 0 completa** y la **arquitectura de la
Fase 1** del refactor LiteSeInt → Code4Code (ver `ROADMAP.md`). Incluye
todos los archivos **nuevos y modificados**; los archivos que la Fase 0 no
cambia (núcleo del lenguaje, `app.js`, estilos, los 7 JSON de ejercicios)
se copian desde tu clone local de LiteSeInt con un solo comando.

## Paso 1 — Completar el proyecto

Necesitas Git, Node.js y un shell bash (en Windows: Git Bash o WSL).

```bash
# 1. Descomprime este paquete
unzip code4code-fase0.zip
cd code4code

# 2. Clona (o ubica) el repositorio original
git clone https://github.com/ErnestoLeonidas/LiteSeInt.git /tmp/LiteSeInt

# 3. Importa los archivos sin cambios a sus nuevas rutas
bash scripts/importar-desde-liteseint.sh /tmp/LiteSeInt
```

El script copia `core/*.js` → `core/liteseint/` (renombrando
`LiteSeInt.js` → `runtime.js`), trae `css/`, `js/`, `json/`, `shared/`,
`EJERCICIOS.md`, `.claude/`, ajusta las rutas en `tests/run-tests.js`,
anexa el historial 1.x al `CHANGELOG.md` y termina ejecutando `npm test`.
Si las pruebas quedan en verde, el proyecto está completo.

## Paso 2 — Verificar en el navegador

Abre `index.html` y recorre el flujo de estudiante: cargar un ejemplo,
ejecutar, responder un `Leer`, revisar Variables y Diagrama, abrir un
ejercicio. Todo debe comportarse exactamente igual que LiteSeInt v1.9.0
(esa es la definición de "Fase 0 lista").

## Paso 3 — Publicar el repositorio nuevo

```bash
git init
git add .
git commit -m "fase0: Code4Code 2.0.0-alpha — renombrado desde LiteSeInt v1.9.0"
git branch -M main
git remote add origin https://github.com/ErnestoLeonidas/Code4Code.git
git push -u origin main
```

Luego activa GitHub Pages (Settings → Pages → branch `main`) y, cuando la
demo nueva esté publicada, agrega al README de LiteSeInt un aviso de
migración y archiva ese repositorio.

> Nota: al compartir origen (`ernestoleonidas.github.io`), el progreso de
> ejercicios que los estudiantes guardaron en la app vieja sigue accesible
> desde la nueva; la migración de claves se hace en la Fase 1.

## Qué quedó hecho y qué sigue

**Hecho en este paquete:**
- Renombrado completo de marca, versión `2.0.0-alpha`, docs nuevas
  (`README.md`, `ROADMAP.md`, `CHANGELOG.md`, `CLAUDE.md`).
- `index.html` con rutas `core/liteseint/` y selector de lenguaje
  preparado (deshabilitado).
- Capa multi-lenguaje completa y probada: contrato de providers, registro
  con persistencia y RuntimeHost con límite de pasos y detención
  (`tests/contract-tests.js`, 14/14 OK).
- LiteSeInt registrado como primer lenguaje (`core/liteseint/provider.js`).

**Siguiente sesión (recomendado: Claude Code sobre el repo completo):**
- Cierre de la Fase 1: cablear `js/app.js` al registro y al RuntimeHost
  (los puntos exactos están marcados `TODO(FASE1)` en
  `core/liteseint/provider.js`), activar `#languageSelect` y migrar las
  claves `liteseint:*` de `localStorage`.
- `CLAUDE.md` contiene las reglas de trabajo para esas sesiones.

## Si algo falla

- **`npm test` falla tras importar:** revisa los `require()` de
  `tests/run-tests.js`; deben apuntar a `core/liteseint/…` y a
  `runtime.js` en lugar de `LiteSeInt.js`.
- **Pantalla en blanco o errores 404 en la consola del navegador:** algún
  script no está en su ruta; compara la lista de `<script src=...>` de
  `index.html` con el contenido real de `core/liteseint/`.
- **El selector de lenguaje no hace nada:** es esperado; se habilita al
  cerrar la Fase 1.
