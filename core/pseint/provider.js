/**
 * Code4Code — core/pseint/provider.js
 * =====================================
 * Provider del lenguaje PSeInt (perfil estricto): adapta el núcleo
 * core/pseint/ al contrato Code4Code (core/language-provider.js) y lo
 * registra en Code4Code.registro.
 *
 * El núcleo expone sus APIs como globals de script clásico:
 *   DocErroresPSeInt  (core/pseint/tokenizer.js)
 *   parsearPSeInt     (core/pseint/parser.js)
 *   validarPSeInt     (core/pseint/validator.js)
 *   RuntimePSeInt     (core/pseint/runtime.js)
 *
 * Este provider es la única pieza que los conoce: la UI (js/app.js) habla
 * solo con el contrato y ejecuta a través del RuntimeHost (core/runtime-host.js).
 *
 * Ver ROADMAP.md — Fase 3.
 */
(function (raiz) {
  'use strict';

  var Code4Code = raiz.Code4Code;
  if (!Code4Code || typeof Code4Code.crearProvider !== 'function') {
    if (raiz.console) raiz.console.warn(
      'pseint/provider.js: falta language-provider.js; provider no registrado.');
    return;
  }

  var g = raiz;

  // OJO: DocErroresPSeInt (const), validarPSeInt (function) y RuntimePSeInt
  // (class) son declaraciones léxicas de script clásico: NO cuelgan de
  // window/globalThis. Se referencian como identificadores libres.

  /**
   * Acceso defensivo al núcleo DocErroresPSeInt.
   */
  function nucleoDocErroresPSeInt() {
    return typeof DocErroresPSeInt !== 'undefined' ? DocErroresPSeInt : null;
  }

  /** Plantilla inicial del editor para PSeInt. */
  var PLANTILLA = 'Algoritmo nombre_algoritmo\n\n\n\n\n\nFinAlgoritmo';

  /** Perfiles disponibles. */
  var PERFILES = Object.freeze({
    estricto: Object.freeze({ asignacionConIgual: false, indicesDesde0: false }),
    flexible: Object.freeze({ asignacionConIgual: true,  indicesDesde0: true  })
  });

  /**
   * Perfil activo del provider. Es una variable del closure — no una
   * propiedad del objeto provider — por lo que `configurarPerfil` puede
   * mutar este valor aunque el objeto provider esté congelado por
   * `Code4Code.crearProvider`.
   */
  var _perfilActivo = PERFILES.estricto;

  /** Tipos de token del núcleo PSeInt → tipos genéricos del contrato. */
  var MAPA_TOKENS = null;
  function mapaTokens() {
    if (MAPA_TOKENS) return MAPA_TOKENS;
    var nucleo = nucleoDocErroresPSeInt();
    if (!nucleo) return {};
    var TK = nucleo.TK;
    MAPA_TOKENS = {};
    MAPA_TOKENS[TK.KEYWORD]          = 'palabra-clave';
    MAPA_TOKENS[TK.STRING]           = 'cadena';
    MAPA_TOKENS[TK.STRING_UNCLOSED]  = 'cadena';
    MAPA_TOKENS[TK.NUMBER]           = 'numero';
    MAPA_TOKENS[TK.FLECHA]           = 'asignacion';
    MAPA_TOKENS[TK.COMPARADOR]       = 'operador';
    MAPA_TOKENS[TK.OPERATOR]         = 'operador';
    MAPA_TOKENS[TK.IDENTIFIER]       = 'identificador';
    MAPA_TOKENS[TK.COMMA]            = 'plano';
    MAPA_TOKENS[TK.COLON]            = 'plano';
    MAPA_TOKENS[TK.LPAREN]           = 'parentesis-abre';
    MAPA_TOKENS[TK.RPAREN]           = 'parentesis-cierra';
    MAPA_TOKENS[TK.LBRACKET]         = 'plano';
    MAPA_TOKENS[TK.RBRACKET]         = 'plano';
    return MAPA_TOKENS;
  }

  function definicion() {
    return {
      id: 'pseint',
      nombre: 'PSeInt',
      extension: '.psc',
      capacidades: [
        Code4Code.CAPACIDADES.INSPECTOR_VARIABLES,
        Code4Code.CAPACIDADES.EJERCICIOS,
        Code4Code.CAPACIDADES.DOCUMENTACION
      ],

      plantillaInicial: function () {
        return PLANTILLA;
      },

      /**
       * Tokens para el resaltado, desde el tokenizer real del núcleo PSeInt.
       */
      tokenizarLinea: function (linea) {
        var nucleo = nucleoDocErroresPSeInt();
        if (!nucleo || typeof nucleo.tokenizarLinea !== 'function') {
          return { tokens: [{ tipo: 'plano', texto: String(linea) }] };
        }
        var mapa = mapaTokens();
        var tokens = nucleo.tokenizarLinea(String(linea), _perfilActivo).map(function (tk) {
          return { tipo: mapa[tk.tipo] || 'plano', texto: tk.valor, nucleo: tk };
        });
        return { tokens: tokens };
      },

      /**
       * Reglas de indentación para el editor:
       * - aperturas: palabras que abren un bloque (aumentan nivel)
       * - cierres:   palabras que cierran un bloque (disminuyen nivel)
       * - intermedios: palabras que vuelven al nivel del apertura (Sino)
       */
      reglasIndentacion: function () {
        return {
          aperturas: [
            'Algoritmo', 'Proceso',
            'Si', 'Mientras', 'Para', 'Repetir', 'Segun',
            'SubProceso', 'Funcion'
          ],
          cierres: [
            'FinAlgoritmo', 'FinProceso',
            'FinSi', 'FinMientras', 'FinPara', 'Hasta Que', 'HastaQue',
            'FinSegun', 'FinSubProceso', 'FinFuncion'
          ],
          intermedios: ['Sino', 'De Otro Modo:']
        };
      },

      /**
       * Extrae variables declaradas con "Definir x Como Tipo" para el
       * resaltado del editor (js/editor/highlight.js las marca como sh-variable).
       */
      extraerVariables: function (codigo) {
        var vars = [];
        var vistos = {};
        String(codigo || '').split('\n').forEach(function (linea) {
          var m = linea.match(/^\s*definir\s+([^,\s].+?)\s+como\s+\S/i);
          if (!m) return;
          // Puede ser "Definir x, y, z Como Entero"
          m[1].split(',').forEach(function (parte) {
            var nombre = parte.trim().toLowerCase();
            if (nombre && !vistos[nombre]) {
              vistos[nombre] = true;
              vars.push(parte.trim());
            }
          });
        });
        return vars;
      },

      /**
       * Validación estática mediante validarPSeInt().
       * La función devuelve [{ linea, mensaje }] con linea 1-based.
       * El contrato espera [{ linea, mensaje, tipo }].
       */
      validar: function (codigo) {
        if (typeof validarPSeInt !== 'function') return [];
        return validarPSeInt(String(codigo || ''), _perfilActivo).map(function (e) {
          return { linea: e.linea, mensaje: e.mensaje, tipo: 'error' };
        });
      },

      /**
       * Candidatos de autocompletado: palabras clave PSeInt + funciones nativas.
       * La UI filtra por prefijo antes de mostrar el popup.
       *
       * @param {object} contexto - { linea, columna, codigo }
       * @returns {Array<{texto: string, tipo: string, detalle?: string}>}
       */
      autocompletar: function (contexto) {
        var nucleo = nucleoDocErroresPSeInt();
        if (!nucleo) return [];

        var palabras = [];
        nucleo.KEYWORDS_PSEINT.forEach(function (kw) {
          // Capitalizar primera letra para mostrarlo en el popup igual
          // que aparece en el código PSeInt.
          var cap = kw.charAt(0).toUpperCase() + kw.slice(1);
          palabras.push({ texto: cap, tipo: 'keyword' });
        });

        var funciones = [];
        nucleo.FUNCIONES_NATIVAS_SET.forEach(function (fn) {
          funciones.push({ texto: fn.toUpperCase() + '()', tipo: 'funcion' });
        });

        return palabras.concat(funciones);
      },

      /**
       * Ejecución a través del RuntimeHost: adapta la interfaz simple del
       * RuntimePSeInt (host.escribir, host.leer, host.variables, host.lineaActiva)
       * al contrato del RuntimeHost de Code4Code.
       *
       * RuntimePSeInt llama:
       *   host.escribir(texto, tipo_string)   tipo_string: 'error'|'output'|…
       *   host.leer(nombreVar)                → Promise<string>
       *   host.variables(snapshot)            para el inspector de variables
       *   host.lineaActiva(lineaIdx)          resaltado de línea activa
       *
       * Y NO llama host.iniciar() ni host.finalizar() — eso lo hace el provider.
       */
      ejecutar: function (codigo, host) {
        if (typeof RuntimePSeInt === 'undefined') {
          host.iniciar();
          host.reportarError(new Error('El núcleo PSeInt no está cargado.'));
          return { detener: function () {} };
        }

        var rt = new RuntimePSeInt(_perfilActivo);
        var detenido = false;

        // Objeto puente que RuntimePSeInt recibe como `host` interno.
        // Adapta la interfaz simple del runtime al contrato del RuntimeHost.
        var puenteHost = {
          escribir: function (texto, tipo) {
            // RuntimePSeInt llama host.escribir(texto, tipo_string).
            // El RuntimeHost de Code4Code espera host.escribir(texto, meta_object).
            // Aquí el texto de error ya incluye "Error: …" como prefijo.
            if (tipo === 'error') {
              host.reportarError({ message: String(texto) });
            } else {
              host.escribir(String(texto), { tipo: 'salida' });
            }
          },
          leer: function (nombreVar) {
            return host.leer(nombreVar).catch(function (e) {
              if (e && e.esDetencionDeHost) return '';
              throw e;
            });
          },
          variables: function (snapshot) {
            host.reportarVariables(snapshot);
          },
          lineaActiva: function (lineaIdx) {
            // RuntimePSeInt pasa el índice 0-based; contarPaso espera cualquier
            // número (lo propaga a callbacks.lineaActiva).
            try { host.contarPaso(lineaIdx); } catch (e) {
              // EjecucionDetenida: marcar detenido para que el runtime pare.
              if (e && e.esDetencionDeHost) {
                detenido = true;
              }
            }
          }
        };

        host.iniciar();

        // ejecutar() es async: devuelve la Promise pero el control (detener)
        // se devuelve de forma síncrona.
        rt.ejecutar(String(codigo || ''), puenteHost).then(
          function () {
            if (detenido || host.fueDetenido()) {
              host.detener();
            } else {
              host.finalizar();
            }
          },
          function (err) {
            host.reportarError(err);
          }
        );

        return {
          detener: function (motivo) {
            detenido = true;
            host.detener(motivo);
          }
        };
      },

      /**
       * Cambia el perfil activo. Acepta 'estricto' o 'flexible'.
       * Aunque el objeto provider esté congelado por crearProvider, esta
       * función muta `_perfilActivo` que es una variable del closure, no
       * una propiedad del objeto.
       */
      configurarPerfil: function (preset) {
        _perfilActivo = PERFILES[preset] || PERFILES.estricto;
      },

      /** Devuelve el objeto de perfil actualmente activo. */
      obtenerPerfil: function () {
        return _perfilActivo;
      },

      /**
       * Documentación pedagógica de los comandos PSeInt para el panel de
       * aprendizaje. Cada entrada sigue el mismo esquema que DOC_COMANDOS en
       * js/app.js (LiteSeInt): { nombre, sintaxis, ejemplo, descripcion,
       * detalle?, errores?, ejercicios? }.
       */
      documentacion: function () {
        return {
          comandos: DOC_COMANDOS_PSEINT
        };
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Datos de documentación — definidos fuera de definicion() para no
  // reconstruirlos en cada llamada, pero dentro del IIFE para no contaminar
  // el ámbito global.
  // ---------------------------------------------------------------------------

  var DOC_COMANDOS_PSEINT = [
    {
      nombre: 'Algoritmo / FinAlgoritmo',
      sintaxis: 'Algoritmo nombre_algoritmo\n  instrucciones\nFinAlgoritmo',
      ejemplo: 'Algoritmo saludar\n  Escribir "Hola, mundo"\nFinAlgoritmo',
      descripcion: 'Marca el inicio y el fin del programa. Todo el código PSeInt va dentro de este bloque. También se acepta Proceso / FinProceso (compatibilidad LiteSeInt).',
      detalle: 'El nombre no puede contener espacios. Usa siempre este bloque, incluso en programas cortos; PSeInt no ejecuta código fuera de él.',
      errores: 'Olvidar FinAlgoritmo, escribir instrucciones fuera del bloque, o usar un nombre con espacios como "Mi Algoritmo".'
    },
    {
      nombre: 'Definir',
      sintaxis: 'Definir variable Como Entero\nDefinir a, b, c Como Real\nDefinir nombre Como Cadena\nDefinir activo Como Logico',
      ejemplo: 'Algoritmo tipos\n  Definir edad Como Entero\n  Definir promedio Como Real\n  Definir nombre Como Cadena\n  Definir aprobado Como Logico\n  edad <- 20\n  promedio <- 9.5\n  nombre <- "Ana"\n  aprobado <- Verdadero\n  Escribir nombre, " tiene ", edad, " años"\nFinAlgoritmo',
      descripcion: 'Declara una variable con su nombre y tipo. En perfil estricto toda variable debe declararse con Definir antes de usarse.',
      detalle: 'Puedes declarar varias variables del mismo tipo en una línea separadas por comas. El tipo no puede cambiar después de la declaración.',
      errores: 'Usar una variable sin Definirla primero, declarar la misma variable dos veces, o usar una palabra reservada como nombre de variable.'
    },
    {
      nombre: 'Tipos de dato',
      sintaxis: 'Entero   // número entero sin decimales\nReal     // número con decimales\nCadena   // texto entre comillas dobles\nCaracter // texto (sinónimo de Cadena)\nLogico   // Verdadero o Falso',
      ejemplo: 'Algoritmo demo_tipos\n  Definir cantidad Como Entero\n  Definir precio Como Real\n  Definir ciudad Como Cadena\n  Definir aprobado Como Logico\n  cantidad <- 5\n  precio <- 19.99\n  ciudad <- "Santiago"\n  aprobado <- Verdadero\n  Escribir "Ciudad: ", ciudad\nFinAlgoritmo',
      descripcion: 'Cada variable guarda un único tipo de dato. PSeInt acepta tanto Cadena como Caracter para texto; Cadena es el nombre más usual.',
      detalle: 'Entero para contadores, cantidades y edades. Real para precios, promedios y medidas. Cadena para nombres y texto. Logico para estados booleanos (Verdadero/Falso).',
      errores: 'Guardar texto en una variable Entero, o intentar asignar Verdadero a una variable Real.'
    },
    {
      nombre: 'Asignación  <-',
      sintaxis: 'variable <- expresion',
      ejemplo: 'Algoritmo asignacion\n  Definir precio, cantidad, total Como Real\n  precio <- 1500\n  cantidad <- 3\n  total <- precio * cantidad\n  Escribir "Total: ", total\nFinAlgoritmo',
      descripcion: 'Calcula la expresión de la derecha y guarda el resultado en la variable. En PSeInt (perfil estricto) la flecha <- es el único operador de asignación; el signo = siempre es un comparador.',
      detalle: 'Esta es la diferencia más importante respecto a LiteSeInt: en PSeInt estricto `x = 5` es una comparación (¿x vale 5?), no una asignación. Para asignar usa `x <- 5`.',
      errores: 'Usar = para asignar (es un error en perfil estricto), o asignar a una variable no declarada con Definir.'
    },
    {
      nombre: 'Leer',
      sintaxis: 'Leer variable\nLeer variable1, variable2',
      ejemplo: 'Algoritmo lectura\n  Definir nombre Como Cadena\n  Definir edad Como Entero\n  Escribir "Ingresa tu nombre:"\n  Leer nombre\n  Escribir "Ingresa tu edad:"\n  Leer edad\n  Escribir "Hola ", nombre, ", tienes ", edad, " años"\nFinAlgoritmo',
      descripcion: 'Detiene el programa y espera que el usuario ingrese un valor. En PSeInt se pueden leer varias variables en una sola línea separadas por comas.',
      detalle: 'Coloca siempre un Escribir descriptivo antes de cada Leer para indicar al usuario qué dato ingresar. PSeInt admite Leer a, b en una sola instrucción.',
      errores: 'Leer una variable no declarada, ingresar texto donde se espera un número, o no avisar al usuario qué ingresar.'
    },
    {
      nombre: 'Escribir / Escribir Sin Saltar',
      sintaxis: 'Escribir expresion\nEscribir expresion, expresion, ...\nEscribir Sin Saltar expresion',
      ejemplo: 'Algoritmo salida\n  Definir x Como Real\n  x <- 3.14\n  Escribir "El valor de pi es aproximadamente ", x\n  Escribir Sin Saltar "Ingresa un dato: "\n  Leer x\nFinAlgoritmo',
      descripcion: 'Escribe valores en la consola. Escribir agrega un salto de línea al final; Escribir Sin Saltar mantiene el cursor en la misma línea (útil antes de un Leer en la misma línea).',
      detalle: 'Separa texto fijo, variables y expresiones con comas. El texto literal va entre comillas dobles. Cada Escribir es una nueva línea salvo que uses la variante Sin Saltar.',
      errores: 'Olvidar comillas en el texto fijo, usar + para concatenar (usa comas), o imprimir una variable no inicializada.'
    },
    {
      nombre: 'Operadores aritméticos',
      sintaxis: 'a + b   // suma\na - b   // resta\na * b   // multiplicación\na / b   // división real\na MOD b // resto de la división\na ^ b   // potencia',
      ejemplo: 'Algoritmo aritmetica\n  Definir a, b Como Real\n  a <- 10\n  b <- 3\n  Escribir "Suma: ", a + b\n  Escribir "División: ", a / b\n  Escribir "Módulo: ", a MOD b\n  Escribir "Potencia: ", a ^ 2\nFinAlgoritmo',
      descripcion: 'Realizan los cálculos matemáticos básicos. La precedencia es: ^ → menos unario → * / MOD → + -. Usa paréntesis para forzar el orden de evaluación.',
      errores: 'Dividir por cero, usar variables no inicializadas en la expresión, o mezclar texto y número sin conversión explícita.'
    },
    {
      nombre: 'Operadores relacionales',
      sintaxis: 'a = b    // igual a (siempre comparador en PSeInt estricto)\na <> b   // distinto de\na < b    // menor que\na > b    // mayor que\na <= b   // menor o igual que\na >= b   // mayor o igual que',
      ejemplo: 'Algoritmo comparar\n  Definir nota Como Real\n  Leer nota\n  Si nota >= 4.0 Entonces\n    Escribir "Aprobado"\n  Sino\n    Escribir "Reprobado"\n  FinSi\nFinAlgoritmo',
      descripcion: 'Comparan dos valores y producen Verdadero o Falso. En PSeInt estricto el signo = siempre compara igualdad; nunca asigna.',
      errores: 'Confundir <- (asignación) con = (comparación), comparar cadena con número, o dejar la condición vacía.'
    },
    {
      nombre: 'Operadores lógicos',
      sintaxis: 'condicion1 Y condicion2  // ambas verdaderas\ncondicion1 O condicion2  // al menos una verdadera\nNo condicion             // invierte el resultado',
      ejemplo: 'Algoritmo logica\n  Definir edad Como Entero\n  Leer edad\n  Si edad >= 18 Y edad <= 65 Entonces\n    Escribir "En edad de trabajar"\n  FinSi\n  Si edad < 18 O edad > 65 Entonces\n    Escribir "Fuera del rango laboral"\n  FinSi\nFinAlgoritmo',
      descripcion: 'Conectan condiciones. Y requiere que ambas sean verdaderas; O requiere que al menos una lo sea; No invierte el resultado.',
      errores: 'Escribir && o || en lugar de Y y O (no son válidos en PSeInt), omitir los operandos de comparación en cada lado.'
    },
    {
      nombre: 'Si / Sino / FinSi',
      sintaxis: 'Si condicion Entonces\n  instrucciones\nFinSi\n\nSi condicion Entonces\n  instrucciones\nSino\n  instrucciones\nFinSi',
      ejemplo: 'Algoritmo decision\n  Definir nota Como Real\n  Leer nota\n  Si nota >= 4.0 Entonces\n    Escribir "Aprobado con ", nota\n  Sino\n    Si nota >= 3.0 Entonces\n      Escribir "En recuperación"\n    Sino\n      Escribir "Reprobado"\n    FinSi\n  FinSi\nFinAlgoritmo',
      descripcion: 'Estructura de decisión. Ejecuta el bloque Entonces si la condición es verdadera; de lo contrario ejecuta el bloque Sino (opcional). Los bloques Si pueden anidarse.',
      errores: 'Olvidar FinSi, mezclar el orden Entonces/Sino, o escribir la condición sin comparador.'
    },
    {
      nombre: 'Segun / FinSegun',
      sintaxis: 'Segun variable Hacer\n  valor1: instrucciones\n  valor2, valor3: instrucciones\n  De Otro Modo:\n    instrucciones\nFinSegun',
      ejemplo: 'Algoritmo menu\n  Definir opcion Como Entero\n  Leer opcion\n  Segun opcion Hacer\n    1: Escribir "Nuevo archivo"\n    2: Escribir "Abrir archivo"\n    3: Escribir "Guardar"\n    De Otro Modo:\n      Escribir "Opción no válida"\n  FinSegun\nFinAlgoritmo',
      descripcion: 'Compara una variable contra múltiples valores y ejecuta el bloque correspondiente. Equivalente a un switch; De Otro Modo actúa como el caso por defecto.',
      errores: 'Olvidar FinSegun, escribir rangos en lugar de valores exactos, o mezclar tipos de dato.'
    },
    {
      nombre: 'Mientras / FinMientras',
      sintaxis: 'Mientras condicion Hacer\n  instrucciones\nFinMientras',
      ejemplo: 'Algoritmo suma_positivos\n  Definir n, suma Como Entero\n  suma <- 0\n  Leer n\n  Mientras n > 0 Hacer\n    suma <- suma + n\n    Leer n\n  FinMientras\n  Escribir "Suma: ", suma\nFinAlgoritmo',
      descripcion: 'Repite el bloque mientras la condición sea verdadera. La condición se evalúa antes de cada iteración; si es falsa desde el principio, el cuerpo no se ejecuta.',
      errores: 'Olvidar FinMientras, no modificar la variable de control dentro del bucle (ciclo infinito), o condición que nunca se vuelve falsa.'
    },
    {
      nombre: 'Repetir / Hasta Que',
      sintaxis: 'Repetir\n  instrucciones\nHasta Que condicion',
      ejemplo: 'Algoritmo validar_entrada\n  Definir n Como Entero\n  Repetir\n    Escribir "Ingresa un número positivo:"\n    Leer n\n  Hasta Que n > 0\n  Escribir "Ingresaste: ", n\nFinAlgoritmo',
      descripcion: 'Repite el bloque hasta que la condición sea verdadera. Se evalúa al final: el cuerpo siempre se ejecuta al menos una vez. Útil para validar entradas.',
      errores: 'Olvidar Hasta Que, o escribir la condición de continuación en lugar de la de parada (el bucle para cuando la condición es verdadera, no falsa).'
    },
    {
      nombre: 'Para / FinPara',
      sintaxis: 'Para variable <- inicio Hasta fin Hacer\n  instrucciones\nFinPara\n\nPara variable <- inicio Hasta fin Con Paso incremento Hacer\n  instrucciones\nFinPara',
      ejemplo: 'Algoritmo tabla_multiplicar\n  Definir i, n Como Entero\n  Leer n\n  Para i <- 1 Hasta 10 Hacer\n    Escribir n, " x ", i, " = ", n * i\n  FinPara\nFinAlgoritmo',
      ejemplo2: 'Algoritmo cuenta_regresiva\n  Definir i Como Entero\n  Para i <- 10 Hasta 1 Con Paso -1 Hacer\n    Escribir i\n  FinPara\n  Escribir "¡Ya!"\nFinAlgoritmo',
      descripcion: 'Repite el bloque con la variable tomando valores desde inicio hasta fin, incrementando en 1 por defecto o en el valor Con Paso especificado.',
      errores: 'Olvidar FinPara, modificar la variable de control dentro del bucle, o usar paso 0 (ciclo infinito).'
    },
    {
      nombre: 'Dimension (arreglos)',
      sintaxis: 'Dimension arreglo[tamaño]\nDimension matriz[filas, columnas]',
      ejemplo: 'Algoritmo arreglo\n  Definir notas Como Real\n  Definir i Como Entero\n  Dimension notas[5]\n  Para i <- 1 Hasta 5 Hacer\n    Leer notas[i]\n  FinPara\n  Definir suma Como Real\n  suma <- 0\n  Para i <- 1 Hasta 5 Hacer\n    suma <- suma + notas[i]\n  FinPara\n  Escribir "Promedio: ", suma / 5\nFinAlgoritmo',
      descripcion: 'Declara un arreglo (vector) o matriz. En PSeInt los índices comienzan en 1. Primero declara la variable con Definir y luego dimensiónala con Dimension.',
      errores: 'Acceder a un índice fuera del rango dimensionado, olvidar Dimension antes de usar el arreglo, o invertir filas y columnas en una matriz.'
    },
    {
      nombre: 'SubProceso / FinSubProceso',
      sintaxis: 'SubProceso nombre(param1, param2)\n  instrucciones\nFinSubProceso\n\n// Con parámetro por referencia:\nSubProceso nombre(Por Referencia param)\n  instrucciones\nFinSubProceso',
      ejemplo: 'Algoritmo uso_subproceso\n  Llamar saludar("Ana")\nFinAlgoritmo\n\nSubProceso saludar(nombre)\n  Escribir "Hola, ", nombre\nFinSubProceso',
      descripcion: 'Define un subproceso (procedimiento) que puede recibir parámetros pero no retorna valor. Se invoca con Llamar. Por defecto los parámetros se pasan por valor; con Por Referencia se pasan por referencia.',
      errores: 'Llamar a un SubProceso sin haberlo definido, no usar Llamar al invocarlo, o confundir parámetros por valor y por referencia.'
    },
    {
      nombre: 'Funcion / FinFuncion',
      sintaxis: 'Funcion resultado <- nombre(param1, param2)\n  instrucciones\n  resultado <- valor_de_retorno\nFinFuncion',
      ejemplo: 'Algoritmo uso_funcion\n  Definir resultado Como Real\n  resultado <- cuadrado(5)\n  Escribir "5^2 = ", resultado\nFinAlgoritmo\n\nFuncion r <- cuadrado(n)\n  r <- n * n\nFinFuncion',
      descripcion: 'Define una función que retorna un valor. La variable de retorno (antes de <-) recibe el resultado que se devuelve al llamador.',
      errores: 'Olvidar asignar la variable de retorno, usar Llamar para funciones (reservado para SubProceso), o no declarar las variables internas con Definir.'
    },
    {
      nombre: 'Funciones matemáticas',
      sintaxis: 'RC(x)         // raíz cuadrada (también RAIZ)\nABS(x)        // valor absoluto\nTRUNC(x)      // parte entera\nREDON(x)      // redondeo al entero más cercano\nLN(x)         // logaritmo natural\nEXP(x)        // e elevado a x\nSEN(x)        // seno (radianes)\nCOS(x)        // coseno (radianes)\nATAN(x)       // arcotangente\nAZAR(n)       // entero aleatorio entre 0 y n-1\nALEATORIO(a,b)// entero aleatorio entre a y b',
      ejemplo: 'Algoritmo matematica\n  Definir x Como Real\n  x <- 16\n  Escribir "Raíz de ", x, ": ", RC(x)\n  Escribir "ABS(-7): ", ABS(-7)\n  Escribir "TRUNC(3.9): ", TRUNC(3.9)\n  Escribir "REDON(3.5): ", REDON(3.5)\n  Escribir "Aleatorio 1-6: ", ALEATORIO(1, 6)\nFinAlgoritmo',
      descripcion: 'Funciones matemáticas incorporadas de PSeInt. Los nombres son insensibles a mayúsculas (rc = RC = Rc), pero por convención se escriben en mayúsculas.',
      errores: 'RC de un número negativo, LN de cero o negativo, AZAR con argumento menor o igual a cero, o ALEATORIO con límite inferior mayor al superior.'
    },
    {
      nombre: 'Funciones de cadena',
      sintaxis: 'LONGITUD(cadena)               // largo del texto\nSUBCADENA(cadena, inicio, fin) // subcadena [inicio..fin]\nCONCATENAR(c1, c2, ...)        // une cadenas\nMAYUSCULAS(cadena)             // convierte a mayúsculas\nMINUSCULAS(cadena)             // convierte a minúsculas\nCONVERTIRANUMERO(cadena)       // texto → número\nCONVERTIRATEXTO(numero)        // número → texto',
      ejemplo: 'Algoritmo cadenas\n  Definir nombre Como Cadena\n  nombre <- "Mundo"\n  Escribir "Largo: ", LONGITUD(nombre)\n  Escribir "Mayúsculas: ", MAYUSCULAS(nombre)\n  Escribir "Sub [2,4]: ", SUBCADENA(nombre, 2, 4)\n  Escribir CONCATENAR("Hola, ", nombre, "!")\nFinAlgoritmo',
      descripcion: 'Funciones para manipular cadenas de texto. Los índices de SUBCADENA comienzan en 1 (igual que los arreglos).',
      errores: 'SUBCADENA con índices fuera de rango (devuelve cadena vacía), CONVERTIRANUMERO con texto no numérico (lanza error en tiempo de ejecución).'
    },
    {
      nombre: 'Perfil: Estricto vs Flexible',
      sintaxis: '// Selector de perfil visible solo en modo PSeInt\n// (esquina superior del editor)\n\n─── Perfil ESTRICTO (por defecto) ────────\nAsignación:      solo <- (= siempre compara)\nDeclaración:     Definir obligatorio antes de usar\nÍndices:         arreglos desde 1\n\n─── Perfil FLEXIBLE ──────────────────────\nAsignación:      = también asigna (y <- también)\nDeclaración:     Definir opcional; la variable se\n                 crea en el primer uso con el tipo\n                 del valor asignado\nÍndices:         arreglos desde 0',
      ejemplo: '// Estricto\nAlgoritmo estricto\n  Definir x Como Entero\n  x <- 5\n  Escribir x\nFinAlgoritmo\n\n// Flexible (mismo resultado)\nAlgoritmo flexible\n  x = 5\n  Escribir x\nFinAlgoritmo',
      descripcion: 'Code4Code ofrece dos perfiles compatibles con PSeInt de escritorio. Estricto es el más usado en docencia: exige Definir y usa <- para asignar. Flexible relaja ambas restricciones para usuarios que vienen de otros lenguajes.',
      detalle: 'En el perfil estricto, escribir `x = 5` es un error (= solo compara). En el flexible, `x = 5` asigna el valor 5 y crea la variable automáticamente como Entero. Los arreglos en perfil estricto usan índices desde 1; en flexible desde 0. El perfil que eliges se guarda automáticamente y viaja en el archivo .psc descargado.',
      errores: 'Mezclar estilos en un mismo algoritmo (intentar usar <- en modo flexible donde ya usaste =, o escribir = en modo estricto). Pasar un archivo .psc de perfil estricto al flexible puede cambiar el comportamiento de los índices de arreglo.'
    }
  ];

  try {
    var provider = Code4Code.registro.registrar(definicion());
    if (g.console && g.console.debug) {
      g.console.debug('[Code4Code] Lenguaje registrado:', provider.nombre);
    }
  } catch (e) {
    if (g.console) g.console.error('[Code4Code] No se pudo registrar PSeInt:', e);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { definicion: definicion };
  }
})(typeof window !== 'undefined' ? window : globalThis);
