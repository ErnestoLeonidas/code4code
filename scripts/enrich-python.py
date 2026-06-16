#!/usr/bin/env python3
"""Enriquece los ejercicios Python N1-N6 con numero, modulo, conceptos, pista y entradaProcesoSalida."""
import json, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ENRICHMENT = {
  # N1 — Salida, variables, operaciones básicas
  'py-n1-001': {
    'conceptos': ['print', 'cadenas', 'hola mundo'],
    'pista': 'Usa print("...") para mostrar texto en pantalla.',
    'entradaProcesoSalida': {'entrada': 'Ninguna', 'proceso': 'Llamar a print con el mensaje', 'salida': 'Hola, mundo!'},
  },
  'py-n1-002': {
    'conceptos': ['print', 'cadenas', 'literales'],
    'pista': 'print("Mi nombre es Ana") imprime el texto tal como está escrito entre comillas.',
    'entradaProcesoSalida': {'entrada': 'Ninguna', 'proceso': 'Llamar a print con el nombre', 'salida': 'Mi nombre es Ana'},
  },
  'py-n1-003': {
    'conceptos': ['variables', 'int', 'print', 'asignación'],
    'pista': 'Asigna edad = 20 y luego print(edad) para mostrar su valor.',
    'entradaProcesoSalida': {'entrada': 'Ninguna', 'proceso': 'Declarar variable y mostrarla', 'salida': 'El valor de la variable'},
  },
  'py-n1-004': {
    'conceptos': ['variables', 'str', 'print', 'cadenas'],
    'pista': 'Asigna nombre = "tu nombre" y luego muéstrala con print(nombre).',
    'entradaProcesoSalida': {'entrada': 'Ninguna', 'proceso': 'Declarar variable cadena y mostrarla', 'salida': 'El valor de la variable'},
  },
  'py-n1-005': {
    'conceptos': ['input', 'print', 'variables', 'cadenas'],
    'pista': 'nombre = input("Ingresa tu nombre: ") guarda lo que escribe el usuario.',
    'entradaProcesoSalida': {'entrada': 'Nombre del usuario', 'proceso': 'Leer con input() y mostrar saludo', 'salida': 'Hola, [nombre]!'},
  },
  'py-n1-006': {
    'conceptos': ['input', 'int()', 'operadores', 'print'],
    'pista': 'Convierte la entrada a entero con int(input(...)). Luego multiplica por 2.',
    'entradaProcesoSalida': {'entrada': 'Un número entero', 'proceso': 'Leer, convertir a int y multiplicar por 2', 'salida': 'El doble del número'},
  },
  'py-n1-007': {
    'conceptos': ['input', 'int()', 'suma', 'print'],
    'pista': 'Lee dos números con int(input(...)) y súmalos. Muestra el resultado.',
    'entradaProcesoSalida': {'entrada': 'Dos números enteros', 'proceso': 'Sumar ambos valores', 'salida': 'La suma'},
  },
  'py-n1-008': {
    'conceptos': ['input', 'float()', 'multiplicación', 'variables'],
    'pista': 'area = base * altura. Lee base y altura con float(input(...)).',
    'entradaProcesoSalida': {'entrada': 'Base y altura del rectángulo', 'proceso': 'Calcular base × altura', 'salida': 'El área'},
  },
  'py-n1-009': {
    'conceptos': ['input', 'float()', 'fórmula', 'conversión'],
    'pista': 'Fahrenheit = (Celsius × 9/5) + 32. Lee Celsius con float(input(...)).',
    'entradaProcesoSalida': {'entrada': 'Temperatura en Celsius', 'proceso': 'Aplicar fórmula de conversión', 'salida': 'Temperatura en Fahrenheit'},
  },
  'py-n1-010': {
    'conceptos': ['input', 'float()', 'promedio', 'división'],
    'pista': 'promedio = (n1 + n2 + n3) / 3. Usa float() para aceptar decimales.',
    'entradaProcesoSalida': {'entrada': 'Tres notas numéricas', 'proceso': 'Calcular la suma y dividir entre 3', 'salida': 'El promedio'},
  },
  'py-n1-011': {
    'conceptos': ['input', 'float()', 'fórmula', 'variables'],
    'pista': 'IMC = peso / (talla ** 2). Divide el peso (kg) entre la talla (m) al cuadrado.',
    'entradaProcesoSalida': {'entrada': 'Peso (kg) y talla (m)', 'proceso': 'Calcular IMC = peso / talla²', 'salida': 'El IMC'},
  },
  'py-n1-012': {
    'conceptos': ['input', 'int()', 'módulo', 'división entera'],
    'pista': 'minutos = segundos // 60; resto = segundos % 60. Usa // para división entera y % para el resto.',
    'entradaProcesoSalida': {'entrada': 'Total de segundos', 'proceso': 'División entera y módulo para obtener minutos y segundos', 'salida': 'Minutos y segundos'},
  },
  'py-n1-013': {
    'conceptos': ['input', 'float()', 'porcentaje', 'variables'],
    'pista': 'precio_final = precio * 1.19. El IVA del 19% equivale a multiplicar por 1.19.',
    'entradaProcesoSalida': {'entrada': 'Precio sin IVA', 'proceso': 'Multiplicar por 1.19', 'salida': 'Precio con IVA'},
  },
  'py-n1-014': {
    'conceptos': ['input', 'float()', 'porcentaje', 'operadores'],
    'pista': 'descuento = precio * (porcentaje / 100); precio_final = precio - descuento.',
    'entradaProcesoSalida': {'entrada': 'Precio y porcentaje de descuento', 'proceso': 'Calcular y restar el descuento', 'salida': 'Precio final con descuento'},
  },
  'py-n1-015': {
    'conceptos': ['input', 'int()', 'potencias', 'operador **'],
    'pista': 'cuadrado = n ** 2; cubo = n ** 3. El operador ** calcula potencias en Python.',
    'entradaProcesoSalida': {'entrada': 'Un número entero N', 'proceso': 'Calcular N² y N³', 'salida': 'El cuadrado y el cubo de N'},
  },
  'py-n1-016': {
    'conceptos': ['variables', 'variable auxiliar', 'intercambio', 'asignación'],
    'pista': 'Necesitas una variable temporal: aux = a; a = b; b = aux. En Python también puedes usar: a, b = b, a.',
    'entradaProcesoSalida': {'entrada': 'Dos valores', 'proceso': 'Intercambiar usando variable auxiliar', 'salida': 'Los dos valores intercambiados'},
  },
  'py-n1-017': {
    'conceptos': ['int()', 'módulo', 'división entera', 'dígitos'],
    'pista': 'Para un número de 2 cifras: unidades = n % 10; decenas = n // 10. Luego suma ambos.',
    'entradaProcesoSalida': {'entrada': 'Un número de 2 cifras', 'proceso': 'Extraer dígitos con // y % y sumarlos', 'salida': 'La suma de los dígitos'},
  },
  'py-n1-018': {
    'conceptos': ['input', 'float()', 'matemáticas', 'raíz cuadrada'],
    'pista': 'distancia = ((x2-x1)**2 + (y2-y1)**2) ** 0.5. Usa ** 0.5 para raíz cuadrada.',
    'entradaProcesoSalida': {'entrada': 'Coordenadas de dos puntos (x1,y1) y (x2,y2)', 'proceso': 'Aplicar fórmula de distancia euclidiana', 'salida': 'La distancia entre los puntos'},
  },
  'py-n1-019': {
    'conceptos': ['input', 'float()', 'porcentaje', 'variables'],
    'pista': 'propina = total * 0.15. La propina del 15% es el total multiplicado por 0.15.',
    'entradaProcesoSalida': {'entrada': 'Total de la cuenta', 'proceso': 'Calcular el 15% del total', 'salida': 'Monto de la propina'},
  },
  'py-n1-020': {
    'conceptos': ['input', 'float()', 'sustracción', 'cambio'],
    'pista': 'cambio = pago - precio. Asegúrate de convertir ambos valores a float.',
    'entradaProcesoSalida': {'entrada': 'Precio del producto y monto del pago', 'proceso': 'Restar precio al pago', 'salida': 'El cambio a devolver'},
  },

  # N2 — Condicionales
  'py-n2-001': {
    'conceptos': ['if/else', 'comparación', 'int()', 'condicional'],
    'pista': 'Compara edad >= 18 con if/else para decidir el mensaje a mostrar.',
    'entradaProcesoSalida': {'entrada': 'Edad del usuario', 'proceso': 'Comparar si edad >= 18', 'salida': '"Mayor de edad" o "Menor de edad"'},
  },
  'py-n2-002': {
    'conceptos': ['if/elif/else', 'comparación', 'float()', 'condicional'],
    'pista': 'Usa if n > 0 / elif n < 0 / else para los tres casos. Convierte con float().',
    'entradaProcesoSalida': {'entrada': 'Un número real', 'proceso': 'Comparar con 0 para determinar signo', 'salida': '"positivo", "negativo" o "cero"'},
  },
  'py-n2-003': {
    'conceptos': ['if/else', 'comparación', 'máximo', 'condicional'],
    'pista': 'if a >= b: print(a) else: print(b). Compara los dos números directamente.',
    'entradaProcesoSalida': {'entrada': 'Dos números', 'proceso': 'Comparar para encontrar el mayor', 'salida': 'El mayor de los dos'},
  },
  'py-n2-004': {
    'conceptos': ['if/elif/else', 'comparación encadenada', 'máximo'],
    'pista': 'Compara a vs b primero; si a es el mayor, compáralo con c. Si no, compara b con c.',
    'entradaProcesoSalida': {'entrada': 'Tres números', 'proceso': 'Comparaciones anidadas para hallar el mayor', 'salida': 'El mayor de los tres'},
  },
  'py-n2-005': {
    'conceptos': ['if/elif/else', 'and', 'comparación', 'triángulo'],
    'pista': 'Un triángulo equilátero tiene los 3 lados iguales; isósceles 2; escaleno ninguno. Usa == y and.',
    'entradaProcesoSalida': {'entrada': 'Tres longitudes de lados', 'proceso': 'Comparar lados para clasificar', 'salida': 'Tipo de triángulo (equilátero/isósceles/escaleno)'},
  },
  'py-n2-006': {
    'conceptos': ['if/elif/else', 'comparación', 'rangos', 'calificación'],
    'pista': 'Define rangos: >=90 Sobresaliente, >=70 Bueno, >=60 Regular, <60 Insuficiente.',
    'entradaProcesoSalida': {'entrada': 'Una calificación numérica', 'proceso': 'Comparar contra rangos con if/elif', 'salida': 'La categoría de la calificación'},
  },
  'py-n2-007': {
    'conceptos': ['if/elif/else', 'operadores aritméticos', 'calculadora'],
    'pista': 'Lee el operador como cadena con input(). Usa elif para cada operación (+, -, *, /).',
    'entradaProcesoSalida': {'entrada': 'Dos números y un operador', 'proceso': 'Seleccionar la operación con if/elif', 'salida': 'El resultado de la operación'},
  },
  'py-n2-008': {
    'conceptos': ['if/else', 'módulo', 'par/impar', 'int()'],
    'pista': 'Un número es par si n % 2 == 0. El operador % devuelve el resto de la división.',
    'entradaProcesoSalida': {'entrada': 'Un número entero', 'proceso': 'Verificar si el resto de dividir entre 2 es 0', 'salida': '"Par" o "Impar"'},
  },
  'py-n2-009': {
    'conceptos': ['if', 'módulo', 'and', 'divisibilidad'],
    'pista': 'Usa n % 3 == 0 and n % 5 == 0. El operador and requiere que ambas condiciones sean True.',
    'entradaProcesoSalida': {'entrada': 'Un número entero', 'proceso': 'Verificar divisibilidad por 3 y por 5 simultáneamente', 'salida': '"Sí" o "No"'},
  },
  'py-n2-010': {
    'conceptos': ['if/elif/else', 'módulo', 'año bisiesto', 'condiciones compuestas'],
    'pista': 'Bisiesto: divisible por 4, excepto siglos (100), salvo que sean divisibles por 400.',
    'entradaProcesoSalida': {'entrada': 'Un año', 'proceso': 'Aplicar las reglas de año bisiesto', 'salida': '"Bisiesto" o "No bisiesto"'},
  },
  'py-n2-011': {
    'conceptos': ['if/else', 'comparación', 'rango', 'validación'],
    'pista': 'Combina dos condiciones: if 1 <= n <= 100. Python permite encadenar comparaciones así.',
    'entradaProcesoSalida': {'entrada': 'Un número entero', 'proceso': 'Verificar si está en el rango [1, 100]', 'salida': '"Válido" o "Fuera de rango"'},
  },
  'py-n2-012': {
    'conceptos': ['if/elif/else', 'comparación', 'máximo', 'mínimo'],
    'pista': 'Busca el máximo con comparaciones y el mínimo de forma similar. Son dos procesos separados.',
    'entradaProcesoSalida': {'entrada': 'Tres números', 'proceso': 'Comparar para hallar el mayor y el menor', 'salida': 'El máximo y el mínimo'},
  },
  'py-n2-013': {
    'conceptos': ['if/elif/else', 'and', 'ángulos', 'triángulo'],
    'pista': 'Triángulo rectángulo: un ángulo == 90°. Obtusángulo: un ángulo > 90°. Acutángulo: todos < 90°.',
    'entradaProcesoSalida': {'entrada': 'Tres ángulos del triángulo', 'proceso': 'Clasificar según los ángulos', 'salida': 'Tipo de triángulo (rectángulo/obtusángulo/acutángulo)'},
  },
  'py-n2-014': {
    'conceptos': ['if/else', 'comparación', 'rango', 'and'],
    'pista': 'Usa if a <= n <= b para verificar que n está entre a y b (inclusive).',
    'entradaProcesoSalida': {'entrada': 'Un número y dos extremos', 'proceso': 'Verificar si el número está en el rango', 'salida': '"Dentro del rango" o "Fuera del rango"'},
  },
  'py-n2-015': {
    'conceptos': ['if/elif/else', 'comparación', 'rangos', 'calificación'],
    'pista': 'Agrega condiciones intermedias para asignar + (>=85) o - (<=64) dentro de cada letra.',
    'entradaProcesoSalida': {'entrada': 'Una calificación numérica', 'proceso': 'Clasificar con rangos más específicos', 'salida': 'Calificación con signo (A+, A, B+, ...)'},
  },

  # N3 — Bucles
  'py-n3-001': {
    'conceptos': ['for', 'range', 'bucle', 'print'],
    'pista': 'for i in range(1, n+1): print(i). El range empieza en 1 y va hasta n (inclusive).',
    'entradaProcesoSalida': {'entrada': 'Un número entero N', 'proceso': 'Iterar de 1 a N e imprimir cada valor', 'salida': 'Los enteros del 1 al N, uno por línea'},
  },
  'py-n3-002': {
    'conceptos': ['for', 'range', 'acumulador', 'suma'],
    'pista': 'Inicializa suma = 0 antes del bucle. Dentro del for: suma += i.',
    'entradaProcesoSalida': {'entrada': 'Un número entero N', 'proceso': 'Acumular la suma de 1 a N con for', 'salida': 'La suma de los primeros N números'},
  },
  'py-n3-003': {
    'conceptos': ['for', 'range', 'multiplicación', 'tabla'],
    'pista': 'for i in range(1, 11): print(n, "x", i, "=", n*i). Itera del 1 al 10.',
    'entradaProcesoSalida': {'entrada': 'Un número N', 'proceso': 'Calcular N×i para i de 1 a 10', 'salida': 'La tabla de multiplicar de N'},
  },
  'py-n3-004': {
    'conceptos': ['for', 'range', 'acumulador', 'factorial'],
    'pista': 'Inicializa fact = 1. Dentro del for: fact *= i (para i en range(1, n+1)).',
    'entradaProcesoSalida': {'entrada': 'Un número entero N', 'proceso': 'Multiplicar acumulativamente de 1 a N', 'salida': 'N! (factorial de N)'},
  },
  'py-n3-005': {
    'conceptos': ['for', 'range', 'potencia', 'acumulador'],
    'pista': 'resultado = 1; for i in range(e): resultado *= n. Multiplica la base E veces.',
    'entradaProcesoSalida': {'entrada': 'Base N y exponente E', 'proceso': 'Multiplicar N por sí mismo E veces con for', 'salida': 'N elevado a E'},
  },
  'py-n3-006': {
    'conceptos': ['for', 'range', 'if', 'filtro', 'par/impar'],
    'pista': 'Usa range(2, n+1, 2) para generar solo pares, o agrega if i % 2 == 0 dentro del for.',
    'entradaProcesoSalida': {'entrada': 'Un número N', 'proceso': 'Iterar y filtrar solo los números pares', 'salida': 'Los números pares de 1 a N'},
  },
  'py-n3-007': {
    'conceptos': ['while', 'módulo', 'dígitos', 'acumulador'],
    'pista': 'Mientras n > 0: suma += n % 10; n //= 10. Extrae el último dígito con % 10.',
    'entradaProcesoSalida': {'entrada': 'Un número entero', 'proceso': 'Extraer y sumar dígitos con while', 'salida': 'La suma de los dígitos'},
  },
  'py-n3-008': {
    'conceptos': ['for', 'range', 'máximo', 'acumulador'],
    'pista': 'Inicia maximo con el primer número. Para cada siguiente, actualiza si es mayor.',
    'entradaProcesoSalida': {'entrada': 'N números ingresados uno a uno', 'proceso': 'Comparar cada número con el máximo actual', 'salida': 'El mayor de todos los números'},
  },
  'py-n3-009': {
    'conceptos': ['for', 'range', 'fibonacci', 'variables'],
    'pista': 'Inicia a=0, b=1. En cada iteración: print(a); a, b = b, a+b.',
    'entradaProcesoSalida': {'entrada': 'Cantidad de términos N', 'proceso': 'Calcular cada término como suma de los dos anteriores', 'salida': 'Los primeros N términos de Fibonacci'},
  },
  'py-n3-010': {
    'conceptos': ['while', 'múltiplos', 'incremento', 'condición'],
    'pista': 'Empieza en m+1 e incrementa hasta encontrar un número divisible por k: mult % k == 0.',
    'entradaProcesoSalida': {'entrada': 'K (divisor) y M (valor de referencia)', 'proceso': 'Buscar el primer múltiplo de K mayor que M', 'salida': 'El primer múltiplo encontrado'},
  },
  'py-n3-011': {
    'conceptos': ['while', 'random', 'break', 'condicional'],
    'pista': 'Genera el número secreto con random.randint(1, 10). Usa while True y break al acertar.',
    'entradaProcesoSalida': {'entrada': 'Números ingresados en cada intento', 'proceso': 'Comparar con número secreto hasta acertar', 'salida': 'Mensaje de acierto y número de intentos'},
  },
  'py-n3-012': {
    'conceptos': ['for', 'range', 'if', 'primo', 'condicional'],
    'pista': 'Para cada n, verifica si algún número de 2 a n//2 lo divide. Si no se divide, es primo.',
    'entradaProcesoSalida': {'entrada': 'Un número N', 'proceso': 'Para cada número 2..N, verificar si es primo', 'salida': 'Los números primos hasta N'},
  },
  'py-n3-013': {
    'conceptos': ['for', 'range', 'módulo', 'acumulador', 'or'],
    'pista': 'Suma los i de 1 a N que cumplan i % 3 == 0 or i % 5 == 0.',
    'entradaProcesoSalida': {'entrada': 'Un número N', 'proceso': 'Sumar múltiplos de 3 o de 5 hasta N', 'salida': 'La suma de los múltiplos'},
  },
  'py-n3-014': {
    'conceptos': ['while', 'validación', 'input', 'condicional'],
    'pista': 'Usa while True; dentro lee el dato. Si es válido, break. Si no, muestra error y repite.',
    'entradaProcesoSalida': {'entrada': 'Valor ingresado por el usuario (puede ser inválido)', 'proceso': 'Repetir la solicitud mientras el dato sea inválido', 'salida': 'El primer dato válido recibido'},
  },
  'py-n3-015': {
    'conceptos': ['while', 'módulo', 'MCD', 'algoritmo de Euclides'],
    'pista': 'while b != 0: a, b = b, a % b. Al terminar, a contiene el MCD.',
    'entradaProcesoSalida': {'entrada': 'Dos números enteros positivos', 'proceso': 'Aplicar el algoritmo de Euclides iterativamente', 'salida': 'El Máximo Común Divisor'},
  },

  # N4 — Listas
  'py-n4-001': {
    'conceptos': ['list', 'append', 'for', 'input'],
    'pista': 'Crea lista = []. Usa un for con range(5) y lista.append(int(input(...))) en cada iteración.',
    'entradaProcesoSalida': {'entrada': '5 números, uno por iteración', 'proceso': 'Agregar cada número a la lista con append', 'salida': 'La lista completa'},
  },
  'py-n4-002': {
    'conceptos': ['list', 'sum', 'append', 'for'],
    'pista': 'Después de llenar la lista, usa sum(lista) para obtener la suma de todos los elementos.',
    'entradaProcesoSalida': {'entrada': 'N números del usuario', 'proceso': 'Acumular en lista y calcular sum()', 'salida': 'La suma de todos los elementos'},
  },
  'py-n4-003': {
    'conceptos': ['list', 'sum', 'len', 'promedio'],
    'pista': 'promedio = sum(lista) / len(lista). Primero llena la lista y luego aplica estas funciones.',
    'entradaProcesoSalida': {'entrada': 'N números del usuario', 'proceso': 'Calcular suma total y dividir entre cantidad', 'salida': 'El promedio de los elementos'},
  },
  'py-n4-004': {
    'conceptos': ['list', 'max', 'append', 'funciones nativas'],
    'pista': 'Usa max(lista) para obtener el valor máximo de la lista. Python lo hace en una función.',
    'entradaProcesoSalida': {'entrada': 'N números del usuario', 'proceso': 'Llenar lista y aplicar max()', 'salida': 'El valor máximo de la lista'},
  },
  'py-n4-005': {
    'conceptos': ['list', 'min', 'append', 'funciones nativas'],
    'pista': 'Usa min(lista) para obtener el valor mínimo. Funciona igual que max() pero para el menor.',
    'entradaProcesoSalida': {'entrada': 'N números del usuario', 'proceso': 'Llenar lista y aplicar min()', 'salida': 'El valor mínimo de la lista'},
  },
  'py-n4-006': {
    'conceptos': ['list', 'for', 'if', 'contadores', 'condicional'],
    'pista': 'Usa tres contadores: pos, neg, cero = 0, 0, 0. Por cada elemento, incrementa el contador correspondiente.',
    'entradaProcesoSalida': {'entrada': 'Lista de números', 'proceso': 'Clasificar cada número y contar positivos, negativos y ceros', 'salida': 'Cantidad de positivos, negativos y ceros'},
  },
  'py-n4-007': {
    'conceptos': ['list', 'for', 'in', 'búsqueda'],
    'pista': 'Usa "if elemento in lista:" para verificar si existe, o itera con for y compara.',
    'entradaProcesoSalida': {'entrada': 'Una lista y un elemento a buscar', 'proceso': 'Recorrer la lista o usar "in"', 'salida': '"Encontrado" o "No encontrado"'},
  },
  'py-n4-008': {
    'conceptos': ['list', 'reverse', 'slicing', 'invertir'],
    'pista': 'Puedes usar lista[::-1] para obtener la inversa, o lista.reverse() para invertirla en su lugar.',
    'entradaProcesoSalida': {'entrada': 'Una lista de elementos', 'proceso': 'Invertir el orden de la lista', 'salida': 'La lista en orden inverso'},
  },
  'py-n4-009': {
    'conceptos': ['list', 'sort', 'sorted', 'ordenamiento'],
    'pista': 'Usa lista.sort() para ordenar en su lugar, o sorted(lista) para obtener una nueva lista ordenada.',
    'entradaProcesoSalida': {'entrada': 'Una lista de números', 'proceso': 'Ordenar con sort() o sorted()', 'salida': 'La lista en orden ascendente'},
  },
  'py-n4-010': {
    'conceptos': ['list', 'set', 'duplicados', 'conversión'],
    'pista': 'Convierte a set para eliminar duplicados: list(set(lista)). El set no permite repetidos.',
    'entradaProcesoSalida': {'entrada': 'Una lista con posibles duplicados', 'proceso': 'Convertir a set y volver a lista', 'salida': 'La lista sin elementos repetidos'},
  },
  'py-n4-011': {
    'conceptos': ['list comprehension', 'for', 'potencia', 'comprensión'],
    'pista': 'cuadrados = [x**2 for x in range(1, n+1)]. La comprensión de listas es muy compacta.',
    'entradaProcesoSalida': {'entrada': 'Un número N', 'proceso': 'Generar cuadrados con list comprehension', 'salida': 'Lista de los cuadrados de 1 a N'},
  },
  'py-n4-012': {
    'conceptos': ['list comprehension', 'if', 'filtro', 'par/impar'],
    'pista': 'pares = [x for x in lista if x % 2 == 0]. La condición if al final filtra los elementos.',
    'entradaProcesoSalida': {'entrada': 'Una lista de números', 'proceso': 'Filtrar solo los pares con comprensión de lista', 'salida': 'Lista de números pares'},
  },
  'py-n4-013': {
    'conceptos': ['list', 'count', 'for', 'frecuencia'],
    'pista': 'Usa lista.count(elemento) para contar cuántas veces aparece un elemento.',
    'entradaProcesoSalida': {'entrada': 'Una lista y un elemento', 'proceso': 'Contar ocurrencias con count()', 'salida': 'El número de veces que aparece el elemento'},
  },
  'py-n4-014': {
    'conceptos': ['list', 'concatenación', 'extend', '+', 'unir listas'],
    'pista': 'Usa lista1 + lista2 o lista1.extend(lista2) para unir dos listas.',
    'entradaProcesoSalida': {'entrada': 'Dos listas', 'proceso': 'Unir las listas con + o extend', 'salida': 'Una lista combinada'},
  },
  'py-n4-015': {
    'conceptos': ['list', 'list comprehension', 'media', 'filtro'],
    'pista': 'media = sum(lista) / len(lista); resultado = [x for x in lista if x > media].',
    'entradaProcesoSalida': {'entrada': 'Una lista de números', 'proceso': 'Calcular media y filtrar elementos mayores', 'salida': 'Lista de elementos por encima de la media'},
  },

  # N5 — Funciones
  'py-n5-001': {
    'conceptos': ['def', 'función', 'parámetros', 'print'],
    'pista': 'Define def saludar(nombre): con el cuerpo de la función indentado. Llámala con saludar("Ana").',
    'entradaProcesoSalida': {'entrada': 'Nombre como argumento', 'proceso': 'Llamar a la función con el nombre', 'salida': 'Saludo personalizado'},
  },
  'py-n5-002': {
    'conceptos': ['def', 'return', 'parámetros', 'potencia'],
    'pista': 'def cuadrado(n): return n ** 2. El return devuelve el resultado al lugar de la llamada.',
    'entradaProcesoSalida': {'entrada': 'Un número como argumento', 'proceso': 'Calcular n² dentro de la función', 'salida': 'El cuadrado del número'},
  },
  'py-n5-003': {
    'conceptos': ['def', 'for', 'return', 'factorial', 'acumulador'],
    'pista': 'def factorial(n): resultado=1; for i in range(1,n+1): resultado*=i; return resultado.',
    'entradaProcesoSalida': {'entrada': 'Un entero N como argumento', 'proceso': 'Calcular N! iterativamente', 'salida': 'N! (factorial de N)'},
  },
  'py-n5-004': {
    'conceptos': ['def', 'return', 'bool', 'módulo'],
    'pista': 'def es_par(n): return n % 2 == 0. Una expresión booleana puede devolverse directamente.',
    'entradaProcesoSalida': {'entrada': 'Un número entero', 'proceso': 'Verificar si n % 2 == 0', 'salida': 'True si es par, False si es impar'},
  },
  'py-n5-005': {
    'conceptos': ['def', 'return', 'if/else', 'comparación'],
    'pista': 'def maximo(a, b): return a if a > b else b. Puedes usar una expresión condicional en línea.',
    'entradaProcesoSalida': {'entrada': 'Dos números como argumentos', 'proceso': 'Comparar y devolver el mayor', 'salida': 'El máximo de los dos'},
  },
  'py-n5-006': {
    'conceptos': ['def', 'for', 'return', 'primo', 'break'],
    'pista': 'Verifica divisores de 2 hasta n//2. Si alguno divide exactamente, retorna False. Si ninguno, True.',
    'entradaProcesoSalida': {'entrada': 'Un número entero', 'proceso': 'Verificar si tiene divisores distintos de 1 y sí mismo', 'salida': 'True si es primo, False si no'},
  },
  'py-n5-007': {
    'conceptos': ['def', 'for', 'return', 'potencia', 'acumulador'],
    'pista': 'def potencia(base, exp): resultado=1; for _ in range(exp): resultado*=base; return resultado.',
    'entradaProcesoSalida': {'entrada': 'Base y exponente como argumentos', 'proceso': 'Multiplicar la base exp veces', 'salida': 'base elevado a exp'},
  },
  'py-n5-008': {
    'conceptos': ['def', 'for', 'return', 'sum', 'listas'],
    'pista': 'def suma_lista(lst): total=0; for x in lst: total+=x; return total. O: return sum(lst).',
    'entradaProcesoSalida': {'entrada': 'Una lista de números', 'proceso': 'Sumar todos los elementos', 'salida': 'La suma total'},
  },
  'py-n5-009': {
    'conceptos': ['def', 'recursión', 'caso base', 'factorial'],
    'pista': 'def factorial(n): return 1 if n <= 1 else n * factorial(n-1). El caso base es n == 0 o n == 1.',
    'entradaProcesoSalida': {'entrada': 'Un entero N', 'proceso': 'Llamarse a sí misma con n-1 hasta llegar al caso base', 'salida': 'N!'},
  },
  'py-n5-010': {
    'conceptos': ['def', 'recursión', 'fibonacci', 'caso base'],
    'pista': 'def fib(n): return n if n <= 1 else fib(n-1) + fib(n-2). Casos base: fib(0)=0, fib(1)=1.',
    'entradaProcesoSalida': {'entrada': 'Un entero N', 'proceso': 'Calcular fib(n) = fib(n-1) + fib(n-2) recursivamente', 'salida': 'El N-ésimo número de Fibonacci'},
  },
  'py-n5-011': {
    'conceptos': ['def', 'for', 'return', 'cadenas', 'conteo'],
    'pista': 'Recorre la cadena con for c in cadena y cuenta si c in "aeiouAEIOU".',
    'entradaProcesoSalida': {'entrada': 'Una cadena', 'proceso': 'Contar letras que son vocales', 'salida': 'Número de vocales'},
  },
  'py-n5-012': {
    'conceptos': ['def', 'for', 'return', 'listas', 'invertir'],
    'pista': 'Crea una nueva lista y agrega elementos de derecha a izquierda: for i in range(len(lst)-1, -1, -1).',
    'entradaProcesoSalida': {'entrada': 'Una lista', 'proceso': 'Crear nueva lista con elementos en orden inverso', 'salida': 'La lista invertida'},
  },
  'py-n5-013': {
    'conceptos': ['def', 'while', 'búsqueda binaria', 'listas ordenadas'],
    'pista': 'Mantén izq y der. Calcula mid=(izq+der)//2. Compara lista[mid] con el objetivo y ajusta izq o der.',
    'entradaProcesoSalida': {'entrada': 'Lista ordenada y elemento a buscar', 'proceso': 'Dividir la búsqueda a la mitad en cada paso', 'salida': 'Índice del elemento o -1 si no existe'},
  },
  'py-n5-014': {
    'conceptos': ['def', 'parámetros por defecto', 'return', 'valor predeterminado'],
    'pista': 'def saludar(nombre, saludo="Hola"): ... El parámetro con = tiene valor por defecto.',
    'entradaProcesoSalida': {'entrada': 'Nombre (obligatorio) y saludo (opcional)', 'proceso': 'Combinar los parámetros en el mensaje', 'salida': 'El saludo personalizado'},
  },
  'py-n5-015': {
    'conceptos': ['def', 'return', 'sum', 'min', 'max', 'len'],
    'pista': 'La función puede retornar múltiples valores: return media, minimo, maximo usando una tupla.',
    'entradaProcesoSalida': {'entrada': 'Una lista de números', 'proceso': 'Calcular media, mínimo y máximo', 'salida': 'Los tres estadísticos en una línea'},
  },

  # N6 — Cadenas
  'py-n6-001': {
    'conceptos': ['str', 'len', 'cadenas', 'input'],
    'pista': 'len(cadena) devuelve la cantidad de caracteres. Guarda la cadena con input().',
    'entradaProcesoSalida': {'entrada': 'Una cadena de texto', 'proceso': 'Calcular longitud con len()', 'salida': 'El número de caracteres'},
  },
  'py-n6-002': {
    'conceptos': ['str', 'upper', 'lower', 'métodos de cadena'],
    'pista': 'cadena.upper() convierte a mayúsculas; cadena.lower() a minúsculas.',
    'entradaProcesoSalida': {'entrada': 'Una cadena de texto', 'proceso': 'Aplicar .upper() y .lower()', 'salida': 'La cadena en mayúsculas y en minúsculas'},
  },
  'py-n6-003': {
    'conceptos': ['str', 'concatenación', '+', 'f-string'],
    'pista': 'Puedes unir con nombre + " " + apellido o con f"{nombre} {apellido}".',
    'entradaProcesoSalida': {'entrada': 'Nombre y apellido por separado', 'proceso': 'Concatenar con espacio entre medias', 'salida': 'Nombre completo'},
  },
  'py-n6-004': {
    'conceptos': ['str', 'indexación', 'cadenas', 'índices'],
    'pista': 'El primer carácter es cadena[0] y el último es cadena[-1] o cadena[len(cadena)-1].',
    'entradaProcesoSalida': {'entrada': 'Una cadena', 'proceso': 'Acceder a los índices 0 y -1', 'salida': 'El primer y el último carácter'},
  },
  'py-n6-005': {
    'conceptos': ['str', 'slicing', '[::-1]', 'invertir cadena'],
    'pista': 'cadena[::-1] invierte la cadena con slicing. Los tres parámetros son inicio:fin:paso.',
    'entradaProcesoSalida': {'entrada': 'Una cadena', 'proceso': 'Invertir con slicing [::-1]', 'salida': 'La cadena en orden inverso'},
  },
  'py-n6-006': {
    'conceptos': ['str', 'for', 'in', 'conteo', 'vocales'],
    'pista': 'for c in cadena: if c in "aeiouAEIOU": contador += 1.',
    'entradaProcesoSalida': {'entrada': 'Una cadena de texto', 'proceso': 'Recorrer e identificar vocales', 'salida': 'Número de vocales'},
  },
  'py-n6-007': {
    'conceptos': ['str', 'slicing', 'palíndromo', 'comparación'],
    'pista': 'Un palíndromo es igual al revés: cadena == cadena[::-1]. Convierte a minúsculas antes de comparar.',
    'entradaProcesoSalida': {'entrada': 'Una cadena', 'proceso': 'Comparar la cadena con su inversa', 'salida': '"Es palíndromo" o "No es palíndromo"'},
  },
  'py-n6-008': {
    'conceptos': ['str', 'replace', 'métodos de cadena'],
    'pista': 'cadena.replace(" ", "_") reemplaza todos los espacios por guiones bajos.',
    'entradaProcesoSalida': {'entrada': 'Una cadena con espacios', 'proceso': 'Reemplazar espacios con replace()', 'salida': 'La cadena con guiones bajos'},
  },
  'py-n6-009': {
    'conceptos': ['str', 'count', 'ocurrencias', 'métodos de cadena'],
    'pista': 'cadena.count(caracter) cuenta cuántas veces aparece el carácter en la cadena.',
    'entradaProcesoSalida': {'entrada': 'Una cadena y un carácter', 'proceso': 'Contar ocurrencias con count()', 'salida': 'El número de ocurrencias'},
  },
  'py-n6-010': {
    'conceptos': ['str', 'title', 'capitalize', 'métodos de cadena'],
    'pista': 'cadena.title() pone en mayúscula la primera letra de cada palabra.',
    'entradaProcesoSalida': {'entrada': 'Una cadena de texto', 'proceso': 'Aplicar .title() para formato título', 'salida': 'La cadena con cada palabra capitalizada'},
  },
  'py-n6-011': {
    'conceptos': ['str', 'isupper', 'indexación', 'condicional'],
    'pista': 'cadena[0].isupper() devuelve True si el primer carácter es mayúscula.',
    'entradaProcesoSalida': {'entrada': 'Una cadena', 'proceso': 'Verificar si cadena[0] es mayúscula', 'salida': '"Empieza con mayúscula" o "No empieza con mayúscula"'},
  },
  'py-n6-012': {
    'conceptos': ['str', 'split', 'for', 'palabras'],
    'pista': 'cadena.split() separa por espacios en blanco y devuelve una lista de palabras.',
    'entradaProcesoSalida': {'entrada': 'Una frase con varias palabras', 'proceso': 'Separar con split() y recorrer la lista', 'salida': 'Cada palabra en una línea separada'},
  },
  'py-n6-013': {
    'conceptos': ['str', 'strip', 'lstrip', 'rstrip', 'espacios'],
    'pista': 'cadena.strip() elimina espacios al principio y al final. También existen lstrip() y rstrip().',
    'entradaProcesoSalida': {'entrada': 'Una cadena con espacios al inicio y/o final', 'proceso': 'Aplicar .strip()', 'salida': 'La cadena sin espacios extra'},
  },
  'py-n6-014': {
    'conceptos': ['str', 'ord', 'chr', 'cifrado', 'for'],
    'pista': 'ord(c) da el código ASCII del carácter y chr(n) lo convierte de vuelta. Suma el desplazamiento al código.',
    'entradaProcesoSalida': {'entrada': 'Un texto y el desplazamiento', 'proceso': 'Desplazar cada letra en el alfabeto', 'salida': 'El texto cifrado'},
  },
  'py-n6-015': {
    'conceptos': ['str', 'try/except', 'float', 'validación'],
    'pista': 'Intenta float(cadena) dentro de un try. Si lanza ValueError, la cadena no es numérica.',
    'entradaProcesoSalida': {'entrada': 'Una cadena', 'proceso': 'Intentar convertir a float con try/except', 'salida': '"Es un número válido" o "No es un número"'},
  },
}

total = 0
for n in range(1, 7):
    path = os.path.join(BASE, 'json', 'python', f'N{n}.json')
    with open(path) as f:
        data = json.load(f)
    i = 1
    for e in data['ejercicios']:
        key = e['id']
        e['numero'] = f'PY-N{n}-{i:02d}'
        e['modulo'] = f'N{n}'
        if key in ENRICHMENT:
            e['conceptos'] = ENRICHMENT[key]['conceptos']
            e['pista'] = ENRICHMENT[key]['pista']
            e['entradaProcesoSalida'] = ENRICHMENT[key]['entradaProcesoSalida']
        else:
            print(f'MISSING enrichment for {key}')
        i += 1
        total += 1
    with open(path, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    count = len(data['ejercicios'])
    print(f'N{n}: {count} ejercicios enriquecidos')

print(f'Total: {total} ejercicios actualizados')
