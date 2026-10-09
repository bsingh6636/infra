#!/usr/bin/env bash
# GitHub runner only; credentials are read from environment and never echoed.
set -euo pipefail
COMMIT="${1:?Expected portfolio commit SHA}"
SITE="${2:?Expected built site directory}"
MODE="${3:-deploy}"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]
[[ "$MODE" == deploy || "$MODE" == rollback ]]
: "${DEPLOY_HOST:?Missing DEPLOY_HOST}"
: "${DEPLOY_USER:?Missing DEPLOY_USER}"
: "${DEPLOY_SSH_KEY:?Missing DEPLOY_SSH_KEY}"
: "${DEPLOY_KNOWN_HOSTS:?Missing DEPLOY_KNOWN_HOSTS}"
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9.-]+$ && "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]
INFRA="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TASK_DIR="$(mktemp -d)"
REMOTE=''
cleanup() {
  local status=$?
  trap - EXIT
  # shellcheck disable=SC2029 # Validated path must expand on the runner.
  if [[ -n "$REMOTE" ]]; then ssh "${SSH_ARGS[@]}" "$SERVER" "rm -rf -- '$REMOTE'" || true; fi
  rm -rf -- "$TASK_DIR"
  exit "$status"
}
trap cleanup EXIT
umask 077
printf '%s\n' "$DEPLOY_SSH_KEY" > "$TASK_DIR/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$TASK_DIR/known_hosts"
unset DEPLOY_SSH_KEY DEPLOY_KNOWN_HOSTS
SSH_ARGS=(-i "$TASK_DIR/key" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$TASK_DIR/known_hosts" -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
SERVER="$DEPLOY_USER@$DEPLOY_HOST"
FILES=()
if [[ "$MODE" == deploy ]]; then
  printf '{"commit":"%s"}\n' "$COMMIT" > "$SITE/deployment.json"
  tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -I 'gzip -n' -cf "$TASK_DIR/site.tar.gz" -C "$SITE" .
  (cd "$TASK_DIR" && sha256sum site.tar.gz > site.tar.gz.sha256)
  FILES=("$TASK_DIR/site.tar.gz" "$TASK_DIR/site.tar.gz.sha256")
fi
node "$INFRA/scripts/ci/portfolio-config.mjs" > "$TASK_DIR/config.json"
REMOTE_CANDIDATE="$(ssh "${SSH_ARGS[@]}" "$SERVER" 'mktemp -d /opt/brijesh-infra/incoming/portfolio.XXXXXXXX')"
[[ "$REMOTE_CANDIDATE" =~ ^/opt/brijesh-infra/incoming/portfolio\.[A-Za-z0-9]+$ ]]
REMOTE="$REMOTE_CANDIDATE"
scp "${SSH_ARGS[@]}" "${FILES[@]}" "$TASK_DIR/config.json" "$INFRA/scripts/server/portfolio-on-server.sh" "$INFRA/scripts/server/portfolio-files.py" "$SERVER:$REMOTE/"
# shellcheck disable=SC2029 # All remote arguments are validated before expansion.
ssh "${SSH_ARGS[@]}" "$SERVER" "sudo -n bash '$REMOTE/portfolio-on-server.sh' '$MODE' '$COMMIT' '$REMOTE'"
# Public URL verifies DNS/CDN access as well as the server's direct-origin checks.
mapfile -t HOSTS < <(node -e 'console.log(require(process.argv[1]).hosts.join("\n"))' "$TASK_DIR/config.json")
for host in "${HOSTS[@]}"; do
  marker="$(curl --fail --silent --show-error --retry 3 --max-time 30 "https://$host/deployment.json?commit=$COMMIT")"
  node -e 'if(JSON.parse(process.argv[1]).commit!==process.argv[2]) process.exit(1)' "$marker" "$COMMIT"
done
