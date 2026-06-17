# Code4Code

**Code4Code** es una plataforma web educativa para aprender programación,
evolución de [LiteSeInt](https://github.com/ErnestoLeonidas/LiteSeInt).
Permite escribir programas en un editor integrado, validarlos en tiempo real
y ejecutarlos directamente en el navegador, sin instalación, sin backend y
sin proceso de compilación.

La ruta del estudiante recorre tres lenguajes dentro del mismo entorno:

1. **LiteSeInt** — dialecto de pseudocódigo mínimo y predecible (245 ejercicios N1–N7).
2. **PSeInt** — compatible con el PSeInt de escritorio; perfiles Estricto y Flexible
   (110 ejercicios N1–N7).
3. **Python** — Python 3 real ejecutado en el navegador con Pyodide 0.26.2 en un
   Web Worker (110 ejercicios N1–N7).

## Estado actual

- Versión: `v2.3.8-beta`
- Los tres lenguajes son funcionales: LiteSeInt (Fases 0–1), PSeInt con perfiles
  Estricto/Flexible (Fases 3a–3b) y Python vía Pyodide (Fase 4).
- Editor propio sin dependencias externas: resaltado, autocompletado, pares/autocierre,
  búsqueda/reemplazo, historial undo/redo, gutter, folding, 6 temas y barra de símbolos
  táctiles (Fase 2, completa).
- Rutas N1–N7 por módulo para PSeInt y Python: tarjetas colapsables con conceptos,
  barra de progreso y ejercicios agrupados (Fase 5, en curso).

## Funcionalidad

- **Editor** con numeración (gutter), resaltado de sintaxis dirigido por el provider
  activo, guías de indentación, autocompletado, pares/autocierre, búsqueda/reemplazo,
  historial undo/redo con agrupación, validación estática por línea y resaltado de
  línea en ejecución.
- **Consola** integrada con entrada inline para `Leer` (LiteSeInt/PSeInt) o panel
  stdin previo a la ejecución (Python), inspector de variables en vivo y diagrama
  Nassi-Shneiderman bidireccional.
- **Panel de aprendizaje** con cuatro pestañas:
  - *Ejercicios* — 465 ejercicios en total (245 LiteSeInt + 110 PSeInt + 110 Python),
    niveles N1–N7, con filtros de nivel/dificultad/estado y progreso local por lenguaje.
  - *Comandos* — documentación de los comandos/instrucciones del lenguaje activo.
  - *Rutas* — ruta N1–N7 del lenguaje activo más vista comparada del progreso en los
    tres lenguajes a la vez.
  - *Errores* — guía de errores comunes del lenguaje activo.
- **Selector de lenguaje** en la cabecera; la elección se persiste en `localStorage`.
- **Selector de perfil PSeInt** (Estricto / Flexible) visible solo cuando PSeInt está
  activo; el perfil se embebe en el archivo `.psc` descargado y se detecta al importar.
- Importación y descarga de archivos con la extensión del lenguaje activo (`.psc`),
  ejemplos agrupados por concepto y progreso local persistente.

## Uso rápido

1. Clona este repositorio.
2. Abre `index.html` en un navegador moderno.
3. Selecciona el lenguaje en la cabecera (LiteSeInt, PSeInt o Python).
4. Escribe código o carga un ejemplo y presiona `Ejecutar`.

Para Python, escribe las entradas necesarias en el panel stdin antes de ejecutar
(una por línea). La primera ejecución descarga Pyodide desde la CDN (~10 MB).

## Estructura del proyecto

```
.
├── index.html
├── css/
├── js/
│   ├── app.js                    # controlador de UI (editor, consola, paneles)
│   ├── diagram.js                # diagrama Nassi-Shneiderman
│   ├── ejercicios-data.js        # carga del banco LiteSeInt
│   ├── ejercicios-pseint-data.js # carga del banco PSeInt
│   ├── ejercicios-python-data.js # carga del banco Python
│   └── editor/                   # módulos del editor propio
│       ├── highlight.js          # resaltado de sintaxis
│       ├── autocomplete.js       # autocompletado
│       ├── pairs.js              # pares/autocierre
│       ├── search.js             # búsqueda y reemplazo
│       ├── history.js            # historial undo/redo
│       ├── gutter.js             # numeración de líneas
│       └── folding.js            # plegado de bloques
├── core/
│   ├── language-provider.js      # contrato común de lenguajes
│   ├── language-registry.js      # registro y lenguaje activo
│   ├── runtime-host.js           # I/O de ejecución unificado
│   ├── liteseint/                # núcleo LiteSeInt (congelado desde 1.0)
│   │   ├── tokenizer.js  parser.js  validator.js  ast.js
│   │   ├── expression-evaluator.js  symbol-table.js  doc_errores.js
│   │   ├── diagram-mapper.js
│   │   ├── runtime.js
│   │   └── provider.js
│   ├── pseint/                   # núcleo PSeInt (perfiles Estricto/Flexible)
│   │   ├── tokenizer.js  parser.js  validator.js  ast.js
│   │   ├── expression-evaluator.js  symbol-table.js  builtins.js
│   │   ├── runtime.js
│   │   └── provider.js
│   └── python/                   # núcleo Python (Pyodide 0.26.2)
│       ├── tokenizer.js
│       ├── worker.js             # Web Worker con Pyodide
│       ├── bridge.js             # conecta el worker con RuntimeHost
│       └── provider.js
├── json/
│   ├── liteseint/                # ejercicios LiteSeInt N1–N7 (245 ejercicios)
│   ├── pseint/                   # ejercicios PSeInt N1–N7 (110 ejercicios)
│   └── python/                   # ejercicios Python N1–N7 (110 ejercicios)
├── tests/
│   ├── run-tests.js              # regresión del núcleo LiteSeInt y bancos
│   ├── contract-tests.js         # contrato multi-lenguaje (33 pruebas)
│   ├── editor-tests.js           # resaltado y editor
│   ├── autocomplete-tests.js     # autocompletado
│   ├── pairs-tests.js  search-tests.js  history-tests.js
│   ├── gutter-tests.js  folding-tests.js
│   ├── pseint-tokenizer-tests.js  pseint-parser-tests.js
│   ├── pseint-builtins-tests.js   pseint-runtime-tests.js
│   ├── pseint-validator-tests.js  pseint-golden-tests.js
│   └── python-tokenizer-tests.js
└── scripts/
```

## Pruebas

```
npm test
```

Ejecuta las 16 suites de pruebas (regresión del núcleo LiteSeInt, contrato
multi-lenguaje, módulos del editor, tokenizador/parser/runtime/validador PSeInt,
golden tests PSeInt, tokenizador Python y validación de los tres bancos de
ejercicios). No requiere navegador. Mantener esta suite en verde es la regla
número uno del proyecto (ver `CLAUDE.md`).

## Hoja de ruta

Ver [`ROADMAP.md`](ROADMAP.md): fases 0–6, decisiones de arquitectura
(D1–D5), riesgos y criterios de salida por fase.

## Licencia

Proyecto educativo de uso libre. El modo PSeInt es una reimplementación limpia
a partir del comportamiento observado; ver la decisión D5 del ROADMAP respecto
de las fuentes GPL de PSeInt.

## Créditos

Desarrollado por [Ernesto Velásquez](https://github.com/ernestoleonidas).
