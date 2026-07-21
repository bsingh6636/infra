#!/usr/bin/env bash
# deploy.sh
# Package a published release and deploy it to the production server.
# Usage:
#   bash scripts/server/deploy.sh <release-id>
#   bash scripts/server/deploy.sh          # deploys the latest published release
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
RELEASES_DIR="${REPO_ROOT}/generated/runtime-state/releases"

# ── Load SERVER from .env ────────────────────────────────────────────────────
if [[ -z "${SERVER:-}" ]] && [[ -f "${ENV_FILE}" ]]; then
  SERVER="$(grep -E '^SERVER=' "${ENV_FILE}" | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)"
fi

if [[ -z "${SERVER:-}" ]]; then
  echo "[error] SERVER not set. Add SERVER=user@host to .env or export it." >&2
  exit 1
fi

# ── Resolve release ID ───────────────────────────────────────────────────────
RELEASE_ID="${1:-}"

if [[ -z "${RELEASE_ID}" ]]; then
  RELEASE_ID="$(ls -1 "${RELEASES_DIR}" | sort -r | head -1)"
  if [[ -z "${RELEASE_ID}" ]]; then
    echo "[error] No release found in ${RELEASES_DIR}. Run npm run release:publish:prod:registry first." >&2
    exit 1
  fi
  echo "[deploy] No release ID given — using latest: ${RELEASE_ID}"
fi

RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"

if [[ ! -d "${RELEASE_DIR}" ]]; then
  echo "[error] Release directory not found: ${RELEASE_DIR}" >&2
  exit 1
fi

TARBALL="/tmp/${RELEASE_ID}.tar.gz"

# ── Package ──────────────────────────────────────────────────────────────────
echo "[deploy] Packaging ${RELEASE_ID}..."
tar -czf "${TARBALL}" -C "${RELEASES_DIR}" "${RELEASE_ID}"
echo "[deploy] Packaged → ${TARBALL}"

# ── Transfer ─────────────────────────────────────────────────────────────────
echo "[deploy] Transferring to ${SERVER}..."
ssh "${SERVER}" "mkdir -p /opt/brijesh-infra/incoming"
scp "${TARBALL}" "${SERVER}:/opt/brijesh-infra/incoming/"
scp "${REPO_ROOT}/scripts/server/deploy-on-server.sh" "${SERVER}:/tmp/deploy-on-server.sh"
echo "[deploy] Transfer complete."

# ── Deploy on server ─────────────────────────────────────────────────────────
echo "[deploy] Deploying on server..."
ssh "${SERVER}" "sudo bash /tmp/deploy-on-server.sh ${RELEASE_ID}"

# ── Cleanup local tarball ────────────────────────────────────────────────────
rm -f "${TARBALL}"
echo "[deploy] Done. ${RELEASE_ID} is live on ${SERVER}."
