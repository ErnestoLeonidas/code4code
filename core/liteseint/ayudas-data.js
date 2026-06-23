/**
 * Code4Code — core/liteseint/ayudas-data.js
 * =========================================
 * Catálogo de símbolos de LiteSeInt para las "ayudas de código" del editor
 * (hover de documentación, ayuda de firma y autocompletado enriquecido).
 * Lo consume el módulo js/editor/ayudas.js a través de
 * provider.catalogoAyudas().
 *
 * Misma forma de dato que core/python/ayudas-data.js y core/pseint/ayudas-data.js:
 *   { nombre, tipo, firma, descripcion, params, retorno, ejemplo }.
 * Solo `nombre` es obligatorio. `nombre` debe ser una sola palabra para que el
 * hover (palabraEn) lo encuentre bajo el cursor.
 *
 * Recordatorio del dialecto LiteSeInt (congelado en 1.0): asignación con `=`,
 * comparación con `==`, tipo de texto `Caracter` (no `Cadena`).
 */
(function (raiz) {
  'use strict';

  var SIMBOLOS_LITESEINT = [
    // ── Estructura del programa ──────────────────────────────────────────
    {
      nombre: 'Proceso', tipo: 'keyword',
      firma: 'Proceso nombre … FinProceso',
      descripcion: 'Marca el inicio del programa. Todo el código va dentro de este bloque.',
      ejemplo: 'Proceso saludar\n  Escribir "Hola, mundo"\nFinProceso'
    },
    {
      nombre: 'FinProceso', tipo: 'keyword',
      firma: 'FinProceso',
      descripcion: 'Cierra el bloque del programa abierto con Proceso.'
    },
    {
      nombre: 'Definir', tipo: 'keyword',
      firma: 'Definir variable Como Tipo',
      descripcion: 'Crea una o más variables de un tipo. Debe ir antes de usarlas.',
      ejemplo: 'Definir edad Como Entero\nDefinir a, b Como Real'
    },
    {
      nombre: 'Como', tipo: 'keyword',
      firma: 'Definir variable Como Tipo',
      descripcion: 'Une el nombre de la variable con su tipo dentro de Definir.'
    },

    // ── Entrada / salida ─────────────────────────────────────────────────
    {
      nombre: 'Leer', tipo: 'keyword',
      firma: 'Leer variable',
      descripcion: 'Detiene el programa y guarda en la variable lo que escribe el usuario.',
      ejemplo: 'Escribir "Tu edad:"\nLeer edad'
    },
    {
      nombre: 'Escribir', tipo: 'keyword',
      firma: 'Escribir expr, expr, …',
      descripcion: 'Muestra uno o varios valores en la consola y salta de línea.',
      ejemplo: 'Escribir "Total: ", total'
    },

    // ── Condicionales ────────────────────────────────────────────────────
    {
      nombre: 'Si', tipo: 'keyword',
      firma: 'Si condicion Entonces … [Sino …] FinSi',
      descripcion: 'Ejecuta un bloque u otro según una condición.',
      ejemplo: 'Si nota >= 4 Entonces\n  Escribir "Aprobado"\nSino\n  Escribir "Reprobado"\nFinSi'
    },
    { nombre: 'Entonces', tipo: 'keyword', firma: 'Si condicion Entonces',
      descripcion: 'Introduce el bloque que se ejecuta cuando la condición del Si es verdadera.' },
    { nombre: 'Sino', tipo: 'keyword', firma: 'Sino',
      descripcion: 'Bloque alternativo del Si cuando la condición es falsa.' },
    { nombre: 'FinSi', tipo: 'keyword', firma: 'FinSi', descripcion: 'Cierra un bloque Si.' },
    {
      nombre: 'Segun', tipo: 'keyword',
      firma: 'Segun expr Hacer\n  valor: …\n  De Otro Modo: …\nFinSegun',
      descripcion: 'Elige entre varios casos según el valor de una expresión.',
      ejemplo: 'Segun dia Hacer\n  1: Escribir "Lunes"\n  De Otro Modo:\n    Escribir "Otro"\nFinSegun'
    },
    { nombre: 'FinSegun', tipo: 'keyword', firma: 'FinSegun', descripcion: 'Cierra un bloque Segun.' },

    // ── Ciclos ───────────────────────────────────────────────────────────
    {
      nombre: 'Mientras', tipo: 'keyword',
      firma: 'Mientras condicion Hacer … FinMientras',
      descripcion: 'Repite un bloque mientras la condición sea verdadera (puede no ejecutarse).',
      ejemplo: 'Mientras i <= 10 Hacer\n  Escribir i\n  i = i + 1\nFinMientras'
    },
    { nombre: 'FinMientras', tipo: 'keyword', firma: 'FinMientras', descripcion: 'Cierra un bloque Mientras.' },
    {
      nombre: 'Repetir', tipo: 'keyword',
      firma: 'Repetir … HastaQue condicion',
      descripcion: 'Repite un bloque al menos una vez; termina cuando la condición se cumple.',
      ejemplo: 'Repetir\n  Leer clave\nHastaQue clave == "ok"'
    },
    { nombre: 'HastaQue', tipo: 'keyword', firma: 'HastaQue condicion',
      descripcion: 'Condición de salida del ciclo Repetir (termina cuando es verdadera).' },
    {
      nombre: 'Para', tipo: 'keyword',
      firma: 'Para i = inicio Hasta fin [Con Paso p] Hacer … FinPara',
      descripcion: 'Repite con un contador que avanza automáticamente.',
      ejemplo: 'Para i = 1 Hasta 5 Hacer\n  Escribir i\nFinPara'
    },
    { nombre: 'FinPara', tipo: 'keyword', firma: 'FinPara', descripcion: 'Cierra un bloque Para.' },
    { nombre: 'Hasta', tipo: 'keyword', firma: 'Para i = inicio Hasta fin',
      descripcion: 'Indica el valor final del contador en un ciclo Para.' },
    { nombre: 'Hacer', tipo: 'keyword', firma: '… Hacer',
      descripcion: 'Introduce el cuerpo de Mientras, Para o Segun.' },
    { nombre: 'Paso', tipo: 'keyword', firma: 'Con Paso n',
      descripcion: 'Define el incremento del contador en un ciclo Para (puede ser negativo).' },

    // ── Arreglos y subprogramas ──────────────────────────────────────────
    {
      nombre: 'Dimension', tipo: 'keyword',
      firma: 'Dimension arr[n]  |  Dimension mat[f, c]',
      descripcion: 'Declara un arreglo (1D) o una matriz (2D). Los índices empiezan en 1.',
      ejemplo: 'Dimension notas[5]\nnotas[1] = 7'
    },
    {
      nombre: 'SubProceso', tipo: 'keyword',
      firma: 'SubProceso nombre(params) … FinSubProceso',
      descripcion: 'Define un subproceso reutilizable que se invoca con Llamar.',
      ejemplo: 'SubProceso saludar()\n  Escribir "Hola"\nFinSubProceso'
    },
    { nombre: 'FinSubProceso', tipo: 'keyword', firma: 'FinSubProceso', descripcion: 'Cierra un SubProceso.' },
    {
      nombre: 'Funcion', tipo: 'keyword',
      firma: 'Funcion res = nombre(params) … FinFuncion',
      descripcion: 'Define una función que devuelve un valor mediante su variable de retorno.',
      ejemplo: 'Funcion d = doble(n)\n  d = n * 2\nFinFuncion'
    },
    { nombre: 'FinFuncion', tipo: 'keyword', firma: 'FinFuncion', descripcion: 'Cierra una Funcion.' },
    {
      nombre: 'Llamar', tipo: 'keyword',
      firma: 'Llamar nombre(args)',
      descripcion: 'Invoca un subproceso definido por el usuario.',
      ejemplo: 'Llamar saludar()'
    },

    // ── Tipos de dato ────────────────────────────────────────────────────
    { nombre: 'Entero', tipo: 'tipo', firma: 'Entero',
      descripcion: 'Número sin decimales: contadores, edades, cantidades.' },
    { nombre: 'Real', tipo: 'tipo', firma: 'Real',
      descripcion: 'Número con decimales: precios, promedios, medidas.' },
    { nombre: 'Caracter', tipo: 'tipo', firma: 'Caracter',
      descripcion: 'Texto entre comillas dobles. En LiteSeInt el tipo de texto es Caracter (no Cadena).' },
    { nombre: 'Logico', tipo: 'tipo', firma: 'Logico',
      descripcion: 'Valor Verdadero o Falso (booleano).' },

    // ── Constantes y operadores con palabra ──────────────────────────────
    { nombre: 'Verdadero', tipo: 'constante', firma: 'Verdadero', descripcion: 'Valor lógico verdadero.' },
    { nombre: 'Falso', tipo: 'constante', firma: 'Falso', descripcion: 'Valor lógico falso.' },
    { nombre: 'Y', tipo: 'operador', firma: 'cond1 Y cond2',
      descripcion: 'Operador lógico Y: verdadero solo si ambas condiciones lo son.' },
    { nombre: 'O', tipo: 'operador', firma: 'cond1 O cond2',
      descripcion: 'Operador lógico O: verdadero si al menos una condición lo es.' },
    { nombre: 'No', tipo: 'operador', firma: 'No cond',
      descripcion: 'Operador lógico de negación: invierte el valor de la condición.' },
    { nombre: 'mod', tipo: 'operador', firma: 'a mod b',
      descripcion: 'Resto de la división entera de a entre b. Solo en minúsculas.' },

    // ── Funciones nativas ────────────────────────────────────────────────
    {
      nombre: 'Abs', tipo: 'función', firma: 'Abs(x)',
      descripcion: 'Valor absoluto (sin signo) de un número.',
      params: [{ nombre: 'x', descripcion: 'Número entero o real.' }],
      retorno: 'número', ejemplo: 'Abs(-5)  // 5'
    },
    {
      nombre: 'Redon', tipo: 'función', firma: 'Redon(x)',
      descripcion: 'Redondea al entero más cercano.',
      params: [{ nombre: 'x', descripcion: 'Número a redondear.' }],
      retorno: 'Entero', ejemplo: 'Redon(2.5)  // 3'
    },
    {
      nombre: 'Trunc', tipo: 'función', firma: 'Trunc(x)',
      descripcion: 'Elimina los decimales sin redondear (parte entera).',
      params: [{ nombre: 'x', descripcion: 'Número a truncar.' }],
      retorno: 'Entero', ejemplo: 'Trunc(2.9)  // 2'
    },
    {
      nombre: 'Longitud', tipo: 'función', firma: 'Longitud(texto)',
      descripcion: 'Cantidad de caracteres de una cadena.',
      params: [{ nombre: 'texto', descripcion: 'Variable o literal de tipo Caracter.' }],
      retorno: 'Entero', ejemplo: 'Longitud("hola")  // 4'
    },
    {
      nombre: 'Mayusculas', tipo: 'función', firma: 'Mayusculas(texto)',
      descripcion: 'Devuelve el texto convertido a mayúsculas.',
      params: [{ nombre: 'texto', descripcion: 'Cadena a transformar.' }],
      retorno: 'Caracter', ejemplo: 'Mayusculas("hola")  // "HOLA"'
    },
    {
      nombre: 'Minusculas', tipo: 'función', firma: 'Minusculas(texto)',
      descripcion: 'Devuelve el texto convertido a minúsculas.',
      params: [{ nombre: 'texto', descripcion: 'Cadena a transformar.' }],
      retorno: 'Caracter', ejemplo: 'Minusculas("HOLA")  // "hola"'
    }
  ];

  raiz.AyudasLiteSeInt = { SIMBOLOS_LITESEINT: SIMBOLOS_LITESEINT };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SIMBOLOS_LITESEINT: SIMBOLOS_LITESEINT };
  }
})(typeof window !== 'undefined' ? window : globalThis);
