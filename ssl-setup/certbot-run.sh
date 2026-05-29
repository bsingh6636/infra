#!/usr/bin/env bash
# certbot-run.sh
# Issue or renew TLS certificates derived from config/stack.yaml (single source of truth).
# Supports two modes:
#   Default (per-hostname): one cert per individual hostname, failures isolated.
#   Grouped (--grouped):   one cert per root domain covering all its subdomains.
#
# Usage:
#   sudo bash ssl-setup/certbot-run.sh                          # all hostnames, one cert each
#   sudo bash ssl-setup/certbot-run.sh --grouped                # one cert per root domain
#   sudo bash ssl-setup/certbot-run.sh --domain subsnepal.com   # single hostname or root
#   sudo bash ssl-setup/certbot-run.sh --renew                  # renew certs expiring < 120 days
#   sudo bash ssl-setup/certbot-run.sh --force-all              # force re-issue everything
#   sudo bash ssl-setup/certbot-run.sh --dry-run                # simulate, nothing issued
#
# Requirements (installed automatically if missing):
#   certbot, python3-certbot-dns-cloudflare
#
# CLOUDFLARE_API_TOKEN must be in the project root .env file or environment.
#
set -euo pipefail

# ── Paths ───────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
STACK_YAML="${REPO_ROOT}/config/stack.yaml"
ENV_FILE="${REPO_ROOT}/.env"

# ── Config ───────────────────────────────────────────────────────────────────
EMAIL="bkushwaha.dev@gmail.com"
CF_CRED_FILE="/etc/letsencrypt/cloudflare.ini"
INFRA_COMPOSE="/opt/brijesh-infra/current/compose.yaml"
INFRA_PROJECT="brijesh-infra"

# ── Argument parsing ─────────────────────────────────────────────────────────
SINGLE_DOMAIN=""
FORCE_RENEW=false
FORCE_ALL=false
DRY_RUN=false
GROUPED=false
SKIP_DAYS=120   # skip if cert has more than this many days left

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      SINGLE_DOMAIN="${2:-}"
      if [[ -z "${SINGLE_DOMAIN}" ]]; then
        echo "[error] --domain requires a value" >&2; exit 1
      fi
      shift 2
      ;;
    --renew)
      FORCE_RENEW=true
      shift
      ;;
    --force-all)
      FORCE_ALL=true
      FORCE_RENEW=true
      shift
      ;;
    --grouped)
      GROUPED=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-days)
      SKIP_DAYS="${2:-120}"
      shift 2
      ;;
    *)
      echo "[error] Unknown argument: $1" >&2; exit 1
      ;;
  esac
done

# ── Colour helpers ───────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[ok]${NC}  $*"; }
fail() { echo -e "${RED}[fail]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC} $*"; }

# ── Root check ───────────────────────────────────────────────────────────────
if [[ "${EUID}" -ne 0 ]]; then
  echo "[error] This script must be run as root (sudo)." >&2
  exit 1
fi

# ── Load Cloudflare token ────────────────────────────────────────────────────
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]] && [[ -f "${ENV_FILE}" ]]; then
  CLOUDFLARE_API_TOKEN="$(grep -E '^CLOUDFLARE_API_TOKEN=' "${ENV_FILE}" \
    | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)"
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "[error] CLOUDFLARE_API_TOKEN not set. Add it to ${ENV_FILE} or export it." >&2
  exit 1
fi

export CLOUDFLARE_API_TOKEN

# ── Install certbot + cloudflare plugin if needed ────────────────────────────
ensure_certbot() {
  if ! command -v certbot &>/dev/null; then
    info "Installing certbot..."
    apt-get install -y certbot
  fi

  if ! python3 -c "import certbot_dns_cloudflare" &>/dev/null 2>&1; then
    info "Installing certbot-dns-cloudflare plugin..."
    apt-get install -y python3-certbot-dns-cloudflare 2>/dev/null \
      || pip3 install certbot-dns-cloudflare
  fi
}

# ── Write Cloudflare credentials ─────────────────────────────────────────────
setup_cf_credentials() {
  mkdir -p /etc/letsencrypt
  printf 'dns_cloudflare_api_token = %s\n' "${CLOUDFLARE_API_TOKEN}" > "${CF_CRED_FILE}"
  chmod 600 "${CF_CRED_FILE}"
}

# ── Node.js helper: correctly parse stack.yaml (handles all YAML structure) ──
# All domain queries go through Node to avoid brittle grep/awk YAML parsing.
_node_stack() {
  node --input-type=module <<EOF
import { readFileSync } from 'fs';
import { parse } from '${REPO_ROOT}/node_modules/yaml/dist/index.js';
const raw = parse(readFileSync('${STACK_YAML}', 'utf8'));
${1}
EOF
}

# ── Read all hostnames from stack.yaml ───────────────────────────────────────
read_stack_domains() {
  if [[ ! -f "${STACK_YAML}" ]]; then
    echo "[error] stack.yaml not found: ${STACK_YAML}" >&2; exit 1
  fi
  _node_stack '
const hosts = (raw.ingress ?? []).flatMap(e => (e.hosts ?? []).map(h => h.name)).filter(Boolean);
const unique = [...new Set(hosts)].sort();
process.stdout.write(unique.join("\n") + "\n");
'
}

# ── Read root domains from tls.root_domains in stack.yaml ────────────────────
read_root_domains() {
  if [[ ! -f "${STACK_YAML}" ]]; then
    echo "[error] stack.yaml not found: ${STACK_YAML}" >&2; exit 1
  fi
  _node_stack '
const roots = Object.keys(raw.tls?.root_domains ?? {}).sort();
process.stdout.write(roots.join("\n") + "\n");
'
}

# ── Get cert_name for a root domain ──────────────────────────────────────────
get_cert_name_for_root() {
  local root_domain="$1"
  _node_stack "
const cfg = raw.tls?.root_domains?.['${root_domain}'] ?? {};
process.stdout.write((cfg.cert_name ?? '${root_domain}') + '\n');
"
}

# ── Get all hostnames belonging to a root domain ──────────────────────────────
get_hosts_for_root() {
  local root_domain="$1"
  _node_stack "
const all = (raw.ingress ?? []).flatMap(e => (e.hosts ?? []).map(h => h.name)).filter(Boolean);
const matched = [...new Set(all)].filter(h => h === '${root_domain}' || h.endsWith('.${root_domain}')).sort();
if (matched.length > 0) process.stdout.write(matched.join('\n') + '\n');
"
}

# ── Find the cert file for a domain (looks in /etc/letsencrypt/live/<domain>/) ──
find_cert_file() {
  local domain="$1"
  local cert_path="/etc/letsencrypt/live/${domain}/cert.pem"
  if [[ -f "${cert_path}" ]]; then
    echo "${cert_path}"
    return 0
  fi
  while IFS= read -r -d '' cert; do
    if openssl x509 -in "${cert}" -noout -text 2>/dev/null | grep -qi "DNS:${domain}"; then
      echo "${cert}"
      return 0
    fi
  done < <(find /etc/letsencrypt/live -name 'cert.pem' -print0 2>/dev/null)
  return 1
}

# ── Return days remaining on cert (-1 if not found) ─────────────────────────
cert_days_remaining() {
  local domain="$1"
  local cert_path
  if ! cert_path="$(find_cert_file "${domain}")"; then
    echo -1
    return 0
  fi
  local end_date
  end_date="$(openssl x509 -in "${cert_path}" -noout -enddate 2>/dev/null \
    | cut -d= -f2)"
  if [[ -z "${end_date}" ]]; then
    echo -1
    return 0
  fi
  local end_epoch now_epoch
  end_epoch="$(date -d "${end_date}" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "${end_date}" +%s 2>/dev/null || echo 0)"
  now_epoch="$(date +%s)"
  echo $(( (end_epoch - now_epoch) / 86400 ))
}

# ── Issue or renew cert — cert_name is the folder name, domains is an array ──
run_certbot() {
  local cert_name="$1"
  shift
  local domain_args=()
  for d in "$@"; do domain_args+=("-d" "${d}"); done

  local extra_flags=()
  if [[ "${FORCE_RENEW}" == "true" ]]; then extra_flags+=("--force-renewal"); fi
  if [[ "${DRY_RUN}" == "true" ]]; then extra_flags+=("--dry-run"); fi

  certbot certonly \
    --dns-cloudflare \
    --dns-cloudflare-credentials "${CF_CRED_FILE}" \
    --dns-cloudflare-propagation-seconds 30 \
    --non-interactive \
    --agree-tos \
    --email "${EMAIL}" \
    --cert-name "${cert_name}" \
    --expand \
    "${domain_args[@]}" \
    "${extra_flags[@]}" \
    2>&1
}

# ── Reload nginx inside running container ─────────────────────────────────────
reload_nginx() {
  if [[ -f "${INFRA_COMPOSE}" ]]; then
    docker compose -p "${INFRA_PROJECT}" -f "${INFRA_COMPOSE}" \
      exec edge nginx -s reload 2>/dev/null || true
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────
ensure_certbot
setup_cf_credentials

if [[ "${DRY_RUN}" == "true" ]]; then warn "DRY-RUN mode — no certs will be issued."; fi
if [[ "${FORCE_ALL}" == "true" ]]; then warn "FORCE-ALL mode — all certs re-issued regardless of expiry."
elif [[ "${FORCE_RENEW}" == "true" ]]; then warn "FORCE-RENEW mode — expiring certs will be re-issued."; fi
info "Skip threshold: ${SKIP_DAYS} days (use --skip-days N to change)"
echo ""

SUCCEEDED=()
FAILED=()
SKIPPED=()   # "label:days" pairs

# ── Helper: process one cert unit (cert_name + list of domains) ──────────────
process_cert() {
  local cert_name="$1"
  local label="$1"
  shift
  local domains=("$@")

  echo "────────────────────────────────────────"
  info "Cert: ${cert_name}  (${#domains[@]} domain(s): ${domains[*]})"

  # Check days remaining on cert_name folder (primary domain)
  if [[ "${FORCE_RENEW}" == "false" && "${DRY_RUN}" == "false" ]]; then
    days="$(cert_days_remaining "${cert_name}")"
    if [[ "${days}" -gt "${SKIP_DAYS}" ]]; then
      warn "Skipping — cert valid for ${days} more days. Use --renew or --force-all to override."
      SKIPPED+=("${label}:${days}")
      return
    elif [[ "${days}" -ge 0 ]]; then
      info "Cert expires in ${days} days — renewing."
    else
      info "No existing cert found — issuing."
    fi
  fi

  set +e
  output="$(run_certbot "${cert_name}" "${domains[@]}" 2>&1)"
  exit_code=$?
  set -e

  if [[ ${exit_code} -eq 0 ]]; then
    ok "Issued/renewed: ${cert_name}"
    SUCCEEDED+=("${label}")
  else
    fail "Failed: ${cert_name}"
    echo "${output}" | tail -10
    FAILED+=("${label}")
  fi
  echo ""
}

# ── Grouped mode: one cert per root domain ────────────────────────────────────
if [[ "${GROUPED}" == "true" && -z "${SINGLE_DOMAIN}" ]]; then
  mapfile -t ROOT_DOMAINS < <(read_root_domains)

  if [[ "${#ROOT_DOMAINS[@]}" -eq 0 ]]; then
    echo "[error] No root domains found in tls.root_domains in stack.yaml." >&2; exit 1
  fi

  info "Grouped mode — ${#ROOT_DOMAINS[@]} root domain(s): ${ROOT_DOMAINS[*]}"
  echo ""

  for root in "${ROOT_DOMAINS[@]}"; do
    cert_name="$(get_cert_name_for_root "${root}")"
    mapfile -t hosts < <(get_hosts_for_root "${root}")

    if [[ "${#hosts[@]}" -eq 0 ]]; then
      warn "No hostnames found for root domain ${root} — skipping."
      continue
    fi

    process_cert "${cert_name}" "${hosts[@]}"
  done

# ── Single domain mode ────────────────────────────────────────────────────────
elif [[ -n "${SINGLE_DOMAIN}" ]]; then
  info "Single domain mode: ${SINGLE_DOMAIN}"
  echo ""
  process_cert "${SINGLE_DOMAIN}" "${SINGLE_DOMAIN}"

# ── Default mode: one cert per hostname ───────────────────────────────────────
else
  mapfile -t DOMAINS < <(read_stack_domains)

  if [[ "${#DOMAINS[@]}" -eq 0 ]]; then
    echo "[error] No domains found in stack.yaml." >&2; exit 1
  fi

  info "Per-hostname mode — ${#DOMAINS[@]} domain(s)"
  echo ""

  for domain in "${DOMAINS[@]}"; do
    process_cert "${domain}" "${domain}"
  done
fi

# ── Reload nginx if any succeeded ────────────────────────────────────────────
if [[ "${#SUCCEEDED[@]}" -gt 0 && "${DRY_RUN}" == "false" ]]; then
  info "Reloading nginx..."
  reload_nginx
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  SSL Certificate Summary"
echo "════════════════════════════════════════"

if [[ "${#SUCCEEDED[@]}" -gt 0 ]]; then
  echo -e "${GREEN}  Succeeded (${#SUCCEEDED[@]}):${NC}"
  for d in "${SUCCEEDED[@]}"; do echo "    ✓ ${d}"; done
fi

if [[ "${#SKIPPED[@]}" -gt 0 ]]; then
  echo -e "${YELLOW}  Skipped — cert valid > ${SKIP_DAYS} days (${#SKIPPED[@]}):${NC}"
  for entry in "${SKIPPED[@]}"; do
    d="${entry%%:*}"
    days_left="${entry##*:}"
    echo "    - ${d}  (${days_left} days remaining)"
  done
fi

if [[ "${#FAILED[@]}" -gt 0 ]]; then
  echo -e "${RED}  Failed (${#FAILED[@]}):${NC}"
  for d in "${FAILED[@]}"; do echo "    ✗ ${d}"; done
  echo ""
  echo -e "${RED}  Action: fix DNS or Cloudflare token, then re-run:${NC}"
  for d in "${FAILED[@]}"; do
    echo "    sudo bash ssl-setup/certbot-run.sh --domain ${d}"
  done
fi

echo "════════════════════════════════════════"

# Exit non-zero if any failed
if [[ "${#FAILED[@]}" -gt 0 ]]; then
  exit 1
fi
