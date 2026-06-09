# LiteSeInt AST Contract

> Contrato del Árbol de Sintaxis Abstracta (AST) producido por `core/parser.js` y consumido por `core/LiteSeInt.js` (runtime), y a futuro por `core/diagram-mapper.js` (v1.9.0).
>
> Versión del contrato: **`astVersion: 5`** (actualizada en v1.9.0).

## Propósito

A partir de v1.1.0, `core/parser.js` es la única fuente de verdad estructural para el código del estudiante. El runtime, las herramientas de inspección (v1.7.0), los subprocesos (v1.8.0) y el diagrama bidireccional (v1.9.0) consumen el mismo AST. Cualquier extensión del dialecto debe agregar nodos aquí antes de tocar otra capa.

## Forma general de los nodos

```js
{
  tipo: "NombreEnPascalCase",
  // ... campos específicos del nodo (en camelCase)
  loc: {
    linea: number,           // índice base 0
    columnaInicio: number,   // columna base 0 del primer carácter
    columnaFin: number       // columna base 0 del último carácter
  }
}
```

- `tipo` está en **PascalCase** (`Programa`, `Si`, `Mientras`, ...).
- Los campos restantes son **camelCase**.
- `loc` aparece en todos los nodos excepto en nodos hoja que viven dentro de otro nodo y comparten su rango (por ejemplo `Caso` dentro de `Segun`).
- El nodo raíz `Programa` lleva además `astVersion: number`.

## Nodos definidos en v1.1.0

### `Programa`

Nodo raíz único del documento.

```js
{
  tipo: "Programa",
  astVersion: 5,
  cuerpo: Nodo[],            // instrucciones del Proceso principal
  subprocesos: Object,       // mapa nombre→SubProceso (v1.8.0)
  nombreProceso: string,     // nombre del bloque Proceso, default 'Principal' (v1.9.0)
  loc
}
```

### `Definir`

Declaración de una o más variables. El texto crudo se preserva en `texto` para que el runtime y los reportes mantengan la representación original.

```js
{ tipo: "Definir", texto: string, loc }
```

### `Asignar`

Asignación `<variable> = <expresión>`. El parser no descompone el RHS en sub-expresión todavía: el runtime usa el evaluador para resolverlo.

```js
{ tipo: "Asignar", texto: string, loc }
```

### `Leer`

```js
{ tipo: "Leer", texto: string, loc }
```

### `Escribir`

```js
{ tipo: "Escribir", texto: string, loc }
```

### `Si`

Condicional con rama opcional `Sino`.

```js
{
  tipo: "Si",
  condicion: string,
  entonces: Nodo[],
  sino: Nodo[] | null,
  loc
}
```

### `Mientras`

Bucle pretest.

```js
{
  tipo: "Mientras",
  condicion: string,
  cuerpo: Nodo[],
  loc
}
```

### `Repetir`

Bucle postest. Cierra con `HastaQue <cond>` (alias `Hasta Que`). El `loc` apunta al `Repetir` y `locHastaQue` al cierre, para que el runtime resalte la línea correcta cuando evalúa la condición.

```js
{
  tipo: "Repetir",
  cuerpo: Nodo[],
  condicion: string | null,   // null si el parser no encontró HastaQue (error)
  loc,
  locHastaQue
}
```

### `Para`

Bucle con contador.

```js
{
  tipo: "Para",
  variable: string,           // nombre normalizado (lowercase)
  variableOriginal: string,   // nombre tal como aparece en el código
  desde: string,              // expresión inicial
  hasta: string,              // expresión final
  paso: string,               // expresión de paso ("1" por defecto)
  cuerpo: Nodo[],
  loc
}
```

### `Segun`

Selector múltiple.

```js
{
  tipo: "Segun",
  expresion: string,
  casos: Caso[],
  otro: Nodo[] | null,        // rama "De Otro Modo"
  loc
}
```

### `Caso`

Caso dentro de un `Segun`. No lleva `loc` propio: hereda el rango de su `Segun`.

```js
{
  tipo: "Caso",
  valores: string[],          // valores de etiqueta ("1", "2", "3")
  cuerpo: Nodo[]
}
```

### `Desconocido`

Línea no reconocida por el parser. El runtime la convierte en un error de ejecución. Permite al validador estático seguir reportando errores precisos y al runtime detener la corrida con un mensaje claro.

```js
{ tipo: "Desconocido", texto: string, loc }
```

## Nodos agregados en v1.6.0

### `Dimension`

Declara las dimensiones de un arreglo o matriz. Debe ir antes o después de `Definir`, pero ambos deben aparecer antes de cualquier acceso por índice.

```js
{
  tipo: "Dimension",
  nombre: string,        // nombre original de la variable (sin normalizar)
  dimensiones: (number | string)[],  // tamaños: [n] para 1D, [n, m] para 2D
  loc
}
```

Los elementos de `dimensiones` son números si el tamaño es un literal entero en el código fuente, o strings de expresión si es una variable o expresión (evaluados en tiempo de ejecución).

### `AsignarIndice`

Asignación a un elemento de arreglo: `arr[i] = expr` o `mat[i, j] = expr`.

```js
{
  tipo: "AsignarIndice",
  nombre: string,         // nombre original de la variable
  indices: string[],      // una o dos expresiones de índice (como strings)
  expresion: string,      // expresión del lado derecho de la asignación
  loc
}
```

### `LeerIndice`

Lectura desde consola hacia un elemento de arreglo: `Leer arr[i]`.

```js
{
  tipo: "LeerIndice",
  nombre: string,
  indices: string[],      // expresiones de índice (como strings)
  loc
}
```

## Nodos agregados en v1.8.0

### `SubProceso`

Definición de un subproceso o función. Aparece como valor en el mapa `subprocesos` del nodo `Programa`, no directamente en `cuerpo`.

```js
{
  tipo: "SubProceso",
  nombre: string,              // nombre normalizado (lowercase)
  nombreOriginal: string,      // nombre tal como aparece en el código
  retorno: string | null,      // nombre de la variable de retorno, o null (SubProceso sin retorno)
  params: Param[],             // lista de parámetros
  esFuncion: boolean,          // true si se declaró con "Funcion"
  cuerpo: Nodo[],              // instrucciones del cuerpo
  loc
}
```

Donde `Param` es:

```js
{
  nombre: string,              // nombre normalizado (lowercase)
  nombreOriginal: string,
  tipo: string | null,         // tipo declarado con "Como", o null si ausente
  porReferencia: boolean       // true si "Por Referencia"
}
```

### `Llamar`

Invocación de un subproceso como instrucción independiente (sin captura de retorno).

```js
{
  tipo: "Llamar",
  nombre: string,              // nombre normalizado (lowercase)
  nombreOriginal: string,
  args: string[],              // expresiones de argumento como strings
  varRetorno: null,            // siempre null en Llamar (retorno se captura con asignación)
  loc
}
```

## Helpers de serialización

```js
LiteSeIntAST.serializarAST(ast)    // → string JSON
LiteSeIntAST.deserializarAST(json) // → AST
```

El roundtrip JSON debe preservar exactamente el AST. Está cubierto por la prueba `parser: roundtrip JSON preserva el AST` en `tests/run-tests.js`.

## Reglas para extender el contrato

1. **Subir `astVersion`** cuando se agreguen, retiren o cambien nodos del lenguaje. Versiones planeadas:
   - `astVersion: 3` → v1.6.0 (**completado**: nodos `Dimension`, `AsignarIndice`, `LeerIndice`).
   - `astVersion: 4` → v1.8.0 (**completado**: nodos `SubProceso`, `Llamar`; campo `subprocesos` en `Programa`).
   - `astVersion: 5` → v1.9.0 (**completado**: campo `nombreProceso` en `Programa`).
2. **Nuevos nodos** se definen en `core/ast.js` mediante factory `nodoX(...)` y se documentan aquí.
3. **Modificaciones en nodos existentes** se documentan aquí indicando la versión del cambio.
4. **No se eliminan campos** sin un ciclo de deprecación que toque parser, runtime y validator a la vez. Los consumidores de F1.7+ (inspector, diagrama) dependen de la estabilidad de `loc` y de los campos estructurales.

## Aplicabilidad por capa

| Capa | Lee del AST | Escribe en el AST |
|---|---|---|
| `core/parser.js` | — | Produce `Programa` y nodos hijos. |
| `core/LiteSeInt.js` (runtime) | Sí, despacha por `nodo.tipo`. | No. |
| `core/diagram-mapper.js` (v1.9.0) | Sí, mapea a nodos visuales. | Reconstruye AST en edición. |
| Validador estático (`core/validator.js`) | No directamente: trabaja sobre tokens crudos por línea. Su salida (errores + tabla de símbolos) acompaña al AST en el runtime. | No. |

El validador estático y el parser son **complementarios**: el validador detecta errores con `loc` precisa antes de la ejecución, y el parser construye el AST que el runtime ejecuta. Ambos se ejecutan sobre el mismo texto fuente y deben mantenerse coherentes (si el validador acepta una construcción, el parser debe poder representarla).
