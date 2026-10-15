#!/usr/bin/env bash
# manage-municipal.sh
# Manage municipal backend containers (restart individual or group, check status, view logs).
# Can be run directly on the production server OR locally via SSH.
#
# Usage:
#   ./scripts/server/manage-municipal.sh restart [all | <service-name>]
#   ./scripts/server/manage-municipal.sh status
#   ./scripts/server/manage-municipal.sh logs [<service-name>]
#
# Examples:
#   ./scripts/server/manage-municipal.sh restart               # Restarts all municipal containers
#   ./scripts/server/manage-municipal.sh restart ratnagar      # Restarts ratnagar-municipal only
#   ./scripts/server/manage-municipal.sh status                # Shows status of all municipal containers
#   ./scripts/server/manage-municipal.sh logs devghat          # Views logs for devghat-municipal
#
set -euo pipefail

ACTION="${1:-restart}"
TARGET="${2:-all}"

MUNICIPAL_SERVICES=(
  "municipal-api"
  "siranchowk-municipal"
  "ratnagar-municipal"
  "madhyabindu-municipal"
  "devghat-municipal"
)

# Normalize short name to full service name
normalize_service() {
  local input="$1"
  case "$input" in
    all|"")
      echo "all"
      ;;
    municipal|municipal-api|dharche)
      echo "municipal-api"
      ;;
    siranchowk|siranchowk-municipal)
      echo "siranchowk-municipal"
      ;;
    ratnagar|ratnagar-municipal)
      echo "ratnagar-municipal"
      ;;
    madhyabindu|madhyabindu-municipal)
      echo "madhyabindu-municipal"
      ;;
    devghat|devghat-municipal)
      echo "devghat-municipal"
      ;;
    *)
      echo "$input"
      ;;
  esac
}

RESOLVED_TARGET="$(normalize_service "${TARGET}")"

# normalize_service passes unknown names through verbatim, and the remote branch
# below interpolates this into a shell string run over SSH. Reject anything that
# is not a plain service name.
if [[ "${RESOLVED_TARGET}" != "all" && ! "${RESOLVED_TARGET}" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
  echo "[error] Invalid service name: ${RESOLVED_TARGET}" >&2
  exit 1
fi

# Check if running directly on the production server
if [[ -d "/opt/brijesh-infra/releases" && -f "/opt/brijesh-infra/current/compose.yaml" ]]; then
  PROJECT_NAME="brijesh-infra"
  COMPOSE_FILE="/opt/brijesh-infra/current/compose.yaml"

  case "${ACTION}" in
    restart)
      if [[ "${RESOLVED_TARGET}" == "all" ]]; then
        echo "[municipal] Restarting all municipal services: ${MUNICIPAL_SERVICES[*]}..."
        docker compose -p "${PROJECT_NAME}" -f "${COMPOSE_FILE}" restart "${MUNICIPAL_SERVICES[@]}"
      else
        echo "[municipal] Restarting single municipal service: ${RESOLVED_TARGET}..."
        docker compose -p "${PROJECT_NAME}" -f "${COMPOSE_FILE}" restart "${RESOLVED_TARGET}"
      fi
      echo "[municipal] Restart complete."
      ;;
    status)
      echo "[municipal] Status of municipal containers:"
      docker compose -p "${PROJECT_NAME}" -f "${COMPOSE_FILE}" ps "${MUNICIPAL_SERVICES[@]}"
      ;;
    logs)
      if [[ "${RESOLVED_TARGET}" == "all" ]]; then
        docker compose -p "${PROJECT_NAME}" -f "${COMPOSE_FILE}" logs -f --tail=100 "${MUNICIPAL_SERVICES[@]}"
      else
        docker compose -p "${PROJECT_NAME}" -f "${COMPOSE_FILE}" logs -f --tail=100 "${RESOLVED_TARGET}"
      fi
      ;;
    *)
      echo "Usage: $0 {restart|status|logs} [all|<service>]" >&2
      exit 1
      ;;
  esac
  exit 0
fi

# Otherwise, running from local machine — delegate to remote server via SSH
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
SERVER="${SERVER:-}"

if [[ -z "${SERVER}" ]] && [[ -f "${ENV_FILE}" ]]; then
  SERVER="$(grep -E '^SERVER=' "${ENV_FILE}" | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)"
fi

if [[ -z "${SERVER}" ]]; then
  SERVER="aws"
fi

echo "[municipal] Running on remote server ${SERVER}: ${ACTION} ${RESOLVED_TARGET}"
case "${ACTION}" in
  restart)
    if [[ "${RESOLVED_TARGET}" == "all" ]]; then
      ssh "${SERVER}" "docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml restart ${MUNICIPAL_SERVICES[*]}"
    else
      ssh "${SERVER}" "docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml restart ${RESOLVED_TARGET}"
    fi
    ;;
  status)
    ssh "${SERVER}" "docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml ps ${MUNICIPAL_SERVICES[*]}"
    ;;
  logs)
    if [[ "${RESOLVED_TARGET}" == "all" ]]; then
      ssh "${SERVER}" "docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml logs -f --tail=100 ${MUNICIPAL_SERVICES[*]}"
    else
      ssh "${SERVER}" "docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml logs -f --tail=100 ${RESOLVED_TARGET}"
    fi
    ;;
  *)
    echo "Usage: $0 {restart|status|logs} [all|<service>]" >&2
    exit 1
    ;;
esac
