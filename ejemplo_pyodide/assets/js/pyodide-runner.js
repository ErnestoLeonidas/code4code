const outputEl = document.getElementById('consoleOutput');
const statusEl = document.getElementById('runtimeStatus');
const runBtn = document.getElementById('runBtn');
const clearBtn = document.getElementById('clearBtn');
const exampleBtn = document.getElementById('exampleBtn');

const editor = CodeMirror.fromTextArea(document.getElementById('pythonCode'), {
  mode: 'python',
  theme: 'material-darker',
  lineNumbers: true,
  indentUnit: 4,
  tabSize: 4,
  indentWithTabs: false,
  viewportMargin: Infinity,
  lineWrapping: true
});

function scrollConsole() {
  outputEl.scrollTop = outputEl.scrollHeight;
}

function writeOutput(text = '') {
  outputEl.textContent += String(text);
  scrollConsole();
}

function writeLine(text = '') {
  outputEl.textContent += `${String(text)}\n`;
  scrollConsole();
}

function writeChar(charCode) {
  outputEl.textContent += String.fromCharCode(charCode);
  scrollConsole();
}

function clearOutput() {
  outputEl.textContent = '';
}

// Disponible desde Python con: from js import pyodideConsoleClear
window.pyodideConsoleClear = clearOutput;

function setStatus(text, state = 'loading') {
  statusEl.textContent = text;
  statusEl.className = 'fw-semibold';
  if (state === 'ready') statusEl.classList.add('text-success');
  if (state === 'error') statusEl.classList.add('text-danger');
  if (state === 'loading') statusEl.classList.add('text-primary');
}

function configureStreams(pyodide) {
  // raw conserva exactamente lo que Python escribe:
  // \n, \t, print(..., end=""), prompts de input(), etc.
  pyodide.setStdout({
    raw: (charCode) => writeChar(charCode),
    isatty: true
  });

  pyodide.setStderr({
    raw: (charCode) => writeChar(charCode),
    isatty: true
  });

  // input() en navegador: usa prompt() y luego escribe la entrada en la consola
  // para simular el eco de una terminal real.
  pyodide.setStdin({
    stdin: () => {
      const value = window.prompt('Entrada requerida por input():');
      const normalizedValue = value === null ? '' : String(value);
      writeLine(normalizedValue);
      return normalizedValue;
    },
    isatty: true
  });
}

async function patchOsSystem(pyodide) {
  // Parche de consola para ejercicios educativos.
  // Pyodide corre en WebAssembly, no en una consola Windows real.
  // Por eso os.system("cls") no puede limpiar la terminal del navegador.
  // Este parche intercepta cls/clear y limpia el <pre> de salida.
  await pyodide.runPythonAsync(`
import os as _pyodide_os
from js import pyodideConsoleClear as _pyodide_console_clear

_pyodide_original_system = _pyodide_os.system

def _pyodide_system(command):
    command = str(command).strip().lower()
    if command in ("cls", "clear"):
        _pyodide_console_clear()
        return 0
    return _pyodide_original_system(command)

_pyodide_os.system = _pyodide_system
`);
}

async function initPyodide() {
  clearOutput();
  writeLine('Inicializando Pyodide...');
  setStatus('Inicializando Pyodide...', 'loading');

  const pyodide = await loadPyodide();

  configureStreams(pyodide);
  await patchOsSystem(pyodide);

  setStatus('Listo para ejecutar Python', 'ready');
  clearOutput();
  writeLine('Runtime listo. Presiona Ejecutar.');
  runBtn.disabled = false;

  return pyodide;
}

const pyodideReady = initPyodide().catch((error) => {
  setStatus('Error cargando Pyodide', 'error');
  clearOutput();
  writeLine(error.message || error);
  throw error;
});

async function runPython() {
  runBtn.disabled = true;
  runBtn.textContent = 'Ejecutando...';

  try {
    const pyodide = await pyodideReady;
    const code = editor.getValue();
    clearOutput();

    if (typeof pyodide.loadPackagesFromImports === 'function') {
      await pyodide.loadPackagesFromImports(code);
    }

    const result = await pyodide.runPythonAsync(code);

    if (result !== undefined && result !== null) {
      writeLine('');
      writeLine('[resultado]');
      writeLine(result.toString());
    }
  } catch (error) {
    writeLine('');
    writeLine('[error]');
    writeLine(error.message || error);
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = 'Ejecutar';
  }
}

runBtn.addEventListener('click', runPython);
clearBtn.addEventListener('click', clearOutput);
exampleBtn.addEventListener('click', () => {
  editor.setValue(`import os\n\nnombre = "Guaren"\n\nfor i in range(1, 6):\n    print(f"{i}. Hola {nombre} desde Python en el navegador\\n\\tTexto con tabulación")\n\n# input() usa una ventana prompt del navegador y luego escribe una nueva línea\nrespuesta = input("Escribe algo: ")\nprint(f"Ingresaste: {respuesta}")\n\n# En Pyodide esto se emula para limpiar la consola del navegador\n# os.system("cls")\n\nsumatoria = sum(range(1, 101))\nprint("Después de cls solo queda esta parte")\nsumatoria`);
});

editor.setOption('extraKeys', {
  'Ctrl-Enter': runPython,
  'Cmd-Enter': runPython
});
