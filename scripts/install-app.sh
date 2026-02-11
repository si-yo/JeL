#!/usr/bin/env bash
set -euo pipefail

# ─── Lab — Installation et build de l'application ───
# Installe les dependances npm, build le renderer + mobile,
# et optionnellement package l'app Electron pour l'OS courant.
#
# Usage:
#   ./install-app.sh              # Install + build (dev)
#   ./install-app.sh --package    # Install + build + package Electron
#   ./install-app.sh --dev        # Install seulement (pas de build)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERR]${NC}   $*"; }
skip()  { echo -e "${YELLOW}[SKIP]${NC}  $*"; }

MODE="build"  # build | dev | package

for arg in "$@"; do
  case "$arg" in
    --package) MODE="package" ;;
    --dev)     MODE="dev" ;;
    --help|-h)
      echo "Usage: $0 [--dev] [--package]"
      echo ""
      echo "  (defaut)    Installe les dependances et build le projet"
      echo "  --dev       Installe les dependances sans build"
      echo "  --package   Installe, build et package l'app Electron"
      exit 0
      ;;
    *) err "Flag inconnu: $arg (utiliser --help)"; exit 1 ;;
  esac
done

OS="$(uname -s)"

# ─── Locate project root ───

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"
info "Repertoire projet: $PROJECT_DIR"
echo ""

# ─── 1. Check Node.js ───

echo -e "${CYAN}━━━ 1/4 Verification Node.js ━━━${NC}"
if ! command -v node &>/dev/null; then
  err "Node.js non installe. Lancez d'abord ./scripts/install-requirements.sh"
  exit 1
fi
if ! command -v npm &>/dev/null; then
  err "npm non installe. Lancez d'abord ./scripts/install-requirements.sh"
  exit 1
fi
ok "Node.js $(node --version) — npm $(npm --version)"
echo ""

# ─── 2. Install dependencies ───

echo -e "${CYAN}━━━ 2/4 Dependances npm ━━━${NC}"
info "Installation des dependances du projet principal..."
npm install

if [[ -d "mobile" ]]; then
  info "Installation des dependances mobile..."
  cd mobile && npm install && cd ..
fi
ok "Dependances installees"
echo ""

# ─── 3. Build ───

echo -e "${CYAN}━━━ 3/4 Build ━━━${NC}"
if [[ "$MODE" == "dev" ]]; then
  skip "Build (mode --dev, pas de build)"
else
  info "Build renderer (Vite)..."
  npm run build:renderer

  if [[ -d "mobile" ]]; then
    info "Build mobile (Vite)..."
    npm run build:mobile
  fi
  ok "Build termine"
fi
echo ""

# ─── 4. Package (optionnel) ───

echo -e "${CYAN}━━━ 4/4 Package Electron ━━━${NC}"
if [[ "$MODE" != "package" ]]; then
  skip "Package (utiliser --package pour creer l'app)"
else
  info "Package Electron pour $OS..."
  case "$OS" in
    Darwin)
      npx electron-builder --mac --publish never
      ok "App macOS creee dans dist/"
      ;;
    Linux)
      npx electron-builder --linux --publish never
      ok "App Linux creee dans dist/"
      ;;
    *)
      warn "OS non supporte pour le packaging: $OS"
      ;;
  esac
fi
echo ""

# ─── Resume ───

echo -e "${GREEN}━━━ Installation terminee ━━━${NC}"
echo ""
if [[ "$MODE" == "dev" ]]; then
  info "Lancer en mode dev : npm run dev"
elif [[ "$MODE" == "package" ]]; then
  info "L'app empaquetee se trouve dans dist/"
else
  info "Lancer l'app : npm start"
  info "Mode dev :     npm run dev"
fi
