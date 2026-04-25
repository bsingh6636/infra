# Production Runbook

This is the end-to-end guide to go from a clean repo to a live production stack with TLS.

---

## Prerequisites

| Requirement | Check |
|---|---|
| Docker Engine installed locally and on server | `docker info` |
| Node 20+ locally | `node -v` |
| Infisical CLI installed locally | `infisical --version` |
| SSH key access to production server | `ssh user@server-ip echo ok` |
| Cloudflare API token in `.env` as `CLOUDFLARE_API_TOKEN` | `grep CLOUDFLARE .env` |
| Cloud/Azure Security Group: ports 80 and 443 open | Azure Portal / NSG Check |
| All env files present (`env/global.env`, `env/global.secrets.env`, service envs) | `npm run validate` |
| DNS records for all domains pointing to server IP | Cloudflare dashboard |

---

## Part 1 — Local Testing (Before Touching the Server)

Run every step below in order. Do not skip any. Port 8091 is used as the local integrated runtime.

### Step 0 — Pull env files from Infisical

Ensure you have the latest env values for the environment you are deploying (usually `production`). In Infisical mode this writes every configured local env file, including `env/global.env`, `env/global.secrets.env`, `env/services/*.env`, and `env/services-secrets/*.env`.

```bash
# Log in if needed
npm run infisical:login

# Pull production env values into local env/ files
npm run infisical:pull:production -- --force
```

### Step 1 — Validate config

```bash
npm run validate
```

Expected: `✓ All checks passed` (or only warnings, no errors).

```bash
npm run validate:remote
```

Expected: all remote git repos reachable.

### Step 2 — Build stubs for all modes

```bash
npm run build:edge-static:stub
npm run build:isolated-preview:stub
npm run build:shared-node-preview:stub
```

### Step 3 — Phase previews (pick the mode you changed)

**Edge-static** (port 8088):
```bash
npm run preview:edge-static:render
npm run preview:edge-static:up

# Test: static frontends
curl -si -H 'Host: brijeshkushwaha.com.np'            http://127.0.0.1:8088/ | head -1
curl -si -H 'Host: portfolio.brijeshkushwaha.com.np'  http://127.0.0.1:8088/ | head -1
curl -si -H 'Host: ranju.brijeshkushwaha.com.np'      http://127.0.0.1:8088/ | head -1
curl -si -H 'Host: cors-proxy.brijeshkushwaha.com.np' http://127.0.0.1:8088/ | head -1
curl -si -H 'Host: admin.municipa.brijeshkushwaha.com.np' http://127.0.0.1:8088/ | head -1
# All must return HTTP/1.1 200

# Test: backend routes must be blocked in edge-static phase
curl -si -H 'Host: cors-proxy.brijeshkushwaha.com.np' http://127.0.0.1:8088/api/ | head -1
# Must return HTTP/1.1 503

npm run preview:edge-static:down
```

**Isolated** (port 8089):
```bash
npm run preview:isolated:render
npm run preview:isolated:up

curl -si -H 'Host: subsnepal.brijeshkushwaha.com.np'     http://127.0.0.1:8089/ | head -1
curl -si -H 'Host: subsnepal.brijeshkushwaha.com.np'     http://127.0.0.1:8089/api/ | head -1
curl -si -H 'Host: api-subsnepal.brijeshkushwaha.com.np' http://127.0.0.1:8089/ | head -1
# All must return 200 (stub) or 404 from backend (not 502/503)

npm run preview:isolated:down
```

**Shared-node** (port 8090):
```bash
npm run preview:shared-node:render
npm run preview:shared-node:up

curl -si -H 'Host: api-cors-proxy.brijeshkushwaha.com.np'       http://127.0.0.1:8090/ | head -1
curl -si -H 'Host: getdata-cors-proxy.brijeshkushwaha.com.np'   http://127.0.0.1:8090/ | head -1
curl -si -H 'Host: api.muncipal.brijeshkushwaha.com.np'         http://127.0.0.1:8090/ | head -1
# All must reach the shared-low-node container (200 or 404, not 502/503)

# Verify PM2 processes inside container
docker exec $(docker ps -qf name=shared-low-node) pm2 list
# Must show: cors-api, getdata, municipal-api — all "online"

npm run preview:shared-node:down
```

> **Troubleshooting — 502 Bad Gateway / PM2 shows `errored`**
>
> If the curls return 502 and `pm2 list` shows all processes as `errored` (restart count
> near 10), the PM2 start scripts are crashing on boot. Diagnose with:
>
> ```bash
> docker exec $(docker ps -qf name=shared-low-node) pm2 logs --lines 50
> ```
>
> **Common cause:** env values that contain shell metacharacters (`&`, `;`, `|`) break
> the `set -eu; . /srv/env/<service>.env` sourcing in the start script. sh treats `&`
> in an unquoted value as a background operator, and the trailing token runs as a
> foreground command that exits 127, killing the script under `set -e`.
>
> **Fix:** the `serializeEnvValue` function in `scripts/build/shared-node-preview.mjs`
> and `scripts/build/isolated-preview.mjs` now single-quotes all generated env values
> so special characters are treated literally. If you hit this after a merge from an
> older branch, ensure your branch has that fix, then rebuild the stub:
>
> ```bash
> npm run build:shared-node-preview:stub
> npm run preview:shared-node:down
> npm run preview:shared-node:render
> npm run preview:shared-node:up
> ```

### Step 4 — Publish a local integrated release (HTTP only)

```bash
npm run release:publish -- --release 20260420-01 --port 8091
```

Inspect the release:
```bash
cat generated/runtime-state/releases/20260420-01/release.lock.yaml
cat generated/runtime-state/releases/20260420-01/nginx.conf | head -5
# Must start with: # Local release runtime config
```

### Step 5 — Apply and test integrated stack (port 8091)

```bash
npm run release:apply -- --release 20260420-01
```

Full curl matrix against port 8091:
```bash
# Frontends
curl -si -H 'Host: brijeshkushwaha.com.np'                    http://127.0.0.1:8091/ | head -1
curl -si -H 'Host: portfolio.brijeshkushwaha.com.np'          http://127.0.0.1:8091/ | head -1
curl -si -H 'Host: ranju.brijeshkushwaha.com.np'              http://127.0.0.1:8091/ | head -1
curl -si -H 'Host: cors-proxy.brijeshkushwaha.com.np'         http://127.0.0.1:8091/ | head -1
curl -si -H 'Host: admin.municipa.brijeshkushwaha.com.np'     http://127.0.0.1:8091/ | head -1

# APIs
curl -si -H 'Host: cors-proxy.brijeshkushwaha.com.np'             http://127.0.0.1:8091/api/ | head -1
curl -si -H 'Host: api-cors-proxy.brijeshkushwaha.com.np'         http://127.0.0.1:8091/ | head -1
curl -si -H 'Host: getdata-cors-proxy.brijeshkushwaha.com.np'     http://127.0.0.1:8091/ | head -1
curl -si -H 'Host: subsnepal.brijeshkushwaha.com.np'              http://127.0.0.1:8091/api/ | head -1
curl -si -H 'Host: api-subsnepal.brijeshkushwaha.com.np'          http://127.0.0.1:8091/ | head -1
curl -si -H 'Host: admin.municipa.brijeshkushwaha.com.np'         http://127.0.0.1:8091/api/ | head -1
curl -si -H 'Host: admin.municipa.brijeshkushwaha.com.np'         http://127.0.0.1:8091/media/ | head -1
curl -si -H 'Host: api.muncipal.brijeshkushwaha.com.np'           http://127.0.0.1:8091/ | head -1

# Unknown host — must be 404, not 200
curl -si -H 'Host: unknown.example.com'                     http://127.0.0.1:8091/ | head -1
```

Expected: all service routes return `200` or `404` (from app logic), never `502` or `503`.

### Step 6 — Media persistence check

```bash
# Write a test file into the media mount
echo "test-media" > generated/runtime-state/data/municipal/media/test.txt

# Verify it is visible inside the container
docker exec $(docker ps -qf name=infra-local-release_shared-low-node) \
  cat /srv/shared/municipal-api/media/test.txt
# Must print: test-media

# Roll back and verify file survived
npm run release:rollback -- --release 20260420-00  # use a previous release id if available
ls generated/runtime-state/data/municipal/media/test.txt
# Must still exist
```

### Step 7 — Rollback test

```bash
# Publish a second release
npm run release:publish -- --release 20260420-02 --port 8091

# Apply it
npm run release:apply -- --release 20260420-02

# Roll back to first
npm run release:rollback -- --release 20260420-01

# Check symlink
ls -la generated/runtime-state/current
# Must point to: releases/20260420-01
```

### Step 8 — Shut down local stack

```bash
docker compose -p infra-local-release -f \
  generated/runtime-state/releases/20260420-01/compose.yaml \
  down --remove-orphans
```

### Step 9 — Local HTTPS tunnel test (optional but recommended)

This lets you test real TLS with real domain names against your local stack — without deploying to the server.

**How it works:** Cloudflare Tunnel (`cloudflared`) creates a temporary public HTTPS URL that proxies to your local port. No DNS changes needed. Certs are handled by Cloudflare.

```bash
# Install cloudflared (Mac)
brew install cloudflare/cloudflare/cloudflared

# Start your local integrated release on port 8091 first
npm run release:apply -- --release 20260420-01

# Create a quick tunnel to your local port 8091
cloudflared tunnel --url http://localhost:8091
```

Cloudflared prints a temporary URL like `https://abc123.trycloudflare.com`. Open it or curl it:
```bash
curl -si https://abc123.trycloudflare.com/ -H 'Host: brijeshkushwaha.com.np' | head -2
```

> **Limitation:** The temporary tunnel URL is not your real domain. To test with your actual domains (`brijeshkushwaha.com.np`, `subsnepal.com`) over HTTPS locally, you need to:
> 1. Temporarily point DNS to your Mac's IP (not recommended for live traffic)
> 2. Or use a named Cloudflare Tunnel (requires a Cloudflare account with the domain — you already have this via Cloudflare)

**Named Cloudflare Tunnel (real domain → local Mac):**
```bash
# One-time setup (run once)
cloudflared tunnel login                          # opens browser, picks your zone
cloudflared tunnel create local-infra-test        # creates a named tunnel
cloudflared tunnel route dns local-infra-test brijeshkushwaha.com.np
cloudflared tunnel route dns local-infra-test subsnepal.com
# (repeat for any subdomain you want to test)

# Run the tunnel pointing to local port 8091
cloudflared tunnel --url http://localhost:8091 run local-infra-test
```

Now `https://brijeshkushwaha.com.np` will resolve to your local Mac for as long as the tunnel runs. TLS is terminated at Cloudflare — your local stack serves HTTP on 8091, exactly as the local release config expects.

> **Tear it down** when done — `Ctrl+C` stops the tunnel. DNS routes created above must be manually removed in the Cloudflare dashboard or via:
> ```bash
> cloudflared tunnel route dns --delete local-infra-test brijeshkushwaha.com.np
> ```

---

## Part 2 — SSL Certificate Provisioning (On Server, Before First Deploy)

Run these steps **once** on the production server.

> **Note:** `ssl-setup/certbot-run.sh` is the authoritative SSL tool. It reads all domains
> and root domains directly from `config/stack.yaml`. Do **not** use the old `setup-ssl.sh`.

```bash
# 1. Copy repo files to the server (ssl-setup + config + node_modules/yaml)
scp -r ssl-setup/ config/ node_modules/ user@server-ip:/opt/brijesh-infra/

# 2. Copy your .env (contains CLOUDFLARE_API_TOKEN) to the server
scp .env user@server-ip:/opt/brijesh-infra/.env

# 3. SSH into server
ssh user@server-ip
cd /opt/brijesh-infra

# 4. Issue one cert per root domain (covers all subdomains of each root)
#    --grouped reads tls.root_domains from stack.yaml — fully automatic
sudo bash ssl-setup/certbot-run.sh --grouped

# 5. Verify certificates exist for each root domain
sudo certbot certificates
# You should see one cert per root domain (e.g. cors-proxy.brijeshkushwaha.com.np, subsnepal.com)
# Each cert lists all its subdomains under "Domains:"
```

Auto-renewal is handled by certbot's systemd timer. Verify:
```bash
sudo systemctl list-timers | grep certbot
# or
sudo systemctl status snap.certbot.renew.timer
```

To add a new domain later — just add it to `stack.yaml` and run:
```bash
sudo bash ssl-setup/certbot-run.sh --grouped
# Skips certs with > 120 days remaining, issues/expands only what changed
```

---

## Part 3 — First Production Deploy

Run from your **local Mac**.

### Step 1 — Publish a TLS-enabled release

```bash
npm run build:edge-static
npm run build:isolated-preview
npm run build:shared-node-preview

npm run release:publish:prod -- --release prod-20260420-01
```

This bakes TLS server blocks into `nginx.conf` inside the release snapshot. Verify:
```bash
REL=prod-20260420-01
grep "listen 443" generated/runtime-state/releases/${REL}/nginx.conf
# Must return one line per service (many lines)

grep "ssl_certificate" generated/runtime-state/releases/${REL}/nginx.conf
# Must show one entry per root domain, e.g.:
#   /etc/letsencrypt/live/cors-proxy.brijeshkushwaha.com.np/fullchain.pem
#   /etc/letsencrypt/live/subsnepal.com/fullchain.pem

grep "443:443" generated/runtime-state/releases/${REL}/compose.yaml
# Must return one line (edge port mapping)

grep "letsencrypt" generated/runtime-state/releases/${REL}/compose.yaml
# Must return: /etc/letsencrypt:/etc/letsencrypt:ro
```

### Step 2 — Push and apply on server

```bash
./scripts/server/push-release.sh prod-20260420-01 ubuntu@YOUR_SERVER_IP
```

This packages the release, uploads it, SSHes in, and calls `deploy-on-server.sh` automatically.

### Step 3 — Verify from your Mac

```bash
SERVER_IP=YOUR_SERVER_IP

# Must redirect HTTP → HTTPS (301)
curl -si http://brijeshkushwaha.com.np/ | head -2
curl -si http://cors-proxy.brijeshkushwaha.com.np/ | head -2

# Must return 200 over HTTPS
curl -si https://brijeshkushwaha.com.np/ | head -1
curl -si https://portfolio.brijeshkushwaha.com.np/ | head -1
curl -si https://ranju.brijeshkushwaha.com.np/ | head -1
curl -si https://cors-proxy.brijeshkushwaha.com.np/ | head -1
curl -si https://cors-proxy.brijeshkushwaha.com.np/api/ | head -1
curl -si https://api-cors-proxy.brijeshkushwaha.com.np/ | head -1
curl -si https://getdata-cors-proxy.brijeshkushwaha.com.np/ | head -1
curl -si https://subsnepal.brijeshkushwaha.com.np/ | head -1
curl -si https://subsnepal.brijeshkushwaha.com.np/api/ | head -1
curl -si https://api-subsnepal.brijeshkushwaha.com.np/ | head -1
curl -si https://admin.municipa.brijeshkushwaha.com.np/ | head -1
curl -si https://admin.municipa.brijeshkushwaha.com.np/api/ | head -1
curl -si https://admin.municipa.brijeshkushwaha.com.np/media/ | head -1
curl -si https://api.muncipal.brijeshkushwaha.com.np/ | head -1
```

---

## Part 4 — Where to Check Services on the Server

SSH into the server: `ssh user@server-ip`

### Docker containers

```bash
# All running containers for this project
docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml ps

# Short form
docker ps --filter label=com.docker.compose.project=brijesh-infra
```

Expected containers:
| Container | What it is |
|---|---|
| `brijesh-infra-edge-1` | nginx edge proxy (ports 80, 443) |
| `brijesh-infra-shared-low-node-1` | PM2 node container (cors-api, getdata, municipal-api) |
| `brijesh-infra-subsnepal-web-1` | SubsNepal frontend |
| `brijesh-infra-subsnepal-api-1` | SubsNepal backend |

### Logs

```bash
# Live logs — edge nginx
docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml logs -f edge

# Live logs — shared node container (all PM2 processes)
docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml logs -f shared-low-node

# Isolated services
docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml logs -f subsnepal-api

# All containers together
docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml logs -f
```

### PM2 processes inside the shared-node container

```bash
docker exec \
  $(docker ps -qf "label=com.docker.compose.service=shared-low-node" \
               -f "label=com.docker.compose.project=brijesh-infra") \
  pm2 list
```

Expected: `cors-api`, `getdata`, `municipal-api` all show status **online**.

```bash
# Restart one PM2 process without touching others
docker exec \
  $(docker ps -qf "label=com.docker.compose.service=shared-low-node" \
               -f "label=com.docker.compose.project=brijesh-infra") \
  pm2 restart municipal-api
```

### TLS certificate status

```bash
# On the server
sudo bash /opt/brijesh-infra/ssl-setup/check-ssl.sh

# Or directly
sudo certbot certificates
```

### Current release

```bash
ls -la /opt/brijesh-infra/current
# Shows: current -> releases/prod-20260420-01

cat /opt/brijesh-infra/current/release.lock.yaml
```

### All available releases (for rollback)

```bash
ls -1t /opt/brijesh-infra/releases/
```

---

## Part 5 — Production Rollback

```bash
# From the server
sudo bash /opt/brijesh-infra/ssl-setup/../scripts/server/rollback-on-server.sh prod-20260419-01

# Or push the script to the server first
scp scripts/server/rollback-on-server.sh user@server-ip:/tmp/
ssh user@server-ip "sudo bash /tmp/rollback-on-server.sh prod-20260419-01"
```

---

## Part 6 — Media Backup (Before Any Migration)

```bash
# On server — create a timestamped backup
sudo tar -czf /opt/brijesh-infra/media-backup-$(date +%Y%m%d).tar.gz \
  -C /opt/brijesh-infra/data/municipal/media .

# Copy backup to local
scp user@server-ip:/opt/brijesh-infra/media-backup-*.tar.gz ./backups/
```

---

## Quick Reference — All Important Paths

| Path | What |
|---|---|
| `/opt/brijesh-infra/releases/` | All deployed releases |
| `/opt/brijesh-infra/current` | Symlink → active release |
| `/opt/brijesh-infra/current/compose.yaml` | Active compose file |
| `/opt/brijesh-infra/current/nginx.conf` | Active nginx config |
| `/opt/brijesh-infra/current/release.lock.yaml` | Release manifest + hashes |
| `/opt/brijesh-infra/data/municipal/media/` | Persistent media files |
| `/etc/letsencrypt/live/cors-proxy.brijeshkushwaha.com.np/` | TLS certificates |
| `/opt/brijesh-infra/incoming/` | Staging area for tarballs |
