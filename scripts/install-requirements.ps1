# ─── Lab — Installation automatique des requirements (Windows) ───
# Supporte winget (Windows 10+) et choco (Chocolatey)
#
# Usage:
#   .\install-requirements.ps1                          # Tout installer
#   .\install-requirements.ps1 -NoIpfs                  # Tout sauf IPFS
#   .\install-requirements.ps1 -NoJupyter -NoIpfs       # Node + Python seulement
#
# Flags:
#   -NoNode      Passer Node.js
#   -NoPython    Passer Python 3
#   -NoJupyter   Passer Jupyter Lab
#   -NoIpfs      Passer IPFS Kubo

param(
    [switch]$NoNode,
    [switch]$NoPython,
    [switch]$NoJupyter,
    [switch]$NoIpfs
)

$ErrorActionPreference = "Stop"

$KuboVersion = "v0.33.2"

function Write-Info  { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[ERR]   $msg" -ForegroundColor Red }
function Write-Skip  { param($msg) Write-Host "[SKIP]  $msg" -ForegroundColor Yellow }

# ─── Detect package manager ───

$Pkg = $null
if (Get-Command winget -ErrorAction SilentlyContinue) {
    $Pkg = "winget"
} elseif (Get-Command choco -ErrorAction SilentlyContinue) {
    $Pkg = "choco"
}

if (-not $Pkg) {
    Write-Err "Ni winget ni chocolatey n'est disponible."
    Write-Err "Installez winget (Windows 10+) ou Chocolatey : https://chocolatey.org/install"
    exit 1
}

Write-Info "Gestionnaire de paquets: $Pkg"
Write-Host ""

# ─── 1. Node.js ───

Write-Host "=== 1/4 Node.js ===" -ForegroundColor Cyan
if ($NoNode) {
    Write-Skip "Node.js (desactive via -NoNode)"
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVer = node --version
    Write-Ok "Node.js deja installe: $nodeVer"
} else {
    Write-Info "Installation de Node.js..."
    switch ($Pkg) {
        "winget" { winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements }
        "choco"  { choco install nodejs-lts -y }
    }
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    Write-Ok "Node.js installe: $(node --version)"
}
Write-Host ""

# ─── 2. Python 3 ───

Write-Host "=== 2/4 Python 3 ===" -ForegroundColor Cyan

# Always detect Python (needed for Jupyter step)
$pyCmd = $null
foreach ($cmd in @("python3", "python", "py")) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3\.") {
            $pyCmd = $cmd
            break
        }
    }
}

if ($NoPython) {
    Write-Skip "Python 3 (desactive via -NoPython)"
} elseif ($pyCmd) {
    $pyVer = & $pyCmd --version 2>&1
    Write-Ok "Python deja installe: $pyVer ($pyCmd)"
} else {
    Write-Info "Installation de Python 3.10..."
    switch ($Pkg) {
        "winget" { winget install Python.Python.3.10 --accept-source-agreements --accept-package-agreements }
        "choco"  { choco install python310 -y }
    }
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    $pyCmd = "python"
    Write-Ok "Python installe: $(& $pyCmd --version 2>&1)"
}
Write-Host ""

# ─── 3. Jupyter Lab ───

Write-Host "=== 3/4 Jupyter Lab ===" -ForegroundColor Cyan
if ($NoJupyter) {
    Write-Skip "Jupyter Lab (desactive via -NoJupyter)"
} elseif (-not $pyCmd) {
    Write-Warn "Python non disponible, impossible d'installer Jupyter Lab"
} elseif (Get-Command jupyter -ErrorAction SilentlyContinue) {
    try {
        $jlabVer = jupyter lab --version 2>&1
        Write-Ok "Jupyter Lab deja installe: $jlabVer"
    } catch {
        Write-Info "jupyter present mais jupyterlab manquant, installation..."
        & $pyCmd -m pip install jupyterlab
        Write-Ok "Jupyter Lab installe"
    }
} else {
    Write-Info "Installation de Jupyter Lab via pip..."
    & $pyCmd -m pip install jupyterlab
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    Write-Ok "Jupyter Lab installe"
}
Write-Host ""

# ─── 4. IPFS Kubo ───

Write-Host "=== 4/4 IPFS Kubo ===" -ForegroundColor Cyan
if ($NoIpfs) {
    Write-Skip "IPFS Kubo (desactive via -NoIpfs)"
} elseif (Get-Command ipfs -ErrorAction SilentlyContinue) {
    $ipfsVer = ipfs --version
    Write-Ok "IPFS deja installe: $ipfsVer"
} else {
    Write-Info "Installation de IPFS Kubo $KuboVersion..."

    $arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "386" }
    $kuboZip = "kubo_${KuboVersion}_windows-${arch}.zip"
    $kuboUrl = "https://dist.ipfs.tech/kubo/${KuboVersion}/${kuboZip}"

    $tmpDir = Join-Path $env:TEMP "kubo-install"
    New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

    Write-Info "Telechargement depuis $kuboUrl"
    Invoke-WebRequest -Uri $kuboUrl -OutFile (Join-Path $tmpDir $kuboZip)

    Write-Info "Extraction..."
    Expand-Archive -Path (Join-Path $tmpDir $kuboZip) -DestinationPath $tmpDir -Force

    $installDir = Join-Path $env:LOCALAPPDATA "kubo"
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    Copy-Item -Path (Join-Path $tmpDir "kubo\ipfs.exe") -Destination (Join-Path $installDir "ipfs.exe") -Force

    # Add to user PATH if not already there
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notlike "*$installDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$userPath;$installDir", "User")
        $env:Path += ";$installDir"
    }

    Remove-Item -Recurse -Force $tmpDir
    Write-Ok "IPFS installe: $(ipfs --version)"
}
Write-Host ""

# ─── Resume ───

Write-Host "=== Installation terminee ===" -ForegroundColor Green
Write-Host ""
Write-Host "  Node.js  : $(try { node --version } catch { 'non installe' })"
Write-Host "  Python   : $(try { & $pyCmd --version 2>&1 } catch { 'non installe' })"
Write-Host "  Jupyter  : $(try { jupyter lab --version 2>&1 } catch { 'non installe' })"
Write-Host "  IPFS     : $(try { ipfs --version } catch { 'non installe' })"
Write-Host ""
Write-Info "Prochaine etape : npm install; npm run build:all; npm start"
