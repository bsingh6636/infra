# Operations — Logs, Status, Debugging

Day-to-day "where do I check X on the live server" cheat sheet.
SSH in first: `ssh aws` (or whatever alias/host you have configured for the production server — see `SERVER` in `.env`)

---

## Service-to-container map

Knowing which container a service lives in matters — it dictates how you read logs.

This map describes the configured stack. Check the active release and running processes to confirm the migration has been deployed; see [MUNICIPAL_MIGRATION.md](MUNICIPAL_MIGRATION.md).

| Service | Mode | Container | Port (internal) |
|---|---|---|---|
| portfolio-web, ranju-web, cors-web, municipal-admin, sahayog-web, stylework-web, codify-web | edge-static | served directly by `brijesh-infra-edge-1` (static files) | n/a |
| cors-api | shared-node | `brijesh-infra-shared-low-node-1` (via PM2) | 4301 |
| getdata | shared-node | `brijesh-infra-shared-low-node-1` (via PM2) | 4302 |
| municipal-api | isolated | `brijesh-infra-municipal-api-1` | 4303 |
| siranchowk-municipal | isolated | `brijesh-infra-siranchowk-municipal-1` | 4304 |
| ratnagar-municipal | isolated | `brijesh-infra-ratnagar-municipal-1` | 4305 |
| madhyabindu-municipal | isolated | `brijesh-infra-madhyabindu-municipal-1` | 4307 |
| devghat-municipal | isolated | `brijesh-infra-devghat-municipal-1` | 4308 |
| subsnepal-web | isolated | `brijesh-infra-subsnepal-web-1` | 80 (container) |
| subsnepal-api | isolated | `brijesh-infra-subsnepal-api-1` | 9090 |
| sahayog-api | isolated | `brijesh-infra-sahayog-api-1` | 4306 |
| stylework-api | isolated | `brijesh-infra-stylework-api-1` | 4309 |
| redis | image | `brijesh-infra-redis-1` (cache-only) | 6379 |

`otp-api` is disabled. Frontends served by edge have no separate application containers.

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

### Isolated services (municipal backends, subsnepal-web, subsnepal-api)

Each runs in its own container — logs come straight from `docker logs`.

```bash
docker logs -f brijesh-infra-subsnepal-api-1
docker logs -f brijesh-infra-subsnepal-web-1
docker logs -f brijesh-infra-municipal-api-1

docker logs --tail 200 brijesh-infra-subsnepal-api-1
```

Municipal shortcuts can run locally over SSH or directly on the server:

```bash
npm run municipal:status
npm run municipal:restart -- ratnagar
npm run municipal:logs -- devghat
```

### Shared-node services (cors-api, getdata)

Both run inside **one container** managed by PM2, so `docker logs` shows them mixed. Use PM2 to filter by service.

```bash
# Shortcut variable
CID=$(docker ps -qf name=shared-low-node)

# All processes status (online / errored / restart count)
docker exec $CID pm2 list

# Logs for ONE service (live tail)
docker exec $CID pm2 logs cors-api
docker exec $CID pm2 logs getdata

# Last N lines, no tail
docker exec $CID pm2 logs cors-api --lines 100 --nostream

# All services interleaved
docker exec $CID pm2 logs

# Raw container output (mixed)
docker logs -f brijesh-infra-shared-low-node-1
```

PM2 logs are written inside the container under `/root/.pm2/logs/<service>-out.log` and `<service>-error.log`.

### Compose-style logs (whole stack)

```bash
COMPOSE=/opt/brijesh-infra/current/compose.yaml

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
docker exec $CID pm2 info cors-api

# Restart one service without touching the others
docker exec $CID pm2 restart cors-api
docker exec $CID pm2 reload cors-api  # zero-downtime
```

### Internal ports — is a service actually listening?

```bash
docker exec $CID sh -c "ss -tlnp 2>/dev/null || netstat -tlnp"
# Should show 4301 and 4302 for shared-low-node
```

### Internal env — what does the running process see?

```bash
# The env file PM2 sources at startup
docker exec $CID cat /srv/env/cors-api.env | grep -v '^$'

# What PM2 actually injected (live env of running process)
docker exec $CID sh -c 'cat /proc/$(pgrep -f cors-api | head -1)/environ | tr "\0" "\n"' | grep -v -E "^(PATH|HOME|TERM|HOSTNAME)="
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

To rebuild and deploy a frontend already present in the live Nginx configuration:

```bash
npm run deploy:edge-static -- municipal-admin
```

This replaces the service's live static directory, removing files absent from the new build. Extraction or Nginx reload failures preserve the previous directory. It updates the current release in place; publish a new release when you need a separate rollback snapshot or changed ingress configuration.

### Shared-node (cors-api / getdata) — DON'T use `--service`

Both backends share one PM2-managed container. Building just one would produce a container missing the other. Always rebuild the whole group:

```bash
npm run build:shared-node-preview
```

### Isolated (municipal backends / subsnepal-web / subsnepal-api) — `--service` works

```bash
npm run build:isolated-preview -- --service subsnepal-api
npm run build:isolated-preview -- --service municipal-api
```

The five municipal backends share one image. Each gets its own env file containing `runtime.env` and `PORT` from `runtime.port`; those runtime settings take precedence over env-file values. Rebuild all isolated services when changing configuration for multiple municipal services.

### Common one-service deploy flow

Example — only municipal backend + frontend changed:
```bash
npm run build:edge-static -- --service municipal-admin
npm run build:isolated-preview -- --service municipal-api
npm run release:publish:prod
./scripts/server/push-release.sh 20260531-143203 ubuntu@SERVER_IP
```

For the first migration of municipal backends from the shared group, regenerate both backend artifacts before publishing:

```bash
npm run build:isolated-preview
npm run build:shared-node-preview
npm run release:publish:prod
./scripts/server/push-release.sh <release-id> aws municipal
```

The `municipal` target deploys all five municipal containers and rebuilds `shared-low-node` to stop its former municipal PM2 processes before updating the edge.

This can briefly interrupt municipal traffic while the old shared upstreams stop and edge is recreated. Follow [MUNICIPAL_MIGRATION.md](MUNICIPAL_MIGRATION.md) for backups and post-deployment checks.

Or the one-command shortcut: `npm run server:ship` (publish + push + deploy in one shot). See [`RELEASES_AND_ROLLBACK.md`](./RELEASES_AND_ROLLBACK.md).

Compose reconciles services with the selected release. Changed configuration, bind paths, or release image tags can recreate containers even when application source is unchanged. A targeted deployment explicitly recreates edge. Publish/deploy shortcuts do not rebuild application sources first.

---

## Releases

```bash
# Which release is live?
ls -la /opt/brijesh-infra/current
cat /opt/brijesh-infra/current/release.lock.yaml | head -10

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

# Issue/renew grouped certificates, with the script's expiry skip
sudo bash /opt/brijesh-infra/ssl-setup/certbot-run.sh --grouped

# Explicitly force grouped re-issuance when required
sudo bash /opt/brijesh-infra/ssl-setup/certbot-run.sh --grouped --force-all

# Verify a cert from outside (run from your Mac)
echo | openssl s_client -connect subsnepal.com:443 -servername subsnepal.com 2>/dev/null \
  | openssl x509 -noout -dates -subject
```

If nginx is crash-looping after a deploy with `cannot load certificate`, the cert for that host doesn't exist yet — run certbot first.

Check certificate SAN coverage for changed hosts and verify the renewal timer/reload hook on the server. Single-domain mode issues only that hostname, even if combined with `--grouped`. See [../ssl-setup/README.md](../ssl-setup/README.md).

---

## Media (all municipal backends)

Stored on the host, bind-mounted into the container.

```bash
# Persistent host path (survives every deploy)
ls -la /opt/brijesh-infra/data/municipal/media/
du -sh /opt/brijesh-infra/data/municipal/media/

# Path inside the isolated municipal container
docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml \
  exec -T municipal-api ls -ld /srv/app/media
```

Back up all five municipal directories before migrating:
```bash
sudo tar -czf /tmp/media-backup-$(date +%Y%m%d).tar.gz \
  -C /opt/brijesh-infra/data \
  municipal/media siranchowk/media ratnagar/media madhyabindu/media devghat/media
```

Copy the archive off-server and verify restoration. [MEDIA_STORAGE.md](MEDIA_STORAGE.md) maps every host path and also covers Sahayog uploads. Release snapshots do not include these files.

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
   `grep proxy_pass /opt/brijesh-infra/current/nginx.conf`
7. **Can the edge container reach the upstream?**
   `docker exec brijesh-infra-edge-1 wget -qO- http://municipal-api:4303/`

For the shared Cors backend use `http://shared-low-node:4301/`; each municipal backend uses its own service name and port.

---

## When in doubt

```bash
# Tail everything for 30 seconds and look for the problem
timeout 30 docker compose -p brijesh-infra \
  -f /opt/brijesh-infra/current/compose.yaml logs -f
```
