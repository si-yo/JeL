#!/usr/bin/env bash
set -euo pipefail

# ─── Lab — Installation automatique des requirements ───
# Supporte macOS (brew) et Linux (apt / dnf)
#
# Usage:
#   ./install-requirements.sh                    # Tout installer
#   ./install-requirements.sh --no-ipfs          # Tout sauf IPFS
#   ./install-requirements.sh --no-jupyter --no-ipfs  # Node + Python seulement
#
# Flags:
#   --no-node      Passer Node.js
#   --no-python    Passer Python 3
#   --no-jupyter   Passer Jupyter Lab
#   --no-ipfs      Passer IPFS Kubo

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

KUBO_VERSION="v0.33.2"

# ─── Parse flags ───

INSTALL_NODE=true
INSTALL_PYTHON=true
INSTALL_JUPYTER=true
INSTALL_IPFS=true

for arg in "$@"; do
  case "$arg" in
    --no-node)    INSTALL_NODE=false ;;
    --no-python)  INSTALL_PYTHON=false ;;
    --no-jupyter) INSTALL_JUPYTER=false ;;
    --no-ipfs)    INSTALL_IPFS=false ;;
    --help|-h)
      echo "Usage: $0 [--no-node] [--no-python] [--no-jupyter] [--no-ipfs]"
      echo ""
      echo "Installe les requirements de Lab. Par defaut tout est installe."
      echo ""
      echo "  --no-node      Passer Node.js"
      echo "  --no-python    Passer Python 3"
      echo "  --no-jupyter   Passer Jupyter Lab"
      echo "  --no-ipfs      Passer IPFS Kubo"
      exit 0
      ;;
    *)
      err "Flag inconnu: $arg (utiliser --help)"
      exit 1
      ;;
  esac
done

# ─── Detect OS & package manager ───

OS="$(uname -s)"
ARCH="$(uname -m)"
PKG=""

if [[ "$OS" == "Darwin" ]]; then
  if command -v brew &>/dev/null; then
    PKG="brew"
  else
    err "Homebrew non installe. Installez-le depuis https://brew.sh"
    exit 1
  fi
elif [[ "$OS" == "Linux" ]]; then
  if command -v apt-get &>/dev/null; then
    PKG="apt"
  elif command -v dnf &>/dev/null; then
    PKG="dnf"
  else
    err "Gestionnaire de paquets non supporte (apt ou dnf requis)"
    exit 1
  fi
else
  err "OS non supporte: $OS"
  exit 1
fi

info "OS: $OS ($ARCH) — Gestionnaire: $PKG"
echo ""

# ─── 1. Node.js ───

echo -e "${CYAN}━━━ 1/4 Node.js ━━━${NC}"
if [[ "$INSTALL_NODE" == false ]]; then
  skip "Node.js (desactive via --no-node)"
elif command -v node &>/dev/null; then
  NODE_VER="$(node --version)"
  ok "Node.js deja installe: $NODE_VER"
else
  info "Installation de Node.js..."
  case "$PKG" in
    brew) brew install node ;;
    apt)  sudo apt-get update && sudo apt-get install -y nodejs npm ;;
    dnf)  sudo dnf install -y nodejs npm ;;
  esac
  ok "Node.js installe: $(node --version)"
fi
echo ""

# ─── 2. Python 3 ───

echo -e "${CYAN}━━━ 2/4 Python 3 ━━━${NC}"
PY_CMD=""

# Always detect Python (needed for Jupyter step)
for cmd in python3.10 python3 python; do
  if command -v "$cmd" &>/dev/null; then
    PY_VER="$("$cmd" --version 2>&1)"
    if [[ "$PY_VER" == *"3."* ]]; then
      PY_CMD="$cmd"
      break
    fi
  fi
done

if [[ "$INSTALL_PYTHON" == false ]]; then
  skip "Python 3 (desactive via --no-python)"
elif [[ -n "$PY_CMD" ]]; then
  ok "Python deja installe: $($PY_CMD --version) ($PY_CMD)"
else
  info "Installation de Python 3..."
  case "$PKG" in
    brew) brew install python@3.10 ; PY_CMD="python3.10" ;;
    apt)  sudo apt-get update && sudo apt-get install -y python3 python3-pip python3-venv ; PY_CMD="python3" ;;
    dnf)  sudo dnf install -y python3 python3-pip ; PY_CMD="python3" ;;
  esac
  ok "Python installe: $($PY_CMD --version)"
fi
echo ""

# ─── 3. Jupyter Lab ───

echo -e "${CYAN}━━━ 3/4 Jupyter Lab ━━━${NC}"
if [[ "$INSTALL_JUPYTER" == false ]]; then
  skip "Jupyter Lab (desactive via --no-jupyter)"
elif [[ -z "$PY_CMD" ]]; then
  warn "Python non disponible, impossible d'installer Jupyter Lab"
elif command -v jupyter &>/dev/null && jupyter --version 2>&1 | grep -q "jupyterlab"; then
  JLAB_VER="$(jupyter lab --version 2>/dev/null || echo 'inconnu')"
  ok "Jupyter Lab deja installe: $JLAB_VER"
else
  info "Installation de Jupyter Lab via pip..."
  "$PY_CMD" -m pip install --user jupyterlab
  ok "Jupyter Lab installe"
fi
echo ""

# ─── 4. IPFS Kubo ───

echo -e "${CYAN}━━━ 4/4 IPFS Kubo ━━━${NC}"
if [[ "$INSTALL_IPFS" == false ]]; then
  skip "IPFS Kubo (desactive via --no-ipfs)"
elif command -v ipfs &>/dev/null; then
  IPFS_VER="$(ipfs --version)"
  ok "IPFS deja installe: $IPFS_VER"
else
  info "Installation de IPFS Kubo $KUBO_VERSION..."

  case "$OS" in
    Darwin)
      case "$ARCH" in
        arm64)  KUBO_ARCH="darwin-arm64" ;;
        x86_64) KUBO_ARCH="darwin-amd64" ;;
        *)      err "Architecture non supportee: $ARCH"; exit 1 ;;
      esac
      ;;
    Linux)
      case "$ARCH" in
        aarch64) KUBO_ARCH="linux-arm64" ;;
        x86_64)  KUBO_ARCH="linux-amd64" ;;
        armv7l)  KUBO_ARCH="linux-arm" ;;
        *)       err "Architecture non supportee: $ARCH"; exit 1 ;;
      esac
      ;;
  esac

  KUBO_TAR="kubo_${KUBO_VERSION}_${KUBO_ARCH}.tar.gz"
  KUBO_URL="https://dist.ipfs.tech/kubo/${KUBO_VERSION}/${KUBO_TAR}"

  TMPDIR="$(mktemp -d)"
  info "Telechargement depuis $KUBO_URL"
  curl -fsSL "$KUBO_URL" -o "$TMPDIR/$KUBO_TAR"
  tar -xzf "$TMPDIR/$KUBO_TAR" -C "$TMPDIR"

  info "Installation du binaire ipfs..."
  if [[ -w /usr/local/bin ]]; then
    cp "$TMPDIR/kubo/ipfs" /usr/local/bin/ipfs
  else
    sudo cp "$TMPDIR/kubo/ipfs" /usr/local/bin/ipfs
  fi
  rm -rf "$TMPDIR"
  ok "IPFS installe: $(ipfs --version)"
fi
echo ""

# ─── Resume ───

echo -e "${GREEN}━━━ Installation terminee ━━━${NC}"
echo ""
echo "  Node.js  : $(node --version 2>/dev/null || echo 'non installe')"
echo "  Python   : $(${PY_CMD:-python3} --version 2>/dev/null || echo 'non installe')"
echo "  Jupyter  : $(jupyter lab --version 2>/dev/null || echo 'non installe')"
echo "  IPFS     : $(ipfs --version 2>/dev/null || echo 'non installe')"
echo ""
info "Prochaine etape : npm install && npm run build:all && npm start"
