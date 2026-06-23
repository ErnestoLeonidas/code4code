# Changelog — Code4Code

## [2.4.1-beta] - 2026-06-22

### Backlog — Autocorrección por salida esperada

- `js/app.js` — nueva función `verificarAutocorreccion(salidaReal)`: al terminar
  la ejecución con éxito, compara la salida acumulada con `salidaEsperada` del
  ejercicio activo. Normalización: `trimEnd` por línea + `trimEnd` del total.
  Si coincide y el ejercicio aún no era *Completado*, lo marca automáticamente,
  refresca lista, progreso y ruta, y muestra `"✓ ¡Salida correcta! Ejercicio
  marcado como completado."` en la consola.
- `crearHostDeEjecucion()` acumula las líneas de salida normal (`tipo: 'salida'`
  / sin tipo) en closure `_lineasSalida`; llama a `verificarAutocorreccion`
  al finalizar. Errores y mensajes de sistema no se acumulan.
- Funciona en los tres lenguajes (LiteSeInt, PSeInt, Python). Limitación
  conocida: `Escribir Sin Saltar` en PSeInt N7 puede no hacer coincidir.
- Backlog: `Exportar/importar progreso local` marcado como completado en ROADMAP
  (ya estaba implementado desde Fase 5 en `exportarProgreso`/`importarProgresoDesdeArchivo`).

## [2.4.0-beta] - 2026-06-22

### Fase 5 — Esquema multi-lenguaje unificado (`v2.4.0`)

- `json/multi/ejercicios.json`: 74 ejercicios unificados generados con
  `scripts/generar-unificados.js`. Cada entrada tiene: `id` (`mu-nX-NNN`),
  `concepto`, `modulo`, `titulo`, `dificultad`, `gradoAyuda`, `conceptos`,
  `enunciado` compartido (preferentemente el de Python, más neutro), y un mapa
  `lenguajes` con `codigoReferencia`, `salidaEsperada`, `pista`,
  `entradaProcesoSalida` e `idOriginal` por cada lenguaje disponible.
  9 ejercicios cubren los 3 lenguajes; 65 cubren 2 lenguajes.
- `scripts/generar-unificados.js`: script de migración one-time. No es build
  step: el JSON resultante se versiona como archivo estático.
- `js/ejercicios-multi-data.js`: API extendida con `ejercicioUnificadoPorId(id, lang)`
  y `ejerciciosUnificadosPorModulo(modulo)`; carga `json/multi/ejercicios.json` en
  paralelo con `mapa.json` (falla silenciosamente si no existe); índice lazy por
  `idOriginal`. La API legada queda intacta (`buscarPorId`, `MAPAS`, etc.).
- `js/app.js`: nueva sección colapsable "Comparar soluciones en otros lenguajes"
  en el panel de detalle del ejercicio, que muestra el `codigoReferencia` de los
  lenguajes alternativos cuando existen datos unificados.
- `css/styles.css`: estilos para `.ej-comparar-soluciones`, `.ej-comp-lang-label`
  y `.ej-comp-codigo` (bloque de código con scroll horizontal, altura máx. 180 px).

### Tests

- `tests/run-tests.js`: 7 nuevas pruebas del esquema unificado (estructura básica,
  mínimo 70 entradas, campos obligatorios, ≥ 2 lenguajes por ejercicio, `idOriginal`
  referenciando ejercicios reales, IDs y conceptos únicos). Total: 100/100.

## [2.3.9-beta] - 2026-06-22

### Fase 2 — Autocompletado enriquecido en LiteSeInt y PSeInt

- `js/editor/autocomplete.js`: `contextoDesdePosicion` ahora incluye el campo
  `prefijo` (identificador inmediatamente anterior al cursor) para que los
  providers puedan usarlo directamente sin re-extraerlo.
- `core/liteseint/provider.js`: `autocompletar` usa `Code4CodeAyudas.completar()`
  cuando el catálogo está cargado (añade `firma` y `descripcion` al dropdown, como
  ya hacía Python). Sin catálogo, conserva el comportamiento v1.x exacto.
- `core/pseint/provider.js`: igual que LiteSeInt. Además corrige un bug previo:
  antes devolvía TODOS los keywords sin filtrar por prefijo.
- Python ya usaba `ctx.prefijo`; con el campo ahora presente en el contexto,
  el autocompletado enriquecido funciona también para Python.
- Tests: `autocomplete-tests.js` verifica el nuevo campo `prefijo`; `contract-tests.js`
  adapta las aserciones de PSeInt al nuevo filtrado y al tipo `'función'` del catálogo.

### Fase 6 — CI con GitHub Actions

- `.github/workflows/ci.yml`: ejecuta `npm test` en cada push/PR a `main` sobre
  ubuntu-latest con Node 22. Cierra el único ítem de Fase 6 sin requerir navegador.

## [2.3.8-beta] - 2026-06-17

### Fase 5 — Ruta modular para PSeInt y Python + mapa multi-lenguaje ampliado

- `json/multi/mapa.json`: ampliado de 55 a 74 entradas. Se completan N4 (arreglos/
  listas: llenar, suma, max, min, búsqueda lineal, invertir, unir) y N5 (funciones:
  saludo, cuadrado, factorial iterativo/recursivo, fibonacci recursivo, max, primo,
  potencia, suma colección, vocales). Se agregan 2 entradas N7 (calculadora, conversor
  decimal-binario). El mapa cubre ahora todos los módulos N1–N7.
- `js/app.js`: nueva función `renderizarRutaModular(provider, $cont)` que muestra
  tarjetas N1–N7 colapsables para cualquier lenguaje con banco de ejercicios.
  Cada tarjeta lista: conceptos únicos del módulo (como badges), barra de progreso
  (completados/total), y enlaces a ejercicios "Para comenzar", "Para practicar" y
  "Para desafiar". Reemplaza el mensaje "próximamente" en la pestaña Rutas para
  PSeInt y Python.
- `js/app.js`: `MODULOS_ORDEN` y `MODULOS_TITULO` con títulos genéricos N1–N7
  usables por cualquier lenguaje (Entrada/salida, Condicionales, Ciclos, etc.).

### Tests

- `tests/pseint-runtime-tests.js`: 4 nuevas pruebas (44–47): REDON(.5), funciones
  anidadas en expresión, precedencia booleana Y/O, y LN(EXP(1))≈1. Total: 47/47.

## [2.3.7-beta] - 2026-06-16

### Fase 2 — Plegado de bloques Python por indentación

- `js/editor/folding.js`: nuevo modo de plegado por indentación — cuando
  `reglas.cierres` es vacío (Python), las líneas que terminan en `:` abren
  un bloque que se cierra en la primera línea con sangría ≤ a la de apertura.
  El modo por palabras clave (LiteSeInt/PSeInt) queda inalterado.
- `tests/folding-tests.js`: 4 nuevas pruebas Python (def, for, bloque de una
  línea no plegable, bloques anidados). Total: 19/19.

### Docs

- `README.md`: reescrito al estado real v2.3.6→2.3.7-beta — los tres lenguajes
  como funcionales, conteos correctos (245+110+110 ejercicios), estructura de
  proyecto actual con `js/editor/` y 16 suites de tests, Pyodide documentado.

## [2.3.6-beta] - 2026-06-16

### Fase 3a — Coerción implícita de tipos PSeInt (completada)

- `core/pseint/symbol-table.js`: `coercionarValor` completado para todas las
  combinaciones de tipos PSeInt (Entero, Real, Logico, Cadena, Caracter):
  corrección de Logico→Caracter (`'V'`/`'F'` en vez de `'t'`/`'f'`), ramas
  explícitas para Logico→Entero/Real, `parseFloat` en Cadena→Entero/Real.
- `tests/pseint-runtime-tests.js`: 13 pruebas nuevas (25-37) cubriendo todas
  las combinaciones de coerción. Total: 37/37.

### Fase 5 — Mapa multi-lenguaje y vista de progreso comparado

- `json/multi/mapa.json`: 32 entradas que asocian el mismo concepto en
  LiteSeInt, PSeInt y Python (generadas por título normalizado).
- `js/ejercicios-multi-data.js`: cargador del mapa con `buscarPorId`,
  `listarPorModulo` y `porConcepto`; carga diferida desde JSON.
- `js/app.js`: sección "Ver en otros lenguajes" en el panel de detalle cuando
  existe equivalencia; al hacer clic cambia el lenguaje activo y selecciona
  el ejercicio equivalente. Vista de progreso comparado en la pestaña Rutas
  (`renderizarProgresoComparado`) muestra completados/total de los tres bancos.
- `css/styles.css`: estilos `.ej-otros-lenguajes`, `.ej-otro-lenguaje-btn`,
  `.learning-progreso-comparado`.
- `tests/run-tests.js`: 6 pruebas del mapa (estructura, conteo mínimo, campos
  obligatorios, lenguajes válidos, formato de IDs, IDs existentes en bancos).

## [2.3.5-beta] - 2026-06-16

### Fase 3a — ORDENAR (ordenamiento de arreglos)

- `core/pseint/ast.js`: nuevo nodo `Ordenar` + función `nodoOrdenar`.
- `core/pseint/parser.js`: detecta `Ordenar(arreglo[, n])` como instrucción
  procedimental antes del fallback a `nodoDesconocido`.
- `core/pseint/runtime.js`: función `ejecutarOrdenar` — ordena los primeros `n`
  elementos de un arreglo 1D en su lugar (ascendente numérico o lexicográfico).
  Corrección clave: los datos internos del arreglo son 1-based (`datos[1..n]`).
- `core/pseint/provider.js`: documentación "Ordenar (arreglos)" en el panel de
  aprendizaje con sintaxis, ejemplo ejecutable y descripción de errores.
- `tests/pseint-golden-tests.js`: 2 nuevos golden tests (32 y 33) —
  ordenar arreglo numérico `[5,3,1,4,2] → [1,2,3,4,5]` y cadenas
  `["manzana","cereza","banana"] → ["banana","cereza","manzana"]`.
- `core/pseint/validator.js`: nuevo caso `Ordenar` — error si el arreglo no fue
  declarado con `Dimension`. `tests/pseint-validator-tests.js`: 2 nuevas pruebas
  (21 y 22). Total: 22/22.

### Fase 3b — Golden tests duplicados por preset

- `tests/pseint-golden-tests.js`: 4 nuevos golden tests (34-37) que ejecutan el
  mismo programa en perfil Estricto y Flexible (suma acumulada con `Definir`/`<-`
  vs sin `Definir`/`=`; acceso a arreglos en base 1 vs base 0 con
  `indicesDesde0`). Total: 37/37.

### Fase 4 — Metadatos banco Python N1–N7

- `json/python/N{1..7}.json`: los 110 ejercicios Python ahora tienen los campos
  `numero` (formato `PY-Nn-nn`), `modulo`, `conceptos`, `pista` y
  `entradaProcesoSalida`, igualando la riqueza de metadatos de LiteSeInt y PSeInt.
  Generados con `scripts/enrich-python.py`.
- `tests/run-tests.js`: 2 nuevas pruebas validan que todos los ejercicios tengan
  `numero`/`modulo`/`conceptos` y que los adaptados tengan `pista` y EPS.

### Docs

- `ROADMAP.md`: actualizado al estado real v2.3.4-beta: Fase 3b y 4 marcadas como
  completas, Fase 5 in-progress con los tres bancos existentes. Tabla de versiones
  corregida.
- `index.html`: versión visible corregida de `v2.2.0-beta` (desactualizada desde
  varios hitos atrás) a `v2.3.5-beta`.

## [2.3.4-beta] - 2026-06-15

### Fase 3a — Correcciones de coerción de tipos PSeInt

- `core/pseint/symbol-table.js`: `coercionarValor` corregido en 3 casos:
  - **Bug crítico**: `"Falso"` → `false` al coercer a `Logico` (antes devolvía `true`
    porque `Boolean("Falso")` en JS es `true` para cualquier string no vacío).
  - `"Verdadero"` → `true`, `"true"` → `true`, `"1"` → `true` al coercer a `Logico`.
  - `true`/`false` → `"Verdadero"`/`"Falso"` al coercer a `Cadena`.
  - `ENTERO`/`REAL`: lanzan error con mensaje claro si el valor no es numérico
    (antes devolvían `NaN` silenciosamente).
- `core/pseint/builtins.js`: `CONVERTIRATEXTO(Verdadero)` → `"Verdadero"`,
  `CONVERTIRATEXTO(Falso)` → `"Falso"` (antes devolvía `"true"/"false"`).
- `tests/pseint-runtime-tests.js`: 7 nuevos tests de coerción (total 24/24):
  Real→Entero, "Falso"→false, "Verdadero"→true, bool→"Verdadero"/"Falso",
  error en cadena no numérica, Escribir Logico, asignación Real→Entero.
- `tests/pseint-golden-tests.js`: 5 nuevos golden tests (total 30/30): golden 26–30
  cubren CONVERTIRATEXTO con Logico, CONVERTIRANUMERO, Leer Logico, truncado
  Real→Entero en asignación, SUBCADENA+LONGITUD.

## [2.3.3-beta] - 2026-06-15

### Fase 4 — Banco Python N7 completo

- `json/python/N7.json`: 15 ejercicios integradores Python de nivel avanzado. Cubren:
  diccionarios de operaciones, estadísticas de listas, frecuencia de letras, `sorted` con
  clave, juego "adivina el número" con `random`, `map()`/`filter()`, agenda con dict,
  comprensión de lista avanzada (XOR de divisibilidad), conversor de bases numéricas,
  validación de contraseña con `any()`, eliminación de duplicados con `set`, `*args`,
  contador de palabras, inventario con lista de dicts y tabla de multiplicar formateada.
- `js/ejercicios-python-data.js`: agrega `json/python/N7.json` a `EJERCICIOS_JSON_PATHS`.
  El banco Python pasa de 95 a 110 ejercicios (N1–N7), igualando a PSeInt y LiteSeInt.
- `tests/run-tests.js`: test "banco Python: carga 110 ejercicios de N1 a N7" actualizado.
- `CLAUDE.md`: Fase 4 actualizada con banco N1–N7 (110 ejercicios).

## [2.3.2-beta] - 2026-06-15

### Fase 3b — Cierre

- `core/pseint/expression-evaluator.js` + `core/pseint/provider.js` + `core/pseint/runtime.js`:
  `indicesDesde0` activado en perfil flexible; los métodos `_get/_setElementoArreglo` del
  `EvaluadorPSeInt` reciben el perfil y aplican lógica 0-based para arreglos 1D y 2D.
  Prueba de runtime añadida (perfil flexible con `arr[0]`/`arr[2]`).
- `core/pseint/provider.js`: nueva entrada de documentación "Perfil: Estricto vs Flexible"
  en el panel de aprendizaje — explica diferencias de asignación (`<-` vs `=`),
  declaración (`Definir` obligatorio u opcional) e índices de arreglo (1-based vs 0-based).
- `tests/pseint-golden-tests.js`: 25 golden tests que ejecutan programas PSeInt completos
  contra `RuntimePSeInt` y verifican la salida exacta. Cubre perfil estricto (hola mundo,
  factorial, Fibonacci, arreglos, SubProceso, Funcion, Segun, funciones matemáticas y de
  cadena, recursión, matriz 2D) y perfil flexible (asignación con `=`, variables auto-creadas,
  índices 0-based).
- `core/pseint/runtime.js`: corregido bug en `ejecutarSubproceso` — el constructor de
  `TablaPSeInt` se extraía sin `new`, lanzando `TypeError` al invocar cualquier `SubProceso`.

### Fase 4 — Validación Python

- `core/python/worker.js`: agrega paso de validación de sintaxis con `compile()` Python
  antes de ejecutar el programa; reporta `SyntaxError`/`IndentationError` con número de
  línea preciso sin necesidad de arrancar la ejecución completa.
- `core/python/provider.js`: 9 nuevas entradas de documentación en el panel de aprendizaje
  (Métodos de cadena, Métodos de lista, Comprensión de listas, Diccionarios, try/except,
  import math, f-strings, enumerate/zip).

## [2.3.1-beta] - 2026-06-15

### Fase 4 — Mejoras Python

- `core/python/worker.js`: inspector de variables — tras ejecutar extrae el namespace
  del usuario (filtra privados, módulos y callables) y los envía como mensaje
  `{tipo:'variables'}`; parseo de traceback mejorado extrae la última línea de
  excepción con número de línea (`Línea N: NameError: ...`).
- `core/python/bridge.js`: limpia el inspector al iniciar (`reiniciar`), mapea tipos
  Python → contrato Code4Code (`int→entero`, `str→caracter`, `bool→logico`, `list→lista`),
  llama `host.reportarVariables()` al terminar la ejecución.
- `core/python/provider.js`: amplía `KEYWORDS_AUTOCOMPLETAR` con `abs`, `sum`, `max`,
  `min`, `sorted`, `enumerate`, `zip`, `map`, `filter`, `any`, `all`, `isinstance`,
  `open`, `round`, `pow` y más (total ~47 entradas).

### Fase 3b — Metadatos de perfil PSeInt en archivo

- `js/app.js` — descarga: antepone `// Perfil: Estricto` o `// Perfil: Flexible`
  al contenido del `.psc` cuando el lenguaje activo es PSeInt.
- `js/app.js` — importar: detecta la línea de perfil en la primera línea del `.psc`,
  activa PSeInt si no lo estaba, configura el perfil y elimina la línea antes de
  mostrar el contenido; los `.psc` sin comentario de perfil también activan PSeInt.

## [2.3.0-beta] - 2026-06-14

### Fase 4 — Lenguaje Python (base funcional)

#### Agregado — Núcleo Python (`core/python/`)

- `core/python/tokenizer.js`: tokenizador Python con 37 keywords (incluyendo builtins
  educativos `print`, `input`, `range`, `len`, tipos), strings simples y dobles con
  escape, comentarios `#`, operadores de 1 y 2 caracteres (`**`, `//`, `==`, `!=`,
  `+=`, etc.), delimitadores `{}`, `[]`, `()`, `,`, `:`.
- `core/python/worker.js`: Web Worker que carga Pyodide 0.26.2 desde CDN y ejecuta
  código Python 3 de forma asíncrona; redirige `sys.stdout`, `sys.stderr` e `input()`
  al hilo principal via `postMessage`; v1 usa cola de entradas pre-cargadas (sin
  `SharedArrayBuffer`, compatible con GitHub Pages).
- `core/python/bridge.js`: conecta el worker con el `RuntimeHost` de Code4Code;
  lee entradas del textarea `#pythonStdin`; maneja mensajes de carga, salida, error
  y fin.
- `core/python/provider.js`: implementa el contrato `LanguageProvider` para Python:
  `tokenizarLinea`, `reglasIndentacion`, `autocompletar`, `validar` (cadenas sin
  cerrar), `ejecutar` (vía Pyodide Worker), `documentacion` (10 comandos).

#### Agregado — UI Python

- Opción `Python` en el selector de lenguaje.
- Panel stdin (`#pythonStdinPanel`) en la consola: textarea donde el usuario escribe
  las entradas antes de ejecutar (una por línea), solo visible cuando Python está activo.
- Indicador de carga de Pyodide en la consola la primera vez que se activa.
- Barra de símbolos táctiles renovada (`mobile-symbol-bar`): 11 botones con inserción
  inteligente de pares (`""`, `()`, `[]`) y auto-indentación; adaptable al lenguaje
  (muestra `=` en lugar de `<-` con Python activo).

#### Agregado — Tests

- `tests/python-tokenizer-tests.js`: 28 pruebas del tokenizador Python.
- `tests/contract-tests.js`: extendido con 10 pruebas de integración del provider Python.

#### Agregado — Banco de ejercicios Python

- `json/python/N1.json`: 20 ejercicios básicos (variables, print, input, aritmética).
- `json/python/N2.json`: 15 ejercicios de condicionales (if/elif/else).
- `json/python/N3.json`: 15 ejercicios de bucles (for/while/range).
- `json/python/N4.json`: 15 ejercicios de listas y colecciones.
- `json/python/N5.json`: 15 ejercicios de funciones y recursión.
- `json/python/N6.json`: 15 ejercicios de cadenas (métodos de string).
- `js/ejercicios-python-data.js`: módulo de carga del banco Python (igual patrón
  que LiteSeInt y PSeInt).

### Fase 3b completada

- `core/pseint/validator.js` + `core/pseint/runtime.js`: en perfil flexible,
  las variables se crean automáticamente en el primer uso (sin `Definir` obligatorio);
  la inferencia de tipo usa el valor asignado (`Entero`, `Real`, `Cadena`, `Logico`).
- Banco de ejercicios PSeInt completo: N3 (18 bucles), N4 (15 arreglos), N5 (15
  subprocesos), N6 (15 cadenas), N7 (12 integradores) — 95 ejercicios PSeInt en total.

## [2.2.0-beta] - 2026-06-14

Cierre del primer hito de la **Fase 3a — Lenguaje PSeInt** (perfil estricto):
el núcleo PSeInt completo queda integrado en la UI; el estudiante puede
seleccionar PSeInt en el selector de lenguaje y ejecutar algoritmos con el
perfil estricto.

### Agregado — Núcleo PSeInt (`core/pseint/`)

- `core/pseint/tokenizer.js`: tokenizador PSeInt con 25 tipos de token,
  `KEYWORDS` y `FUNCIONES_NATIVAS_SET`; distingue identificadores, literales,
  operadores y palabras reservadas del dialecto.
- `core/pseint/parser.js`: parser recursivo descendente que produce un AST con
  todos los nodos de estructuras PSeInt (`Algoritmo`, `Asignar`, `Escribir`,
  `Leer`, `Si/Sino`, `Segun`, `Mientras`, `Repetir/HastaQue`, `Para/ConPaso`,
  `Dimension`, `SubProceso/Funcion`, `Llamar`).
- `core/pseint/expression-evaluator.js`: evaluador de expresiones mediante el
  algoritmo shunting-yard; soporta operadores aritméticos, relacionales y
  lógicos con la precedencia de PSeInt, incluyendo `^` y `mod`.
- `core/pseint/symbol-table.js`: tabla de símbolos con `TIPOS_PSEINT` y la
  función `coercionarValor` para conversión de tipos básicos.
- `core/pseint/builtins.js`: 18 funciones nativas (`RC`/`RAIZ`, `ABS`, `LN`,
  `EXP`, `SEN`, `COS`, `TAN`, `ATAN`, `TRUNC`, `REDON`, `AZAR`, `ALEATORIO`,
  `LONGITUD`, `SUBCADENA`, `CONCATENAR`, `MAYUSCULAS`, `MINUSCULAS`,
  `CONVERTIRANUMERO`, `CONVERTIRATEXTO`).
- `core/pseint/runtime.js`: intérprete asíncrono (`RuntimePSeInt`) que ejecuta
  el AST instrucción a instrucción, comunicándose con el `RuntimeHost` de
  Code4Code para I/O (`Escribir`/`Leer`), línea activa e inspector de variables.
- `core/pseint/validator.js`: análisis semántico estático con mensajes de error
  alineados al vocabulario de PSeInt; emite aviso de migración al detectar `=`
  usado como asignación en lugar de `<-`.
- `core/pseint/provider.js`: adapta el núcleo PSeInt al contrato `Code4Code`
  (`tokenizarLinea`, `reglasIndentacion`, `extraerVariables`, `autocompletar`,
  `validar`, `ejecutar`). El método `ejecutar` construye un puente entre la
  interfaz simple de `RuntimePSeInt` y el `RuntimeHost` de Code4Code. Incluye
  documentación de los 18 comandos principales para el panel de aprendizaje.

### Agregado — UI

- `index.html`: carga los nueve scripts del núcleo PSeInt (tokenizer → provider)
  entre el provider LiteSeInt y el editor propio. Agrega la opción
  `<option value="pseint">PSeInt</option>` al selector de lenguaje.
- Panel de aprendizaje: la pestaña "Comandos" muestra la documentación PSeInt
  cuando ese lenguaje está activo; `onCambio` del registro refresca el panel
  al cambiar de lenguaje. Las pestañas "Ruta" y "Errores" muestran un
  placeholder para lenguajes que aún no tienen esa data.

### Agregado — Tests

- `tests/pseint-tokenizer-tests.js`: 25 pruebas del tokenizador PSeInt.
- `tests/pseint-builtins-tests.js`: 61 pruebas de las 18 funciones nativas.
- `tests/pseint-parser-tests.js`: 15 pruebas del parser y el AST generado.
- `tests/pseint-runtime-tests.js`: 15 pruebas de ejecución del runtime
  (asignaciones, estructuras de control, arreglos, subprocesos, I/O).
- `tests/pseint-validator-tests.js`: 17 pruebas del validador estático.
- `tests/contract-tests.js`: extendido a 33 pruebas; la sección PSeInt cubre
  definición del provider, plantilla, tokenizado, reglas de indentación,
  autocompletado, validación, ejecución con `Leer`/`Escribir` y documentación.

### Estado de Fase 3a
Implementado: núcleo completo (tokenizer, parser, expression-evaluator,
symbol-table, builtins, runtime, validator), provider e integración en la UI.
Pendiente (Fase 3b): golden tests contra PSeInt escritorio, aviso de migración
bidireccional completo, conversión implícita de tipos avanzada y perfil flexible.

## [2.0.0-beta] - 2026-06-09

Cierre de la **Fase 1 — Capa multi-lenguaje**: la UI deja de conocer el
núcleo LiteSeInt directamente; validación y ejecución pasan por el contrato
de providers y el RuntimeHost. Regresión cero para el estudiante.

### Cambiado
- `js/app.js` valida y ejecuta a través de `Code4Code.registro.activo()` y
  `Code4Code.crearRuntimeHost(...)`: desaparecen la instancia global
  `new LiteSeInt(...)` y la llamada directa a `DocErrores.validarDocumento`
  del flujo de ejecución. El cierre del ciclo (Listo/Detenido/Error, botones,
  resaltado de línea) lo maneja el estado del host.
- `core/liteseint/provider.js` cablea el núcleo real (se eliminan los
  `TODO(FASE1)`): `validar` usa el validador, `tokenizarLinea` el tokenizer
  (tokens con tipos genéricos del contrato) y `ejecutar` crea un intérprete
  por corrida conectado al RuntimeHost (salida, `Leer`, línea activa,
  inspector de variables, detención).
- Selector de lenguaje `#languageSelect` activo: se puebla desde el registro,
  persiste la elección (`code4code:lenguaje`) y deja a la app lista para
  registrar más lenguajes (Fases 3–4).
- Claves de `localStorage` migradas a `code4code:*` (tema, orden y ancho de
  paneles, lista de ejercicios, trazas y altura de consola, progreso de
  ejercicios) con **lectura retro-compatible**: el progreso guardado por
  LiteSeInt 1.x se migra en la primera lectura y la clave antigua se conserva.
- Banco de ejercicios movido a `json/liteseint/N1.json`–`N7.json` (banco por
  lenguaje); `js/ejercicios-data.js` actualiza sus rutas.
- Descarga e importación de archivos usan la extensión del lenguaje activo
  (`provider.extension`) en lugar de `.psc` fijo.
- `core/runtime-host.js`: `reportarError` propaga la línea del error en el
  meta de consola, y el corte por límite de pasos informa el motivo
  ("posible ciclo infinito") antes de detener.

### Corregido
- `validarYDecorar()` no existía y se invocaba al editar el diagrama NS
  (ReferenceError latente); ahora valida vía provider y pinta los errores.

### Agregado
- `tests/contract-tests.js` pasa de 14 a 21 pruebas: meta de línea en
  `reportarError`, motivo del límite de pasos, y 5 pruebas de integración
  que cargan el núcleo real y ejecutan programas completos (con `Leer` y
  con error de runtime) a través del provider y el host.

---

## [2.0.0-alpha] - 2026-06-09

Primera versión bajo el nombre **Code4Code** (antes LiteSeInt). Sin cambios
funcionales para el estudiante: regresión cero respecto de LiteSeInt v1.9.0.

### Cambiado
- Renombrado del proyecto, la marca y la versión visible: LiteSeInt → Code4Code.
- El núcleo del lenguaje LiteSeInt se mueve intacto de `core/` a
  `core/liteseint/`; `core/LiteSeInt.js` pasa a llamarse
  `core/liteseint/runtime.js`.
- `index.html` actualizado a las nuevas rutas y con un selector de lenguaje
  en la cabecera (deshabilitado hasta cablear la Fase 1).
- `npm test` ahora ejecuta la suite original del núcleo más las pruebas de
  contrato de la capa multi-lenguaje.

### Agregado
- Capa multi-lenguaje (Fase 1, arquitectura):
  - `core/language-provider.js` — contrato común de lenguajes y validación.
  - `core/language-registry.js` — registro de lenguajes, lenguaje activo,
    persistencia de la selección (`code4code:lenguaje`) y suscripción a cambios.
  - `core/runtime-host.js` — I/O unificado de ejecución: consola, entrada de
    usuario, línea activa, inspector de variables, Detener y límite de pasos.
  - `core/liteseint/provider.js` — LiteSeInt registrado como primer lenguaje
    (cableado fino al runtime marcado `TODO(FASE1)`).
  - `tests/contract-tests.js` — 14 pruebas de la capa multi-lenguaje.
- `ROADMAP.md` nuevo con el plan Code4Code (fases 0–6 y decisiones D1–D5).
- `CLAUDE.md` con las reglas de trabajo para sesiones de refactor asistido.
- `scripts/importar-desde-liteseint.sh` para completar el proyecto desde un
  clone del repositorio original.

### Pendiente (ver ROADMAP.md)
- Fase 1 (cierre): cablear `js/app.js` al registro y al RuntimeHost; activar
  el selector de lenguaje; renombrar claves `liteseint:*` de `localStorage`
  con migración retro-compatible.
- Fase 2: editor propio mejorado. Fase 3: lenguaje PSeInt. Fase 4: Python
  con Pyodide. Fase 5: ejercicios multi-lenguaje.

---

# Historial LiteSeInt 1.x

# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

---

## [1.9.0] — 2026-06-08

Diagrama NS bidireccional.

### Resumen
- Panel Diagrama (pestaña inferior) muestra un diagrama de Nassi-Shneiderman del código activo generado al vuelo desde el AST.
- El diagrama es **bidireccional**: hacer clic en un bloque editable (condiciones, etiquetas) muestra un campo inline; al confirmar, el código del editor se actualiza automáticamente.
- `core/diagram-mapper.js` expone `astACodigo(ast)→string` y `astADiagrama(ast)→DiagramaData`; ambas operaciones son puras (sin DOM).
- `js/diagram.js` implementa el renderizador SVG y el overlay de edición.
- `AST_VERSION` incrementado a 5: `nodoPrograma` incluye campo `nombreProceso`.

### Agregado
- **`core/diagram-mapper.js`**: `astACodigo`, `nodoACodigo`, `astADiagrama`, `diagramaAAst`, `normalizarASTParaComparacion`, `LiteSeIntDiagrama`.
- **`js/diagram.js`**: `LiteSeIntDiagramaUI.inicializarDiagrama()` y `LiteSeIntDiagramaUI.refrescarDiagrama(codigo)`.
- **Evento `liteseint:diagramEdit`**: cuando el usuario edita en el diagrama, `app.js` escucha este evento y actualiza el editor + validación estática.
- **Shortcut Ctrl+D**: cambia al tab Diagrama.

### Cambiado
- **`core/ast.js`**: `nodoPrograma` acepta cuarto argumento `nombreProceso`; `AST_VERSION = 5`.
- **`core/parser.js`**: extrae el nombre del `Proceso` de la cabecera y lo pasa a `nodoPrograma`.
- **`index.html`**: versión visible actualizada a `v1.9.0`; `diagramaView` ahora usa el renderizador SVG (antes era placeholder).
- **`shared/ast-contract.md`**: documentado campo `nombreProceso` y `astVersion: 5`.

### Validado
- **Pruebas**: `npm test` pasa con **77 pruebas** (57 anteriores + 20 nuevas de v1.9.0).
- **Ejercicios**: los 245 ejercicios pasan sin cambios.

---

## [1.8.0] — 2026-06-08

SubProcesos y funciones definidas por el usuario.

### Resumen
- Se pueden declarar bloques `SubProceso … FinSubProceso` y `Funcion res = Nombre(params) … FinFuncion` fuera del `Proceso` principal.
- Los subprocesos se invocan con `Llamar Nombre(args)`. Las funciones con retorno se invocan en el lado derecho de una asignación: `r = Funcion(args)`.
- Parámetros por valor (defecto) y por referencia (`Por Referencia`). Los arreglos siempre se pasan por referencia (datos compartidos).
- Recursividad soportada con límite de 256 frames de call stack.
- `AST_VERSION` incrementado a 4: `nodoPrograma` incluye campo `subprocesos`; nuevos nodos `SubProceso` y `Llamar`.

### Agregado
- **`SubProceso` / `FinSubProceso`** y **`Funcion` / `FinFuncion`**: declaración de subprocesos y funciones con parámetros opcionales.
- **`Llamar NombreSP(args)`**: invocación de subproceso como instrucción.
- **Parámetros por referencia**: prefijo `Por Referencia` en la declaración del parámetro.
- **Call stack** con `LiteSeInt.MAX_PROFUNDIDAD_LLAMADA = 256`; error de desbordamiento claro.
- **`core/ast.js`**: `nodoSubProceso(...)` y `nodoLlamar(...)`.
- **`shared/ast-contract.md`**: documentados nodos `SubProceso` y `Llamar`.

### Cambiado
- **`core/tokenizer.js`**: `subproceso`, `finsubproceso`, `funcion`, `finfuncion`, `llamar` agregados a `PALABRAS_RESERVADAS_SET`; eliminados de `CONSTRUCCIONES_FUERA_DE_ALCANCE`.
- **`core/parser.js`**: reescrito para soportar múltiples bloques de nivel superior; extrae SubProcesos en el mapa `subprocesos` del AST.
- **`core/validator.js`**: pre-paso recolecta definiciones de SubProceso; la validación de cuerpos usa tabla local; `validarLlamar` verifica nombre y aridad.
- **`core/LiteSeInt.js`**: `ejecutar()` carga subprocesos del AST; `_ejecutarLlamar` y `_ejecutarSubProcesoCall` ejecutan el cuerpo con scope propio; `_ejecutarDefinir` y `_ejecutarDimension` marcan arreglos como inicializados al completar su registro.
- **`index.html`**: versión visible actualizada a `v1.8.0`.

### Validado
- **Pruebas**: `npm test` pasa con **55 pruebas** (45 anteriores + 10 nuevas de v1.8.0).
- **Ejercicios**: los 245 ejercicios pasan sin cambios.

### Fuera de alcance
- Inspector multi-frame en panel Variables (se agrega en revisión de v1.8.x o v1.9.0).
- Módulos / importación entre archivos.

---

## [1.7.0] — 2026-06-08

Panel de pestañas en el área inferior y inspector de variables en tiempo de ejecución. No cambia el dialecto.

### Resumen
- La consola se convierte en un panel con tres pestañas: **Consola**, **Variables** y **Diagrama** (placeholder).
- La pestaña **Variables** muestra el estado de todas las variables del proceso activo durante y después de la ejecución: nombre, tipo, valor. Los arreglos y matrices son expandibles.
- Los cambios recientes se resaltan brevemente con una animación de flash al ser modificados.
- El runtime emite tres nuevos callbacks: `onVariableChanged`, `onScopeEntered`, `onScopeExited`.
- Los 245 ejercicios existentes pasan sin cambios.

### Agregado
- **Panel de pestañas** en la consola: Consola / Variables / Diagrama.
- **Inspector de variables** en tiempo de ejecución: árbol plano con nombre, tipo y valor; arreglos y matrices expandibles con sus índices.
- **`onVariableChanged({nombre, tipo, valor, inicializada, dimensiones?, datos?})`**: emitido por el runtime en cada creación o modificación de variable (incluyendo el contador de `Para`).
- **`onScopeEntered({})`** y **`onScopeExited({})`**: emitidos al inicio y fin del proceso.
- **Ejemplos `arreglo` y `matriz`** en el selector de ejemplos precargados (faltaban en el HTML desde v1.6.0).

### Cambiado
- **`core/LiteSeInt.js`**: constructor acepta las tres nuevas callbacks; `_notificarCambioVariable(nombre)` inyectado en `_ejecutarDefinir`, `_ejecutarAsignacion`, `_ejecutarLeer`, `_ejecutarPara`, `_ejecutarDimension`, `_ejecutarAsignarIndice`, `_ejecutarLeerIndice`.
- **`index.html`**: encabezado de la consola sustituye `.console-header-title` por `nav.console-tabs`; el cuerpo de la consola envuelve `#consola` en `.console-view#consolaView` y agrega `#variablesView` y `#diagramaView`; versión visible actualizada a `v1.7.0`.
- **`css/styles.css`**: estilos de `.console-tabs`, `.console-tab`, `.console-view`, `.inspector-panel`, `.inspector-var` y variantes de arreglo; animación `inspectorFlash`; regla mobile corregida para ocultar todas las vistas en modo colapsado.
- **`js/app.js`**: `initConsoleTabs()`, `switchConsoleView()`, inspector state (`_inspectorVars`, `_inspectorOrder`), `limpiarInspector()`, `actualizarInspector()`, `renderizarInspector()`, `renderizarFilaVariable()`, `renderizarFilaArreglo()`; `limpiarConsola()` también limpia el inspector.

### Validado
- **Pruebas**: `npm test` pasa con **45 pruebas** (41 anteriores + 4 nuevas de v1.7.0).
- **Ejercicios**: los 245 ejercicios ejecutan con salida idéntica.
- **Diagrama**: pestaña placeholder visible con mensaje "Disponible en v1.9.0".

### Fuera de alcance
- Modo paso a paso (entrará en una revisión de v1.7.x o v1.8.0).
- Inspector multi-frame / call stack (entra en v1.8.0 con `SubProceso`).
- Diagrama bidireccional (v1.9.0).

---

## [1.6.0] — 2026-06-07

Agrega arreglos unidimensionales y matrices bidimensionales con la instrucción `Dimension`. Es el primer cambio de dialecto visible desde `v1.0.0`.

### Resumen
- `Dimension arr[n]` declara un arreglo de `n` elementos (1-indexado).
- `Dimension mat[n, m]` declara una matriz de `n × m` elementos (1-indexado).
- Los elementos se leen con `arr[i]`, se asignan con `arr[i] = expr` y se leen con `Leer arr[i]`.
- `Dimension` puede ir antes o después de `Definir`; ambos deben aparecer antes de cualquier acceso.
- Los arreglos y matrices son accesibles en expresiones dentro de `Escribir`, condiciones y asignaciones escalares.
- Los 245 ejercicios existentes pasan las pruebas sin cambios.

### Agregado
- **`Dimension`**: nueva instrucción declarada en todos los módulos del núcleo.
- **Arreglos 1D**: `Dimension v[5]` + `Definir v Como Entero`. Acceso: `v[i]`, `v[i] = expr`, `Leer v[i]`.
- **Matrices 2D**: `Dimension m[3, 3]` + `Definir m Como Entero`. Acceso: `m[i, j]`, `m[i, j] = expr`.
- **Validación estática** completa: tamaño cero, índices no numéricos, variable no dimensionada, índice fuera de rango, dimensiones inválidas.
- **Ejemplos precargados** `arreglo` y `matriz` en el selector de ejemplos.
- **AST**: nodos `Dimension`, `AsignarIndice`, `LeerIndice` en `core/ast.js`; `AST_VERSION` subió de 2 a 3.
- **`shared/ast-contract.md`**: documentados los tres nodos nuevos.

### Cambiado
- **`core/tokenizer.js`**: añadidos `TK.LBRACKET`, `TK.RBRACKET` y `'dimension'` a palabras reservadas. `Dimension` eliminado de `CONSTRUCCIONES_FUERA_DE_ALCANCE`.
- **`core/symbol-table.js`**: `dimensionar()`, `obtenerDimensiones()` y `esArreglo()` para gestión de dimensiones; `definir()` detecta pre-registro por `Dimension`.
- **`core/validator.js`**: `validarDimension`, `validarAsignacionIndice`, `validarLeerIndice`; `validarListaExpresiones` y `validarExpresionTokens` entienden `[`. El separador de comas respeta niveles de corchete.
- **`core/parser.js`**: detecta `Dimension nombre[...]`, `nombre[...] = expr` y `Leer nombre[...]` y emite los nodos correctos.
- **`core/expression-evaluator.js`**: el tokenizador de expresiones emite `indiceArreglo` al detectar `nombre[...]`; `_evaluarRPN` resuelve el elemento en runtime.
- **`core/LiteSeInt.js`**: casos `Dimension`, `AsignarIndice`, `LeerIndice` en `_ejecutarNodo`; `_initArrayDatos`, `_getArrayElement`, `_setArrayElement`, `_validarIndices`; `_separarPorComas` respeta corchetes para no partir índices 2D.

### Validado
- **Pruebas**: `npm test` pasa con **41 pruebas** (30 anteriores + 11 nuevas de v1.6.0).
- **Rango y tipo**: error `IndiceFueraDeRango` y `ArregloNoDimensionado` se emiten con mensaje claro.
- **Paridad**: los 245 ejercicios visibles parsean y ejecutan sin errores sobre el AST nuevo.
- **Roundtrip AST**: los nodos `Dimension` y `AsignarIndice` sobreviven `JSON.stringify` / `JSON.parse`.

### Fuera de alcance
- Arreglos de más de 2 dimensiones.
- Redimensionado dinámico (`Dimension` solo se puede llamar una vez por variable).
- Subprocesos (`SubProceso` / `FinSubProceso`) — entran en v1.8.0.

## [1.1.0] — 2026-06-03

Reestructura interna sin cambio de dialecto ni de comportamiento visible. El motor queda dividido en módulos de capa única dentro de `core/` y produce un AST explícito versionado. Es la base que `v1.2.0` (backend) y `v1.6.0+` (lenguaje 2.0) consumirán sin tocar la fachada del editor.

### Resumen
- Editor, consola y banco de ejercicios funcionan exactamente igual que en `v1.0.0`. Los 245 ejercicios siguen validando y ejecutando con la misma salida.
- El motor del lenguaje quedó reorganizado en módulos de responsabilidad única dentro de `core/`.
- El parser construye un AST explícito (`astVersion: 2`) con nodos en PascalCase y `loc` por nodo. El runtime ejecuta sobre ese AST.
- Tabla de símbolos extraída con una `ScopeChain` lista para soportar subprocesos en `v1.8.0` (en `v1.1.0` solo hay scope global, pero la cadena ya existe).

### Cambiado
- **Reorganización a `core/`**: `core/tokenizer.js`, `core/symbol-table.js`, `core/validator.js`, `core/doc_errores.js` (aggregator), `core/ast.js`, `core/parser.js`, `core/expression-evaluator.js`, `core/LiteSeInt.js`. Los archivos previos `js/doc_errores.js` y `js/LiteSeInt.js` ya no existen.
- **`core/doc_errores.js`** quedó como aggregator delgado (~35 líneas) que re-expone el contrato público `DocErrores.{...}` sobre el que dependen `js/app.js`, el runtime y los tests.
- **Runtime de `LiteSeInt.js`** consume `LiteSeIntParser.parsearPrograma(codigo).cuerpo` en lugar de re-parsear por línea internamente. El switch del ejecutor reconoce los nodos en PascalCase (`Definir`, `Asignar`, `Si`, `Mientras`, `Repetir`, `Para`, `Segun`, ...) y lee `nodo.loc.linea`.
- **Evaluador de expresiones** extraído a `core/expression-evaluator.js`. `LiteSeInt.js` aplica el mixin sobre `LiteSeInt.prototype` después de declarar la clase. Las tablas `_OPERADORES` y `_FUNCIONES_NATIVAS` siguen accesibles como estáticos de la clase.
- **`core/symbol-table.js`** nuevo: contiene `TablaSimbolos` (movida desde `validator.js`) y la nueva `ScopeChain` con `actual()`, `global()`, `push()`, `pop()`, `lookup(nombre)` y `profundidad()`.

### Agregado
- **`core/ast.js`**: factories para los nodos del AST (`Programa`, `Definir`, `Asignar`, `Leer`, `Escribir`, `Si`, `Mientras`, `Repetir`, `Para`, `Segun`, `Caso`, `Desconocido`), `AST_VERSION = 2` y helpers `serializarAST` / `deserializarAST`.
- **`core/parser.js`**: `parsearPrograma(codigo)` devuelve `{ tipo: "Programa", astVersion: 2, cuerpo, loc }`.
- **`shared/ast-contract.md`**: contrato público del AST documentado con shape por nodo, reglas de extensión y matriz de capas que lo consumen.

### Validado
- **Pruebas**: `npm test` pasa con **30 pruebas** (las 17 originales + 9 nuevas de parser/AST + 1 de paridad de ejecución sobre ejercicios reales + 3 de symbol-table/ScopeChain).
- **Paridad de ejecución**: los ejercicios visibles del banco que no requieren `Leer` ejecutan con `exito === true` y cero errores runtime sobre el nuevo AST.
- **Roundtrip AST**: `JSON.stringify` / `JSON.parse` preserva el árbol generado por el parser.
- **Carga estática**: `index.html` continúa sirviéndose desde la raíz del repo (GitHub Pages intacto).

### Fuera de alcance
- Backend, autenticación, persistencia, cuentas y modelo académico (entran en `v1.2.0` y `v1.3.0`).
- Nuevas construcciones del lenguaje: `Dimension`, `SubProceso`, `Funcion`, `Llamar` (entran en `v1.6.0` y `v1.8.0`).
- Cambios visibles en el editor, la consola o el banco de ejercicios.

## [1.0.0] — 2026-05-04

Release estable de LiteSeInt como plataforma minimalista para aprender pseudolenguaje desde el navegador. Cierra el camino desde `v0.9.0` consolidando documentación, banco de ejercicios, ruta del estudiante y guía de errores. **No agrega lenguaje nuevo respecto a v0.9.6**: el dialecto LiteSeInt queda congelado para 1.0.

### Resumen
- Editor web con resaltado, autocompletado, validación estática y ejecución, todo en el navegador y sin build.
- Consola inferior redimensionable con entrada inline para `Leer`.
- Panel de aprendizaje integrado con pestañas `Ejercicios`, `Comandos`, `Ruta` y `Errores`, redimensionable horizontalmente.
- Banco de **245 ejercicios adaptados** al dialecto LiteSeInt, cargados desde `json/N1.json` a `json/N7.json` con `estadoAdaptacion: adaptado` y `codigoReferencia` que pasa validación estática.
- Niveles **N1–N7** visibles en la app, con progreso local por ejercicio en `localStorage` (`liteseint:exerciseProgress`).
- Guía de **17 comandos** y guía de **16 errores comunes** integradas, sin depender de internet.
- Ruta N1–N7 con objetivos, requisitos, comandos clave y avance local.
- Importación de archivos `.psc`, ejemplos agrupados por concepto y confirmación previa para acciones que reemplazan el editor.

### Cambiado
- **Versión visible**: `v1.0.0`.
- **README, EJERCICIOS, ROADMAP**: estado y referencias actualizadas a `v1.0.0`.
- **ROADMAP**: hito `v1.0.0 — Release Estable` marcado como completado; checklist de salida 1.0 cumplido salvo el tag de release.

### Validado
- **Pruebas**: `npm test` pasa con 17 pruebas (validador estático, runtime, banco de ejercicios y documentación interna).
- **Banco de ejercicios**: 245 ejercicios visibles, todos `adaptado`, sin sintaxis prohibida (`<-`, `Cadena`, `SiNo`, `MOD`, `DIV`) en `codigoReferencia`.
- **Documentación interna**: IDs recomendados por `DOC_COMANDOS` existen en el banco; ejemplos de comandos y errores validan.
- **Niveles visibles**: alineados con N1–N7.

### Fuera de alcance (post-1.0)
- Validación automática por salida esperada en ejercicios seleccionados.
- Modo práctica guiada con pasos desbloqueables.
- Exportación/importación de progreso local.
- Mejoras de accesibilidad y navegación por teclado.
- Revisión pedagógica profunda de ejercicios avanzados (N6 y N7).
- Nuevos bancos de ejercicios manteniendo el dialecto LiteSeInt estable.

## [0.9.6] — 2026-05-04

QA final pre-release. No cambia el lenguaje, el runtime ni la UI: ejecuta y registra la pasada de verificación previa al bump a `v1.0.0`.

### Validado
- **Pruebas**: `npm test` pasa con 17 pruebas (validador estático, runtime, banco de ejercicios y documentación interna).
- **Banco de ejercicios**: los 245 ejercicios visibles siguen cargando desde `json/N1.json` a `json/N7.json`, todos con `estadoAdaptacion: adaptado`, sin sintaxis prohibida (`<-`, `Cadena`, `SiNo`, `MOD`, `DIV`) en `codigoReferencia` y pasando validación estática.
- **Documentación de comandos**: los IDs de ejercicios recomendados por `DOC_COMANDOS` existen en el banco; los ejemplos no usan sintaxis PSeInt prohibida.
- **Documentación de errores**: los ejemplos corregidos validan; los incorrectos reproducen errores estáticos o de runtime.
- **Niveles visibles**: alineados con N1–N7.

### Cambiado
- **README, EJERCICIOS y ROADMAP**: estado actualizado a `v0.9.6`; el hito `v0.9.6 — QA Final Pre-Release` queda marcado como completado en el roadmap.
- **Versión visible**: `v0.9.6`.

## [0.9.5] — 2026-05-04

Ajuste de versionado para la revisión de redimensionado horizontal del panel de aprendizaje.

### Cambiado
- **Panel de aprendizaje**: mantiene el menú de ejercicios desplegado por defecto, conserva el redimensionado horizontal dentro del rango definido para el layout y vuelve a mostrar la lista al recuperar espacio suficiente.
- **README, EJERCICIOS y ROADMAP**: estado actualizado a `v0.9.5`.
- **Versión visible**: `v0.9.5`.

### Validado
- **Pruebas**: `npm test` pasa con 17 pruebas.

## [0.9.4] — 2026-05-04

Preparación de release hacia `v1.0.0`, consolidando los ajustes finales de interacción, theming y archivos `.psc`.

### Agregado
- **Importación `.psc`**: nuevo botón en el editor para cargar archivos `.psc` y reemplazar el contenido previa confirmación.
- **Redimensionado horizontal**: el panel de aprendizaje parte en 50%; al ampliarlo, el borde no permite pasar del ancho natural del menú, y al reducirlo minimiza la lista de ejercicios cuando queda angosto.
- **Tooltips compactos**: acciones de editor y consola (`cargar`, `descargar`, `borrar editor`, `borrar consola`, `mostrar/ocultar trazas`) usan tooltips propios alineados con el estilo de la barra de progreso.
- **SweetAlert compacto**: las alertas y confirmaciones usan clases `liteseint-swal*`, menor tamaño y botones acordes al sistema visual.
- **Tokens de superficies**: nuevas variables `--surface-*` aíslan fondos de panel, lista, detalle, tarjetas y subpaneles para simplificar la creación de themes.

### Cambiado
- **Tema Papel**: el workspace oscuro conserva headers, gutter y consola en tonos oscuros; el detalle de ejercicios queda levemente más oscuro que la selección.
- **Panel de ejercicios**: el botón de minimizar lista existe tanto en el header como junto al progreso; si la lista está minimizada, seleccionar otro ejercicio mantiene el estado minimizado.
- **Carga de ejemplos**: solo pide confirmación cuando el proceso actual ya no es el genérico `nombre_proceso`.
- **Descarga `.psc`**: ahora se bloquea si no hay instrucciones reales dentro del proceso o si el nombre del proceso sigue siendo genérico.
- **Textos de confirmación**: cada alerta describe la acción concreta (`Borrar editor`, `Borrar consola`, `Cargar ejemplo`, `Importar archivo`, `Ver referencia`).
- **Banco JSON**: títulos de ejercicios seleccionados en N1 y N2 quedan sin sufijos técnicos de origen.
- **README, EJERCICIOS y ROADMAP**: estado actualizado a `v0.9.4`.
- **Versión visible**: `v0.9.4`.

### Validado
- **Pruebas**: `npm test` pasa con 17 pruebas.

## [0.9.3] — 2026-05-04

Revisión UX de flujo completo para que la práctica pueda completarse desde la app sin explicación externa.

### Cambiado
- **Confirmaciones de reemplazo**: cargar ejemplos y borrar el editor ahora piden confirmación antes de reemplazar el código actual, igual que el código de referencia de ejercicios.
- **Responsive móvil**: en pantallas pequeñas el editor queda como primer bloque, el panel de aprendizaje pasa debajo con altura contenida, los filtros quedan accesibles y los controles del editor/consola reducen presión horizontal.
- **Selector de ejemplos**: el menú vuelve a su estado inicial después de confirmar o cancelar la carga.
- **README y EJERCICIOS**: estado actualizado a `v0.9.3`.
- **Versión visible**: `v0.9.3`.

### Validado
- **Pruebas**: `npm test` pasa.

## [0.9.2] — 2026-05-03

Pruebas de material pedagógico para reforzar la confianza antes del cierre estable hacia `v1.0.0`.

### Agregado
- **Pruebas del banco completo**: `tests/run-tests.js` confirma que se cargan 245 ejercicios desde N1–N7 con la distribución esperada: 20, 40, 40, 60, 15, 40 y 30.
- **Prueba de niveles visibles**: la suite verifica que `NIVELES_VISIBLES` esté alineado con N1–N7.
- **Pruebas de documentación de comandos**: la suite extrae `DOC_COMANDOS` desde `js/app.js`, verifica que los ejercicios recomendados existan en el banco real y que los ejemplos no usen sintaxis PSeInt prohibida.
- **Pruebas de documentación de errores**: la suite extrae `DOC_ERRORES_COMUNES`, valida que todos los ejemplos corregidos pasen `DocErrores.validarDocumento` y que los ejemplos incorrectos reproduzcan errores estáticos o estén marcados como casos de runtime.

### Cambiado
- **README**: versión visible actualizada a `v0.9.2` y descripción de pruebas ampliada para incluir banco y documentación interna.
- **EJERCICIOS**: estado actualizado a `v0.9.2`, dejando explícito que la cobertura principal está respaldada por pruebas del banco o de documentación.
- **ROADMAP**: hito `v0.9.2` marcado como completado.
- **Versión visible**: `v0.9.2`.

### Validado
- **Pruebas**: `npm test` pasa con 17 pruebas.

---

## [0.9.1] — 2026-05-03

Revisión de consistencia documental para alinear el proyecto con el estado real posterior a `v0.9.0`.

### Cambiado
- **ROADMAP**: se reemplaza la hoja histórica desde `v0.6.5` por un plan enfocado desde `v0.9.0` hacia `v1.0.0`, con hitos `v0.9.1`–`v0.9.4`, checklist de salida, riesgos y alcance post-1.0.
- **README**: se actualiza la versión visible a `v0.9.1`, se corrigen referencias antiguas a `v0.8.x` y se reformula la ruta hacia 1.0 como estabilización, pruebas de material pedagógico, revisión UX y preparación de release.
- **EJERCICIOS**: se corrige la visibilidad real de N1–N7, se elimina la referencia obsoleta a N6/N7 como evaluación futura no visible, se reemplaza la distribución antigua N0–N9 por N1–N7 y se marca la cobertura pedagógica principal como cubierta.
- **Versión visible**: `v0.9.1`.

### Validado
- **Pruebas**: `npm test` pasa con 11 pruebas.

---

## [0.9.0] — 2026-05-02

Mejora de la vista `Errores`: `DOC_ERRORES_COMUNES` pasa de 9 a 16 entradas, agrupadas por categoría, con ejemplo incorrecto + corrección y resaltado de sintaxis. Las tarjetas son colapsables como las vistas de comandos y rutas. Cada error documentado coincide con un mensaje real del validador o del runtime.

### Cambiado
- **Guía de errores**: cuatro categorías (`Estructura`, `Variables`, `Expresiones`, `Ciclos`) cubren los errores típicos del estudiante inicial: `Falta Proceso o FinProceso`, `Bloque sin cerrar`, `Cierre cruzado de bloques`, `Falta HastaQue`, `Variable no definida`, `Variable no inicializada`, `Palabra reservada como variable`, `Variable ya definida`, `Tipo incompatible al Leer`, `Texto sin cerrar`, `Paréntesis o argumentos incompletos`, `Operador incompleto`, `Confusión entre = y ==`, `Sintaxis PSeInt no soportada`, `Ciclo infinito` y `Paso cero en Para`.
- **Estructura por entrada**: cada error mantiene síntoma, causa, corrección, ejemplo incorrecto (cuando aporta claridad) y ejemplo corregido. Los síntomas citan los mensajes reales que produce `js/doc_errores.js` y `js/LiteSeInt.js`.
- **Vista `Errores`**: las tarjetas adoptan el patrón colapsable usado en `Comandos` y `Rutas` (botón con título y chevron, cuerpo oculto hasta abrir). Los ejemplos ahora se renderizan con resaltado de sintaxis idéntico al editor.
- **CSS**: nuevas reglas `.learning-doc-label-bad`, `.learning-doc-label-good`, `.learning-doc-cat-label`, `.doc-pre-bad` reutilizando `--error` y `--accent` del sistema de temas.
- **README**: versión visible actualizada.
- **Versión visible**: `v0.9.0`.

### Validado
- **Pruebas**: `npm test` pasa con 11 pruebas.
- **Ejemplos corregidos**: los 16 ejemplos `ejemplo` se pasaron por `DocErrores.validarDocumento` y validan sin errores.
- **Ejemplos incorrectos**: los `ejemploMal` con error de validación estática se verificaron contra el mensaje real del validador. Los casos atrapados solo en runtime (variable no inicializada, paréntesis y operadores incompletos) están marcados con "Al ejecutar..." en el síntoma.

---

## [0.8.9] — 2026-05-02

Mejora de la vista `Ruta`: los datos de `NIVELES_LITESEINT` quedan alineados con el banco real de 245 ejercicios y la vista muestra progreso, requisitos y ejercicios agrupados por grado de ayuda.

### Cambiado
- **`NIVELES_LITESEINT`**: los siete niveles se reescriben con nombres propios de LiteSeInt (`Primeros programas`, `Expresiones y fórmulas`, `Decisiones`, `Repetición`, `Desafíos`, `Decisiones anidadas`, `Menú y acumulación`), eliminando los nombres de EA originales (`Introducción a los Algoritmos`, `Diagramas de Flujo`, `Tipo Prueba Parte 1/2`). Cada nivel agrega campos `antes` (requisito previo) y `comandosClave` (array de comandos del nivel).
- **Vista `Ruta`**: el render muestra requisito previo (`Antes:`), comandos clave como badges, barra de progreso con porcentaje, ejercicios agrupados en `Para comenzar` (guiado/con-pista básico), `Para practicar` (práctica) y `Para desafiar` (desafío), y la sección `Cuándo avanzar` diferenciada visualmente.
- **CSS**: nuevas reglas `.route-antes`, `.route-commands`, `.route-cmd-badge`, `.route-progress-wrap`, `.route-progress-bar`, `.route-progress-fill` para los elementos nuevos de la tarjeta de nivel.
- **README**: versión visible actualizada.
- **Versión visible**: `v0.8.9`.

### Validado
- **Pruebas**: `npm test` pasa con 11 pruebas.

---

## [0.8.8] — 2026-05-02

Mejora de la guía de comandos: `DOC_COMANDOS` pasa de 12 a 17 entradas, con contenido más directo para principiantes, ejemplos adicionales para comandos complejos y cobertura de operadores y tipos como documentación independiente.

### Cambiado
- **Guía de comandos**: se amplía con cinco entradas nuevas (`Tipos de dato`, `Operadores aritméticos`, `Operadores relacionales`, `Operadores lógicos`, `Funciones de texto`) y se separa la entrada anterior de `Funciones nativas` en `Funciones numéricas` y `Funciones de texto`.
- **Contenido de cada entrada**: se mejoran las descripciones con lenguaje más directo, se refuerzan los campos `detalle` (cuándo usarlo) distinguiendo alternativas (`Mientras` vs `Para` vs `Repetir`), y se actualizan las referencias de ejercicios.
- **Ejemplos adicionales**: `Si / Sino / FinSi` agrega un Si anidado; `Mientras / FinMientras` agrega un patrón de menú; `Para / FinPara` agrega conteo descendente y múltiplos con `Con Paso`; `Segun / FinSegun` agrega caso con múltiples valores separados por coma.
- **Render de comandos**: el bloque de comandos soporta un campo `ejemplo2` opcional que se muestra bajo la etiqueta `Otro ejemplo`, sin cambiar la estructura visual de los comandos que no lo usan.
- **Referencias de ejercicios**: se actualizan los IDs para `Para` (`n4-041`, `n4-042`, `n4-047`) y `Segun` (`n3-031`, `n3-032`, `n3-033`); todos los IDs nuevos y existentes verificados contra los JSON `N1`–`N7`.
- **README**: versión visible y descripción de la guía de comandos actualizadas.
- **Versión visible**: `v0.8.8`.

### Validado
- **Pruebas**: `npm test` pasa con 11 pruebas.
- **Ejemplos nuevos**: los 17 ejemplos (incluyendo `ejemplo2`) pasan la validación estática de `DocErrores.validarDocumento`.

---

## [0.8.7.1]

### Cambiado
- **ROADMAP**: desde `0.8.8` en adelante el cierre hacia `v1.0.0` se reformula como pulido de comandos, rutas y errores; se elimina el puente con Python como objetivo futuro.
- **README**: la hoja de ruta queda alineada con el nuevo alcance, centrado en LiteSeInt.

---

## [0.8.7] — 2026-05-01

Versión de documentación pedagógica: mejora la ruta hacia `v1.0.0`, amplía la guía de comandos, refuerza la guía de errores y hace más legibles las pestañas del panel de aprendizaje.

### Cambiado
- **Ruta hacia v1.0.0**: `ROADMAP.md` y la vista `Ruta` distinguen estado actual, pendientes bloqueantes y pendientes posteriores a 1.0.
- **Guía de comandos**: la vista `Comandos` agrega explicación de uso, errores típicos y ejemplos más contextualizados para cada construcción soportada.
- **Documentación de errores**: la vista `Errores` incorpora síntoma, causa, corrección y ejemplo, además de nuevos casos frecuentes como ciclo infinito, texto sin cerrar y paréntesis incompletos.
- **Detalle de ejercicios**: el bloque `ej-enunciado` ahora se presenta como sección propia e incluye una orientación según el grado de ayuda del ejercicio.
- **Panel de aprendizaje**: los textos de `.learning-tab` aumentan de tamaño y peso visual para mejorar legibilidad.
- **README**: se amplían la guía de comandos y la ruta de desarrollo hacia `v1.0.0`.
- **Versión visible**: `v0.8.7`.

### Validado
- **Pruebas**: `npm test` pasa con 11 pruebas.

---

## [0.8.6] — 2026-05-01

Pulido de la experiencia de aprendizaje y consola: esta versión reorganiza controles, filtros y acciones para dejar la interfaz más compacta y orientada a práctica.

### Cambiado
- **Consola**: los controles de ejecutar/detener pasan al header de consola; limpiar, trazas y descarga usan botones con iconos.
- **Consola**: nuevo toggle de trazas para ocultar/mostrar mensajes internos como `entrada` y asignaciones; por defecto quedan ocultos.
- **Panel de aprendizaje**: las vistas `Ejercicios`, `Comandos`, `Rutas` y `Errores` pasan al header como pestañas.
- **Banco de ejercicios**: filtros de nivel, dificultad y estado ocupan el ancho superior del sector; el detalle reorganiza tags, conceptos, enunciado, pista y E·P·S.
- **Código de referencia**: se elimina el botón de cargar plantilla; el acceso al código de referencia queda como botón de ojo en `ej-detail-tags`, con tooltip y confirmación previa.
- **Temas visuales**: se separan paletas para dificultad, estado y acciones de referencia en los tres temas.
- **Documentación**: `README.md` actualizado a `v0.8.6` e incluye enlace a GitHub Pages.

---

## [0.8.5] — 2026-04-30

Cierre de la fase "Documentación Integrada": el panel de aprendizaje ahora combina banco de ejercicios, referencia de comandos, ruta del estudiante y guía de errores comunes dentro de la app.

### Agregado
- **Documentación interna de comandos**: nueva vista `Comandos` con sintaxis soportada, descripción breve, ejemplo mínimo y ejercicios recomendados para practicar cada construcción.
- **Ruta del estudiante**: nueva vista `Ruta` con recorrido N1–N7, progreso local por nivel y accesos directos a ejercicios iniciales.
- **Errores comunes**: nueva vista `Errores` con correcciones para variable no definida, variable no inicializada, cierres faltantes, sintaxis PSeInt no soportada y confusión entre `=` y `==`.
- **Temas visuales**: selector de tema persistente con paletas `Hacker`, `Ocean` y `Sunset`.

### Cambiado
- **Panel de aprendizaje**: el banco pasa a una navegación por pestañas y puede moverse entre izquierda/derecha con asa de arrastre persistente.
- **Banco de ejercicios**: filtros convertidos a píldoras, barra de progreso compacta, lista colapsable y numeración visible `N#-##` en cada ejercicio.
- **`json/N1.json`–`json/N7.json`**: cada ejercicio incorpora el campo `numero`, validado por pruebas.
- **Documentación**: `README.md`, `EJERCICIOS.md`, comentarios de banco y versión visible actualizados a `v0.8.5`.

### Validado
- **Pruebas**: `npm test` pasa con 11 pruebas.

---

## [0.8.4] — 2026-04-30

Corrección visual del editor y normalización del estilo de los códigos de referencia del banco de ejercicios.

### Corregido
- **Editor**: sincroniza el scroll real del `textarea` con las capas espejo de sintaxis y subrayados para que el cursor, la selección y el texto coloreado no se desalineen en contextos largos.
- **Editor**: unifica la altura de línea usada por `textarea`, resaltado, subrayados, overlays y gutter para evitar acumulación de redondeo al hacer scroll.

### Cambiado
- **`codigoReferencia` en `json/EA 1.1.json`–`json/EA 1.7.json` y `json/N1.json`–`json/N7.json`**: formato consistente con 2 espacios por nivel, comas con espacio en `Definir`, separación entre declaraciones, entrada/salida y operaciones, y asignaciones consecutivas alineadas.
- **Ejercicios visibles**: N1–N7 quedan visibles en la app.
- **Documentación**: `README.md`, `EJERCICIOS.md`, comentarios de banco y versión visible actualizados a `v0.8.4`.

### Validado
- **490 `codigoReferencia` adaptados** pasan validación estática.
- **Pruebas**: `npm test` pasa con 11 pruebas.

---

## [0.8.3] — 2026-04-29 (reorganización N1-N7)

Refactorización del banco de ejercicios: los archivos `json/EA 1.x.json` fueron renombrados a `json/N1.json`–`json/N7.json`. Los ids de ejercicios pasaron de `ea1-x-###` a `n1-001`... `n7-030`. El campo `nivelLiteSeInt` refleja ahora el número de nivel (1-7). Solo los niveles N1–N5 son visibles en la app; N6 y N7 quedan preparados como evaluación futura (`NIVELES_VISIBLES = [1, 2, 3, 4, 5]`).

### Cambiado
- **`json/N1.json`–`json/N7.json`**: reemplazan a `json/EA 1.1.json`–`json/EA 1.7.json`. Todos los ejercicios conservan su `origen` original para trazabilidad.
- **`js/ejercicios-data.js`**: `EJERCICIOS_JSON_PATHS` apunta a los nuevos archivos N1–N7.
- **`js/app.js`**: agrega `NIVELES_VISIBLES = [1, 2, 3, 4, 5]`; `ejerciciosVisibles()` filtra por ese array; `NIVELES_LITESEINT` actualizado a N1–N7.
- **`EJERCICIOS.md`**: tabla de estructura actualizada a N1–N7.
- **Versión visible**: `v0.8.3`.

---

## [0.8.2] — 2026-04-28

Consolidación del banco de ejercicios. Esta versión mueve la fuente real de ejercicios a JSON normalizados por EA y deja `js/ejercicios-data.js` como cargador único del banco.

### Agregado
- **245 ejercicios adaptados y visibles**: los archivos `json/EA 1.1.json` a `json/EA 1.7.json` quedan en el formato normalizado del banco (`id`, `origen`, `modulo`, `experiencia`, `nivelLiteSeInt`, `dificultad`, `gradoAyuda`, `titulo`, `conceptos`, `enunciado`, `entradaProcesoSalida`, `salidaEsperada`, `pista`, `codigoReferencia`, `estadoAdaptacion`, `motivoExclusion`).
- **Carga centralizada desde JSON**: `js/ejercicios-data.js` ahora define las rutas de las EAs, carga los JSON con `fetch`, instala el banco y expone `EjerciciosLiteSeInt`.

### Cambiado
- **`index.html`**: carga `js/ejercicios-data.js` antes de `js/app.js`.
- **`js/app.js`**: deja de conocer las rutas JSON y delega la carga en `EjerciciosLiteSeInt.cargarDesdeJson()`.
- **`tests/run-tests.js`**: las pruebas instalan el banco desde los JSON, alineadas con el flujo de la app.
- **Documentación**: `README.md` y `EJERCICIOS.md` reflejan que el banco visible contiene 245 ejercicios adaptados.
- **Versión visible**: `v0.8.2`.

### Pendiente
- Optimizar los JSON de **EA 1.6** y **EA 1.7**: aunque están normalizados y pasan validación estática, todavía requieren revisión pedagógica para reducir repetición, mejorar enunciados/pistas y ajustar progresión.

## [0.8.0] — 2026-04-26

Cierre de la fase "Banco de Ejercicios Integrado". Esta versión reemplaza los placeholders del panel derecho por un banco real de ejercicios navegable, derivado de `ejercicios/guia.html` y adaptado al dialecto LiteSeInt. No cambia el lenguaje ni el runtime.

### Agregado
- **`js/ejercicios-data.js`**: nueva fuente de datos del banco de ejercicios. Expone `EjerciciosLiteSeInt` con `EJERCICIOS`, helpers (`listarAdaptados`, `porId`, `porNivel`) y constantes (`ESTADOS_VALIDOS`, `DIFICULTADES_VALIDAS`, `GRADOS_VALIDOS`).
- **Primer lote de 20 ejercicios adaptados** desde `ejercicios/guia.html`, cubriendo los niveles 0-7 de la ruta LiteSeInt: orientación (2), secuencia/salida (1), variables/entrada (3), expresiones y E·P·S (3), decisiones simples (3), decisiones múltiples (2), repetición controlada (3) y patrones de procesamiento (3). Cada ejercicio normaliza los campos definidos en `EJERCICIOS.md` (`id`, `origen`, `modulo`, `experiencia`, `nivelLiteSeInt`, `dificultad`, `gradoAyuda`, `titulo`, `conceptos`, `enunciado`, `entradaProcesoSalida`, `salidaEsperada`, `pista`, `codigoReferencia`, `estadoAdaptacion`, `motivoExclusion`).
- **Panel derecho navegable**: filtros por **nivel**, **dificultad** y **estado**; resumen de progreso (completados/en curso/total); listado con badge de nivel, dificultad y estado; detalle del ejercicio con tags, enunciado, conceptos, entrada/proceso/salida, salida esperada y pista colapsable.
- **Acciones por ejercicio**: botón "Cargar plantilla" (genera un esqueleto `Proceso ... FinProceso` con el título como nombre) y botón "Ver código de referencia" (carga la solución adaptada). Ambos confirman antes de sobrescribir el editor si tiene contenido distinto del placeholder.
- **Progreso local persistente**: cada ejercicio puede marcarse como `pendiente`, `en curso` o `completado`. El estado se guarda en `localStorage` bajo la clave `liteseint:exerciseProgress` y persiste al recargar la página.
- **Pruebas del banco** (`tests/run-tests.js`): seis nuevas pruebas que validan ids únicos, presencia de campos obligatorios, valores permitidos para estado/dificultad/grado de ayuda, ausencia de sintaxis prohibida (`<-`, `Cadena`, `SiNo`, `MOD`, `DIV`, `;` final) en `codigoReferencia`, paso por `DocErrores.validarDocumento` para todos los códigos adaptados, y que todo ejercicio visible esté en estado `adaptado`.

### Cambiado
- **`index.html`**: el panel derecho deja de mostrar el listado de niveles 0-9 con placeholders "próximamente" y pasa a mostrar el banco con filtros + lista + detalle. La cabecera del panel ahora se titula `Ejercicios`. Se carga `js/ejercicios-data.js` antes de `js/app.js`.
- **`js/app.js`**: las funciones `NIVELES_APRENDIZAJE`, `renderizarNivelesAprendizaje`, `mostrarDetalleNivel` y `seleccionarNivel` se reemplazan por la familia del banco: `cargarProgreso`/`guardarProgreso`/`estadoEjercicio`/`setEstadoEjercicio`, `aplicarFiltros`, `renderizarListaEjercicios`, `renderizarResumenProgreso`, `mostrarDetalleEjercicio`, `cargarPlantillaEjercicio`, `cargarCodigoReferencia`, `seleccionarEjercicio` e `inicializarBancoEjercicios`.
- **`css/styles.css`**: nueva sección "EXERCISE BANK" con estilos para `.ej-filters`, `.ej-list`, `.ej-item`, `.ej-detail`, `.ej-tag`, `.ej-eps`, `.ej-salida`, `.ej-pista`, `.ej-actions`, `.ej-btn`, `.ej-btn-estado` y `.ej-progress-summary`. Reusa las variables existentes (`--accent`, `--warning`, `--danger`, `--border-color`, etc.).
- **`EJERCICIOS.md`**: tabla de seguimiento actualizada con la integración real (20 adaptados de 245), distribución por nivel del primer lote y criterios usados para la selección.
- **`README.md`**: nueva sección "Banco de ejercicios" describiendo filtros, detalle, plantilla, código de referencia y progreso local.
- **Versión visible**: `v0.8.0`.

### Compatibilidad
- Sin cambios en el lenguaje, en `js/doc_errores.js` ni en `js/LiteSeInt.js`. Los programas válidos en `v0.7.0` siguen ejecutándose igual.
- El flujo `Leer` y `inputResolver` se preserva: el input inline aparece dentro de la consola, debajo del editor.
- Los 11 ejemplos del selector superior se conservan sin cambios.

### Fuera de alcance de v0.8.0
- No se integran los 245 ejercicios completos. Permanecen 225 como pendientes (no visibles). La regla de calidad manda: todo ejercicio visible debe estar adaptado y probado.
- No se implementa documentación interna de comandos en la app (eso pertenece a 0.8.5).
- No se implementa "Roadmap del estudiante" extendido más allá de los filtros del banco (0.9.0).
- No se valida automáticamente si la solución del estudiante es correcta. El progreso es manual (pendiente / en curso / completado).
- No se introduce alias en LiteSeInt para `Cadena`, `<-`, `SiNo`, `MOD` ni `DIV`. La sintaxis del lenguaje no cambia.
- No se agrega backend, login ni dependencias pesadas.

## [0.7.0] — 2026-04-26

Cierre de la fase "Nuevo layout de aprendizaje". Esta versión reorganiza la pantalla principal para que LiteSeInt empiece a sentirse como una plataforma de aprendizaje, sin tocar el lenguaje ni el runtime.

### Agregado
- **Layout en dos columnas**: columna izquierda con editor y consola apilados; columna derecha reservada al panel de aprendizaje.
- **Consola debajo del editor**: la salida de `Escribir`, los errores, los mensajes de sistema y el input inline de `Leer` ahora ocurren bajo el editor, no al costado.
- **Consola redimensionable**: nuevo divisor `console-resize-handle` que permite arrastrar para ajustar la altura de la consola con el ratón o con `↑/↓` cuando el divisor tiene foco. La altura se persiste en `localStorage` (`liteseint:consoleHeight`).
- **Panel derecho de aprendizaje**: nueva columna `learning-panel` con los **niveles 0-9** (`Orientación`, `Secuencia y salida`, `Variables, tipos y entrada`, `Expresiones y E·P·S`, `Decisiones simples`, `Decisiones múltiples`, `Repetición controlada`, `Patrones de procesamiento`, `Programas integradores`, `Puente hacia Python`). Cada nivel muestra estado "próximamente", resumen y conceptos asociados al seleccionarlo. Aviso explícito de que los ejercicios se integrarán adaptados al dialecto LiteSeInt según `EJERCICIOS.md`.
- **Menú desplegable de ejemplos**: la barra horizontal de botones se reemplazó por un `<select>` en la cabecera del editor, con los ejemplos agrupados en `optgroup` por concepto (Primeros programas, Variables y entrada/salida, Expresiones y funciones, Condicionales, Ciclos, `Segun`).

### Cambiado
- **`index.html`**: nueva jerarquía `main-container` → `workspace-column` (`editor-panel` + `console-resize-handle` + `console-panel`) + `learning-panel`. La cabecera del editor ahora aloja el selector de ejemplos junto a `Descargar` y `Borrar`.
- **`css/styles.css`**: nuevas variables (`--learning-panel-w`, `--console-min-h`, `--console-default-h`, `--resize-handle-h`), estilos para `.workspace-column`, `.console-resize-handle`, `.learning-panel` y `.ejemplos-select`. Se elimina la regla `.example-bar`/`.example-btn`.
- **`js/app.js`**: catálogo `NIVELES_APRENDIZAJE`, helpers `renderizarNivelesAprendizaje`, `seleccionarNivel`, `mostrarDetalleNivel`, `aplicarAlturaConsola`, `inicializarResizeConsola`, `cargarAlturaConsolaPersistida` y `guardarAlturaConsola`. El binding `.example-btn` se reemplaza por `change` sobre `#ejemplosSelect` que reusa `cargarEjemplo`.
- **Versión visible**: `v0.7.0`.

### Responsive
- En anchos `≤ 768px` la columna derecha se apila debajo del workspace, puede colapsarse desde su cabecera y la consola conserva el comportamiento previo de toggle desde la cabecera. El divisor de redimensionado se oculta en móvil.
- En anchos `≤ 1024px` el panel derecho se reduce a `240px` para no comprimir el editor.

### Compatibilidad
- Sin cambios en el lenguaje, en `js/doc_errores.js` ni en `js/LiteSeInt.js`. Los programas válidos en `v0.6.5` siguen ejecutándose igual.
- El flujo `Leer` y `inputResolver` se preserva: el input inline aparece dentro de la consola, debajo del editor.
- El listado de ejemplos no cambió: los 11 ejemplos previos siguen disponibles desde el dropdown.

### Fuera de alcance de v0.7.0
- No se integran los 245 ejercicios de `ejercicios/guia.html`. El panel derecho muestra solo placeholders por nivel.
- No se implementa progreso persistente por ejercicio.
- No se agrega documentación de comandos en la app (eso pertenece a 0.8.5).
- No se agrega el puente a Python (queda fuera del alcance de la preparación 1.0 actual).

## [0.6.5] — 2026-04-26

Cierre de la fase "Base educativa". Esta versión es **documental**: no cambia el lenguaje ni el runtime. Deja por escrito cómo se adaptarán los 245 ejercicios de `ejercicios/guia.html` al dialecto LiteSeInt y qué se va a probar antes de declarar un ejercicio integrado.

### Agregado
- **`EJERCICIOS.md`**: nuevo documento que define la estructura pedagógica de la guía (7 EA × 245 ejercicios), las reglas obligatorias de adaptación (`Cadena` → `Caracter`, `<-` → `=`, `SiNo` → `Sino`, `MOD` → `mod`, `DIV` → `Trunc(a / b)` o exclusión, `;` final → eliminar, `=` como comparador → `==`), el plan de pruebas (6 criterios por ejercicio) y la tabla de seguimiento (adaptados / requieren decisión / excluidos temporales).
- **Nueva estructura de aprendizaje LiteSeInt**: se propone una ruta propia para 1.0, independiente de la numeración original de la guía: orientación, secuencia/salida, variables/entrada, expresiones/E·P·S, decisiones, decisiones múltiples, repetición, patrones, programas con menú y puente hacia Python.
- **Grados de ayuda por ejercicio**: se documenta una progresión de actividades guiado → con pista → práctica → desafío, para evitar que el estudiante parta siempre desde una pantalla en blanco.
- **`ROADMAP.md`**: hito `0.6.5 - Base Educativa` con criterios de aceptación y referencia explícita a `EJERCICIOS.md`. Se deja registrada la invariante "el 100% de los ejercicios visibles deben estar adaptados o explícitamente excluidos".
- **`README.md`**: enlace a `EJERCICIOS.md` desde el bloque de estado actual.

### Decisión
- **No se introducen alias** en LiteSeInt para `Cadena`, `<-`, `SiNo`, `MOD` o `DIV`. La sintaxis de `ejercicios/guia.html` no es la fuente de verdad del lenguaje. Cada ejercicio debe convertirse o quedar marcado como excluido temporal.

### Cambiado
- **Versión visible**: `v0.6.5`.

### Compatibilidad
- Sin cambios en runtime, validador o autocompletado. Los programas válidos en `v0.6.0` siguen ejecutándose igual.

### Fuera de alcance de v0.6.5
- No se mueve la consola debajo del editor (eso es 0.7.0).
- No se rediseña el layout principal.
- No se implementa el panel derecho de ejercicios.
- No se convierten los 245 ejercicios — esta fase deja la decisión y el contrato de pruebas por escrito.

## [0.6.0] — 2026-04-26

Cierre de la fase "Congelar el núcleo del lenguaje". Esta versión declara, documenta y estabiliza el subconjunto mínimo del lenguaje que será la base de la versión 1.0. No agrega nuevas estructuras: ordena lo existente y deja explícito qué queda fuera de alcance.

### Agregado
- **Matriz de compatibilidad en `README.md`**: nueva sección que enumera estructura del programa, instrucciones, tipos, operadores, funciones nativas, estructuras de control, variantes aceptadas y construcciones explícitamente no soportadas en v0.6.0.
- **Sintaxis canónica documentada** para cada instrucción soportada: `Proceso/FinProceso`, `Definir`, asignación con `=`, `Escribir`, `Leer`, `Si/Sino/FinSi`, `Mientras/FinMientras`, `Repetir/HastaQue`, `Para/FinPara`, `Segun/De Otro Modo/FinSegun` y comentarios `//`.
- **Mensaje pedagógico para construcciones fuera de alcance**: nuevo tipo de error `fuera_de_alcance` reportado por `js/doc_errores.js` cuando aparece como primer token `Dimension`, `Dimensionar`, `SubProceso`, `FinSubProceso`, `Funcion` o `FinFuncion`. El mensaje aclara que esa construcción no está soportada en LiteSeInt v0.6.0 sin pretender implementarla.

### Cambiado
- **Lista de palabras reservadas para autocompletado (`LiteSeInt.PALABRAS_RESERVADAS`)**: se completó con `Proceso`, `FinProceso`, `Y`, `O` y `No` para alinearla con el conjunto que ya reconocía el validador y el resaltado.
- **README**: se reorganizó la sección de lenguaje en torno a la matriz de compatibilidad y se añadió `Proceso ... FinProceso` a los ejemplos cortos.
- **Versión visible**: `v0.6.0`.

### Compatibilidad
- Los programas válidos en `v0.5.x` siguen ejecutándose igual. No se agregaron operadores, funciones nativas ni estructuras nuevas. La precedencia de operadores, el comportamiento de `Abs`, `Redon`, `Trunc`, `Longitud`, `Mayusculas`, `Minusculas`, `mod` y `^`, y la sintaxis de cada estructura de control se conservan sin cambios.

### Fuera de alcance de v0.6.0
- `Dimension` y arreglos.
- `SubProceso` / `FinSubProceso`.
- Funciones definidas por el usuario.
- Diagramas, exportadores, editor multiarchivo y persistencia de proyectos.

## [0.5.5]

### Agregado
- **Deshacer y rehacer en el editor**: se agregó historial propio para `Ctrl+Z` / `Cmd+Z` y rehacer con `Ctrl+Y` o `Ctrl+Shift+Z`, cubriendo escritura normal y cambios programáticos como autocompletado, tabulación, borrar todo y carga de ejemplos.

### Cambiado
- **Versión visible**: `v0.5.5`.

## [0.5.4]

### Agregado
- **Pruebas de regresión sin dependencias**: nueva suite `npm test` en `tests/run-tests.js` para validar reglas del lenguaje, ejecución y detención.

### Cambiado
- **`Segun` con expresión**: el runtime ahora acepta expresiones en la cabecera, alineándose con la documentación y la validación estática.
- **Operadores lógicos en expresiones**: `Y`, `O` y `No` funcionan dentro de asignaciones lógicas además de condiciones.
- **Ejecución detenida**: el runtime reporta `detenido` y la UI evita mostrar `Fin de ejecución` cuando el usuario detiene durante un `Leer`.
- **Validación de documento y bloques**: el validador detecta ausencia de `Proceso`/`FinProceso` y cierres cruzados entre bloques anidados.
- **Dependencias externas**: se retiraron Bootstrap Icons y Lucide porque no estaban en uso.

## [0.5.3] — 2026-04-25

Corrección focalizada del pipeline de expresiones para que el menos unario deje de degradarse al workaround `0 - x` y respete la precedencia real en expresiones compuestas.

### Cambiado
- **Pipeline de expresiones en `LiteSeInt.js`**: el `-` prefijo ahora se normaliza como operador unario dedicado en lugar de reescribirse como resta binaria. El shunting-yard y la evaluación RPN distinguen operadores por aridad para resolver correctamente operandos negativos dentro de expresiones y llamadas.
- **Precedencia explícita del menos unario**: `^` queda por encima del menos unario, y el menos unario por encima de `*`, `/` y `mod`. Esto deja consistentes casos como `2 ^ -3`, `-3 ^ 2` y `(-3) ^ 2`.
- **Ejemplo `numerico` y documentación**: ahora muestran operandos negativos en expresiones compuestas sin paréntesis de workaround.
- **Versión visible**: `v0.5.3`.

### Corregido
- **Operandos negativos después de operadores**: `2 * -3`, `2 / -3`, `2 ^ -3`, `2 mod -3` y `2 - -3` vuelven a evaluarse con el valor correcto.
- **Funciones con expresiones negativas compuestas**: llamadas como `Abs(2 * -3)` ya no pierden precedencia ni devuelven resultados truncados por el viejo hack de `0 - x`.
- **Mensajes de error en cierres mal formados**: expresiones como `Abs(-)` o `(-)` ahora reportan la falta de operando de forma más puntual alrededor de `)` y de la llamada involucrada.

### Compatibilidad
- **Validación estática y runtime**: ambos siguen aceptando la misma sintaxis válida para `-3`, `(-3)`, `Abs(-3.5)`, `Redon(-3.6)` y `Trunc(-3.6)`, sin cambios de alcance fuera de `v0.5.3`.

## [0.5.2] — 2026-04-25

Cierre de la serie `0.5.x`. Suma funciones nativas de texto, mejora mensajes de error en torno a llamadas y enriquece ejemplos y documentación, sin invadir el alcance de `0.6.x` (validación en vivo).

### Agregado
- **Función nativa `Longitud(texto)`**: devuelve la cantidad de caracteres del argumento. Acepta variables de tipo `Caracter` y literales de texto.
- **Función nativa `Mayusculas(texto)`**: devuelve el texto convertido a mayúsculas.
- **Función nativa `Minusculas(texto)`**: devuelve el texto convertido a minúsculas.
- **Ejemplo precargado `texto`**: nuevo botón en la barra de ejemplos que combina `Longitud`, `Mayusculas` y `Minusculas`, incluyendo una llamada anidada (`Longitud(Mayusculas(nombre))`).
- **Autocompletado**: se sugieren `Longitud`, `Mayusculas` y `Minusculas` con badge `función`.

### Cambiado
- **Tabla `LiteSeInt._FUNCIONES_NATIVAS`**: se completa con `longitud`, `mayusculas` y `minusculas` siguiendo la firma `{ aridadMin, aridadMax, aplicar(args, ctx) }` definida en `0.5.0`. Las funciones de texto exigen tipo `Caracter` y reportan un mensaje específico si reciben otro tipo.
- **Validador estático (`js/doc_errores.js`)**: el conjunto `FUNCIONES_NATIVAS_SET` incorpora las tres funciones nuevas para que no se reporten como `Función no reconocida`.
- **Mensaje de error mejorado al usar un nombre de función nativa sin `(`**: en lugar de `Variable "Longitud" no definida.`, ahora se reporta `Falta "(" para llamar a la función "Longitud".` con el rango exacto del identificador (nuevo tipo de error `llamada_sin_parentesis`).
- **Mensaje de error mejorado al dejar un argumento vacío antes de `,`**: ahora incluye el nombre de la función involucrada (`Argumento vacío antes de "," en la llamada a "Longitud".`).
- **Versión visible**: `v0.5.2`.

### Corregido
- **Llamadas anidadas a funciones nativas**: el parser de expresiones contaba la aridad de la llamada exterior como `0` cuando un argumento era a su vez una llamada (`Longitud(Mayusculas(nombre))` se reportaba como `La función "Longitud" espera 1 argumento(s), recibió 0.`). El valor producido por la llamada interna ahora se marca como contenido del argumento exterior, habilitando anidación arbitraria sin paréntesis adicionales.

### Compatibilidad
- Los programas válidos en `v0.5.0` y `v0.5.1` siguen ejecutándose igual. La precedencia de operadores y el comportamiento de `Abs`, `Redon`, `Trunc`, `mod` y `^` no cambian. Los ejemplos `hola`, `notas`, `multivar`, `mayor`, `contador`, `tabla`, `logico`, `diasemana` y `numerico` siguen funcionando sin cambios.

## [0.5.1] — 2026-04-25

Primera ampliación visible del nuevo motor de expresiones preparado en `0.5.0`. Agrega operadores aritméticos adicionales y funciones nativas numéricas, sin invadir el alcance de `0.5.2` (funciones de texto).

### Agregado
- **Operador `mod`**: calcula el resto de la división entre dos valores numéricos. Misma precedencia que `*` y `/`, asociatividad a la izquierda. Reporta error claro si los operandos no son numéricos o si el divisor es `0`.
- **Operador `^` (potencia)**: precedencia mayor que `*`, `/` y `mod`, asociatividad a la derecha (`2 ^ 3 ^ 2` evalúa como `2 ^ (3 ^ 2)`). Acepta exponentes enteros y reales.
- **Función nativa `Abs(x)`**: valor absoluto de un número.
- **Función nativa `Redon(x)`**: redondeo al entero más cercano.
- **Función nativa `Trunc(x)`**: trunca la parte decimal.
- **Ejemplo precargado `numerico`**: nuevo botón en la barra de ejemplos que demuestra `mod`, `^`, `Abs`, `Redon` y `Trunc` en una misma ejecución.
- **Autocompletado**: se sugieren `mod`, `Abs`, `Redon` y `Trunc` con sus tipos visibles (`operador` / `función`).

### Cambiado
- **Tabla `LiteSeInt._OPERADORES`**: incorpora `mod` (precedencia 2, izquierda) y `^` (precedencia 3, derecha) con sus reglas de evaluación y mensajes de error específicos.
- **Tabla `LiteSeInt._FUNCIONES_NATIVAS`**: pasa de estar vacía a registrar `abs`, `redon` y `trunc` con la firma `{ aridadMin, aridadMax, aplicar(args, ctx) }` definida en `0.5.0`. La validación de aridad y de tipos sigue siendo responsabilidad del runtime.
- **Tokenizador estático (`js/doc_errores.js`)**: reconoce `^` como `OPERATOR` y `mod` como `KEYWORD` aceptado dentro de expresiones (`KEYWORDS_EXPR_OK`). El conjunto `FUNCIONES_NATIVAS_SET` lista `abs`, `redon` y `trunc` para que el validador no marque como "Función no reconocida" lo que el runtime ya implementa.
- **Resaltado de sintaxis**: hereda automáticamente el comportamiento del tokenizador, por lo que `^` se pinta como operador y `mod` como palabra reservada sin reglas adicionales.
- **Versión visible**: `v0.5.1`.

### Compatibilidad
- Los programas válidos en `v0.5.0` siguen ejecutándose igual. La precedencia de `+`, `-`, `*`, `/` no cambia y los nuevos operadores se sitúan en niveles superiores sin alterar la asociatividad de los anteriores. Los ejemplos `hola`, `notas`, `multivar`, `mayor`, `contador`, `tabla`, `logico` y `diasemana` siguen funcionando sin cambios.

## [0.5.0] — 2026-04-25

Versión de base arquitectónica. El usuario final ve pocos cambios visibles: el objetivo es ordenar el motor de expresiones para que `0.5.1` (operadores `mod`, potencia, funciones numéricas `Abs`, `Redon`, `Trunc`) y `0.5.2` (funciones de texto `Longitud`, `Mayusculas`, `Minusculas`) se puedan implementar con menos fricción.

### Interno
- **Pipeline de expresiones por etapas**: el evaluador en `js/LiteSeInt.js` se separó en cuatro helpers reconocibles — `_tokenizarExpresion`, `_normalizarTokens`, `_parsearRPN` y `_evaluarRPN` — sustituyendo la función monolítica anterior. Cada etapa tiene una responsabilidad acotada y se puede extender sin tocar las demás.
- **Metadata de operadores centralizada**: nueva tabla `LiteSeInt._OPERADORES` con `precedencia`, `asociatividad` y `aplicar` por operador. Agregar `mod` o potencia en `0.5.1` se reduce a sumar entradas a esta tabla y al tokenizador.
- **Registro de funciones nativas preparado**: nuevo `LiteSeInt._FUNCIONES_NATIVAS` (vacío en esta versión) con la firma `{ aridadMin, aridadMax, aplicar(args, ctx) }`. El evaluador ya invoca este registro y aplica validación de aridad.
- **Reconocimiento de llamadas a función**: el tokenizador de expresiones detecta el patrón `Identificador(args)` con look-ahead y emite un token `funcion` que el parser convierte en una entrada postfija con su aridad. Soporta cero, uno o múltiples argumentos.
- **Detección espejo en el validador estático**: `js/doc_errores.js` reconoce el mismo patrón y lo reporta como `Función "X" no reconocida` en lugar de `Variable "X" no definida`. El conjunto `FUNCIONES_NATIVAS_SET` queda vacío a propósito — no se "aprueba" ninguna función que el runtime aún no implemente.
- **Lista de expresiones de `Escribir` respeta paréntesis**: `validarListaExpresiones` ahora separa por comas sólo en el nivel exterior, dejando que comas internas sean argumentos de una llamada a función válida en el futuro.

### Cambiado
- **Errores de expresión más precisos**: paréntesis desbalanceados distinguen entre falta de `(` y falta de `)`; los operadores en posición inválida y los operandos faltantes (`a = 1 +`) reportan mensajes específicos; las llamadas a función abiertas y los argumentos vacíos en una llamada (`f(a,)`, `f(a, ,b)`) tienen sus propios mensajes.
- **Versión visible**: `v0.5.0`.

### Compatibilidad
- Los programas válidos en `v0.4.0` siguen ejecutándose igual. La precedencia de `+`, `-`, `*`, `/` no cambia; el menos unario, el operador `No`, los literales `Verdadero`/`Falso`, las cadenas y la concatenación con `+` se comportan idéntico. Los ejemplos precargados (`hola`, `notas`, `multivar`, `mayor`, `contador`, `tabla`, `logico`, `diasemana`) siguen funcionando sin cambios.

## [0.4.0] — 2026-04-24

### Agregado
- **Tipo `Logico`**: nuevo tipo de dato primitivo con valor por defecto `Falso`. Soportado en `Definir`, asignación, `Leer`, `Escribir` y en condiciones de `Si`, `Mientras`, `Repetir/HastaQue` y `Para`.
- **Literales booleanos `Verdadero` y `Falso`**: reconocidos por el tokenizador, validados como literales en expresiones y evaluados nativamente en el runtime.
- **Operador `No` en expresiones**: ya se aceptaba en condiciones; ahora también en el lado derecho de asignaciones (p. ej. `activo = No activo`).
- **Ejemplo precargado `logico`**: nuevo botón en la barra de ejemplos que demuestra el uso de `Logico`, `Verdadero`, `Falso`, `Y` y `No`.
- **Autocompletado**: se sugieren `Logico`, `Verdadero` y `Falso`.

### Cambiado
- **`Escribir` para booleanos**: los valores `true`/`false` del runtime se imprimen como `Verdadero`/`Falso` para mantener consistencia visual con la sintaxis del lenguaje.
- **Mensajes de error de `Definir`**: mencionan `Logico` además de `Entero`, `Real` y `Caracter`.
- **Versión visible**: `v0.4.0`.

## [0.3.4] — 2026-04-24

### Corregido
- **Inconsistencia en `Segun / FinSegun`**: el parser aceptaba casos inline (`1: Escribir "Lunes"`, `2, 3: Escribir "Otro"`) pero la validación estática los marcaba como `caso_texto_extra`. Todo caso inline válido fallaba al validar. Ahora validador y parser aceptan la misma sintaxis.

### Cambiado
- **Sintaxis oficial de `Segun`**: casos multilínea, inline (una instrucción tras `:`) y con varios valores separados por coma son todos soportados oficialmente. `De Otro Modo:` sigue siendo solo multilínea.
- **Detección de etiqueta de caso centralizada**: nuevo helper `DocErrores.detectarEtiquetaCaso(sig)` (token-based) reutilizado por el validador de línea y por el validador estructural de `Segun`, evitando reglas duplicadas.

### Interno
- **Ejemplo `diasemana`** actualizado para demostrar casos inline y casos con varios valores.

## [0.3.3] — 2026-04-24

### Corregido
- **Inconsistencia en `Repetir / HastaQue`**: el parser reconocía solo `HastaQue` (una palabra) y el validador solo `Hasta Que` (dos palabras), por lo que todo bloque válido fallaba en una capa u otra. Ahora ambas capas aceptan las dos formas.

### Cambiado
- **Sintaxis oficial**: `Repetir ... HastaQue condicion`. Se acepta `Hasta Que` como alias. La detección se centraliza en `DocErrores.REGEX_HASTAQUE_LINEA` (regex, para el parser) y `DocErrores.detectarHastaQue(sig)` (token-based, para el validador).
- **Mensajes de error de Repetir/HastaQue**: se unifican usando la forma oficial `HastaQue` en los textos mostrados al usuario.

## [0.3.2] — 2026-04-22

### Cambiado
- **Operador de asignación ahora es `=`**: se reemplazó `<-` por `=` como único operador de asignación en todo el lenguaje. Se actualizaron tokenizador, validador estático, ejecutor, ejemplos y documentación.
- **Operadores relacionales sin ambigüedad**: en condiciones se requiere `==` para igualdad (antes se aceptaba `=`). Quedan válidos `==`, `!=`, `<>`, `<`, `>`, `<=`, `>=`.

### Eliminado
- **Operador `<-`**: deja de reconocerse como asignación en todo el sistema (tokenizador, ejecutor, ejemplos y documentación).

## [0.3.1] — 2026-04-21

### Agregado
- **Validación estructural para bloques `Si / Sino / FinSi`**: se incorporó validación estática del bloque condicional completo, incluyendo condición obligatoria, uso correcto de `Entonces`, detección de `Sino` duplicado, cierres faltantes con `FinSi` y ramas vacías.
- **Validación estructural para bloques `Segun / De Otro Modo / FinSegun`**: ahora se valida la cabecera con `Hacer`, los casos con `:`, valores duplicados, bloques vacíos, uso correcto de `De Otro Modo` y cierre obligatorio con `FinSegun`.
- **Validación estructural para bloques `Mientras / FinMientras`**: se añadió validación de condición, presencia de `Hacer`, detección de bloques vacíos y control de cierres correctos con `FinMientras`.
- **Nuevas palabras reservadas del lenguaje**: se amplió el analizador para reconocer las estructuras `Si`, `Entonces`, `Sino`, `FinSi`, `Segun`, `Hacer`, `De Otro Modo`, `FinSegun`, `Mientras`, `FinMientras`, `Repetir`, `Hasta` y `Que`.
- **Validación de operadores de comparación en condiciones**: las condiciones de `Si`, `Mientras` y `Hasta Que` ahora aceptan únicamente `==`, `<>`, `<`, `>`, `<=`, `>=` y `!=`, marcando como error cualquier operador no permitido.

### Corregido
- **Errores más precisos en estructuras de control**: ahora se reportan mensajes específicos para condiciones faltantes, bloques vacíos, cierres ausentes, texto extra en sentencias de control y uso inválido de operadores comparativos.
- **Soporte de anidación validada**: los bloques de control ahora pueden validarse correctamente cuando están anidados, evitando falsos positivos en cierres y estructuras internas.

## [0.3.0] - 2026-04-19

### Cambiado

- **Controlador UI extraído a `js/app.js`**: toda la lógica de interfaz que antes vivía embebida en `index.html` ahora se carga desde un archivo JavaScript dedicado, dejando la estructura HTML más limpia y preparada para seguir creciendo.
- **Estructura de assets reorganizada**: `LiteSeInt.js`, `doc_errores.js` y `styles.css` se movieron a carpetas `js/` y `css/`, alineando la base del proyecto con una organización más mantenible.
- **Carga de scripts y estilos actualizada**: `index.html` ahora referencia rutas externas (`css/styles.css`, `js/doc_errores.js`, `js/LiteSeInt.js`, `js/app.js`) en lugar de depender de bloques inline extensos.
- **Versión** actualizada a `v0.3.0` en la interfaz.

### Interno

- **Separación de responsabilidades reforzada**: la capa de presentación queda mejor delimitada entre marcado, estilos, motor, validación y controlador UI, facilitando mantenimiento, depuración y futuras iteraciones.

---

## [0.2.1] - 2026-04-19

### Cambiado

- **Sistema de guías de indentación reforzado**: el render de indentado del editor ahora mide `line-height`, `padding`, `tab-size` y ancho real de carácter desde el DOM en lugar de depender de valores fijos.
- **Render de guías más estable**: las líneas de indentación ahora se dibujan como segmentos continuos y se recalculan correctamente al hacer scroll, redimensionar la ventana o terminar de cargar las fuentes.
- **Lógica visual de indentación unificada**: las líneas activas e inactivas comparten la misma regla para mostrar indentadores parciales, evitando que desaparezcan antes de tiempo al borrar espacios o al mover el cursor dentro del texto.
- **Geometría del editor ajustada**: el editor pasó a usar `padding-top/right/bottom: 8px` y `padding-left: 16px`, manteniendo alineadas las capas de syntax highlight, subrayados, overlays y autocompletado.
- **Indicador de versión reubicado**: la versión visible de la app se movió del header al footer, fijada en la esquina inferior derecha sin desplazar el crédito centrado.
- **Versión** actualizada a `v0.2.1` en la interfaz.

### Corregido

- **Desfase de guías al hacer scroll**: las guías de indentación ya no pierden posición al desplazarse vertical u horizontalmente dentro del editor.
- **Persistencia de indentadores parciales**: una línea con espacios residuales antes del texto conserva su guía visible aunque no complete exactamente un múltiplo de indentación.
- **Resaltado activo de indentación**: las guías activas ahora se apagan solo cuando el cursor sale realmente del bloque visual de indentación y ya no se extienden indebidamente dentro del texto.

---

## [0.2.0] - 2026-04-18

### Agregado

- **Estructuras de control completas**: el intérprete ahora soporta `Si/Entonces/Sino/FinSi`, `Mientras/Hacer/FinMientras`, `Repetir/HastaQue`, `Para/Hasta/Con Paso/Hacer/FinPara` y `Segun/De Otro Modo/FinSegun`, incluyendo anidamiento arbitrario.
- **Motor AST**: `LiteSeInt.js` fue refactorizado a un pipeline de dos fases: `_parsear()` construye un árbol de nodos y `_ejecutarBloque()` los recorre recursivamente, reemplazando el loop plano anterior.
- **Evaluador de condiciones**: nuevo método `_evaluarCondicion()` con soporte para operadores relacionales (`=`, `<>`, `<`, `>`, `<=`, `>=`) y lógicos (`Y`, `O`, `No`), con correcta precedencia y cortocircuito.
- **Validación de balance de bloques**: `validarDocumento()` realiza un segundo pase para detectar bloques sin cerrar o cierres sin apertura (`Si` sin `FinSi`, etc.), reportando el error en la línea exacta.
- **Nuevos ejemplos**: Mayor de dos (Si/FinSi), Contador (Mientras/FinMientras), Tabla de multiplicar (Para/FinPara), Día de semana (Segun/FinSegun).
- **Límite de iteraciones**: constante `MAX_ITERACIONES = 100 000` que aborta bucles infinitos con mensaje descriptivo.
- **Token `COLON`** en el tokenizador de `doc_errores.js` para reconocer etiquetas de caso en `Segun`.
- **Nuevas palabras reservadas**: `Si`, `Entonces`, `Sino`, `FinSi`, `Mientras`, `Hacer`, `FinMientras`, `Repetir`, `HastaQue`, `Para`, `Hasta`, `Con`, `Paso`, `FinPara`, `Segun`, `FinSegun`, `Y`, `O`, `No`, `De`, `Otro`, `Modo` - reconocidas por el tokenizador, resaltadas por el editor y excluidas del autocompletado de variables.

### Cambiado

- **`LiteSeInt.PALABRAS_RESERVADAS`** ampliado con todas las nuevas palabras clave, disponibles en el autocompletado con tipo `estructura` o `palabra clave`.
- **`validarLinea`** acepta sin errores todas las líneas de control de flujo (cabeceras de Si, Mientras, Para, Segun, etiquetas de caso, etc.).
- **Versión** actualizada a `v0.2.0` en el header de la app.

---

## [0.1.4] - 2026-04-18

### Agregado

- **Botón "Descargar .psc"**: se añadió una acción para exportar el pseudocódigo actual del editor como archivo `.psc`, facilitando guardar y compartir programas escritos en LiteSeInt.
- **Soporte para `Proceso` y `FinProceso`**: ahora el intérprete reconoce estas etiquetas como delimitadores del programa, mejorando la compatibilidad con la sintaxis habitual de PSeInt.

### Cambiado

- **Alineación de paneles ajustada**: el panel del editor y la consola ahora tienen altura exactamente igual, con un espaciador en la consola que iguala la altura de la barra de ejemplos del editor.
- **Altura de headers unificada**: `.panel-header` y `.console-header` comparten ahora la misma altura fija (`--header-panel-h: 32px`), garantizando alineación visual perfecta.
- **Botón "Borrar todo" redimensionado**: ahora utiliza la misma clase y tamaño que el botón "Borrar" de la consola, mejorando la consistencia visual.

### Corregido

- **Detención de ejecución en limpiar**: los botones "Borrar" y "Borrar todo" ahora detienen la ejecución del código si está en marcha, evitando comportamientos inesperados al limpiar durante la ejecución.

---

## [0.1.3] - 2026-04-17

### Agregado

- **Módulo central de validación `doc_errores.js`**: se incorporó una nueva capa dedicada al análisis, validación, tabla de símbolos, generación de errores por rango exacto y utilidades para decoraciones del editor, desacoplada tanto de la UI como del motor de ejecución.
- **Tokenización formal por línea**: el sistema ahora reconoce tokens como palabras reservadas, identificadores, strings, números, operadores, asignación `<-`, comas, paréntesis, comentarios, espacios y caracteres desconocidos.
- **Tabla de símbolos con tracking de inicialización**: las variables pasan a manejar tipo, existencia e inicialización real, permitiendo distinguir entre variable definida, no definida y no inicializada.
- **Decoraciones de error por token exacto**: se añadió una capa visual específica para subrayados rojos debajo del fragmento exacto con error, separada del resaltado de sintaxis.
- **Helper de contexto de cursor**: se agregó lógica reutilizable para detectar si el cursor está dentro de un string o un comentario, mejorando el comportamiento del autocompletado.
- **Validación estructurada por línea y documento**: se implementaron funciones reutilizables para validar una línea o el documento completo y devolver errores agrupados por línea con columna inicial y final.

### Cambiado

- **Motor `LiteSeInt.js` refactorizado para depender de `doc_errores.js`**: la ejecución ahora realiza validación previa centralizada antes de interpretar el código, evitando duplicación de reglas entre motor y editor.
- **Evaluador de expresiones reemplazado por parser con shunting-yard**: las expresiones ahora soportan correctamente paréntesis, precedencia de operadores, números, variables, strings, concatenación con `+` y validación de paréntesis desbalanceados.
- **Asignaciones y lecturas ahora inicializan variables de forma explícita**: `Leer` y `<-` marcan la variable como inicializada en vez de asumir que el valor por defecto equivale a una inicialización válida.
- **Validación de `Definir` fortalecida**: ahora detecta tipos inválidos, texto sobrante, nombres faltantes, comas mal ubicadas, palabras reservadas usadas como variables y duplicados en la misma línea o en líneas posteriores.
- **Manejo de `Escribir` mejorado**: las expresiones separadas por coma se validan de forma estructurada y cada identificador se comprueba contra la tabla de símbolos.
- **Autocompletado contextual**: las sugerencias ahora se bloquean correctamente dentro de strings y comentarios, usando análisis del contexto real de la línea en vez de reglas superficiales.
- **Resaltado de sintaxis actualizado**: el operador `<-` pasa a tener una clase visual separada (`sh-assign`) y se pinta con color blanco para distinguirlo del resto de operadores.
- **Branding de la aplicación actualizado a LiteSeInt**: se renombró la app en la interfaz para alinearla con el nombre del motor.
- **UX de errores visuales ajustada**: el destacado rojo de errores queda reservado al flujo de ejecución y se limpia al editar, al limpiar consola o al reiniciar el contenido, evitando errores "pegados" sobre código ya modificado.
- **Toolbar y layout reorganizados**: los botones principales se centran visualmente, el botón Detener adquiere un estilo diferenciado, el botón Limpiar consola se integra al panel de consola y el layout general se ajusta mejor al viewport.
- **Editor con menor cantidad inicial de líneas**: el mínimo visual del editor se reduce para iniciar con 10 líneas en lugar de 20.
- **Footer inferior integrado**: se agregó un pie de app discreto con crédito visible al autor.

### Corregido

- **Variables no definidas ahora informan el error correcto**: expresiones como `Escribir nombres` dejan de reportarse como "expresión no reconocida" y pasan a mostrarse como `Variable "nombres" no definida.`.
- **Variables no inicializadas ya no pueden imprimirse**: si una variable fue declarada pero nunca recibió valor, `Escribir` ahora genera `Variable "X" no inicializada.` en tiempo de ejecución.
- **Errores múltiples por línea**: una misma línea puede acumular varios errores simultáneos, incluyendo combinación de coma inválida y variable duplicada en `Definir`.
- **Subrayado preciso de tokens inválidos**: además del mensaje en consola, ahora se subrayan exactamente símbolos conflictivos como comas incorrectas o variables duplicadas.
- **Separación correcta entre syntax highlight y capa de error**: se evitó mezclar el HTML del resaltado con el HTML de decoraciones, reduciendo errores de render y facilitando mantenimiento.
- **Flujo visual de error más consistente**: los badges, tooltips, overlays y subrayados se limpian y reconstruyen de forma controlada, evitando residuos visuales tras editar o reiniciar.

### Interno

- **API estática del motor mantenida por compatibilidad**: `LiteSeInt` sigue exponiendo helpers como `stripComment()` y `extraerVariablesDelCodigo()`, pero ahora delegando en `doc_errores.js`.
- **Conversión uniforme de errores a decoraciones**: se añadieron helpers para transformar errores en estructuras útiles para subrayado y tooltips por línea.
- **Mayor desacoplamiento entre core y UI**: la interfaz consume resultados del analizador en vez de reimplementar reglas de validación en handlers del editor.

## [0.1.2] - 2026-04-17

### Agregado

- **Comentarios con `//`**: todo lo que aparece después de `//` (fuera de strings) se ignora en la ejecución. Los comentarios se renderizan en gris itálica en el editor.
- **Resaltado de sintaxis completo**: capa visual (`#syntaxLayer`) superpuesta al textarea que colorea palabras reservadas (rosa), strings (amarillo), variables (azul), números (verde menta), operadores (gris) y comentarios (gris itálica).
- **Autocompletado de variables del usuario**: las variables declaradas con `Definir` se detectan dinámicamente y aparecen como sugerencias en el dropdown, etiquetadas como `variable`.
- **Indicador `>`**: cuando una línea se está ejecutando aparece `>` en verde junto al número de línea; cuando hay error aparece `>` en rojo.
- **Método estático `LiteSeInt.stripComment()`**: elimina comentarios inline respetando strings entrecomillados.
- **Método estático `LiteSeInt.extraerVariablesDelCodigo()`**: escanea el código y retorna las variables definidas, para uso del autocompletado.
- Comentarios de ejemplo en los programas precargados.

### Cambiado

- **Opacidad de resaltado aumentada ~30%**: `--exec-highlight-bg` y `--error-highlight-bg` pasaron de `0.08` a `0.16`, haciendo más visibles las líneas en ejecución y con error.
- **Tooltip de error reubicado**: el badge `!` se movió del gutter al costado derecho de la línea de código (dentro del overlay), con tooltip Bootstrap en dirección `left`.
- El autocompletado ahora se desactiva automáticamente cuando el cursor está dentro de un comentario.
- El textarea del editor ahora tiene `color: transparent` y el texto visible proviene exclusivamente de la capa de syntax highlight.
- Gutter ampliado de 50px a 58px para acomodar el indicador `>`.

### Corregido

- El motor ahora procesa correctamente líneas con comentarios inline (ej: `x <- 10 // asignación`) sin fallar en la interpretación.
- Se corrigió un desfase visual en el editor: al escribir o autocompletar variables, el texto podía renderizarse una línea más abajo por un salto de línea extra en la capa de resaltado de sintaxis.

---

## [0.1.1] - 2026-04-17

### Agregado

- **Separación del core en `LiteSeInt.js`**: clase independiente de la UI que expone `ejecutar()`, `detener()`, `getVariables()` y se comunica con la interfaz a través de callbacks (`onEscribir`, `onLeer`, `onError`, `onLineaActiva`, `onSistema`, `onFin`).
- **Input inline en consola**: la instrucción `Leer` ahora muestra un campo de texto directamente en la consola con prompt `? variable:` y botón `↵`, reemplazando el modal overlay anterior.
- **Definir múltiples variables por línea**: soporte para `Definir a, b, c Como Tipo` separando nombres por coma.
- **Resaltado de línea en ejecución**: la línea activa se destaca con fondo verde pastel (`#b8f0c8`) tanto en el gutter como en el área del editor.
- **Badge de error con tooltip**: botón circular rojo `!` que aparece junto a la línea con error, con tooltip de Bootstrap mostrando el mensaje descriptivo.
- Ejemplo precargado "Multi-variable".
- Botón "Detener" para interrumpir la ejecución.
- Indicador de estado en toolbar (`Ejecutando...`, `Listo`, `Error`, `Detenido`).

### Cambiado

- **Tipo `Cadena` renombrado a `Caracter`**: en toda la lógica del motor, palabras reservadas y autocompletado.
- Los eventos de los botones se registran con jQuery `.on()` en lugar de atributos `onclick` inline.
- La capa de overlays y el fondo del editor se separaron en elementos independientes (`editor-bg-layer`, `editor-line-overlays`).

### Eliminado

- Modal overlay (`input-overlay`) para la instrucción `Leer` - reemplazado por input inline en consola.

---

## [0.1.0] - 2026-04-17

### Agregado

- **Editor de pseudocódigo**: textarea con numeración de líneas, placeholder descriptivo y soporte para Tab (inserta 2 espacios).
- **Consola de salida**: panel HTML donde se muestran los mensajes de `Escribir`, errores y mensajes del sistema.
- **Botón Ejecutar**: inicia la interpretación completa del código línea por línea.
- **Botón Limpiar consola** y **Limpiar todo**.
- **Instrucción `Definir`**: declara variables con tipo (`Entero`, `Real`, `Cadena`) y valor por defecto.
- **Instrucción de asignación `<-`**: asigna valores a variables previamente definidas.
- **Instrucción `Escribir`**: imprime en consola strings, números y variables. Soporta múltiples expresiones separadas por coma.
- **Instrucción `Leer`**: pausa la ejecución con `async/await` y muestra un modal para capturar la entrada del usuario.
- **Evaluador de expresiones básico**: soporta literals de string, enteros, reales, variables y operaciones aritméticas simples (`+`, `-`, `*`, `/`), incluyendo concatenación de strings con `+`.
- **Autocompletado básico**: sugiere palabras reservadas (`Definir`, `Escribir`, `Leer`, `Como`, `Entero`, `Real`, `Cadena`) al escribir 2+ caracteres, navegable con flechas y seleccionable con Tab/Enter.
- **Ejecución paso a paso visual**: pausa de 80ms entre líneas para que el usuario vea el progreso.
- **Tres ejemplos precargados**: Hola Mundo, Saludo, Notas.
- Interfaz con tema oscuro estilo terminal, tipografía JetBrains Mono y fondo con grid sutil.
- Diseño responsive para pantallas móviles.
- Stack: HTML5, CSS3, Bootstrap 5.3.3, jQuery 3.7.1, JavaScript vanilla.

