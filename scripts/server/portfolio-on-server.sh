#!/usr/bin/env bash
# Linux server only. Usage: script deploy|rollback <full-sha> <upload-directory>
set -euo pipefail
umask 022
MODE="${1:?Expected deploy or rollback}"
COMMIT="${2:?Expected full portfolio commit SHA}"
UPLOAD="${3:?Expected upload directory}"
[[ "$MODE" == deploy || "$MODE" == rollback ]]
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]
[[ "$UPLOAD" =~ ^/opt/brijesh-infra/incoming/portfolio\.[A-Za-z0-9]+$ ]]
HELPER="$UPLOAD/portfolio-files.py"
mkdir -p /opt/brijesh-infra/locks
exec 9>/opt/brijesh-infra/locks/deployment.lock
flock -w 600 9

mapfile -t HOSTS < <(python3 -c 'import json,sys; print("\n".join(json.load(open(sys.argv[1]))["hosts"]))' "$UPLOAD/config.json")
[[ "${#HOSTS[@]}" -gt 0 ]]
for host in "${HOSTS[@]}"; do [[ "$host" =~ ^[a-z0-9.-]+$ ]]; done
mapfile -t EDGES < <(docker ps -q --filter label=com.docker.compose.project=brijesh-infra --filter label=com.docker.compose.service=edge)
[[ "${#EDGES[@]}" -eq 1 ]] || { echo 'Expected exactly one running shared edge' >&2; exit 1; }
EDGE="${EDGES[0]}"
ROOT="$(docker inspect "$EDGE" | python3 -c 'import json,sys; mounts=json.load(sys.stdin)[0]["Mounts"]; print(next(m["Source"] for m in mounts if m["Destination"]=="/srv/edge-static" and m["Type"]=="bind"))')"
ROOT="$(realpath "$ROOT")"
[[ "$ROOT" == /opt/brijesh-infra/releases/*/edge-static ]] || { echo 'Unexpected edge-static mount; inspect before deploying' >&2; exit 1; }
[[ -d "$ROOT/portfolio-web" ]]
docker exec "$EDGE" nginx -t
docker exec "$EDGE" sh -c 'test -d /srv/edge-static/portfolio-web'
echo "[portfolio] Shared edge: $EDGE; mount: $ROOT; commit: $COMMIT"

probe() {
  local host="$1" path="$2"
  curl --fail --silent --show-error --max-time 15 --resolve "$host:443:127.0.0.1" "https://$host$path"
}
# Verify all portfolio hostnames before any changes. TLS verification stays enabled.
for host in "${HOSTS[@]}"; do probe "$host" / >/dev/null; done
RELEASE="$ROOT/.portfolio-releases/$COMMIT"
if [[ "$MODE" == deploy ]]; then
  (cd "$UPLOAD" && sha256sum -c site.tar.gz.sha256)
  if [[ -d "$RELEASE" ]]; then
    # Reruns must use the identical archive, rather than overwrite a SHA release.
    cmp "$UPLOAD/site.tar.gz.sha256" "$RELEASE/.archive.sha256"
  else
    python3 "$HELPER" extract "$UPLOAD/site.tar.gz" "$RELEASE" "$COMMIT"
    cp "$UPLOAD/site.tar.gz.sha256" "$RELEASE/.archive.sha256"
  fi
fi
[[ -f "$RELEASE/index.html" && -f "$RELEASE/deployment.json" ]]
python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["commit"] == sys.argv[2]' "$RELEASE/deployment.json" "$COMMIT"

PREVIOUS=''
restore_on_failure() {
  local status=$?
  trap - EXIT HUP INT TERM
  if [[ -n "$PREVIOUS" ]]; then
    echo '[portfolio] Restoring previous portfolio release' >&2
    python3 "$HELPER" exchange "$PREVIOUS" "$ROOT/portfolio-web" || { echo 'ROLLBACK FAILED: inspect the live pointer immediately' >&2; exit 1; }
    for host in "${HOSTS[@]}"; do probe "$host" / >/dev/null || true; done
  fi
  exit "$status"
}
trap restore_on_failure EXIT
trap 'exit 130' HUP INT TERM
PREVIOUS="$(python3 "$HELPER" activate "$ROOT" "$COMMIT")"
for host in "${HOSTS[@]}"; do
  marker="$(probe "$host" "/deployment.json?commit=$COMMIT")"
  python3 -c 'import json,sys; assert json.loads(sys.argv[1])["commit"] == sys.argv[2]' "$marker" "$COMMIT"
  probe "$host" / >/dev/null
done
# Verify the exact index and every content-hashed CRA asset through Nginx.
probe "${HOSTS[0]}" / | cmp - "$RELEASE/index.html"
while IFS= read -r -d '' asset; do
  relative="${asset#"$RELEASE"}"
  probe "${HOSTS[0]}" "$relative" | cmp - "$asset"
done < <(find "$RELEASE/static" -type f ! -name '*.map' -print0)
docker exec "$EDGE" nginx -t

# Retain the previous directory/link in the same parent, so relative links work.
SAVED="$PREVIOUS"
PREVIOUS=''
trap - EXIT HUP INT TERM
echo "[portfolio] Healthy: $COMMIT; previous release retained at $SAVED"
