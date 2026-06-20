/**
 * Code4Code — core/python/provider.js
 * =====================================
 * Provider del lenguaje Python: adapta el tokenizador y el bridge Pyodide
 * al contrato Code4Code (core/language-provider.js) y lo registra en
 * Code4Code.registro.
 *
 * Depende de:
 *   DocErroresPython   (core/python/tokenizer.js)
 *   PythonWorkerBridge (core/python/bridge.js)  — solo en el navegador
 *
 * Ver ROADMAP.md — Fase 4.
 */
(function (raiz) {
  'use strict';

  var Code4Code = raiz.Code4Code;
  if (!Code4Code || typeof Code4Code.crearProvider !== 'function') {
    if (raiz.console) raiz.console.warn(
      'python/provider.js: falta language-provider.js; provider no registrado.');
    return;
  }

  var ID = 'python';
  var PLANTILLA = '# Escribe tu programa Python aquí\n\nprint("Hola, mundo")\n';

  /** Reglas de indentación Python (los bloques se abren con `:` al final). */
  var REGLAS_INDENTACION = Object.freeze({
    aperturas: [
      'def ', 'class ', 'if ', 'elif ', 'else:', 'else :', 'for ', 'while ',
      'with ', 'try:', 'try :', 'except', 'finally:', 'finally :'
    ],
    cierres: []   // Python usa indentación, no palabras clave de cierre
  });

  /**
   * Mapa de tipos del tokenizador → tipos genéricos del contrato del provider.
   * Los tipos genéricos son los que consume js/editor/highlight.js
   * (CLASE_POR_TIPO). DEBEN coincidir con el vocabulario en español del
   * contrato — igual que los providers LiteSeInt y PSeInt — o el resaltado
   * cae a 'sh-plain' (sin color).
   */
  var MAPA_TOKENS = {
    KEYWORD:         'palabra-clave',
    STRING:          'cadena',
    STRING_UNCLOSED: 'cadena',
    NUMBER:          'numero',
    COMMENT:         'comentario',
    IDENTIFIER:      'identificador',
    OPERATOR:        'operador',
    LPAREN:          'parentesis-abre',
    RPAREN:          'parentesis-cierra',
    LBRACKET:        'plano',
    RBRACKET:        'plano',
    LBRACE:          'plano',
    RBRACE:          'plano',
    COLON:           'plano',
    COMMA:           'plano',
    UNKNOWN:         'plano',
  };

  /**
   * Lista de keywords para el autocompletado, en el orden en que deben
   * aparecer (los más frecuentes primero).
   */
  var KEYWORDS_AUTOCOMPLETAR = [
    'def', 'class', 'if', 'elif', 'else', 'for', 'while',
    'return', 'import', 'from', 'in', 'and', 'or', 'not',
    'True', 'False', 'None',
    'print', 'input', 'range', 'len',
    'int', 'float', 'str', 'bool',
    'list', 'dict', 'tuple', 'set',
    'try', 'except', 'finally', 'raise',
    'with', 'as', 'pass', 'break', 'continue', 'yield',
    'lambda', 'is',
    'abs', 'sum', 'max', 'min', 'sorted', 'enumerate', 'zip', 'map',
    'filter', 'any', 'all', 'type', 'isinstance', 'hasattr', 'getattr',
    'open', 'round', 'pow', 'divmod', 'reversed',
    'append', 'extend', 'insert', 'remove', 'pop', 'sort',
  ];

  /**
   * Acceso defensivo al tokenizador Python.
   * En Node (tests) se requiere explícitamente desde el test.
   * En el navegador es una const léxica del scope de tokenizer.js.
   */
  function nucleoTokenizer() {
    return typeof DocErroresPython !== 'undefined' ? DocErroresPython : null;
  }

  var definicion = {
    id: ID,
    nombre: 'Python',
    extension: '.py',
    capacidades: [Code4Code.CAPACIDADES.DOCUMENTACION],

    plantillaInicial: function () {
      return PLANTILLA;
    },

    reglasIndentacion: function () {
      return REGLAS_INDENTACION;
    },

    /**
     * Tokens para el resaltado, usando el tokenizador real de Python.
     */
    tokenizarLinea: function (linea) {
      var nucleo = nucleoTokenizer();
      if (!nucleo || typeof nucleo.tokenizarLinea !== 'function') {
        return { tokens: [{ tipo: 'plano', texto: String(linea) }] };
      }
      var tokens = nucleo.tokenizarLinea(String(linea)).map(function (tk) {
        return { tipo: MAPA_TOKENS[tk.tipo] || 'plano', texto: tk.valor };
      });
      return { tokens: tokens };
    },

    /**
     * Candidatos de autocompletado: keywords Python filtrados por prefijo.
     *
     * @param {object} ctx - { prefijo, linea, columna, codigo }
     * @returns {Array<{texto: string, tipo: string}>}
     */
    autocompletar: function (ctx) {
      var prefijo = (ctx && ctx.prefijo || '').toLowerCase();
      if (prefijo.length < 2) return [];
      return KEYWORDS_AUTOCOMPLETAR.filter(function (k) {
        return k.toLowerCase().startsWith(prefijo) && k.toLowerCase() !== prefijo;
      }).map(function (k) {
        return { texto: k, tipo: 'keyword' };
      });
    },

    /**
     * Validación estática básica de Python.
     * Detecta strings sin cerrar línea a línea.
     * La validación completa la hace Pyodide al ejecutar.
     *
     * @param {string} codigo
     * @returns {Array<{linea: number, mensaje: string, tipo: string}>}
     */
    validar: function (codigo) {
      var errores = [];
      var nucleo = nucleoTokenizer();
      if (!nucleo) return errores;

      var lineas = String(codigo || '').split('\n');
      lineas.forEach(function (linea, idx) {
        var tokens = nucleo.tokenizarLinea(linea);
        var tieneStringUnclosed = tokens.some(function (t) {
          return t.tipo === nucleo.TK.STRING_UNCLOSED;
        });
        if (tieneStringUnclosed) {
          errores.push({
            linea: idx + 1,
            mensaje: 'Cadena de texto sin cerrar.',
            tipo: 'error'
          });
        }
      });
      return errores;
    },

    /**
     * Ejecución de Python vía Pyodide en un Web Worker (bridge.js).
     * En entornos sin Worker/Pyodide (Node/tests) notifica el error y
     * devuelve el objeto de control requerido por el contrato.
     *
     * Mejora 3: si el worker ya tiene Pyodide cargado ('idle'), no se
     * muestra el indicador de carga, ya que la ejecución comienza de inmediato.
     *
     * @param {string} codigo
     * @param {object} host  - RuntimeHost de Code4Code
     * @returns {{ detener: function }}
     */
    ejecutar: function (codigo, host) {
      if (typeof PythonWorkerBridge === 'undefined') {
        host.iniciar();
        host.escribir('Error: el entorno de ejecución Python no está disponible.', { tipo: 'error' });
        host.reportarError({ message: 'Pyodide no cargado', linea: null });
        return { detener: function () {} };
      }

      host.iniciar();

      // Informar al usuario solo si Pyodide aún no está listo.
      // El worker enviará { tipo: 'cargando' } + { tipo: 'listo' } si es la primera vez.
      // Si el worker ya está en 'idle', no habrá mensaje de carga.
      var estadoActual = typeof PythonWorkerBridge.estadoWorker === 'function'
        ? PythonWorkerBridge.estadoWorker()
        : 'sin-crear';
      if (estadoActual !== 'idle') {
        // Se mostrará el aviso real cuando el worker envíe { tipo: 'cargando' }
        // (ver bridge.js). No duplicamos el mensaje aquí.
      }

      var bridge = PythonWorkerBridge.crear(host);
      bridge.ejecutar(codigo);
      return {
        detener: function (motivo) {
          bridge.detener();
          host.detener(motivo);
        }
      };
    },

    /**
     * Documentación pedagógica de los comandos Python para el panel de
     * aprendizaje. Cada entrada sigue el esquema { nombre, sintaxis,
     * ejemplo, descripcion }.
     */
    documentacion: function () {
      return { comandos: DOC_COMANDOS_PYTHON };
    },
  };

  // ---------------------------------------------------------------------------
  // Documentación de comandos — fuera de definicion() para no reconstruirla
  // en cada llamada, pero dentro del IIFE para no contaminar el scope global.
  // ---------------------------------------------------------------------------

  var DOC_COMANDOS_PYTHON = [
    {
      nombre: 'print()',
      sintaxis: 'print(valor)\nprint(val1, val2, sep=" ", end="\\n")',
      ejemplo: 'print("Hola, mundo")\nprint("Resultado:", 3 + 4)',
      descripcion: 'Muestra texto o valores en la consola. Agrega un salto de línea al final por defecto.'
    },
    {
      nombre: 'input()',
      sintaxis: 'variable = input(prompt)',
      ejemplo: 'nombre = input("Tu nombre: ")\nprint("Hola,", nombre)',
      descripcion: 'Lee una línea de texto ingresada por el usuario. Siempre devuelve una cadena; usa int() o float() para convertir.'
    },
    {
      nombre: 'if / elif / else',
      sintaxis: 'if condicion:\n    ...\nelif condicion2:\n    ...\nelse:\n    ...',
      ejemplo: 'nota = 6\nif nota >= 7:\n    print("Aprobado")\nelif nota >= 4:\n    print("Recuperación")\nelse:\n    print("Reprobado")',
      descripcion: 'Estructura condicional. Los bloques se definen por indentación (4 espacios).'
    },
    {
      nombre: 'for',
      sintaxis: 'for variable in iterable:\n    ...',
      ejemplo: 'for i in range(5):\n    print(i)',
      descripcion: 'Itera sobre los elementos de un iterable (lista, range, cadena, etc.).'
    },
    {
      nombre: 'while',
      sintaxis: 'while condicion:\n    ...',
      ejemplo: 'x = 10\nwhile x > 0:\n    print(x)\n    x -= 1',
      descripcion: 'Repite el bloque mientras la condición sea verdadera.'
    },
    {
      nombre: 'def',
      sintaxis: 'def nombre(params):\n    ...\n    return valor',
      ejemplo: 'def saludar(nombre):\n    return "Hola, " + nombre\n\nprint(saludar("Ana"))',
      descripcion: 'Define una función reutilizable. Usa return para devolver un valor.'
    },
    {
      nombre: 'range()',
      sintaxis: 'range(fin)\nrange(inicio, fin)\nrange(inicio, fin, paso)',
      ejemplo: 'for i in range(1, 11):\n    print(i)\n\nfor i in range(10, 0, -1):\n    print(i)',
      descripcion: 'Genera una secuencia de números enteros. Muy usado con for.'
    },
    {
      nombre: 'int() / float() / str()',
      sintaxis: 'int(valor)\nfloat(valor)\nstr(valor)',
      ejemplo: 'n = int(input("Número: "))\nresultado = float(n) / 2\nprint("Resultado:", str(resultado))',
      descripcion: 'Convierte entre tipos de dato: int (entero), float (decimal), str (cadena).'
    },
    {
      nombre: 'len()',
      sintaxis: 'len(coleccion)',
      ejemplo: 'texto = "hola"\nprint(len(texto))   # 4\nlista = [1, 2, 3]\nprint(len(lista))   # 3',
      descripcion: 'Devuelve la cantidad de elementos de una colección o la longitud de una cadena.'
    },
    {
      nombre: 'list (listas)',
      sintaxis: 'lista = [v1, v2, ...]\nlista.append(v)\nlista[i]',
      ejemplo: 'nums = [1, 2, 3]\nnums.append(4)\nprint(nums[0])   # 1\nprint(len(nums)) # 4',
      descripcion: 'Colección ordenada y mutable. Los índices empiezan en 0. Usa append() para agregar.'
    },
    {
      nombre: 'Métodos de cadena',
      sintaxis: 'cadena.upper()\ncadena.lower()\ncadena.strip()\ncadena.split(sep)\ncadena.replace(old, new)\nnew_sep.join(lista)',
      ejemplo: 'txt = "  Hola Mundo  "\nprint(txt.strip())      # "Hola Mundo"\nprint(txt.lower())      # "  hola mundo  "\nprint("a,b,c".split(",")) # ["a","b","c"]\nprint("-".join(["a","b"])) # "a-b"',
      descripcion: 'Operaciones comunes sobre cadenas. Las cadenas son inmutables: estos métodos devuelven una cadena nueva sin modificar la original.'
    },
    {
      nombre: 'Métodos de lista',
      sintaxis: 'lista.append(x)\nlista.insert(i, x)\nlista.remove(x)\nlista.pop(i)\nlista.sort()\nlista.reverse()',
      ejemplo: 'nums = [3, 1, 4, 1, 5]\nnums.sort()\nprint(nums)           # [1, 1, 3, 4, 5]\nnums.append(9)\nprint(nums.pop())     # 9\nnums.remove(1)\nprint(nums)           # [1, 3, 4, 5]',
      descripcion: 'Modifica la lista en su lugar. sort() y reverse() no devuelven nada (None). Para obtener una copia ordenada usa sorted(lista).'
    },
    {
      nombre: 'Comprensión de listas',
      sintaxis: '[expresion for var in iterable]\n[expresion for var in iterable if condicion]',
      ejemplo: 'cuadrados = [x**2 for x in range(1, 6)]\nprint(cuadrados)   # [1, 4, 9, 16, 25]\npares = [x for x in range(10) if x % 2 == 0]\nprint(pares)       # [0, 2, 4, 6, 8]',
      descripcion: 'Forma compacta de construir una lista aplicando una expresión a cada elemento de un iterable, con filtrado opcional.'
    },
    {
      nombre: 'Diccionarios (dict)',
      sintaxis: 'd = {clave: valor}\nd[clave] = valor\nd.get(clave, default)\nd.keys()  d.values()  d.items()',
      ejemplo: 'persona = {"nombre": "Ana", "edad": 20}\npersona["ciudad"] = "Lima"\nprint(persona.get("edad"))     # 20\nprint(persona.get("país", "?")) # ?\nfor k, v in persona.items():\n    print(k, "->", v)',
      descripcion: 'Colección de pares clave-valor. Las claves deben ser únicas e inmutables (cadenas o números). d.get(k, default) evita KeyError cuando la clave no existe.'
    },
    {
      nombre: 'try / except',
      sintaxis: 'try:\n    ...\nexcept TipoError as e:\n    ...\nfinally:\n    ...',
      ejemplo: 'try:\n    n = int(input("Número: "))\n    print(10 / n)\nexcept ValueError:\n    print("Debes ingresar un número entero.")\nexcept ZeroDivisionError:\n    print("No se puede dividir por cero.")',
      descripcion: 'Captura y maneja errores en tiempo de ejecución. finally (opcional) se ejecuta siempre, independientemente de si hubo error o no.'
    },
    {
      nombre: 'import math',
      sintaxis: 'import math\nmath.sqrt(x)\nmath.floor(x)  math.ceil(x)\nmath.pi  math.e\nmath.pow(x, y)  math.log(x)',
      ejemplo: 'import math\nprint(math.sqrt(16))   # 4.0\nprint(math.floor(3.7)) # 3\nprint(math.ceil(3.2))  # 4\nprint(round(math.pi, 4)) # 3.1416',
      descripcion: 'Biblioteca estándar de funciones matemáticas. math.sqrt devuelve float; usa int() si necesitas entero. Disponible sin instalación adicional.'
    },
    {
      nombre: 'f-strings (formateo)',
      sintaxis: 'f"texto {variable}"\nf"{valor:.2f}"   # 2 decimales\nf"{valor:>10}"  # alineado',
      ejemplo: 'nombre = "Ana"\nedad = 20\nprint(f"Hola, {nombre}!")\nprint(f"Edad: {edad}")\npi = 3.14159\nprint(f"Pi ≈ {pi:.3f}")  # Pi ≈ 3.142\nnota = 8.5\nprint(f"Promedio: {nota:.1f}")',
      descripcion: 'Forma moderna de insertar variables en cadenas. Más legible que str() + "+" y permite controlar el formato (decimales, ancho, etc.).'
    },
    {
      nombre: 'enumerate / zip',
      sintaxis: 'for i, v in enumerate(lista):\nfor a, b in zip(lista1, lista2):',
      ejemplo: 'frutas = ["manzana", "pera", "uva"]\nfor i, f in enumerate(frutas, 1):\n    print(f"{i}. {f}")\n\nnotas = [8, 7, 9]\nfor fruta, nota in zip(frutas, notas):\n    print(fruta, nota)',
      descripcion: 'enumerate(lista, start=1) da índice y valor a la vez. zip(a, b) empareja dos listas elemento a elemento, útil para recorrerlas en paralelo.'
    },
  ];

  // ---------------------------------------------------------------------------
  // Registro en Code4Code
  // ---------------------------------------------------------------------------

  try {
    var provider = Code4Code.registro.registrar(definicion);
    if (raiz.console && raiz.console.debug) {
      raiz.console.debug('[Code4Code] Lenguaje registrado:', provider.nombre);
    }
  } catch (e) {
    if (raiz.console) raiz.console.error('[Code4Code] No se pudo registrar Python:', e);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { definicion: definicion };
  }
})(typeof window !== 'undefined' ? window : globalThis);
