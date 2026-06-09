# Code4Code

**Code4Code** es una plataforma web educativa para aprender programación,
evolución de [LiteSeInt](https://github.com/ErnestoLeonidas/LiteSeInt).
Permite escribir programas en un editor integrado, validarlos en tiempo real
y ejecutarlos directamente en el navegador, sin instalación, sin backend y
sin proceso de compilación.

La ruta del estudiante recorre tres lenguajes dentro del mismo entorno:

1. **LiteSeInt** — dialecto de pseudocódigo mínimo y predecible (disponible).
2. **PSeInt** — modo compatible con el PSeInt de escritorio, solo desarrollo
   de algoritmos (en desarrollo, ver ROADMAP Fase 3).
3. **Python** — Python 3 real ejecutado en el navegador con Pyodide
   (en desarrollo, ver ROADMAP Fase 4).

## Estado actual

- Versión: `v2.0.0-alpha` — renombrado desde LiteSeInt v1.9.0 con
  **regresión cero**: toda la funcionalidad 1.x sigue operativa.
- Capa multi-lenguaje creada y probada (`core/language-*.js`,
  `core/runtime-host.js`); LiteSeInt registrado como primer lenguaje.
- El plan completo de evolución está en [`ROADMAP.md`](ROADMAP.md).

## Funcionalidad (heredada de LiteSeInt 1.x)

- Editor con numeración, resaltado, guías de indentación, autocompletado,
  validación estática por línea y resaltado de línea en ejecución.
- Consola integrada con entrada inline para `Leer`, inspector de variables
  en vivo y diagrama Nassi-Shneiderman bidireccional.
- Panel de aprendizaje con 245 ejercicios (niveles N1–N7), documentación de
  comandos, ruta del estudiante y errores comunes — todo sin internet.
- Importación y descarga de archivos `.psc`, ejemplos agrupados por concepto
  y progreso local persistente.

La referencia completa del lenguaje LiteSeInt (matriz de compatibilidad,
tipos, operadores, funciones nativas, arreglos, subprocesos) está congelada
desde la 1.0 y documentada en el repositorio original y en la app.

## Uso rápido

1. Clona este repositorio.
2. Abre `index.html` en un navegador moderno.
3. Escribe pseudocódigo o carga un ejemplo y presiona `Ejecutar`.

## Estructura del proyecto

```
.
├── index.html
├── css/
├── js/
│   ├── app.js                  # controlador de UI (editor, consola, paneles)
│   ├── ejercicios-data.js      # banco de ejercicios
│   └── diagram.js              # diagrama NS
├── core/
│   ├── language-provider.js    # contrato común de lenguajes
│   ├── language-registry.js    # registro y lenguaje activo
│   ├── runtime-host.js         # I/O de ejecución unificado
│   └── liteseint/              # núcleo LiteSeInt (intacto desde 1.x)
│       ├── tokenizer.js  parser.js  validator.js  ast.js
│       ├── expression-evaluator.js  symbol-table.js  doc_errores.js
│       ├── diagram-mapper.js
│       ├── runtime.js          # (antes LiteSeInt.js)
│       └── provider.js         # LiteSeInt como lenguaje registrado
├── json/                       # ejercicios N1–N7
├── tests/
│   ├── run-tests.js            # regresión del núcleo y los ejercicios
│   └── contract-tests.js       # contrato de la capa multi-lenguaje
└── scripts/
```

## Pruebas

```
npm test
```

Ejecuta la suite de regresión del núcleo LiteSeInt y las pruebas del
contrato multi-lenguaje. Mantener esta suite en verde es la regla número
uno del refactor (ver `CLAUDE.md`).

## Hoja de ruta

Ver [`ROADMAP.md`](ROADMAP.md): fases 0–6, decisiones de arquitectura
(D1–D5), riesgos y criterios de salida por fase.

## Licencia

Proyecto educativo de uso libre. El modo PSeInt (Fase 3) se implementará
como reimplementación limpia a partir del comportamiento observado; ver la
decisión D5 del ROADMAP respecto de las fuentes GPL de PSeInt.

## Créditos

Desarrollado por [Ernesto Velásquez](https://github.com/ernestoleonidas).
