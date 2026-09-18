#!/usr/bin/env bash
# ensure-fallback-cert.sh
# Creates a self-signed fallback certificate and symlinks any missing cert
# paths to it so nginx can always start even when a real cert hasn't been
# issued yet.  Run this BEFORE `docker compose up` on the server.
#
# Usage:
#   sudo bash ssl-setup/ensure-fallback-cert.sh
#
# What it does:
#   1. Creates /etc/letsencrypt/fallback/{fullchain,privkey}.pem (self-signed)
#   2. For each cert_name in config/stack.yaml tls.root_domains:
#      - If the real cert already exists → leaves it alone (no overwrite)
#      - If missing → creates the directory and symlinks to the fallback cert
#
# Result:
#   - nginx starts regardless of which certs are missing
#   - Domains with real certs work normally
#   - Domains with missing certs get a browser SSL warning (self-signed) but
#     nginx and all other domains keep running
#   - Run certbot-run.sh afterwards to replace fallback symlinks with real certs
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
STACK_YAML="${REPO_ROOT}/config/stack.yaml"

FALLBACK_DIR="/etc/letsencrypt/fallback"
LIVE_DIR="/etc/letsencrypt/live"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[ok]${NC}  $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC} $*"; }

if [[ "${EUID}" -ne 0 ]]; then
  echo "[error] Run as root: sudo bash ssl-setup/ensure-fallback-cert.sh" >&2
  exit 1
fi

# ── Step 1: Generate fallback self-signed cert ────────────────────────────────
mkdir -p "${FALLBACK_DIR}"

if [[ ! -f "${FALLBACK_DIR}/fullchain.pem" ]]; then
  info "Creating self-signed fallback certificate..."
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "${FALLBACK_DIR}/privkey.pem" \
    -out    "${FALLBACK_DIR}/fullchain.pem" \
    -subj   "/CN=fallback-placeholder" \
    2>/dev/null
  ok "Fallback cert created at ${FALLBACK_DIR}/"
else
  ok "Fallback cert already exists at ${FALLBACK_DIR}/"
fi

# ── Step 2: Read cert names from stack.yaml ───────────────────────────────────
if [[ ! -f "${STACK_YAML}" ]]; then
  echo "[error] stack.yaml not found: ${STACK_YAML}" >&2
  exit 1
fi

mapfile -t CERT_NAMES < <(node --input-type=module <<EOF
import { readFileSync } from 'fs';
import { parse } from '${REPO_ROOT}/node_modules/yaml/dist/index.js';
const raw = parse(readFileSync('${STACK_YAML}', 'utf8'));
const roots = Object.entries(raw.tls?.root_domains ?? {});
const names = roots.map(([domain, cfg]) => cfg.cert_name ?? domain);
process.stdout.write(names.join('\n') + '\n');
EOF
)

if [[ "${#CERT_NAMES[@]}" -eq 0 ]]; then
  echo "[error] No tls.root_domains found in stack.yaml" >&2
  exit 1
fi

info "Found ${#CERT_NAMES[@]} cert(s) in stack.yaml: ${CERT_NAMES[*]}"
echo ""

# ── Step 3: Ensure each cert path exists (real or fallback symlink) ───────────
USED_FALLBACK=()
REAL_CERTS=()

for cert_name in "${CERT_NAMES[@]}"; do
  cert_dir="${LIVE_DIR}/${cert_name}"
  fullchain="${cert_dir}/fullchain.pem"
  privkey="${cert_dir}/privkey.pem"

  # Certbot stores certs as symlinks pointing to /etc/letsencrypt/archive/.
  # Using `! -L` to detect "real" certs is WRONG — certbot always uses symlinks.
  # Instead, resolve the absolute target and check it doesn't point to our fallback.
  if [[ -f "${fullchain}" ]]; then
    resolved="$(readlink -f "${fullchain}" 2>/dev/null || true)"
    if [[ -n "${resolved}" && "${resolved}" != "${FALLBACK_DIR}"* ]]; then
      ok "Real cert exists: ${cert_name}  (→ ${resolved##*/etc/letsencrypt/})"
      REAL_CERTS+=("${cert_name}")
      continue
    fi
    # Resolves to fallback — fall through to re-link (idempotent)
    warn "Fallback already in place: ${cert_name}"
    USED_FALLBACK+=("${cert_name}")
    continue
  fi

  # fullchain.pem doesn't exist at all (broken symlink or missing dir)
  warn "Cert missing for ${cert_name} — linking fallback (nginx will warn in browser)"
  mkdir -p "${cert_dir}"
  ln -sf "${FALLBACK_DIR}/fullchain.pem" "${fullchain}"
  ln -sf "${FALLBACK_DIR}/privkey.pem"   "${privkey}"
  USED_FALLBACK+=("${cert_name}")
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  Fallback Cert Summary"
echo "════════════════════════════════════════"

if [[ "${#REAL_CERTS[@]}" -gt 0 ]]; then
  echo -e "${GREEN}  Real certs (${#REAL_CERTS[@]}):${NC}"
  for c in "${REAL_CERTS[@]}"; do echo "    ✓ ${c}"; done
fi

if [[ "${#USED_FALLBACK[@]}" -gt 0 ]]; then
  echo -e "${YELLOW}  Using fallback / self-signed (${#USED_FALLBACK[@]}):${NC}"
  for c in "${USED_FALLBACK[@]}"; do echo "    ⚠ ${c}  (run certbot-run.sh to replace)"; done
fi

echo "════════════════════════════════════════"
echo ""
echo "nginx can now start.  Domains with fallback certs will show a browser"
echo "SSL warning until real certs are issued with:"
echo "  sudo bash ssl-setup/certbot-run.sh --grouped"
echo ""
