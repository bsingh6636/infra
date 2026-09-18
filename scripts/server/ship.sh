#!/usr/bin/env bash
# ship.sh
# One command: publish a fresh production release locally, then push + deploy it
# to the server. Combines `release:publish:prod` and `push-release.sh` so you
# don't have to copy the auto-generated release id between the two steps.
#
# Usage:
#   ./scripts/server/ship.sh [server]
#
# Examples:
#   ./scripts/server/ship.sh            # new release → deploy to `aws` (ssh alias)
#   ./scripts/server/ship.sh aws
#   ./scripts/server/ship.sh ubuntu@1.2.3.4
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER="${1:-aws}"

# Generate the release id up front (UTC, matching scripts/lib/release-id.mjs)
# so publish and push operate on the exact same id.
RELEASE_ID="$(date -u +%Y%m%d-%H%M%S)"

echo "[ship] Release id: ${RELEASE_ID}"
echo "[ship] Server:     ${SERVER}"

echo "[ship] 1/2 Publishing production release locally..."
( cd "${REPO_ROOT}" && npm run release:publish:prod -- --release "${RELEASE_ID}" )

echo "[ship] 2/2 Pushing + deploying to ${SERVER}..."
bash "${REPO_ROOT}/scripts/server/push-release.sh" "${RELEASE_ID}" "${SERVER}"

echo "[ship] Done. ${RELEASE_ID} is live on ${SERVER}."
