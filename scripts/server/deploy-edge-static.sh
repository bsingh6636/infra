#!/usr/bin/env bash
# deploy-edge-static.sh
# Build a single edge-static frontend service from latest git and redeploy only that service to the server.
#
# Usage:
#   ./scripts/server/deploy-edge-static.sh <service-name> [server]
#   npm run deploy:edge-static -- <service-name>
#
# Examples:
#   ./scripts/server/deploy-edge-static.sh municipal-admin
#   ./scripts/server/deploy-edge-static.sh portfolio-web
#
set -euo pipefail

SERVICE="${1:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

if [[ -z "${SERVICE}" ]]; then
  echo "[error] Usage: $0 <service-name> [server]" >&2
  echo "Available edge-static services: municipal-admin, portfolio-web, ranju-web, cors-web, sahayog-web, stylework-web, codify-web" >&2
  exit 1
fi

if [[ ! "${SERVICE}" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
  echo "[error] Invalid service name: ${SERVICE}" >&2
  exit 1
fi

SERVER="${2:-${SERVER:-}}"
if [[ -z "${SERVER}" ]] && [[ -f "${ENV_FILE}" ]]; then
  SERVER="$(grep -E '^SERVER=' "${ENV_FILE}" | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)"
fi

if [[ -z "${SERVER}" ]]; then
  SERVER="aws"
fi

echo "[edge-static] 1/3 Building ${SERVICE} locally from latest source..."
node "${REPO_ROOT}/scripts/build/index.mjs" --edge-static --service "${SERVICE}"

BUILD_DIR="${REPO_ROOT}/generated/edge-static/${SERVICE}"
if [[ ! -d "${BUILD_DIR}" ]]; then
  echo "[error] Build output directory not found: ${BUILD_DIR}" >&2
  exit 1
fi

TARBALL="$(mktemp "${TMPDIR:-/tmp}/${SERVICE}-static.XXXXXX")"
trap 'rm -f "${TARBALL}"' EXIT
REMOTE_TARBALL="/tmp/$(basename "${TARBALL}")"
echo "[edge-static] 2/3 Packaging and syncing to ${SERVER}..."
COPYFILE_DISABLE=1 tar --no-xattrs -czf "${TARBALL}" -C "${BUILD_DIR}" .

scp -O -4 "${TARBALL}" "${SERVER}:${REMOTE_TARBALL}"
ssh -4 "${SERVER}" "sudo bash -s -- '${SERVICE}' '${REMOTE_TARBALL}'" <<'REMOTE'
set -euo pipefail

SERVICE="$1"
TARBALL="$2"
STAGING_DIR=""
ACTIVATED=false

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "${status}" -ne 0 && -n "${STAGING_DIR}" ]]; then
    if [[ -e "${STAGING_DIR}/previous" || -L "${STAGING_DIR}/previous" ]]; then
      rm -rf -- "${LIVE_DIR}"
      mv -- "${STAGING_DIR}/previous" "${LIVE_DIR}"
    elif [[ "${ACTIVATED}" == true ]]; then
      rm -rf -- "${LIVE_DIR}"
    fi
  fi
  if [[ -n "${STAGING_DIR}" ]]; then
    rm -rf -- "${STAGING_DIR}"
  fi
  rm -f -- "${TARBALL}"
  exit "${status}"
}
trap cleanup EXIT

RELEASE_DIR="$(readlink -f /opt/brijesh-infra/current)"
STATIC_ROOT="${RELEASE_DIR}/edge-static"
LIVE_DIR="${STATIC_ROOT}/${SERVICE}"
test -f "${RELEASE_DIR}/compose.yaml"
mkdir -p "${STATIC_ROOT}"
STAGING_DIR="$(mktemp -d "${STATIC_ROOT}/.${SERVICE}.XXXXXX")"
mkdir -m 755 "${STAGING_DIR}/site"
tar -xzf "${TARBALL}" -C "${STAGING_DIR}/site"
test -f "${STAGING_DIR}/site/index.html"

if [[ -e "${LIVE_DIR}" || -L "${LIVE_DIR}" ]]; then
  mv -- "${LIVE_DIR}" "${STAGING_DIR}/previous"
fi
mv -- "${STAGING_DIR}/site" "${LIVE_DIR}"
ACTIVATED=true

echo "[edge-static] 3/3 Reloading Nginx edge proxy..."
docker compose -p brijesh-infra -f "${RELEASE_DIR}/compose.yaml" exec -T edge nginx -s reload
REMOTE

echo "[edge-static] Successfully deployed ${SERVICE} to ${SERVER}."
