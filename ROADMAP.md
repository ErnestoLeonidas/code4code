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
postura antes de iniciar la Fase 3. **Estado: pendiente.**

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
│   ├── liteseint/N1.json … N7.json
│   ├── pseint/                 # pendiente
│   └── python/                 # pendiente
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
- [ ] Plegado de bloques (`Si/FinSi`, `Para/FinPara`, `def:`/indentación en Python).
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
- [ ] Mejoras móviles: scroll/teclado virtual, botones táctiles de símbolos
      frecuentes (`<-`, `==`, `[]`).
- [ ] Temas claro/oscuro del editor.
- [ ] Rendimiento: render incremental por línea (solo repintar líneas cambiadas)
      para soportar archivos largos sin lag.
- [ ] Suite de tests del editor (documento, undo, indentación, folding) en Node
      *(en curso: resaltado y autocompletado ya tienen suites propias)*.

**Criterio de salida:** checklist de regresión cero completo + pruebas manuales
del flujo estudiante en escritorio y móvil.

### Fase 3 — Lenguaje PSeInt `v2.2.0 / v2.2.x`

Objetivo: modo compatible con PSeInt de escritorio, limitado a desarrollo de
algoritmos, con **sistema de perfiles configurable** (D4). Las fuentes C++
(`pseint-fuentes-para-estudio`) se usan como **especificación de comportamiento**
(ver D5), incluyendo cómo el PSeInt real interpreta cada opción de perfil.

#### 3a — Núcleo en perfil estricto `v2.2.0`

- [ ] Diseño del objeto `perfil` desde el día uno: tokenizer/parser/validador
      reciben las opciones aunque inicialmente solo exista el preset estricto
      (evita un refactor posterior).
- [ ] `Algoritmo|Proceso … FinAlgoritmo|FinProceso`.
- [ ] Asignación `<-` (y `=` como comparador en condiciones).
- [ ] `Escribir` / `Escribir Sin Saltar` / `Leer` multivariable.
- [ ] Tipos PSeInt: `Entero, Real, Caracter, Cadena, Logico` y conversión
      implícita según PSeInt.
- [ ] Estructuras: `Si/Sino`, `Segun`, `Mientras`, `Repetir…Hasta Que`,
      `Para … Con Paso`.
- [ ] Arreglos `Dimension` (1D/2D) con la semántica de índices de PSeInt.
- [ ] `SubProceso`/`Funcion` con retorno y paso por referencia.
- [ ] Funciones nativas de PSeInt: `RC/RAIZ, ABS, LN, EXP, SEN, COS, TAN, ATAN,
      TRUNC, REDON, AZAR, ALEATORIO, LONGITUD, SUBCADENA, CONCATENAR, MAYUSCULAS,
      MINUSCULAS, CONVERTIRANUMERO, CONVERTIRATEXTO` (lista a cerrar contra las
      fuentes).
- [ ] Validador con mensajes de error alineados al vocabulario de PSeInt.
- [ ] Suite de tests: programas de referencia ejecutados en PSeInt escritorio
      (perfil estricto) vs Code4Code comparando salida (golden tests).
- [ ] Documentación de comandos PSeInt en el panel de aprendizaje.
- [ ] Aviso de migración bidireccional: detectar sintaxis PSeInt en modo
      LiteSeInt (ya existe el error "sintaxis PSeInt no soportada") y viceversa.

#### 3b — Perfil flexible y presets `v2.2.x`

Opciones de perfil a relevar contra las fuentes C++ (lista inicial):

- [ ] Asignación con `=` además de `<-` (y desambiguación con el comparador).
- [ ] `Definir` opcional: variables creadas en el primer uso, con inferencia
      de tipo al estilo PSeInt flexible.
- [ ] `Dimension` con base de índices configurable (desde 0 o desde 1).
- [ ] Palabras opcionales en estructuras (`Entonces`, `Hacer`) según lo que
      permita el PSeInt real en modo flexible.
- [ ] UI de perfil: selector con presets *Estricto* (default) y *Flexible*,
      visible solo cuando el lenguaje activo es PSeInt; elección persistida.
- [ ] El perfil activo se muestra junto al nombre del lenguaje y viaja en los
      metadatos del archivo descargado (comentario de cabecera), para que un
      `.psc` se reabra con el mismo perfil.
- [ ] Golden tests duplicados por preset: cada programa de referencia se valida
      contra PSeInt escritorio configurado con el perfil equivalente.
- [ ] Documentación en el panel de aprendizaje: qué cambia entre perfiles y
      cuándo conviene cada uno.

**Fuera de alcance de la Fase 3:** diagramas de flujo, exportación a otros
lenguajes, ejecución paso a paso estilo depurador (puede volver en una fase
futura).

### Fase 4 — Python con Pyodide `v2.3.0`

Objetivo: escribir y ejecutar Python 3 real en el mismo entorno, sin backend.

- [ ] Provider Python con resaltado y autocompletado básico en el editor propio.
- [ ] Pyodide en un **Web Worker** con carga diferida: solo se descarga al
      seleccionar Python por primera vez, con indicador de progreso y caché
      (Service Worker o caché HTTP del CDN).
- [ ] `bridge.js`: `print()` → consola integrada; `input()` → entrada inline
      (misma UX que `Leer`), usando `SharedArrayBuffer`/Atomics o el patrón de
      interrupción de Pyodide para el input síncrono.
- [ ] Manejo de errores: traceback de Python mapeado a "error en línea N" con
      el mismo badge visual del editor.
- [ ] Botón Detener funcional (interrupt buffer de Pyodide / terminar worker).
- [ ] Validación previa ligera: chequeo de sintaxis con `compile()` antes de
      ejecutar, para reportar errores por línea sin correr el programa.
- [ ] Subconjunto educativo en la primera entrega: stdlib sí, sin instalación
      de paquetes (`micropip` queda para una fase futura).
- [ ] Verificar requisitos de despliegue en GitHub Pages (headers COOP/COEP si
      se usa `SharedArrayBuffer`; si no son viables, usar la alternativa de
      input asíncrono de Pyodide).

### Fase 5 — Ejercicios multi-lenguaje `v2.4.0` *(pendiente, por pedido explícito)*

La entrada de ejercicios **se mantiene** tal como está (banco LiteSeInt N1–N7,
245 ejercicios, progreso local). Esta fase queda planificada pero sin fecha:

- [ ] Esquema de ejercicio multi-lenguaje (un enunciado, N soluciones de
      referencia, una por lenguaje).
- [ ] Adaptación del banco a PSeInt y selección inicial para Python.
- [ ] Progreso por lenguaje en `localStorage`.
- [ ] Validación estática automática de referencias por lenguaje en `npm test`.

### Fase 6 — Estabilización y release `v3.0.0`

- [ ] Auditoría de rendimiento (tiempo de carga por lenguaje, memoria,
      tamaño de Pyodide en conexiones lentas).
- [ ] Accesibilidad del editor y la consola (teclado, lectores de pantalla).
- [ ] README/CHANGELOG/EJERCICIOS alineados al estado real.
- [ ] Pruebas del flujo completo de estudiante en escritorio y móvil con los
      tres lenguajes.

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
| `2.1.0` | Editor propio mejorado (folding, búsqueda, pares, móvil, temas) |
| `2.2.0` | Lenguaje PSeInt — perfil estricto, solo algoritmos |
| `2.2.x` | Perfil flexible y presets configurables de PSeInt |
| `2.3.0` | Python con Pyodide en el navegador |
| `2.4.0` | Banco de ejercicios multi-lenguaje *(pendiente)* |
| `3.0.0` | Release estable Code4Code |
