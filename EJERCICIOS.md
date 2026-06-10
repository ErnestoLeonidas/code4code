# Ejercicios — Adaptación al dialecto LiteSeInt

Este documento define cómo se adaptaron y mantienen los ejercicios de `ejercicios/guia.html` en el lenguaje LiteSeInt para llegar a la versión 1.0.

`ejercicios/guia.html` es la fuente pedagógica del proyecto: sus ejercicios, su secuencia y sus niveles guiaron la integración del banco. Su sintaxis no es la fuente de verdad del lenguaje. La fuente de verdad del lenguaje es `README.md` (matriz de compatibilidad de v0.6.0).

## Decisión de producto

Para 1.0, **los ejercicios se adaptan a LiteSeInt**. LiteSeInt no debe crecer sin control para aceptar todo lo que aparezca en la guía. Si en el futuro un ejercicio requiere algo fuera de alcance, debe quedar marcado como "requiere adaptación" o "excluido temporalmente", no visible como ejercicio listo.

## Estructura del banco de ejercicios LiteSeInt

El banco contiene **245 ejercicios** distribuidos en 7 niveles (N1–N7). Cada nivel tiene su propio archivo JSON en `json/liteseint/N*.json` y corresponde a una Experiencia de Aprendizaje original de `guia.html`.

| Nivel | Archivo | EA de origen | Título | Cant. | Visible en app |
|---|---|---|---|---|---|
| N1 | `json/liteseint/N1.json` | EA 1.1 | Introducción a los Algoritmos | 20 | Sí |
| N2 | `json/liteseint/N2.json` | EA 1.2 | Diagramas de Flujo y Pseudocódigo | 40 | Sí |
| N3 | `json/liteseint/N3.json` | EA 1.3 | Estructuras de Decisión | 40 | Sí |
| N4 | `json/liteseint/N4.json` | EA 1.4 | Estructuras de Repetición | 60 | Sí |
| N5 | `json/liteseint/N5.json` | EA 1.5 | Desafíos | 15 | Sí |
| N6 | `json/liteseint/N6.json` | EA 1.6 | Tipo Prueba Parte 1 | 40 | Sí |
| N7 | `json/liteseint/N7.json` | EA 1.7 | Tipo Prueba Parte 2 | 30 | Sí |

N1–N7 se cargan y aparecen en el banco visible de la app (`NIVELES_VISIBLES = [1, 2, 3, 4, 5, 6, 7]` en `js/app.js`).

Distribución por dificultad: 91 básicos, 84 intermedios, 70 avanzados.

## Nueva estructura de aprendizaje LiteSeInt

La ruta de aprendizaje de LiteSeInt **no copia de forma literal** la estructura de EA de `guia.html`. La guía funciona como banco de ejercicios y referencia de complejidad, pero LiteSeInt organiza el avance por conceptos, autonomía y práctica progresiva dentro del propio pseudolenguaje.

La estructura se basa en dos decisiones pedagógicas:

1. El estudiante no debe partir siempre desde una pantalla en blanco.
2. Cada concepto debe pasar por una progresión: observar, ejecutar, investigar, modificar y crear.

### Ciclo de trabajo por ejercicio

Cada ejercicio integrado debe clasificarse según la actividad principal que propone:

| Etapa | Acción | Propósito |
|---|---|---|
| Observar | Leer un ejemplo corto y predecir la salida. | Reducir ansiedad inicial y enfocar la atención en qué hace el programa. |
| Ejecutar | Correr el código y comparar con la predicción. | Confirmar o corregir el modelo mental del estudiante. |
| Investigar | Identificar variables, comandos, condiciones, ciclos o patrones. | Entender la estructura del programa antes de escribir desde cero. |
| Modificar | Cambiar una parte acotada del programa. | Transferir gradualmente responsabilidad al estudiante. |
| Crear | Resolver un problema nuevo con el mismo concepto. | Practicar autonomía y consolidar el aprendizaje. |

### Niveles de aprendizaje

Los 245 ejercicios del banco están distribuidos en 7 niveles. Los niveles visibles en la app son N1–N7.

| Nivel | Nombre | Conceptos principales | Visible |
|---|---|---|---|
| N1 | Introducción a los Algoritmos | `Proceso`, `FinProceso`, `Escribir`, `Definir`, `Leer`, asignación, tipos | Sí |
| N2 | Diagramas de Flujo y Pseudocódigo | E·P·S, fórmulas, operadores, secuencias, conversiones | Sí |
| N3 | Estructuras de Decisión | `Si`/`Sino`, `Si` anidado, `Segun`, operadores lógicos | Sí |
| N4 | Estructuras de Repetición | `Mientras`, `Para`, `Repetir`, contador, acumulador | Sí |
| N5 | Desafíos | Combinación libre de los conceptos anteriores | Sí |
| N6 | Tipo Prueba Parte 1 | `Si` anidado al estilo del parcial | Sí |
| N7 | Tipo Prueba Parte 2 | Menú de 3 opciones, ciclo `Mientras`, contador y acumulador | Sí |

### Grados de ayuda

Además del nivel conceptual, cada ejercicio visible en la app debe indicar el grado de ayuda:

| Grado | Nombre | Criterio |
|---|---|---|
| 1 | Guiado | El estudiante predice, ejecuta o analiza código dado. |
| 2 | Con pista | El estudiante modifica una parte pequeña o completa una línea. |
| 3 | Práctica | El estudiante resuelve un ejercicio similar con pistas mínimas. |
| 4 | Desafío | El estudiante crea una solución completa a partir del enunciado. |

Esta clasificación permite que dos ejercicios del mismo tema tengan dificultad distinta. Por ejemplo, un ejercicio de `Mientras` puede ser guiado si solo se analiza un contador, o desafío si pide construir un menú con acumuladores.

### Campos mínimos para cada ejercicio adaptado

Cada ejercicio adaptado debe guardar al menos:

| Campo | Descripción |
|---|---|
| `id` | Identificador estable del ejercicio. |
| `origen` | Referencia al ejercicio original en `guia.html` cuando exista. |
| `nivelLiteSeInt` | Nivel 1-7 de la ruta LiteSeInt (N1–N7). |
| `gradoAyuda` | Guiado, con pista, práctica o desafío. |
| `conceptos` | Comandos o patrones que practica. |
| `dificultad` | Básico, intermedio o avanzado. |
| `enunciado` | Enunciado adaptado al lenguaje LiteSeInt. |
| `entradaProcesoSalida` | E/P/S cuando aplique. |
| `salidaEsperada` | Salida o comportamiento esperado. |
| `codigoReferencia` | Solución adaptada al dialecto LiteSeInt, oculta por defecto. |
| `estadoAdaptacion` | Pendiente, adaptado, requiere decisión o excluido temporalmente. |
| `motivoExclusion` | Obligatorio si el ejercicio queda excluido. |

### Regla de publicación para 1.0

El banco completo ya está integrado. Para 1.0, la regla de publicación es:

- todo ejercicio visible debe estar adaptado y probado;
- todo ejercicio no adaptado debe permanecer oculto o quedar excluido explícitamente;
- los 245 ejercicios visibles deben conservar enunciado, E/P/S, salida esperada, pista y código de referencia compatible;
- cada nivel N1–N7 debe mantener ejercicios guiados, de práctica y de desafío cuando existan en el banco.

## Reglas obligatorias de adaptación

Las siguientes reglas son **obligatorias** al integrar cualquier ejercicio al dialecto LiteSeInt. No se debe agregar alias ni sintaxis nueva al lenguaje solo porque aparezca en `guia.html`.

### Sustituciones directas

| En `guia.html` (PSeInt) | En LiteSeInt | Notas |
|---|---|---|
| `Cadena` | `Caracter` | Tipo string. Aproximadamente 271 ocurrencias en la guía. |
| `<-` | `=` | Operador de asignación. Aproximadamente 981 ocurrencias en la guía. |
| `SiNo` | `Sino` | Rama alternativa. Aproximadamente 276 ocurrencias en la guía. |
| `MOD` | `mod` | Operador resto. Aproximadamente 20 ocurrencias en la guía. |
| `;` al final de instrucción | eliminar | LiteSeInt no usa terminador de sentencia. |
| `=` como comparador en condición | `==` | LiteSeInt exige `==` para igualdad. |

### Construcciones que requieren reescritura

| Construcción de PSeInt | Acción en LiteSeInt |
|---|---|
| `DIV` (división entera) | Reescribir usando `/` y `Trunc(...)`. Ej.: `c = a DIV b` ⟶ `c = Trunc(a / b)`. Si la reescritura altera el objetivo pedagógico, marcar el ejercicio como **excluido temporalmente**. |
| `Escribir Sin Saltar` | LiteSeInt no soporta salida sin salto. Concatenar la línea con comas o marcar como **excluido temporalmente**. |
| `Leer x, y` (varias variables en una línea) | Convertir a `Leer x` + `Leer y` (una variable por línea). |

### Construcciones fuera de alcance para 1.0

Los ejercicios que requieran cualquiera de estas construcciones deben marcarse como **excluidos temporalmente**:

- `Dimension` y arreglos.
- `SubProceso` / `FinSubProceso`.
- `Funcion` definida por el usuario.
- Ejercicios con `Limpiar Pantalla`, lectura de archivos o cualquier I/O fuera de `Leer` / `Escribir`.

Si una versión posterior incorpora alguna de estas, los ejercicios bloqueados deben revisarse y reactivarse.

### Decisiones cerradas para 1.0

- No se introduce ningún alias en LiteSeInt para `Cadena`, `<-`, `SiNo`, `MOD` o `DIV`. Esas formas se convierten en el código del ejercicio o el ejercicio queda excluido.
- No se cambia la estructura visual de `ejercicios/guia.html`.
- No se agregan arreglos, matrices, `SubProceso`, funciones de usuario ni proyectos multiarchivo.
- No se implementa corrección automática avanzada de soluciones.
- No se agrega backend ni sincronización externa de progreso.

## Plan de pruebas para ejercicios adaptados

La adaptación de ejercicios es parte del plan de pruebas, **no** una tarea informal. Cada ejercicio integrado debe cumplir los seis criterios siguientes antes de declararse listo:

1. **Conversión de sintaxis**: ningún token de `Cadena`, `<-`, `SiNo`, `MOD`, `DIV`, `;` final ni `=` como comparador queda en el código.
2. **Validación estática**: `DocErrores.validarDocumento(codigo)` devuelve `errores: []` para el código adaptado.
3. **Ejecución**: el runtime ejecuta el ejercicio sin lanzar errores no esperados (división por cero, entrada inválida, etc. son aceptables si el ejercicio los espera).
4. **Salida esperada**: cuando la guía declara una salida de ejemplo, la salida del runtime debe coincidir línea por línea, considerando que los booleanos se imprimen como `Verdadero`/`Falso`.
5. **Cobertura pedagógica por comando**: cada comando o concepto que el ejercicio pretende enseñar debe aparecer en el código adaptado. Si la conversión obliga a eliminarlo (ej. ejercicios que enseñan `DIV`), el ejercicio se excluye en lugar de degradarse silenciosamente.
6. **Criterio de exclusión documentada**: si el ejercicio no puede adaptarse, queda registrado en la tabla de seguimiento con motivo y enlace al concepto bloqueante.

Estos criterios están reflejados en `tests/run-tests.js` mediante pruebas del banco de ejercicios, validación de campos obligatorios, sintaxis prohibida y validación estática de los códigos de referencia adaptados.

## Seguimiento

Toda integración o cambio futuro en ejercicios debe alimentar la tabla siguiente. La invariante es: **el 100% de los ejercicios visibles en la app deben estar adaptados o explícitamente excluidos**. No puede haber ejercicios visibles en estado intermedio.

| EA | Total | Adaptados | Requieren decisión | Excluidos temporales |
|---|---|---|---|---|
| 1.1 | 20 | 20 | 0 | 0 |
| 1.2 | 40 | 40 | 0 | 0 |
| 1.3 | 40 | 40 | 0 | 0 |
| 1.4 | 60 | 60 | 0 | 0 |
| 1.5 | 15 | 15 | 0 | 0 |
| 1.6 | 40 | 40 | 0 | 0 |
| 1.7 | 30 | 30 | 0 | 0 |
| **Total** | **245** | **245** | **0** | **0** |

Notas de adaptación:
- EA 1.1 #9 (Celsius a Fahrenheit): también existe como `ea1-2-009` (atribuido erróneamente a EA 1.2). El `ea1-1-009` usa el origen correcto.
- EA 1.1 #18 (Segundos a h:m:s): también existe como `ea1-2-015`. El `ea1-1-018` usa el origen correcto (EA 1.1). DIV/MOD adaptados a `Trunc`/`mod`.
- EA 1.1 #20: la variable `paso` es reservada en LiteSeInt (por `Con Paso` de `Para`); se renombra a `numPaso` en el código de referencia.

A **v1.0.0** el banco mantiene **245 ejercicios adaptados** desde `ejercicios/guia.html`, reorganizados en `json/liteseint/N1.json` a `json/liteseint/N7.json`. `js/ejercicios-data.js` es el punto único de carga del banco y consume esos JSON normalizados para exponer `EjerciciosLiteSeInt` al panel de aprendizaje. Los `codigoReferencia` mantienen formato consistente: 2 espacios por nivel, comas con espacio en declaraciones, bloques de declaraciones separados del cuerpo y cálculos separados de entrada/salida.

Mejora posterior sugerida: revisar pedagógicamente **EA 1.6** y **EA 1.7** para reducir repetición, mejorar enunciados/pistas y ajustar progresión. No bloquea 1.0 porque sus ejercicios ya están normalizados, visibles y pasan validación estática.

Distribución actual por nivel visible:

| Nivel | Tema | Adaptados |
|---|---|---:|
| N1 | Primeros programas | 20 |
| N2 | Expresiones y fórmulas | 40 |
| N3 | Decisiones | 40 |
| N4 | Repetición | 60 |
| N5 | Desafíos | 15 |
| N6 | Decisiones anidadas | 40 |
| N7 | Menú y acumulación | 30 |
| **Total** |  | **245** |

Criterio de publicación: todo ejercicio visible debe pasar la validación estática; cada ejercicio conserva enunciado, E·P·S, salida esperada, pista y código de referencia adaptado al dialecto LiteSeInt.

### Cobertura pedagógica por comando

Esta tabla rastrea qué módulos del lenguaje LiteSeInt cubre la guía. A `v0.9.5`, todos los conceptos principales tienen ejercicios adaptados, visibles y cubiertos por pruebas del banco o de documentación interna.

| Comando / concepto | EA donde aparece | Estado de cobertura |
|---|---|---|
| `Escribir` | 1.1 – 1.7 | cubierto |
| `Definir`, tipos, asignación `=` | 1.1 – 1.7 | cubierto |
| `Leer` | 1.1 – 1.7 | cubierto |
| Operadores `+ - * / mod ^` | 1.2 – 1.7 | cubierto |
| `Si` / `Sino` / `FinSi` | 1.3, 1.6 | cubierto |
| `Segun` | 1.3, 1.7 | cubierto |
| `Mientras` | 1.4, 1.7 | cubierto |
| `Para` | 1.4 | cubierto |
| `Repetir` / `HastaQue` | 1.4 | cubierto |
| Operadores lógicos `Y O No` | 1.3, 1.6 | cubierto |
| Funciones nativas `Abs Redon Trunc Longitud Mayusculas Minusculas` | 1.2, 1.5 | cubierto |
| `DIV` (no soportado) | 1.2, 1.5 | reescrito con `Trunc(a / b)` cuando corresponde |

## Cómo registrar cambios futuros

Si en una versión posterior se agrega, corrige o excluye un ejercicio, actualizar la tabla de seguimiento, conservar el `id` estable y anotar el motivo del cambio en `CHANGELOG.md`.
