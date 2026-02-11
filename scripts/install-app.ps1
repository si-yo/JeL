# ─── Lab — Installation et build de l'application (Windows) ───
# Installe les dependances npm, build le renderer + mobile,
# et optionnellement package l'app Electron.
#
# Usage:
#   .\install-app.ps1              # Install + build (dev)
#   .\install-app.ps1 -Package     # Install + build + package Electron
#   .\install-app.ps1 -DevOnly     # Install seulement (pas de build)

param(
    [switch]$Package,
    [switch]$DevOnly
)

$ErrorActionPreference = "Stop"

function Write-Info  { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[ERR]   $msg" -ForegroundColor Red }
function Write-Skip  { param($msg) Write-Host "[SKIP]  $msg" -ForegroundColor Yellow }

# ─── Locate project root ───

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
Set-Location $ProjectDir
Write-Info "Repertoire projet: $ProjectDir"
Write-Host ""

# ─── 1. Check Node.js ───

Write-Host "=== 1/4 Verification Node.js ===" -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js non installe. Lancez d'abord .\scripts\install-requirements.ps1"
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "npm non installe. Lancez d'abord .\scripts\install-requirements.ps1"
    exit 1
}
$nodeVer = node --version
$npmVer = npm --version
Write-Ok "Node.js $nodeVer - npm $npmVer"
Write-Host ""

# ─── 2. Install dependencies ───

Write-Host "=== 2/4 Dependances npm ===" -ForegroundColor Cyan
Write-Info "Installation des dependances du projet principal..."
npm install

if (Test-Path "mobile") {
    Write-Info "Installation des dependances mobile..."
    Push-Location mobile
    npm install
    Pop-Location
}
Write-Ok "Dependances installees"
Write-Host ""

# ─── 3. Build ───

Write-Host "=== 3/4 Build ===" -ForegroundColor Cyan
if ($DevOnly) {
    Write-Skip "Build (mode -DevOnly, pas de build)"
} else {
    Write-Info "Build renderer (Vite)..."
    npm run build:renderer

    if (Test-Path "mobile") {
        Write-Info "Build mobile (Vite)..."
        npm run build:mobile
    }
    Write-Ok "Build termine"
}
Write-Host ""

# ─── 4. Package (optionnel) ───

Write-Host "=== 4/4 Package Electron ===" -ForegroundColor Cyan
if (-not $Package) {
    Write-Skip "Package (utiliser -Package pour creer l'app)"
} else {
    Write-Info "Package Electron pour Windows..."
    npx electron-builder --win --publish never
    Write-Ok "App Windows creee dans dist/"
}
Write-Host ""

# ─── Resume ───

Write-Host "=== Installation terminee ===" -ForegroundColor Green
Write-Host ""
if ($DevOnly) {
    Write-Info "Lancer en mode dev : npm run dev"
} elseif ($Package) {
    Write-Info "L'app empaquetee se trouve dans dist/"
} else {
    Write-Info "Lancer l'app : npm start"
    Write-Info "Mode dev :     npm run dev"
}
