# Code4Code — Roadmap

> Evolución de **LiteSeInt** hacia **Code4Code**: un entorno web educativo de programación
> multi-lenguaje, con soporte para **LiteSeInt** (dialecto propio congelado en 1.0),
> **PSeInt** (modo compatible, solo desarrollo de algoritmos) y **Python** (vía Pyodide).

---

## Visión

Code4Code es la evolución natural de LiteSeInt. El producto deja de ser "un intérprete
de un dialecto de pseudocódigo" y pasa a ser **una plataforma de aprendizaje de
programación** donde el estudiante puede:

1. Empezar con **LiteSeInt** (núcleo mínimo, predecible, congelado en 1.0).
2. Avanzar a **PSeInt** real (sintaxis y funciones nativas del PSeInt de escritorio,
   limitado al desarrollo de algoritmos — sin diagramas de flujo).
3. Dar el salto a **Python**, un lenguaje de producción, ejecutado en el navegador.

Todo dentro del mismo editor, la misma consola y el mismo banco de ejercicios.

### Principios que se mantienen de LiteSeInt

- Ejecución 100% en el navegador, sin instalación ni backend.
- Despliegue estático (GitHub Pages), sin build step obligatorio.
- Núcleo de cada lenguaje separado de la UI (`core/` no conoce el DOM).
- Editor propio, sin dependencias de editores de terceros.
- Validación estática con errores por línea antes de ejecutar.
- Material pedagógico embebido (comandos, ruta, errores comunes).
- Tests de regresión ejecutables con `npm test`.

### Lo que cambia

- El proyecto vive en un **repositorio nuevo: `Code4Code`**.
- El núcleo deja de asumir un único lenguaje: se introduce una capa de
  **proveedores de lenguaje** (plugins).
- El editor propio se **mejora y generaliza** para soportar varios lenguajes.
- Python se ejecuta con **Pyodide** (CPython compilado a WebAssembly).

---

## Decisiones tomadas

| ID | Decisión | Resolución |
| --- | --- | --- |
| **D1** | Ejecución de Python | **Pyodide** (CPython en WebAssembly, en el navegador). Se descarta Transcrypt: al ser un transpilador *ahead-of-time* que requiere CPython como herramienta CLI, obligaba a introducir un backend o un build step, rompiendo el modelo de despliegue estático. Pyodide mantiene la app 100% client-side y ofrece Python 3 real. |
| **D2** | Editor de código | **Evolucionar el editor propio**. Cero dependencias externas y control total de la UX educativa (protección de `Proceso…FinProceso`, badges de error, entrada inline). El costo es implementar internamente las mejoras (folding, búsqueda, pares) — ver Fase 2 y tabla de riesgos. |
| **D3** | Repositorio | **Repositorio nuevo `Code4Code`**. `LiteSeInt` queda congelado como referencia/archivo del producto 1.x. Importante: ambas GitHub Pages comparten origen (`ernestoleonidas.github.io`), por lo que el `localStorage` de los estudiantes **sí es accesible** desde la nueva app; se migran las claves `liteseint:*` → `code4code:*` con lectura retro-compatible. |
| **D4** | Perfil PSeInt | **Ambos perfiles, configurables**, con **estricto como valor por defecto** (el más usado en docencia). El intérprete PSeInt recibe un objeto `perfil` con opciones individuales (asignación con `=`, `Definir` obligatorio u opcional, etc.) y la UI expone dos presets: *Estricto* y *Flexible*. La entrega se divide en dos sub-hitos dentro de la Fase 3: primero estricto completo, luego la capa flexible sobre el mismo núcleo. |

## Decisiones pendientes

### D5 — Licencia

PSeInt es software **GPL**. Usar las fuentes C++ (`pseint-fuentes-para-estudio`)
como **especificación de comportamiento** es distinto a **derivar código** de ellas.
Si se traduce/porta código C++, Code4Code debería licenciarse como GPL. Definir la
postura antes de iniciar la Fase 3.

**Estado: parcialmente resuelto.** La Fase 3 se implementó como **reimplementación
limpia desde el comportamiento observado** (no se portó código C++), por lo que la
obligación de GPL por derivación no aplica al núcleo PSeInt. Queda **pendiente** la
elección formal de licencia del repositorio (definir antes del tag `v3.0.0`).

---

## Arquitectura objetivo

```
code4code/
├── index.html
├── css/
├── js/
│   ├── app.js                  # UI: orquesta editor, consola, paneles
│   └── editor/                 # editor propio, extraído de app.js y modularizado
│       ├── editor.js           # núcleo: documento, selección, undo/redo
│       ├── highlight.js        # resaltado por lenguaje (tokens del provider)
│       ├── gutter.js           # numeración, badges de error, línea activa
│       ├── autocomplete.js     # popup de autocompletado (datos del provider)
│       └── folding.js          # plegado de bloques (Fase 2)
├── core/
│   ├── language-registry.js    # registro y selección de lenguajes
│   ├── language-provider.js    # contrato/interfaz común (abajo)
│   ├── runtime-host.js         # I/O unificado: consola, Leer/input, stop, límites
│   ├── liteseint/              # core/ actual movido aquí (sin cambios funcionales)
│   │   ├── tokenizer.js  parser.js  validator.js  ast.js
│   │   ├── expression-evaluator.js  symbol-table.js  doc_errores.js
│   │   └── runtime.js          # (antes LiteSeInt.js)
│   ├── pseint/                 # nuevo intérprete modo PSeInt
│   │   ├── tokenizer.js  parser.js  validator.js
│   │   ├── builtins.js         # funciones nativas de PSeInt
│   │   └── runtime.js
│   └── python/
│       ├── provider.js         # carga diferida de Pyodide en un Web Worker
│       └── bridge.js           # input()/print() ↔ consola integrada
├── json/                       # ejercicios por lenguaje y nivel
│   ├── liteseint/N1.json … N7.json   # 245 ejercicios
│   ├── pseint/N1.json … N7.json      # 110 ejercicios
│   ├── python/N1.json … N7.json      # 110 ejercicios
│   └── multi/mapa.json               # 74 equivalencias N1–N7 entre lenguajes
└── tests/
```

### Contrato `LanguageProvider`

Cada lenguaje implementa la misma interfaz; `app.js` y el editor solo hablan con
esta capa:

```js
{
  id: 'liteseint' | 'pseint' | 'python',
  nombre, extension,            // '.psc', '.psc', '.py'
  // Editor
  tokenizarLinea(linea),        // tokens para resaltado del editor propio
  reglasIndentacion(),          // pares de apertura/cierre para guías y folding
  autocompletar(contexto),
  plantillaInicial(),           // bloque protegido inicial (si aplica)
  // Análisis
  validar(codigo) -> [errores por línea],
  // Ejecución
  ejecutar(codigo, host) -> control { detener() },
  //   host = { escribir(), leer() -> Promise, lineaActiva(), variables() }
  // Pedagogía (opcional por lenguaje)
  ejemplos(), documentacion()
}
```

Notas:

- `runtime-host.js` centraliza lo que hoy hace `app.js` con callbacks: consola,
  entrada inline de `Leer`/`input()`, resaltado de línea activa, botón Detener y
  límite de pasos/tiempo (protección contra ciclos infinitos), igual para los
  tres lenguajes.
- El **inspector de variables** y el **diagrama NS** se declaran capacidades
  opcionales del provider (LiteSeInt: ambos; PSeInt: variables sí, NS después;
  Python: variables vía inspección del namespace de Pyodide, en fase posterior).
- El editor propio consume `tokenizarLinea` y `reglasIndentacion` del provider
  activo: agregar un lenguaje nuevo no requiere tocar el editor.

---

## Fases

### Fase 0 — Repositorio nuevo y renombrado `v2.0.0-alpha`

Objetivo: nace el repo `Code4Code` con el código de LiteSeInt funcionando idéntico.

- [x] Crear repo `Code4Code` importando el historial de `LiteSeInt`
      (`git clone` + `git push` al remoto nuevo) para no perder los 64 commits.
- [ ] Archivar `LiteSeInt`: README con aviso de migración y enlace al repo nuevo;
      marcar el repo como *archived* en GitHub cuando Code4Code esté publicado.
- [x] Renombrar marca en UI, `index.html`, `package.json`, README, CHANGELOG.
- [x] Migrar claves `localStorage` (`liteseint:*` → `code4code:*`) con lectura
      retro-compatible: mismo origen `ernestoleonidas.github.io`, así que el
      progreso de los estudiantes se conserva. *(Cerrado en Fase 1: helpers
      `lsGet`/`lsSet` en `js/app.js` migran en la primera lectura.)*
- [x] Mover `core/` actual a `core/liteseint/` y renombrar
      `LiteSeInt.js` → `runtime.js`, sin cambios de comportamiento.
- [ ] Publicar GitHub Pages del repo nuevo.
- [x] `npm test` en verde (los tests actuales son la red de seguridad de todo
      el refactor).

**Criterio de salida:** la app funciona idéntica a v1.x bajo el nuevo nombre y URL.

### Fase 1 — Capa multi-lenguaje `v2.0.0-beta`

Objetivo: la UI deja de conocer a LiteSeInt directamente.

- [x] Implementar `language-provider.js`, `language-registry.js` y
      `runtime-host.js`.
- [x] Envolver el núcleo LiteSeInt actual como primer provider (sin tocar su
      lógica interna). *Ojo: `DocErrores`/`LiteSeInt` son declaraciones
      léxicas de script clásico (no cuelgan de `window`); el provider los
      referencia como identificadores libres.*
- [x] Extraer el editor de `app.js` a `js/editor/` y conectarlo al provider
      activo (tokens, indentación, autocompletado) — preparación de la Fase 2.
      *(Hecho al iniciar la Fase 2: `js/editor/highlight.js` y
      `js/editor/autocomplete.js`.)*
- [x] Selector de lenguaje en la cabecera del editor; persistir elección.
- [x] Asociar extensión de archivo y plantilla inicial por lenguaje en
      importar/descargar.
- [x] Mover el banco de ejercicios a `json/<lenguaje>/` y filtrar por lenguaje
      activo (solo LiteSeInt tiene contenido en esta fase).
- [x] Tests del contrato del provider (suite genérica que cualquier lenguaje
      nuevo debe pasar; `tests/contract-tests.js` incluye integración con el
      núcleo real cargando cada script por separado, fiel al navegador).

**Criterio de salida:** con un solo lenguaje registrado, la app es funcionalmente
igual a la Fase 0, pero `app.js` ya no importa nada de `core/liteseint/` directo.
**Cumplido en `v2.0.0-beta`**: `js/app.js` no usa `DocErrores` ni `LiteSeInt`
en ninguna parte.

### Fase 2 — Editor propio mejorado `v2.1.0`

Objetivo: llevar el editor propio a nivel profesional sin dependencias externas,
manteniendo todo lo que ya hace.

Se conserva (regresión cero):

- Numeración, resaltado, guías de indentación, autocompletado, undo/redo,
  badge de errores por línea con tooltip, resaltado de línea en ejecución,
  protección de `Proceso…FinProceso`, tooltips y confirmaciones.

Mejoras nuevas (orden sugerido por valor/esfuerzo):

- [x] Resaltado dirigido por el provider activo (multi-lenguaje real):
      `js/editor/highlight.js` + `provider.extraerVariables`, con suite
      `tests/editor-tests.js`. El autocompletado también quedó dirigido por
      el provider (`js/editor/autocomplete.js` + `provider.autocompletar`,
      suite `tests/autocomplete-tests.js`).
- [x] Autocierre de pares (`()`, `""`): `js/editor/pairs.js` con suite
      `tests/pairs-tests.js`. *Pendiente de este ítem: resaltado visual del
      par coincidente bajo el cursor y autocierre de bloques `Si/FinSi`.*
- [x] Búsqueda y reemplazo (`Ctrl+F` / `Ctrl+H`) con resaltado de coincidencias:
      `js/editor/search.js` + capa espejo `searchLayer`, con suite
      `tests/search-tests.js`. Los reemplazos respetan la plantilla protegida.
- [x] Plegado de bloques: LiteSeInt/PSeInt por pares apertura/cierre (keyword),
      Python por indentación (líneas que terminan en `:` cierran cuando baja la
      sangría). `js/editor/folding.js` + 4 nuevas pruebas Python en
      `tests/folding-tests.js`. Total folding: 19/19.
- [x] Historial undo/redo robusto con agrupación de ediciones (no solo `Ctrl+Z`
      simple) y `Ctrl+Shift+Z`/`Ctrl+Y`: `js/editor/history.js` (módulo puro)
      agrupa tecleos/borrados contiguos en un solo paso y rompe el grupo al
      cambiar de tipo, saltar el caret, cruzar el límite palabra/espacio o tras
      una pausa de tecleo; las ediciones estructurales quedan como pasos
      discretos. Suite `tests/history-tests.js`.
- [x] Indentación automática al crear línea dentro de un bloque
      (`pairs.alNuevaLinea` según `reglasIndentacion()` del provider), y
      `Tab`/`Shift+Tab` sobre selección múltiple de líneas (existente
      desde 1.x, conservado).
- [x] Mejoras móviles: barra de símbolos táctiles (`<-`, `==`, `[]`, `()`,
      `""`, `:`, `!=`, `↵`, `⇥`) adaptable por lenguaje (Python usa `=`
      en lugar de `<-`), gestionada por `actualizarBarraSimbolos`.
      Pendiente: scroll con teclado virtual en iOS/Android (requiere browser).
- [x] Temas claro/oscuro del editor: 6 temas implementados en CSS
      (Hacker/default, Ocean, Sunset, Papel/light, Noche, Día/day) con
      selector cíclico en la cabecera (`btnTheme`, `cycleTheme` en app.js)
      y persistencia en `localStorage`.
- [x] Rendimiento: `actualizarSyntaxHighlight` e `actualizarIndentGuides` diferidos
      30 ms via `_pendingSyntaxTimer` en `actualizarLineas`; undo/redo y
      search/replace usan `actualizarLineasInmediato` para render síncrono.
- [x] Suite de tests del editor en Node: resaltado (editor-tests 12/12),
      autocompletado (autocomplete-tests 10/10), pares (pairs-tests 20/20),
      búsqueda (search-tests 13/13), historial (history-tests 21/21),
      plegado (folding-tests 19/19), gutter (gutter-tests 12/12).

**Criterio de salida:** checklist de regresión cero completo + pruebas manuales
del flujo estudiante en escritorio y móvil.

### Fase 3 — Lenguaje PSeInt `v2.2.0 / v2.2.x`

Objetivo: modo compatible con PSeInt de escritorio, limitado a desarrollo de
algoritmos, con **sistema de perfiles configurable** (D4). Las fuentes C++
(`pseint-fuentes-para-estudio`) se usan como **especificación de comportamiento**
(ver D5), incluyendo cómo el PSeInt real interpreta cada opción de perfil.

#### 3a — Núcleo en perfil estricto `v2.2.0`

- [x] Diseño del objeto `perfil` desde el día uno: tokenizer/parser/validador
      reciben las opciones aunque inicialmente solo exista el preset estricto
      (evita un refactor posterior).
- [x] `Algoritmo|Proceso … FinAlgoritmo|FinProceso`.
- [x] Asignación `<-` (y `=` como comparador en condiciones).
- [x] `Escribir` / `Escribir Sin Saltar` / `Leer` multivariable.
- [x] Tipos PSeInt con conversión implícita (Fase 3a avanzada): coercionarValor
      corregido y completado — Logico↔Entero/Real/Cadena/Caracter,
      Cadena↔Entero/Real/Logico, con 13 pruebas nuevas (runtime tests 25-37).
- [x] Estructuras: `Si/Sino`, `Segun`, `Mientras`, `Repetir…Hasta Que`,
      `Para … Con Paso`.
- [x] Arreglos `Dimension` (1D/2D) con la semántica de índices de PSeInt.
- [x] `SubProceso`/`Funcion` con retorno y paso por referencia.
- [x] Funciones nativas de PSeInt: `RC/RAIZ, ABS, LN, EXP, SEN, COS, TAN, ATAN,
      TRUNC, REDON, AZAR, ALEATORIO, LONGITUD, SUBCADENA, CONCATENAR, MAYUSCULAS,
      MINUSCULAS, CONVERTIRANUMERO, CONVERTIRATEXTO` (19 funciones). Instrucción
      procedimental `ORDENAR(arreglo[, n])` (ordena en su lugar, 1D).
- [x] Correcciones de coerción implícita: `coercionarValor` maneja cadenas
      `"Verdadero"`/`"Falso"` → Lógico; Real → Entero trunca; NaN lanza error.
      `CONVERTIRATEXTO(bool)` produce `"Verdadero"`/`"Falso"`. Segun preserva
      capitalización de etiquetas de cadena.
- [x] Validador con mensajes de error alineados al vocabulario de PSeInt.
- [x] Provider PSeInt (`core/pseint/provider.js`): adapta el núcleo al contrato
      Code4Code; registrado en `index.html`; opción PSeInt en el selector de
      lenguaje; pruebas de integración en `tests/contract-tests.js`.
- [x] Suite de 33 golden tests (`tests/pseint-golden-tests.js`): programas
      completos ejecutados en el runtime con salida verificada.
- [x] Documentación de comandos PSeInt en el panel de aprendizaje.
- [x] Aviso de migración bidireccional: detectar sintaxis PSeInt en modo
      LiteSeInt (ya existe el error "sintaxis PSeInt no soportada") y viceversa.

#### 3b — Perfil flexible y presets `v2.3.1-beta` ✅

Opciones de perfil implementadas:

- [x] Asignación con `=` además de `<-` (y desambiguación con el comparador).
- [x] `Definir` opcional en perfil flexible: variables creadas en el primer uso,
      con inferencia de tipo por valor asignado.
- [x] `Dimension` con base de índices configurable: `indicesDesde0` en perfil
      flexible (acceso desde 0, almacenamiento interno desde 1 transparentemente).
- [x] Palabras opcionales en estructuras (`Entonces`, `Hacer`): el parser las
      acepta y descarta sin afectar la semántica.
- [x] UI de perfil: selector con presets *Estricto* (default) y *Flexible*,
      visible solo cuando el lenguaje activo es PSeInt; elección persistida en
      `localStorage`.
- [x] El perfil activo viaja en los metadatos del archivo descargado
      (`// Perfil: Estricto`) y se detecta al importar el `.psc`.
- [x] Golden tests duplicados por preset: cada programa de referencia se valida
      en ambos modos Estricto y Flexible (golden 34-37: suma acumulada y
      acceso a arreglos en Estricto vs Flexible).
- [x] Documentación en el panel de aprendizaje: diferencias entre perfiles
      incluidas en los comandos PSeInt.

> **Banco de ejercicios PSeInt:** 110 ejercicios en `json/pseint/` (N1–N7).
> Progreso por lenguaje persistido en `localStorage` (implementado en Fase 5 parcial).

**Fuera de alcance de la Fase 3:** diagramas de flujo, exportación a otros
lenguajes, ejecución paso a paso estilo depurador (puede volver en una fase
futura).

### Fase 4 — Python con Pyodide `v2.3.4-beta` ✅

Objetivo: escribir y ejecutar Python 3 real en el mismo entorno, sin backend.

- [x] Provider Python con resaltado (37 keywords + 22 builtins) y autocompletado
      básico en el editor propio (`core/python/tokenizer.js`, `provider.js`).
- [x] Pyodide 0.26.2 en un **Web Worker** con carga diferida (`core/python/worker.js`):
      indicador de progreso visible; caché HTTP del CDN de pyodide.org.
- [x] `bridge.js`: `print()` → consola integrada; `input()` → panel `#pythonStdinPanel`
      con entrada inline (patrón de reanudación asíncrona de Pyodide).
- [x] Manejo de errores: tracebacks de Python reducidos a "error en línea N" con
      mensaje corto, badge visual en el editor.
- [x] Botón Detener: termina el Worker de Pyodide (recreado en la próxima ejecución).
- [x] Validación previa con `compile()` en el Worker: reporta errores de sintaxis
      por línea sin ejecutar el programa.
- [x] Inspector de variables Python: tras la ejecución, el namespace del usuario
      aparece en el panel de variables.
- [x] Banco de ejercicios Python: 110 ejercicios N1–N7 en `json/python/`, todos
      con `numero`, `modulo`, `conceptos`, `pista` y `entradaProcesoSalida`.
      Cargados por `js/ejercicios-python-data.js`.
- [x] COOP/COEP: headers necesarios para `SharedArrayBuffer` — el worker usa
      el patrón de `input()` asíncrono de Pyodide, que no requiere estos headers.

> **Pendiente Fase 4:** mejoras de rendimiento (recarga de Worker vs reutilizar),
> pruebas de ejecución real en browser (requieren entorno con Pyodide corriendo).

### Fase 5 — Ejercicios multi-lenguaje `v2.4.0` *(en curso)*

Los tres bancos de ejercicios ya existen independientemente. La Fase 5
conecta la experiencia del estudiante entre lenguajes:

- [x] Banco LiteSeInt: 245 ejercicios N1–N7 en `json/liteseint/`.
- [x] Banco PSeInt: 110 ejercicios N1–N7 en `json/pseint/`.
- [x] Banco Python: 110 ejercicios N1–N7 en `json/python/`, con metadatos
      completos (`conceptos`, `pista`, `entradaProcesoSalida`, `numero`, `modulo`).
- [x] Progreso por lenguaje en `localStorage`: cada lenguaje tiene su propia
      clave de progreso; el selector de lenguaje carga el banco correspondiente.
- [x] Validación estática de los bancos en `npm test`: IDs únicos, campos
      obligatorios, ausencia de sintaxis cruzada entre lenguajes.
- [x] Esquema de ejercicio multi-lenguaje: mapa de equivalencias en
      `json/multi/mapa.json` (74 entradas N1–N7, todos los módulos cubiertos) que
      asocia el mismo concepto en varios lenguajes; `js/ejercicios-multi-data.js`
      como cargador; botones "Ver en otros lenguajes" en el panel de detalle del
      ejercicio.
- [x] Vista de progreso comparado: cuántos ejercicios resueltos por lenguaje
      (sección en la pestaña Rutas, `renderizarProgresoComparado` en `js/app.js`).
- [x] Ruta modular para PSeInt y Python: tarjetas N1–N7 colapsables con conceptos
      (badges), barra de progreso, y ejercicios agrupados por tipo (guiado/práctica/
      desafío). Reemplaza el placeholder "próximamente" en la pestaña Rutas.
      Implementado en `renderizarRutaModular` (genérico para cualquier lenguaje).

**Pendiente de la Fase 5:**

- [ ] **Esquema multi-lenguaje unificado** (*un enunciado, N soluciones*). Hoy
      cada lenguaje tiene su banco propio y `json/multi/mapa.json` los enlaza
      *a posteriori* por concepto. El objetivo es un formato de ejercicio único
      con un enunciado compartido y una `codigoReferencia`/`entradaProcesoSalida`
      por lenguaje, para no duplicar enunciados y mantener la equivalencia por
      construcción. Migración incremental: el mapa actual sigue sirviendo como
      puente hasta que el esquema unificado esté validado en `npm test`.

### Fase 6 — Estabilización y release `v3.0.0`

- [ ] Auditoría de rendimiento (tiempo de carga por lenguaje, memoria,
      tamaño de Pyodide en conexiones lentas). *Requiere browser.*
- [x] Accesibilidad del editor y la consola: skip-link (WCAG 2.4.1), aria-live
      en consola (WCAG 4.1.3), aria-label en editor/stdin/lenguaje, aria-expanded
      en panel toggle (WCAG 4.1.2), :focus-visible en inputs (WCAG 2.4.7).
- [x] README alineado al estado real v2.3.6-beta (todos los lenguajes
      funcionales, conteos correctos, estructura de proyecto actualizada).
- [ ] Pruebas del flujo completo de estudiante en escritorio y móvil con los
      tres lenguajes. *Requiere browser.*
- [ ] **CI: `npm test` en cada push/PR** (GitHub Actions, Node, sin build).
      Refuerza la regla de oro #1 automáticamente; no introduce build step del
      producto (la app sigue sirviéndose estática). Único ítem de Fase 6 que se
      puede cerrar sin browser.
- [ ] Tag de release `v3.0.0` y publicación de GitHub Pages (ver Fase 0).

> **Resumen de lo que queda para el release.** Casi todo lo abierto requiere un
> entorno con navegador (auditoría de rendimiento, flujo completo, ejecución real
> de Pyodide) o una acción de despliegue (GitHub Pages, archivar el repo
> LiteSeInt). El trabajo de código pendiente sin browser es: el **esquema
> multi-lenguaje unificado** (Fase 5), las **mejoras del Worker de Python**
> (Fase 4) y el **CI**. Las ideas para después del 3.0 viven en el *Backlog*.

### Backlog — Ideas post-3.0 (propuestas, sin comprometer)

Ordenadas por valor/esfuerzo estimado. Son propuestas para discutir, no
compromisos de alcance.

- [ ] **Autocorrección por salida esperada.** Los tres bancos ya guardan
      `entradaProcesoSalida`, pero hoy el progreso se marca a mano
      (`pendiente`/`en-curso`/`completado`). Ejecutar la solución del estudiante
      con la entrada del ejercicio y comparar con la salida esperada permitiría
      marcar *Completado* automáticamente y dar feedback. Era "fuera de alcance
      post-1.0" en LiteSeInt; ahora los metadatos lo habilitan. **Alto valor.**
- [ ] **Exportar/importar progreso local.** El progreso vive solo en
      `localStorage`; un export/import a JSON (los tres lenguajes) mitiga el
      riesgo de pérdida al limpiar el navegador o cambiar de equipo. **Bajo
      esfuerzo.**
- [ ] **PWA + Service Worker.** Cacheo de Pyodide y de la app para uso offline;
      mitiga el riesgo del peso de Pyodide (~6–10 MB) en conexiones lentas y
      encaja con el principio "100% client-side, sin instalación".
- [ ] **Diagrama Nassi-Shneiderman para PSeInt.** Hoy el diagrama NS es solo de
      LiteSeInt (`core/diagram-mapper.js` sobre su AST). El contrato del provider
      ya lo prevé como capacidad opcional ("PSeInt: variables sí, NS después").
- [ ] **Modo paso a paso / depurador.** Ejecución instrucción a instrucción con
      inspección de variables; diferido desde LiteSeInt 1.x. Alto valor
      pedagógico, esfuerzo alto (requiere runtime pausable en los tres núcleos).

---

## Riesgos

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Costo de implementar folding/búsqueda/pares en el editor propio | Alto | Fase 2 incremental por feature, cada una con regresión cero verificada; reevaluar D2 si el costo se dispara |
| Fidelidad PSeInt (semántica de tipos/conversiones poco documentada) | Alto | Golden tests contra PSeInt escritorio; fuentes C++ como especificación |
| Combinatoria de perfiles PSeInt multiplica los casos a testear | Medio | Solo dos presets oficiales (Estricto/Flexible); golden tests por preset; opciones sueltas quedan internas, sin UI propia |
| Peso de Pyodide (~6–10 MB) en conexiones lentas | Medio | Carga diferida solo al elegir Python, caché, indicador de progreso |
| `input()` síncrono en Pyodide requiere `SharedArrayBuffer` (headers COOP/COEP no configurables en GitHub Pages) | Medio | Validar temprano con prototipo; alternativa: patrón de input asíncrono/reanudación de Pyodide |
| Licencia GPL si se deriva código de PSeInt | Medio | Decidir D5; reimplementación limpia desde comportamiento observado |
| Render del editor propio con archivos largos | Medio | Render incremental por línea (Fase 2) |
| Pérdida de progreso guardado de estudiantes al cambiar de app | Bajo | Mismo origen en GitHub Pages: migración retro-compatible de claves `localStorage` |

---

## Resumen de versiones

| Versión | Hito |
| --- | --- |
| `2.0.0-alpha` | Repo nuevo Code4Code, renombrado, sin cambios funcionales |
| `2.0.0-beta` | Arquitectura multi-lenguaje (LiteSeInt como primer provider) |
| `2.1.0` | Editor propio mejorado (folding, búsqueda, pares, historial) |
| `2.2.0` | Lenguaje PSeInt — perfil estricto, 18 funciones nativas |
| `2.3.0` | Python con Pyodide en el navegador (`v2.3.1-beta`) |
| `2.3.2-beta` | Perfil flexible PSeInt + banco N1–N7 PSeInt (110 ejercicios) |
| `2.3.3-beta` | Banco N1–N7 Python (110 ejercicios), inspector de variables |
| `2.3.4-beta` | Correcciones coerción PSeInt + `ORDENAR`, metadatos Python completos |
| `2.3.5-beta` | `ORDENAR`, golden por preset, metadatos Python, mapa multi inicial |
| `2.3.6-beta` | Coerción PSeInt completa, mapa multi-lenguaje + progreso comparado |
| `2.3.7-beta` | Plegado Python por indentación, README al estado real |
| `2.3.8-beta` | Ruta modular N1–N7 (PSeInt/Python), mapa 74 entradas *(actual)* |
| `2.4.0` | Esquema de ejercicio multi-lenguaje unificado (un enunciado, N soluciones) |
| `3.0.0` | Release estable Code4Code (CI, auditoría de rendimiento, QA flujo completo) |
