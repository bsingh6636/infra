#!/usr/bin/env bash
# push-release.sh
# Run from your LOCAL machine (Mac) to package and push a release to the server.
# Usage:
#   ./scripts/server/push-release.sh <release-id> <user@server-ip>
#
# Example:
#   ./scripts/server/push-release.sh 20260420-01 ubuntu@1.2.3.4
#
set -euo pipefail

RELEASE_ID="${1:-}"
SERVER="${2:-}"

if [[ -z "${RELEASE_ID}" || -z "${SERVER}" ]]; then
  echo "[error] Usage: $0 <release-id> <user@server-ip>" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_ROOT="${REPO_ROOT}/generated/runtime-state"
RELEASE_DIR="${STATE_ROOT}/releases/${RELEASE_ID}"
TARBALL="/tmp/${RELEASE_ID}.tar.gz"
REMOTE_INCOMING="/opt/brijesh-infra/incoming"
DEPLOY_SCRIPT="${REPO_ROOT}/scripts/server/deploy-on-server.sh"

if [[ ! -d "${RELEASE_DIR}" ]]; then
  echo "[error] Release not found locally: ${RELEASE_DIR}" >&2
  echo "        Run: npm run release:publish:prod -- --release ${RELEASE_ID}" >&2
  exit 1
fi

echo "[push] Packaging ${RELEASE_ID}..."
COPYFILE_DISABLE=1 tar -czf "${TARBALL}" -C "${RELEASE_DIR}" .

echo "[push] Uploading tarball to ${SERVER}:${REMOTE_INCOMING}/${RELEASE_ID}.tar.gz"
ssh "${SERVER}" "mkdir -p ${REMOTE_INCOMING}"
scp "${TARBALL}" "${SERVER}:${REMOTE_INCOMING}/${RELEASE_ID}.tar.gz"

echo "[push] Uploading deploy script..."
scp "${DEPLOY_SCRIPT}" "${SERVER}:/tmp/deploy-on-server.sh"
ssh "${SERVER}" "chmod +x /tmp/deploy-on-server.sh"

echo "[push] Running deploy on server..."
ssh "${SERVER}" "sudo /tmp/deploy-on-server.sh ${RELEASE_ID}"

rm -f "${TARBALL}"
echo "[push] Complete. Release ${RELEASE_ID} is live."
