# ============================================================================
# Code4Code — scripts/importar-desde-liteseint.ps1
# ============================================================================
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\scripts\importar-desde-liteseint.ps1 "C:\ruta\al\clone\LiteSeInt"
# ============================================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$SRC
)

$ErrorActionPreference = "Stop"

function Join-PathSafe {
    param(
        [string]$Base,
        [string]$Child
    )
    return [System.IO.Path]::Combine($Base, $Child)
}

function Copy-DirectoryContents {
    param(
        [string]$SourceDir,
        [string]$DestinationDir
    )

    if (!(Test-Path $DestinationDir)) {
        New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
    }

    Get-ChildItem -Path $SourceDir -Force | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $DestinationDir -Recurse -Force
    }
}

if (!(Test-Path $SRC)) {
    Write-Error "ERROR: la ruta de origen no existe: $SRC"
    exit 1
}

$SRC = (Resolve-Path $SRC).Path
$DEST = (Resolve-Path (Join-PathSafe $PSScriptRoot "..")).Path

# --- verificación de origen -------------------------------------------------

$archivosRequeridos = @(
    "index.html",
    "core\LiteSeInt.js",
    "core\tokenizer.js",
    "js\app.js",
    "tests\run-tests.js"
)

foreach ($f in $archivosRequeridos) {
    $ruta = Join-PathSafe $SRC $f

    if (!(Test-Path $ruta)) {
        Write-Error "ERROR: no se encontró '$f' en '$SRC'. ¿Es un clone de LiteSeInt?"
        exit 1
    }
}

Write-Host "Origen verificado: $SRC"
Write-Host "Destino:           $DEST"

# --- 1) núcleo -> core/liteseint/ -------------------------------------------

$coreDestino = Join-PathSafe $DEST "core\liteseint"

if (!(Test-Path $coreDestino)) {
    New-Item -ItemType Directory -Path $coreDestino -Force | Out-Null
}

$NUCLEO = @(
    "tokenizer",
    "symbol-table",
    "validator",
    "doc_errores",
    "ast",
    "parser",
    "expression-evaluator",
    "diagram-mapper"
)

foreach ($nombre in $NUCLEO) {
    $origenArchivo = Join-PathSafe $SRC "core\$nombre.js"
    $destinoArchivo = Join-PathSafe $coreDestino "$nombre.js"

    if (Test-Path $origenArchivo) {
        Copy-Item -Path $origenArchivo -Destination $destinoArchivo -Force
        Write-Host "  core/$nombre.js -> core/liteseint/$nombre.js"
    }
    else {
        Write-Host "  AVISO: core/$nombre.js no existe en el origen (se omite)"
    }
}

Copy-Item `
    -Path (Join-PathSafe $SRC "core\LiteSeInt.js") `
    -Destination (Join-PathSafe $coreDestino "runtime.js") `
    -Force

Write-Host "  core/LiteSeInt.js -> core/liteseint/runtime.js"

# Cualquier otro .js del core original que no esté en la lista

$coreOrigen = Join-PathSafe $SRC "core"

Get-ChildItem -Path $coreOrigen -Filter "*.js" -File | ForEach-Object {
    $base = $_.Name
    $nombreSinExtension = [System.IO.Path]::GetFileNameWithoutExtension($base)
    $destinoExtra = Join-PathSafe $coreDestino $base

    if (
        ($NUCLEO -notcontains $nombreSinExtension) -and
        ($base -ne "LiteSeInt.js") -and
        (!(Test-Path $destinoExtra))
    ) {
        Copy-Item -Path $_.FullName -Destination $destinoExtra -Force
        Write-Host "  core/$base -> core/liteseint/$base (extra)"
    }
}

# --- 2) UI y estilos ---------------------------------------------------------

$cssDestino = Join-PathSafe $DEST "css"
$jsDestino = Join-PathSafe $DEST "js"

New-Item -ItemType Directory -Path $cssDestino -Force | Out-Null
New-Item -ItemType Directory -Path $jsDestino -Force | Out-Null

$cssOrigen = Join-PathSafe $SRC "css"

if (Test-Path $cssOrigen) {
    Copy-DirectoryContents -SourceDir $cssOrigen -DestinationDir $cssDestino
    Write-Host "  css/ copiado"
}

foreach ($f in @("app.js", "ejercicios-data.js", "diagram.js")) {
    $origenArchivo = Join-PathSafe $SRC "js\$f"
    $destinoArchivo = Join-PathSafe $jsDestino $f

    if (Test-Path $origenArchivo) {
        Copy-Item -Path $origenArchivo -Destination $destinoArchivo -Force
        Write-Host "  js/$f copiado"
    }
}

# --- 3) datos pedagógicos y metadatos ----------------------------------------

$jsonOrigen = Join-PathSafe $SRC "json"
$jsonDestino = Join-PathSafe $DEST "json"

if (Test-Path $jsonOrigen) {
    Copy-DirectoryContents -SourceDir $jsonOrigen -DestinationDir $jsonDestino
    Write-Host "  json/ (ejercicios) copiado"
}

$sharedOrigen = Join-PathSafe $SRC "shared"
$sharedDestino = Join-PathSafe $DEST "shared"

if (Test-Path $sharedOrigen) {
    Copy-DirectoryContents -SourceDir $sharedOrigen -DestinationDir $sharedDestino
    Write-Host "  shared/ copiado"
}

$ejerciciosMdOrigen = Join-PathSafe $SRC "EJERCICIOS.md"

if (Test-Path $ejerciciosMdOrigen) {
    Copy-Item -Path $ejerciciosMdOrigen -Destination $DEST -Force
    Write-Host "  EJERCICIOS.md copiado"
}

$vscodeOrigen = Join-PathSafe $SRC ".vscode"

if (Test-Path $vscodeOrigen) {
    Copy-Item -Path $vscodeOrigen -Destination $DEST -Recurse -Force
    Write-Host "  .vscode/ copiado"
}

$claudeOrigen = Join-PathSafe $SRC ".claude"

if (Test-Path $claudeOrigen) {
    Copy-Item -Path $claudeOrigen -Destination $DEST -Recurse -Force
    Write-Host "  .claude/ (skills) copiado"
}

$ejerciciosOrigen = Join-PathSafe $SRC "ejercicios"
$ejerciciosDestino = Join-PathSafe $DEST "ejercicios"

if (Test-Path $ejerciciosOrigen) {
    Copy-DirectoryContents -SourceDir $ejerciciosOrigen -DestinationDir $ejerciciosDestino
    Write-Host "  ejercicios/ (guía fuente) copiado"
}

# --- 4) tests: reescribir rutas del núcleo -----------------------------------

$testsDestinoDir = Join-PathSafe $DEST "tests"

if (!(Test-Path $testsDestinoDir)) {
    New-Item -ItemType Directory -Path $testsDestinoDir -Force | Out-Null
}

$runTestsOrigen = Join-PathSafe $SRC "tests\run-tests.js"
$runTestsDestino = Join-PathSafe $testsDestinoDir "run-tests.js"

Copy-Item -Path $runTestsOrigen -Destination $runTestsDestino -Force

$contenido = [System.IO.File]::ReadAllText($runTestsDestino)

# 4a. core/ -> core/liteseint/
$contenido = $contenido -replace "core/", "core/liteseint/"

# 4b. deshacer dobles reemplazos
$contenido = $contenido -replace "core/liteseint/liteseint/", "core/liteseint/"

# 4c. LiteSeInt.js ahora se llama runtime.js
$contenido = $contenido -replace "core/liteseint/LiteSeInt\.js", "core/liteseint/runtime.js"
$contenido = $contenido -replace "core/liteseint/LiteSeInt'", "core/liteseint/runtime'"
$contenido = $contenido -replace 'core/liteseint/LiteSeInt"', 'core/liteseint/runtime"'

[System.IO.File]::WriteAllText($runTestsDestino, $contenido, [System.Text.Encoding]::UTF8)

Write-Host "  tests/run-tests.js copiado y rutas ajustadas a core/liteseint/"

# --- 5) CHANGELOG: anexar historial 1.x --------------------------------------

$changelogOrigen = Join-PathSafe $SRC "CHANGELOG.md"
$changelogDestino = Join-PathSafe $DEST "CHANGELOG.md"

if (Test-Path $changelogOrigen) {
    $debeAnexar = $true

    if (Test-Path $changelogDestino) {
        $contenidoChangelogDestino = Get-Content $changelogDestino -Raw

        if ($contenidoChangelogDestino -match "Historial LiteSeInt 1\.x") {
            $debeAnexar = $false
        }
    }

    if ($debeAnexar) {
        $historial = Get-Content $changelogOrigen -Raw

        Add-Content -Path $changelogDestino -Value ""
        Add-Content -Path $changelogDestino -Value "---"
        Add-Content -Path $changelogDestino -Value ""
        Add-Content -Path $changelogDestino -Value "# Historial LiteSeInt 1.x"
        Add-Content -Path $changelogDestino -Value ""
        Add-Content -Path $changelogDestino -Value $historial

        Write-Host "  CHANGELOG.md: historial 1.x anexado"
    }
}

# --- 6) verificación ----------------------------------------------------------

Write-Host ""
Write-Host "Verificando con npm test..."

$nodeExiste = Get-Command node -ErrorAction SilentlyContinue
$npmExiste = Get-Command npm -ErrorAction SilentlyContinue

if ($nodeExiste -and $npmExiste) {
    Push-Location $DEST

    try {
        npm test

        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "=========================================================="
            Write-Host "  Importación completa y pruebas en verde."
            Write-Host "  Siguiente paso: abrir index.html en el navegador y"
            Write-Host "  luego publicar el repositorio."
            Write-Host "=========================================================="
        }
        else {
            Write-Host ""
            Write-Error "AVISO: npm test falló. Revisa los require() de tests/run-tests.js y apunta el núcleo a core/liteseint/ usando runtime.js en lugar de LiteSeInt.js."
            exit 1
        }
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "AVISO: Node.js o npm no está instalado; ejecuta 'npm test' manualmente cuando esté disponible."
}