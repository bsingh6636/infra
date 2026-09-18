#!/usr/bin/env bash
# rollback-on-server.sh
# Run ON THE SERVER to roll back to any previously deployed release.
# Usage:
#   ./rollback-on-server.sh <release-id>
#   ./rollback-on-server.sh          # auto-selects previous release
#
set -euo pipefail

INFRA_ROOT="/opt/brijesh-infra"
RELEASES_DIR="${INFRA_ROOT}/releases"
CURRENT_LINK="${INFRA_ROOT}/current"
PROJECT_NAME="brijesh-infra"

CURRENT_ID=""
if [[ -L "${CURRENT_LINK}" ]]; then
  CURRENT_ID="$(basename "$(readlink -f "${CURRENT_LINK}")")"
fi

TARGET_ID="${1:-}"

if [[ -z "${TARGET_ID}" ]]; then
  # Auto: pick the most-recent release that is not current
  TARGET_ID="$(ls -1 "${RELEASES_DIR}" | sort -r | grep -v "^${CURRENT_ID}$" | head -1 || true)"
fi

if [[ -z "${TARGET_ID}" ]]; then
  echo "[error] No rollback target found." >&2
  exit 1
fi

COMPOSE_FILE="${RELEASES_DIR}/${TARGET_ID}/compose.yaml"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "[error] Release ${TARGET_ID} has no compose.yaml at ${COMPOSE_FILE}" >&2
  exit 1
fi

echo "[rollback] Current: ${CURRENT_ID:-none}"
echo "[rollback] Target:  ${TARGET_ID}"

# ── Bring down current ──────────────────────────────────────────────────────
if [[ -n "${CURRENT_ID}" ]]; then
  PREV_COMPOSE="${RELEASES_DIR}/${CURRENT_ID}/compose.yaml"

  if [[ -f "${PREV_COMPOSE}" ]]; then
    echo "[rollback] Stopping current stack..."
    docker compose -p "${PROJECT_NAME}" -f "${PREV_COMPOSE}" down --remove-orphans || true
  fi
fi

# ── Bring up target ─────────────────────────────────────────────────────────
echo "[rollback] Starting ${TARGET_ID}..."
docker compose -p "${PROJECT_NAME}" -f "${COMPOSE_FILE}" up -d --remove-orphans --pull never

# ── Flip symlink ────────────────────────────────────────────────────────────
RELATIVE_TARGET="releases/${TARGET_ID}"
rm -f "${CURRENT_LINK}"
ln -s "${RELATIVE_TARGET}" "${CURRENT_LINK}"

echo "[rollback] Done. Current → ${TARGET_ID}"
