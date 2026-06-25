import marimo

__generated_with = "0.14.0"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    return (mo,)


@app.cell
def _(mo):
    mo.md("""
    # Demo marimo WASM

    Este notebook puede exportarse como HTML WebAssembly y ejecutarse en el navegador.
    """)
    return


@app.cell
def _(mo):
    nombre = mo.ui.text(value="Guaren", label="Nombre")
    cantidad = mo.ui.slider(start=1, stop=10, value=5, label="Cantidad")
    mo.vstack([nombre, cantidad])
    return cantidad, nombre


@app.cell
def _(cantidad, nombre, mo):
    mensajes = [f"{i}. Hola {nombre.value} desde marimo WASM" for i in range(1, cantidad.value + 1)]
    mo.md("\n".join(f"- {mensaje}" for mensaje in mensajes))
    return (mensajes,)


@app.cell
def _(mensajes):
    len(mensajes)
    return


if __name__ == "__main__":
    app.run()
