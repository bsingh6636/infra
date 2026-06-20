# Operations — Logs, Status, Debugging

Day-to-day "where do I check X on the live server" cheat sheet.
SSH in first: `ssh gcp`

---

## Service-to-container map

Knowing which container a service lives in matters — it dictates how you read logs.

| Service | Mode | Container | Port (internal) |
|---|---|---|---|
| portfolio-web, ranju-web, cors-web, municipal-admin | edge-static | served directly by `brijesh-infra-edge-1` (static files) | n/a |
| cors-api | shared-node | `brijesh-infra-shared-low-node-1` (via PM2) | 4301 |
| getdata | shared-node | `brijesh-infra-shared-low-node-1` (via PM2) | 4302 |
| municipal-api | shared-node | `brijesh-infra-shared-low-node-1` (via PM2) | 4303 |
| subsnepal-web | isolated | `brijesh-infra-subsnepal-web-1` | 80 (container) |
| subsnepal-api | isolated | `brijesh-infra-subsnepal-api-1` | 9090 |

Quick check of what's running:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

---

## Logs

### Edge nginx (HTTP/HTTPS requests, 4xx/5xx, cert errors)

```bash
# Tail live
docker logs -f brijesh-infra-edge-1

# Last 100 lines
docker logs --tail 100 brijesh-infra-edge-1

# Only errors
docker logs brijesh-infra-edge-1 2>&1 | grep -E "error|emerg|warn" | tail -50
```

### Isolated services (subsnepal-web, subsnepal-api)

Each runs in its own container — logs come straight from `docker logs`.

```bash
docker logs -f brijesh-infra-subsnepal-api-1
docker logs -f brijesh-infra-subsnepal-web-1

docker logs --tail 200 brijesh-infra-subsnepal-api-1
```

### Shared-node services (cors-api, getdata, municipal-api)

All three run inside **one container** managed by PM2, so `docker logs` shows them mixed. Use PM2 to filter by service.

```bash
# Shortcut variable
CID=$(docker ps -qf name=shared-low-node)

# All processes status (online / errored / restart count)
docker exec $CID pm2 list

# Logs for ONE service (live tail)
docker exec $CID pm2 logs municipal-api
docker exec $CID pm2 logs cors-api
docker exec $CID pm2 logs getdata

# Last N lines, no tail
docker exec $CID pm2 logs municipal-api --lines 100 --nostream

# All services interleaved
docker exec $CID pm2 logs

# Raw container output (mixed)
docker logs -f brijesh-infra-shared-low-node-1
```

PM2 logs are written inside the container under `/root/.pm2/logs/<service>-out.log` and `<service>-error.log`.

### Compose-style logs (whole stack)

```bash
COMPOSE=/opt/brijesh-infra/live/current/compose.yaml

# Live tail everything
docker compose -p brijesh-infra -f $COMPOSE logs -f

# One service
docker compose -p brijesh-infra -f $COMPOSE logs -f subsnepal-api
docker compose -p brijesh-infra -f $COMPOSE logs --tail 200 edge
```

---

## Status & health

### Containers

```bash
# All containers in this project
docker ps --filter label=com.docker.compose.project=brijesh-infra

# Restart counts (anything constantly restarting = problem)
docker ps --filter label=com.docker.compose.project=brijesh-infra \
  --format "table {{.Names}}\t{{.Status}}"

# Resource usage (CPU/memory)
docker stats --no-stream
```

### PM2 processes (inside shared-low-node)

```bash
CID=$(docker ps -qf name=shared-low-node)
docker exec $CID pm2 list

# Detailed info on one service
docker exec $CID pm2 info municipal-api

# Restart one service without touching the others
docker exec $CID pm2 restart municipal-api
docker exec $CID pm2 reload municipal-api  # zero-downtime
```

### Internal ports — is a service actually listening?

```bash
docker exec $CID sh -c "ss -tlnp 2>/dev/null || netstat -tlnp"
# Should show 4301, 4302, 4303 for shared-low-node
```

### Internal env — what does the running process see?

```bash
# The env file PM2 sources at startup
docker exec $CID cat /srv/env/municipal-api.env | grep -v '^$'

# What PM2 actually injected (live env of running process)
docker exec $CID sh -c 'cat /proc/$(pgrep -f municipal-api | head -1)/environ | tr "\0" "\n"' | grep -v -E "^(PATH|HOME|TERM|HOSTNAME)="
```

---

## Partial builds — build only what you changed

Full builds reclone every repo and can take minutes. Use `--service <name>` to build a single service when only one has changed.

### Edge-static (frontends) — `--service` works

```bash
# Only rebuild municipal-admin frontend
npm run build:edge-static -- --service municipal-admin

# Only ranju frontend
npm run build:edge-static -- --service ranju-web
```

Other frontends keep their existing artifacts in `generated/edge-static/`; the next `release:publish:prod` bundles whatever is there.

### Shared-node (cors-api / getdata / municipal-api) — DON'T use `--service`

All three backends share one PM2-managed container. Building just one would produce a container missing the other two. Always rebuild the whole group:

```bash
npm run build:shared-node-preview
```

### Isolated (subsnepal-web / subsnepal-api) — `--service` works

```bash
npm run build:isolated-preview -- --service subsnepal-api
```

### Common one-service deploy flow

Example — only municipal backend + frontend changed:
```bash
npm run build:edge-static -- --service municipal-admin
npm run build:shared-node-preview                                # full shared-node rebuild
npm run release:publish:prod
./scripts/server/push-release.sh 20260531-143203 brijeshkumarkushwaha@34.131.236.177
```

With the rolling-restart logic in `deploy-on-server.sh`, only containers whose image content actually changed will restart — so other services keep running.

---

## Releases

```bash
# Which release is live?
ls -la /opt/brijesh-infra/live/current
cat /opt/brijesh-infra/live/current/release.lock.yaml | head -10

# Available releases (for rollback)
ls -1t /opt/brijesh-infra/releases/

# Inspect a specific release
ls /opt/brijesh-infra/releases/<release-id>/
cat /opt/brijesh-infra/releases/<release-id>/compose.yaml
cat /opt/brijesh-infra/releases/<release-id>/nginx.conf | grep -E "server_name|proxy_pass"
```

---

## TLS / Certificates

```bash
# What certs exist + expiry dates
sudo certbot certificates

# Force renew everything (only if you know what you're doing)
sudo bash /opt/brijesh-infra/ssl-setup/certbot-run.sh --grouped

# Re-issue one specific cert
sudo bash /opt/brijesh-infra/ssl-setup/certbot-run.sh --domain subsnepal.com

# Verify a cert from outside (run from your Mac)
echo | openssl s_client -connect subsnepal.com:443 -servername subsnepal.com 2>/dev/null \
  | openssl x509 -noout -dates -subject
```

If nginx is crash-looping after a deploy with `cannot load certificate`, the cert for that host doesn't exist yet — run certbot first.

---

## Media (municipal-api file uploads)

Stored on the host, bind-mounted into the container.

```bash
# Persistent host path (survives every deploy)
ls -la /opt/brijesh-infra/data/municipal/media/
du -sh /opt/brijesh-infra/data/municipal/media/

# Same path inside the container
docker exec $(docker ps -qf name=shared-low-node) ls /srv/apps/municipal-api/media/
```

Backup the media folder before any risky migration:
```bash
sudo tar -czf /tmp/media-backup-$(date +%Y%m%d).tar.gz \
  -C /opt/brijesh-infra/data/municipal/media .
```

---

## Quick diagnostics flow ("why is X broken")

When something is returning 502 / not responding:

1. **Is the container running?**
   `docker ps | grep <name>`
2. **Is the container restart-looping?**
   `docker ps -a` — status shows "Restarting (1)"
3. **What's in the container log?**
   `docker logs --tail 50 <container>` — read the last error
4. **For shared-node, is the specific PM2 process up?**
   `docker exec $(docker ps -qf name=shared-low-node) pm2 list`
5. **Is the service listening on the right port?**
   `docker exec ... ss -tlnp`
6. **Is nginx routing to the right place?**
   `grep proxy_pass /opt/brijesh-infra/live/current/nginx.conf`
7. **Can the edge container reach the upstream?**
   `docker exec brijesh-infra-edge-1 wget -qO- http://shared-low-node:4303/`

---

## When in doubt

```bash
# Tail everything for 30 seconds and look for the problem
timeout 30 docker compose -p brijesh-infra \
  -f /opt/brijesh-infra/live/current/compose.yaml logs -f
```
