/**
 * Code4Code — core/python/ayudas-data.js
 * ======================================
 * Catálogo de símbolos de Python para las "ayudas de código" del editor
 * (autocompletado enriquecido, hover y ayuda de firma). Lo consume el
 * módulo js/editor/ayudas.js a través de provider.catalogoAyudas().
 *
 * Contenido curado para el nivel educativo (builtins y funciones más usadas
 * en los bancos N1–N7), con firmas y descripciones en español inspiradas en
 * la documentación que muestra Pylance/VSCode.
 *
 * Cada símbolo: { nombre, tipo, firma, descripcion, params, retorno, ejemplo }.
 *
 * Patrón reutilizable: LiteSeInt y PSeInt tendrán su propio archivo
 * `ayudas-data.js` con la misma forma (ver ROADMAP — ayudas multilenguaje).
 */
(function (raiz) {
  'use strict';

  var SIMBOLOS_PYTHON = [
    {
      nombre: 'print', tipo: 'función',
      firma: 'print(*valores, sep=" ", end="\\n")',
      descripcion: 'Muestra uno o más valores en la consola.',
      params: [
        { nombre: 'valores', descripcion: 'Uno o más valores a mostrar, separados por comas.' },
        { nombre: 'sep', descripcion: 'Texto entre valores (por defecto un espacio).' },
        { nombre: 'end', descripcion: 'Texto al final (por defecto un salto de línea).' }
      ],
      retorno: 'None',
      ejemplo: 'print("Resultado:", 3 + 4)'
    },
    {
      nombre: 'input', tipo: 'función',
      firma: 'input(prompt="") -> str',
      descripcion: 'Lee una línea escrita por el usuario. Siempre devuelve texto (str).',
      params: [{ nombre: 'prompt', descripcion: 'Mensaje que se muestra antes de leer.' }],
      retorno: 'str',
      ejemplo: 'nombre = input("Tu nombre: ")'
    },
    {
      nombre: 'len', tipo: 'función',
      firma: 'len(coleccion) -> int',
      descripcion: 'Devuelve la cantidad de elementos de una colección o la longitud de una cadena.',
      params: [{ nombre: 'coleccion', descripcion: 'Cadena, lista, tupla, diccionario, etc.' }],
      retorno: 'int',
      ejemplo: 'len("hola")  # 4'
    },
    {
      nombre: 'range', tipo: 'función',
      firma: 'range(inicio, fin, paso)',
      descripcion: 'Genera una secuencia de enteros. Con un solo argumento va de 0 a fin-1.',
      params: [
        { nombre: 'inicio', descripcion: 'Primer valor (por defecto 0).' },
        { nombre: 'fin', descripcion: 'Límite superior, no incluido.' },
        { nombre: 'paso', descripcion: 'Incremento entre valores (por defecto 1).' }
      ],
      retorno: 'range',
      ejemplo: 'for i in range(1, 6):  # 1,2,3,4,5'
    },
    {
      nombre: 'int', tipo: 'tipo',
      firma: 'int(valor) -> int',
      descripcion: 'Convierte un valor a número entero. Útil para convertir lo leído con input().',
      params: [{ nombre: 'valor', descripcion: 'Texto o número a convertir.' }],
      retorno: 'int',
      ejemplo: 'edad = int(input("Edad: "))'
    },
    {
      nombre: 'float', tipo: 'tipo',
      firma: 'float(valor) -> float',
      descripcion: 'Convierte un valor a número decimal (coma flotante).',
      params: [{ nombre: 'valor', descripcion: 'Texto o número a convertir.' }],
      retorno: 'float',
      ejemplo: 'precio = float("19.99")'
    },
    {
      nombre: 'str', tipo: 'tipo',
      firma: 'str(valor) -> str',
      descripcion: 'Convierte un valor a texto (cadena).',
      params: [{ nombre: 'valor', descripcion: 'Valor a convertir en texto.' }],
      retorno: 'str',
      ejemplo: 'str(42)  # "42"'
    },
    {
      nombre: 'bool', tipo: 'tipo',
      firma: 'bool(valor) -> bool',
      descripcion: 'Convierte un valor a booleano (True/False).',
      params: [{ nombre: 'valor', descripcion: 'Valor a evaluar como verdadero/falso.' }],
      retorno: 'bool',
      ejemplo: 'bool(0)  # False'
    },
    {
      nombre: 'list', tipo: 'tipo',
      firma: 'list(iterable) -> list',
      descripcion: 'Crea una lista (colección ordenada y mutable) a partir de un iterable.',
      params: [{ nombre: 'iterable', descripcion: 'Secuencia opcional para inicializar la lista.' }],
      retorno: 'list',
      ejemplo: 'list(range(3))  # [0, 1, 2]'
    },
    {
      nombre: 'dict', tipo: 'tipo',
      firma: 'dict(**pares) -> dict',
      descripcion: 'Crea un diccionario de pares clave-valor.',
      params: [],
      retorno: 'dict',
      ejemplo: 'persona = dict(nombre="Ana", edad=20)'
    },
    {
      nombre: 'tuple', tipo: 'tipo',
      firma: 'tuple(iterable) -> tuple',
      descripcion: 'Crea una tupla (colección ordenada e inmutable).',
      params: [{ nombre: 'iterable', descripcion: 'Secuencia para inicializar la tupla.' }],
      retorno: 'tuple',
      ejemplo: 'tuple([1, 2, 3])  # (1, 2, 3)'
    },
    {
      nombre: 'set', tipo: 'tipo',
      firma: 'set(iterable) -> set',
      descripcion: 'Crea un conjunto (sin elementos repetidos y sin orden).',
      params: [{ nombre: 'iterable', descripcion: 'Secuencia para inicializar el conjunto.' }],
      retorno: 'set',
      ejemplo: 'set([1, 1, 2])  # {1, 2}'
    },
    {
      nombre: 'abs', tipo: 'función',
      firma: 'abs(numero)',
      descripcion: 'Devuelve el valor absoluto de un número.',
      params: [{ nombre: 'numero', descripcion: 'Número entero o decimal.' }],
      retorno: 'int | float',
      ejemplo: 'abs(-5)  # 5'
    },
    {
      nombre: 'round', tipo: 'función',
      firma: 'round(numero, decimales=0)',
      descripcion: 'Redondea un número al número de decimales indicado.',
      params: [
        { nombre: 'numero', descripcion: 'Número a redondear.' },
        { nombre: 'decimales', descripcion: 'Cantidad de decimales (por defecto 0).' }
      ],
      retorno: 'int | float',
      ejemplo: 'round(3.14159, 2)  # 3.14'
    },
    {
      nombre: 'sum', tipo: 'función',
      firma: 'sum(iterable, inicio=0)',
      descripcion: 'Suma los elementos de un iterable de números.',
      params: [
        { nombre: 'iterable', descripcion: 'Secuencia de números.' },
        { nombre: 'inicio', descripcion: 'Valor inicial de la suma (por defecto 0).' }
      ],
      retorno: 'int | float',
      ejemplo: 'sum([1, 2, 3])  # 6'
    },
    {
      nombre: 'max', tipo: 'función',
      firma: 'max(iterable) | max(a, b, ...)',
      descripcion: 'Devuelve el mayor de los valores.',
      params: [{ nombre: 'valores', descripcion: 'Un iterable o varios valores sueltos.' }],
      retorno: 'valor',
      ejemplo: 'max(3, 9, 2)  # 9'
    },
    {
      nombre: 'min', tipo: 'función',
      firma: 'min(iterable) | min(a, b, ...)',
      descripcion: 'Devuelve el menor de los valores.',
      params: [{ nombre: 'valores', descripcion: 'Un iterable o varios valores sueltos.' }],
      retorno: 'valor',
      ejemplo: 'min([4, 1, 7])  # 1'
    },
    {
      nombre: 'sorted', tipo: 'función',
      firma: 'sorted(iterable, key=None, reverse=False)',
      descripcion: 'Devuelve una lista nueva con los elementos ordenados.',
      params: [
        { nombre: 'iterable', descripcion: 'Secuencia a ordenar.' },
        { nombre: 'key', descripcion: 'Función que define el criterio de orden.' },
        { nombre: 'reverse', descripcion: 'True para orden descendente.' }
      ],
      retorno: 'list',
      ejemplo: 'sorted([3, 1, 2])  # [1, 2, 3]'
    },
    {
      nombre: 'enumerate', tipo: 'función',
      firma: 'enumerate(iterable, start=0)',
      descripcion: 'Recorre un iterable dando índice y valor a la vez.',
      params: [
        { nombre: 'iterable', descripcion: 'Secuencia a recorrer.' },
        { nombre: 'start', descripcion: 'Índice inicial (por defecto 0).' }
      ],
      retorno: 'enumerate',
      ejemplo: 'for i, v in enumerate(lista):'
    },
    {
      nombre: 'zip', tipo: 'función',
      firma: 'zip(a, b, ...)',
      descripcion: 'Empareja elemento a elemento varias secuencias.',
      params: [{ nombre: 'secuencias', descripcion: 'Dos o más iterables.' }],
      retorno: 'zip',
      ejemplo: 'for x, y in zip(nombres, notas):'
    },
    {
      nombre: 'type', tipo: 'función',
      firma: 'type(objeto)',
      descripcion: 'Devuelve el tipo de un objeto.',
      params: [{ nombre: 'objeto', descripcion: 'Valor del que se quiere el tipo.' }],
      retorno: 'type',
      ejemplo: 'type(42)  # <class \'int\'>'
    },
    {
      nombre: 'def', tipo: 'keyword',
      firma: 'def nombre(parametros):',
      descripcion: 'Define una función reutilizable. Usa return para devolver un valor.',
      ejemplo: 'def saludar(nombre):\n    return "Hola, " + nombre'
    },
    {
      nombre: 'return', tipo: 'keyword',
      firma: 'return valor',
      descripcion: 'Devuelve un valor desde una función y termina su ejecución.',
      ejemplo: 'return a + b'
    },
    {
      nombre: 'if', tipo: 'keyword',
      firma: 'if condicion:',
      descripcion: 'Ejecuta un bloque solo si la condición es verdadera.',
      ejemplo: 'if edad >= 18:\n    print("Mayor")'
    },
    {
      nombre: 'elif', tipo: 'keyword',
      firma: 'elif condicion:',
      descripcion: 'Condición alternativa cuando la anterior fue falsa.',
      ejemplo: 'elif nota >= 4:\n    print("Recuperación")'
    },
    {
      nombre: 'else', tipo: 'keyword',
      firma: 'else:',
      descripcion: 'Bloque que se ejecuta cuando ninguna condición previa se cumplió.',
      ejemplo: 'else:\n    print("Reprobado")'
    },
    {
      nombre: 'for', tipo: 'keyword',
      firma: 'for variable in iterable:',
      descripcion: 'Repite un bloque para cada elemento de un iterable.',
      ejemplo: 'for i in range(5):\n    print(i)'
    },
    {
      nombre: 'while', tipo: 'keyword',
      firma: 'while condicion:',
      descripcion: 'Repite un bloque mientras la condición sea verdadera.',
      ejemplo: 'while x > 0:\n    x -= 1'
    },
    {
      nombre: 'import', tipo: 'keyword',
      firma: 'import modulo',
      descripcion: 'Carga un módulo de la biblioteca estándar (p. ej. math, random).',
      ejemplo: 'import math\nprint(math.sqrt(16))'
    },
    {
      nombre: 'True', tipo: 'constante',
      firma: 'True',
      descripcion: 'Valor booleano verdadero.',
      ejemplo: 'aprobado = True'
    },
    {
      nombre: 'False', tipo: 'constante',
      firma: 'False',
      descripcion: 'Valor booleano falso.',
      ejemplo: 'terminado = False'
    },
    {
      nombre: 'None', tipo: 'constante',
      firma: 'None',
      descripcion: 'Ausencia de valor. Lo devuelven las funciones que no retornan nada.',
      ejemplo: 'resultado = None'
    }
  ];

  raiz.AyudasPython = { SIMBOLOS_PYTHON: SIMBOLOS_PYTHON };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SIMBOLOS_PYTHON: SIMBOLOS_PYTHON };
  }
})(typeof window !== 'undefined' ? window : globalThis);
