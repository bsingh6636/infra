#!/usr/bin/env bash
# bootstrap-server.sh
# Run ONCE on a fresh VM to install all server-side dependencies and create
# the required directory structure for brijesh-infra.
#
# Supported: Ubuntu 22.04/24.04, Debian 12, Kali Linux (any Debian-based)
#
# Usage (as root or with sudo):
#   curl -fsSL https://raw.githubusercontent.com/.../bootstrap-server.sh | sudo bash
#   — OR —
#   scp scripts/server/bootstrap-server.sh user@server-ip:/tmp/
#   ssh user@server-ip "sudo bash /tmp/bootstrap-server.sh"
#
set -euo pipefail

INFRA_ROOT="/opt/brijesh-infra"
NODE_MAJOR=20

GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[ok]${NC}  $*"; }
info() { echo -e "${CYAN}[info]${NC} $*"; }

# ── Must be root ─────────────────────────────────────────────────────────────
if [[ "${EUID}" -ne 0 ]]; then
  echo "[error] Run as root: sudo bash $0" >&2; exit 1
fi

# ── System update ────────────────────────────────────────────────────────────
info "Updating apt package index..."
apt-get update -qq

info "Upgrading installed packages..."
apt-get upgrade -y -qq

# ── Core tools ───────────────────────────────────────────────────────────────
info "Installing core utilities..."
apt-get install -y -qq \
  curl wget git unzip tar ca-certificates gnupg lsb-release \
  software-properties-common apt-transport-https

# ── Docker ───────────────────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
  ok "Docker already installed: $(docker --version)"
else
  info "Installing Docker Engine..."

  # Determine correct distro for Docker's apt repo.
  # Kali/Debian use "debian"; Ubuntu uses "ubuntu". Both use VERSION_CODENAME.
  . /etc/os-release
  case "${ID}" in
    ubuntu) DOCKER_DISTRO="ubuntu" ;;
    *)      DOCKER_DISTRO="debian" ;;
  esac

  # For Kali, VERSION_CODENAME may be empty — fall back to "bookworm"
  DOCKER_CODENAME="${VERSION_CODENAME:-bookworm}"

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${DOCKER_DISTRO}/gpg" \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${DOCKER_DISTRO} ${DOCKER_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin

  systemctl enable --now docker
  ok "Docker installed: $(docker --version)"
fi

# ── Docker Compose (plugin check) ────────────────────────────────────────────
if docker compose version &>/dev/null; then
  ok "Docker Compose plugin: $(docker compose version)"
else
  echo "[error] docker compose plugin not found — check Docker install above" >&2
  exit 1
fi

# ── Node.js ──────────────────────────────────────────────────────────────────
if command -v node &>/dev/null; then
  INSTALLED_MAJOR="$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')"
  if [[ "${INSTALLED_MAJOR}" -ge "${NODE_MAJOR}" ]]; then
    ok "Node.js already installed: $(node --version)"
  else
    info "Node.js ${INSTALLED_MAJOR} found but need ${NODE_MAJOR}+, upgrading..."
    UPGRADE_NODE=true
  fi
else
  UPGRADE_NODE=true
fi

if [[ "${UPGRADE_NODE:-false}" == "true" ]]; then
  info "Installing Node.js ${NODE_MAJOR} via NodeSource..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
  ok "Node.js installed: $(node --version)"
fi

# ── Certbot + Cloudflare plugin ───────────────────────────────────────────────
if command -v certbot &>/dev/null; then
  ok "Certbot already installed: $(certbot --version 2>&1)"
else
  info "Installing certbot..."
  apt-get install -y -qq certbot || true
fi

if ! python3 -c "import certbot_dns_cloudflare" &>/dev/null 2>&1; then
  info "Installing certbot-dns-cloudflare plugin..."
  apt-get install -y -qq python3-certbot-dns-cloudflare 2>/dev/null \
    || pip3 install certbot-dns-cloudflare
fi
ok "Certbot: $(certbot --version 2>&1)"

# ── infra directory structure ────────────────────────────────────────────────
info "Creating ${INFRA_ROOT} directory structure..."
mkdir -p \
  "${INFRA_ROOT}/releases" \
  "${INFRA_ROOT}/incoming" \
  "${INFRA_ROOT}/data/municipal/media" \
  "${INFRA_ROOT}/ssl-setup" \
  "${INFRA_ROOT}/config"

chmod 775 "${INFRA_ROOT}/data/municipal/media"

ok "Directory structure ready under ${INFRA_ROOT}"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo " Bootstrap complete. Server is ready."
echo "═══════════════════════════════════════════════"
echo " Docker:   $(docker --version)"
echo " Compose:  $(docker compose version)"
echo " Node:     $(node --version)"
echo " Certbot:  $(certbot --version 2>&1)"
echo ""
echo " Next steps:"
echo "   1. Copy .env to ${INFRA_ROOT}/.env"
echo "   2. Copy ssl-setup/ and config/ to ${INFRA_ROOT}/"
echo "   3. Run: sudo bash ${INFRA_ROOT}/ssl-setup/certbot-run.sh --grouped"
echo "   4. Push your first release from local Mac:"
echo "      ./scripts/server/push-release.sh prod-YYYYMMDD-01 user@$(hostname -I | awk '{print $1}')"
echo "═══════════════════════════════════════════════"
