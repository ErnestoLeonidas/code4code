# Python Web WASM Landing

Landing page estática con dos rutas:

- `pyodide.html`: runner Python en navegador usando Pyodide + CodeMirror.
- `marimo.html`: contenedor para un notebook marimo exportado como HTML WASM.
- `marimo-sin-instalar.html`: demo marimo embebida desde CDN sin instalar marimo.

## Ejecutar localmente

No abras los archivos con `file://`. Sirve la carpeta por HTTP:

```bash
python -m http.server 8000
```

Abre:

```txt
http://localhost:8000
```

## Pyodide

El runner usa:

```html
<script src="https://cdn.jsdelivr.net/pyodide/v0.29.4/full/pyodide.js"></script>
```

El código Python se ejecuta en el navegador del usuario.

## marimo WASM

Primero instala marimo:

```bash
pip install marimo
```

Exporta el notebook de ejemplo:

```bash
marimo export html-wasm notebooks/demo_marimo.py -o marimo_dist --mode edit
```

Luego vuelve a cargar:

```txt
http://localhost:8000/marimo.html
```

## Despliegue

Puedes subir la carpeta completa a GitHub Pages, Cloudflare Pages, Netlify o un hosting estático.

Para marimo, asegúrate de subir también el contenido generado dentro de `marimo_dist`.


## marimo sin instalar

Para ver una demo inmediata sin instalar marimo ni exportar el notebook, abre:

```txt
http://localhost:8000/marimo-sin-instalar.html
```

La página usa:

```html
<script src="https://cdn.jsdelivr.net/npm/@marimo-team/marimo-snippets@1"></script>
```

y el componente:

```html
<marimo-iframe>
```python
import marimo as mo
```
</marimo-iframe>
```

Esta opción requiere internet porque carga marimo desde CDN.
