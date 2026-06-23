/**
 * Code4Code — core/pseint/ayudas-data.js
 * ======================================
 * Catálogo de símbolos de PSeInt para las "ayudas de código" del editor
 * (hover de documentación, ayuda de firma y autocompletado enriquecido).
 * Lo consume el módulo js/editor/ayudas.js a través de provider.catalogoAyudas().
 *
 * Misma forma de dato que core/python/ayudas-data.js y
 * core/liteseint/ayudas-data.js: { nombre, tipo, firma, descripcion, params,
 * retorno, ejemplo }. `nombre` debe ser una sola palabra (para el hover).
 *
 * Dialecto PSeInt: asignación con `<-` (el `=` es comparador en perfil
 * estricto; también asigna en perfil flexible), tipo de texto `Cadena` o
 * `Caracter`, funciones nativas en MAYÚSCULAS.
 */
(function (raiz) {
  'use strict';

  var SIMBOLOS_PSEINT = [
    // ── Estructura del algoritmo ─────────────────────────────────────────
    {
      nombre: 'Algoritmo', tipo: 'keyword',
      firma: 'Algoritmo nombre … FinAlgoritmo',
      descripcion: 'Marca el inicio del algoritmo. Equivale a Proceso/FinProceso.',
      ejemplo: 'Algoritmo saludo\n  Escribir "Hola"\nFinAlgoritmo'
    },
    { nombre: 'FinAlgoritmo', tipo: 'keyword', firma: 'FinAlgoritmo',
      descripcion: 'Cierra el bloque abierto con Algoritmo.' },
    { nombre: 'Proceso', tipo: 'keyword', firma: 'Proceso nombre … FinProceso',
      descripcion: 'Inicio del programa (alternativa a Algoritmo).' },
    { nombre: 'FinProceso', tipo: 'keyword', firma: 'FinProceso',
      descripcion: 'Cierra el bloque abierto con Proceso.' },
    {
      nombre: 'Definir', tipo: 'keyword',
      firma: 'Definir variable Como Tipo',
      descripcion: 'Declara una o más variables de un tipo. Opcional en perfil flexible.',
      ejemplo: 'Definir edad Como Entero\nDefinir a, b Como Real'
    },
    { nombre: 'Como', tipo: 'keyword', firma: 'Definir variable Como Tipo',
      descripcion: 'Une el nombre de la variable con su tipo en Definir.' },
    { nombre: 'Dimension', tipo: 'keyword', firma: 'Dimension arr[n] | mat[f, c]',
      descripcion: 'Declara un arreglo (1D) o matriz (2D).',
      ejemplo: 'Dimension notas[5]' },

    // ── Entrada / salida ─────────────────────────────────────────────────
    {
      nombre: 'Leer', tipo: 'keyword', firma: 'Leer var1, var2, …',
      descripcion: 'Lee uno o más valores escritos por el usuario.',
      ejemplo: 'Leer nombre, edad'
    },
    {
      nombre: 'Escribir', tipo: 'keyword', firma: 'Escribir expr, expr, …',
      descripcion: 'Muestra valores en la consola y salta de línea.',
      ejemplo: 'Escribir "Hola ", nombre'
    },
    { nombre: 'Sin', tipo: 'keyword', firma: 'Escribir Sin Saltar expr',
      descripcion: 'Con "Escribir Sin Saltar", imprime sin pasar a la línea siguiente.' },
    { nombre: 'Saltar', tipo: 'keyword', firma: 'Escribir Sin Saltar expr',
      descripcion: 'Parte de "Escribir Sin Saltar": no agrega salto de línea.' },

    // ── Condicionales ────────────────────────────────────────────────────
    {
      nombre: 'Si', tipo: 'keyword',
      firma: 'Si condicion Entonces … [Sino …] FinSi',
      descripcion: 'Ejecuta un bloque u otro según una condición.',
      ejemplo: 'Si edad >= 18 Entonces\n  Escribir "Mayor"\nFinSi'
    },
    { nombre: 'Entonces', tipo: 'keyword', firma: 'Si condicion Entonces',
      descripcion: 'Introduce el bloque del Si cuando la condición es verdadera.' },
    { nombre: 'Sino', tipo: 'keyword', firma: 'Sino',
      descripcion: 'Bloque alternativo del Si cuando la condición es falsa.' },
    { nombre: 'FinSi', tipo: 'keyword', firma: 'FinSi', descripcion: 'Cierra un bloque Si.' },
    {
      nombre: 'Segun', tipo: 'keyword',
      firma: 'Segun expr Hacer\n  valor: …\n  De Otro Modo: …\nFinSegun',
      descripcion: 'Elige entre varios casos según el valor de una expresión.',
      ejemplo: 'Segun opcion Hacer\n  1: Escribir "Uno"\nFinSegun'
    },
    { nombre: 'FinSegun', tipo: 'keyword', firma: 'FinSegun', descripcion: 'Cierra un bloque Segun.' },

    // ── Ciclos ───────────────────────────────────────────────────────────
    {
      nombre: 'Mientras', tipo: 'keyword',
      firma: 'Mientras condicion Hacer … FinMientras',
      descripcion: 'Repite mientras la condición sea verdadera (puede no ejecutarse).',
      ejemplo: 'Mientras i <= 10 Hacer\n  i <- i + 1\nFinMientras'
    },
    { nombre: 'FinMientras', tipo: 'keyword', firma: 'FinMientras', descripcion: 'Cierra un bloque Mientras.' },
    {
      nombre: 'Repetir', tipo: 'keyword',
      firma: 'Repetir … Hasta Que condicion',
      descripcion: 'Repite al menos una vez; termina cuando la condición se cumple.',
      ejemplo: 'Repetir\n  Leer n\nHasta Que n > 0'
    },
    {
      nombre: 'Para', tipo: 'keyword',
      firma: 'Para i <- inicio Hasta fin [Con Paso p] Hacer … FinPara',
      descripcion: 'Repite con un contador que avanza automáticamente.',
      ejemplo: 'Para i <- 1 Hasta 5 Hacer\n  Escribir i\nFinPara'
    },
    { nombre: 'FinPara', tipo: 'keyword', firma: 'FinPara', descripcion: 'Cierra un bloque Para.' },
    { nombre: 'Hasta', tipo: 'keyword', firma: 'Hasta fin / Hasta Que condicion',
      descripcion: 'Valor final del Para, o (con Que) condición de salida de Repetir.' },
    { nombre: 'Que', tipo: 'keyword', firma: 'Hasta Que condicion',
      descripcion: 'Parte de "Hasta Que": cierra el ciclo Repetir.' },
    { nombre: 'Hacer', tipo: 'keyword', firma: '… Hacer',
      descripcion: 'Introduce el cuerpo de Mientras, Para o Segun.' },
    { nombre: 'Con', tipo: 'keyword', firma: 'Con Paso n',
      descripcion: 'Junto con Paso, define el incremento del contador del Para.' },
    { nombre: 'Paso', tipo: 'keyword', firma: 'Con Paso n',
      descripcion: 'Incremento del contador en un ciclo Para (puede ser negativo).' },

    // ── Subprogramas e instrucciones ─────────────────────────────────────
    {
      nombre: 'SubProceso', tipo: 'keyword',
      firma: 'SubProceso nombre(params) … FinSubProceso',
      descripcion: 'Define un subproceso reutilizable.',
      ejemplo: 'SubProceso saludar()\n  Escribir "Hola"\nFinSubProceso'
    },
    { nombre: 'FinSubProceso', tipo: 'keyword', firma: 'FinSubProceso', descripcion: 'Cierra un SubProceso.' },
    {
      nombre: 'Funcion', tipo: 'keyword',
      firma: 'Funcion res <- nombre(params) … FinFuncion',
      descripcion: 'Define una función que devuelve un valor con Retornar o su variable de retorno.',
      ejemplo: 'Funcion d <- doble(n)\n  d <- n * 2\nFinFuncion'
    },
    { nombre: 'FinFuncion', tipo: 'keyword', firma: 'FinFuncion', descripcion: 'Cierra una Funcion.' },
    { nombre: 'Retornar', tipo: 'keyword', firma: 'Retornar valor',
      descripcion: 'Devuelve un valor desde una función o subproceso.' },
    {
      nombre: 'Ordenar', tipo: 'función', firma: 'Ordenar(arreglo[, n])',
      descripcion: 'Ordena en su lugar los primeros n elementos de un arreglo 1D.',
      params: [
        { nombre: 'arreglo', descripcion: 'Arreglo declarado con Dimension.' },
        { nombre: 'n', descripcion: 'Cantidad de elementos a ordenar (opcional).' }
      ],
      ejemplo: 'Ordenar(notas)'
    },

    // ── Tipos de dato ────────────────────────────────────────────────────
    { nombre: 'Entero', tipo: 'tipo', firma: 'Entero', descripcion: 'Número sin decimales.' },
    { nombre: 'Real', tipo: 'tipo', firma: 'Real', descripcion: 'Número con decimales.' },
    { nombre: 'Logico', tipo: 'tipo', firma: 'Logico', descripcion: 'Valor Verdadero o Falso.' },
    { nombre: 'Caracter', tipo: 'tipo', firma: 'Caracter', descripcion: 'Un carácter o texto corto.' },
    { nombre: 'Cadena', tipo: 'tipo', firma: 'Cadena', descripcion: 'Cadena de texto.' },

    // ── Constantes y operadores con palabra ──────────────────────────────
    { nombre: 'Verdadero', tipo: 'constante', firma: 'Verdadero', descripcion: 'Valor lógico verdadero.' },
    { nombre: 'Falso', tipo: 'constante', firma: 'Falso', descripcion: 'Valor lógico falso.' },
    { nombre: 'Y', tipo: 'operador', firma: 'cond1 Y cond2',
      descripcion: 'Operador lógico Y (ambas condiciones verdaderas).' },
    { nombre: 'O', tipo: 'operador', firma: 'cond1 O cond2',
      descripcion: 'Operador lógico O (al menos una verdadera).' },
    { nombre: 'NO', tipo: 'operador', firma: 'NO cond',
      descripcion: 'Operador lógico de negación.' },
    { nombre: 'MOD', tipo: 'operador', firma: 'a MOD b',
      descripcion: 'Resto de la división entera de a entre b.' },

    // ── Funciones nativas (matemáticas) ──────────────────────────────────
    {
      nombre: 'RC', tipo: 'función', firma: 'RC(x)', descripcion: 'Raíz cuadrada de x.',
      params: [{ nombre: 'x', descripcion: 'Número ≥ 0.' }], retorno: 'Real', ejemplo: 'RC(16)  // 4'
    },
    {
      nombre: 'RAIZ', tipo: 'función', firma: 'RAIZ(x)', descripcion: 'Raíz cuadrada de x (alias de RC).',
      params: [{ nombre: 'x', descripcion: 'Número ≥ 0.' }], retorno: 'Real', ejemplo: 'RAIZ(25)  // 5'
    },
    {
      nombre: 'ABS', tipo: 'función', firma: 'ABS(x)', descripcion: 'Valor absoluto de x.',
      params: [{ nombre: 'x', descripcion: 'Número entero o real.' }], retorno: 'número', ejemplo: 'ABS(-5)  // 5'
    },
    {
      nombre: 'TRUNC', tipo: 'función', firma: 'TRUNC(x)', descripcion: 'Parte entera de x (sin redondear).',
      params: [{ nombre: 'x', descripcion: 'Número a truncar.' }], retorno: 'Entero', ejemplo: 'TRUNC(2.9)  // 2'
    },
    {
      nombre: 'REDON', tipo: 'función', firma: 'REDON(x)', descripcion: 'Redondea al entero más cercano.',
      params: [{ nombre: 'x', descripcion: 'Número a redondear.' }], retorno: 'Entero', ejemplo: 'REDON(2.5)  // 3'
    },
    {
      nombre: 'LN', tipo: 'función', firma: 'LN(x)', descripcion: 'Logaritmo natural de x.',
      params: [{ nombre: 'x', descripcion: 'Número > 0.' }], retorno: 'Real'
    },
    {
      nombre: 'EXP', tipo: 'función', firma: 'EXP(x)', descripcion: 'e elevado a x.',
      params: [{ nombre: 'x', descripcion: 'Exponente.' }], retorno: 'Real'
    },
    {
      nombre: 'SEN', tipo: 'función', firma: 'SEN(x)', descripcion: 'Seno de x (radianes).',
      params: [{ nombre: 'x', descripcion: 'Ángulo en radianes.' }], retorno: 'Real'
    },
    {
      nombre: 'COS', tipo: 'función', firma: 'COS(x)', descripcion: 'Coseno de x (radianes).',
      params: [{ nombre: 'x', descripcion: 'Ángulo en radianes.' }], retorno: 'Real'
    },
    {
      nombre: 'TAN', tipo: 'función', firma: 'TAN(x)', descripcion: 'Tangente de x (radianes).',
      params: [{ nombre: 'x', descripcion: 'Ángulo en radianes.' }], retorno: 'Real'
    },
    {
      nombre: 'ATAN', tipo: 'función', firma: 'ATAN(x)', descripcion: 'Arcotangente de x (radianes).',
      params: [{ nombre: 'x', descripcion: 'Valor de la tangente.' }], retorno: 'Real'
    },
    {
      nombre: 'AZAR', tipo: 'función', firma: 'AZAR(n)',
      descripcion: 'Entero al azar entre 0 y n-1.',
      params: [{ nombre: 'n', descripcion: 'Cota superior (exclusiva).' }], retorno: 'Entero', ejemplo: 'AZAR(6)  // 0..5'
    },
    {
      nombre: 'ALEATORIO', tipo: 'función', firma: 'ALEATORIO(a, b)',
      descripcion: 'Entero al azar entre a y b (ambos incluidos).',
      params: [
        { nombre: 'a', descripcion: 'Límite inferior.' },
        { nombre: 'b', descripcion: 'Límite superior.' }
      ], retorno: 'Entero', ejemplo: 'ALEATORIO(1, 6)'
    },

    // ── Funciones nativas (cadena) ───────────────────────────────────────
    {
      nombre: 'LONGITUD', tipo: 'función', firma: 'LONGITUD(texto)',
      descripcion: 'Cantidad de caracteres de una cadena.',
      params: [{ nombre: 'texto', descripcion: 'Cadena de entrada.' }], retorno: 'Entero', ejemplo: 'LONGITUD("hola")  // 4'
    },
    {
      nombre: 'SUBCADENA', tipo: 'función', firma: 'SUBCADENA(texto, desde, hasta)',
      descripcion: 'Extrae la porción del texto entre las posiciones desde y hasta.',
      params: [
        { nombre: 'texto', descripcion: 'Cadena de entrada.' },
        { nombre: 'desde', descripcion: 'Posición inicial.' },
        { nombre: 'hasta', descripcion: 'Posición final.' }
      ], retorno: 'Cadena'
    },
    {
      nombre: 'CONCATENAR', tipo: 'función', firma: 'CONCATENAR(a, b)',
      descripcion: 'Une dos cadenas en una sola.',
      params: [
        { nombre: 'a', descripcion: 'Primera cadena.' },
        { nombre: 'b', descripcion: 'Segunda cadena.' }
      ], retorno: 'Cadena'
    },
    {
      nombre: 'MAYUSCULAS', tipo: 'función', firma: 'MAYUSCULAS(texto)',
      descripcion: 'Devuelve el texto en mayúsculas.',
      params: [{ nombre: 'texto', descripcion: 'Cadena a transformar.' }], retorno: 'Cadena'
    },
    {
      nombre: 'MINUSCULAS', tipo: 'función', firma: 'MINUSCULAS(texto)',
      descripcion: 'Devuelve el texto en minúsculas.',
      params: [{ nombre: 'texto', descripcion: 'Cadena a transformar.' }], retorno: 'Cadena'
    },
    {
      nombre: 'CONVERTIRANUMERO', tipo: 'función', firma: 'CONVERTIRANUMERO(texto)',
      descripcion: 'Convierte una cadena numérica en número.',
      params: [{ nombre: 'texto', descripcion: 'Cadena con un número.' }], retorno: 'número', ejemplo: 'CONVERTIRANUMERO("42")  // 42'
    },
    {
      nombre: 'CONVERTIRATEXTO', tipo: 'función', firma: 'CONVERTIRATEXTO(valor)',
      descripcion: 'Convierte un número o lógico en su representación de texto.',
      params: [{ nombre: 'valor', descripcion: 'Número o valor lógico.' }], retorno: 'Cadena', ejemplo: 'CONVERTIRATEXTO(42)  // "42"'
    }
  ];

  raiz.AyudasPSeInt = { SIMBOLOS_PSEINT: SIMBOLOS_PSEINT };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SIMBOLOS_PSEINT: SIMBOLOS_PSEINT };
  }
})(typeof window !== 'undefined' ? window : globalThis);
