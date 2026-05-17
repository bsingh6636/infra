#!/usr/bin/env bash
# deploy-on-server.sh
# Run this ON THE PRODUCTION SERVER to apply a release.
# Usage:
#   ./deploy-on-server.sh <release-id>
#
# Before the first run:
#   1. Copy the release tarball to the server:
#        scp generated/runtime-state/releases/<release-id>.tar.gz  user@server:/opt/brijesh-infra/incoming/
#   2. SSH into the server and run this script.
#
set -euo pipefail

RELEASE_ID="${1:-}"
INFRA_ROOT="/opt/brijesh-infra"
RELEASES_DIR="${INFRA_ROOT}/releases"
INCOMING_DIR="${INFRA_ROOT}/incoming"
CURRENT_LINK="${INFRA_ROOT}/current"
DATA_ROOT="${INFRA_ROOT}/data"
PROJECT_NAME="brijesh-infra"

if [[ -z "${RELEASE_ID}" ]]; then
  echo "[error] Usage: $0 <release-id>" >&2
  exit 1
fi

TARBALL="${INCOMING_DIR}/${RELEASE_ID}.tar.gz"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
COMPOSE_FILE="${RELEASE_DIR}/compose.yaml"

echo "[deploy] Release: ${RELEASE_ID}"

# ── Bootstrap directories ───────────────────────────────────────────────────
mkdir -p "${RELEASES_DIR}" "${INCOMING_DIR}" "${DATA_ROOT}/municipal/media"
chmod 775 "${DATA_ROOT}/municipal/media"

# ── Expand tarball ──────────────────────────────────────────────────────────
if [[ ! -d "${RELEASE_DIR}" ]]; then
  if [[ ! -f "${TARBALL}" ]]; then
    echo "[error] Tarball not found: ${TARBALL}" >&2
    exit 1
  fi

  echo "[deploy] Expanding ${TARBALL} → ${RELEASE_DIR}"
  mkdir -p "${RELEASE_DIR}"
  tar -xzf "${TARBALL}" -C "${RELEASE_DIR}" --strip-components=1
else
  echo "[deploy] Release directory already exists, skipping untar."
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "[error] compose.yaml not found in release: ${COMPOSE_FILE}" >&2
  exit 1
fi

# ── Bring up new stack (only restart changed containers) ───────────────────
if [[ -L "${CURRENT_LINK}" ]]; then
  PREV_RELEASE="$(basename "$(readlink -f "${CURRENT_LINK}")")"
  echo "[deploy] Previous release: ${PREV_RELEASE}"
fi

echo "[deploy] Starting release ${RELEASE_ID}..."
docker compose -p "${PROJECT_NAME}" -f "${COMPOSE_FILE}" up -d --build --remove-orphans --pull never

# ── Flip the current symlink ────────────────────────────────────────────────
RELATIVE_TARGET="releases/${RELEASE_ID}"
rm -f "${CURRENT_LINK}"
ln -s "${RELATIVE_TARGET}" "${CURRENT_LINK}"

echo "[deploy] Done. Current → ${CURRENT_LINK} → ${RELEASE_ID}"

# ── Cleanup incoming tarball ────────────────────────────────────────────────
rm -f "${TARBALL}"
echo "[deploy] Removed incoming tarball."
