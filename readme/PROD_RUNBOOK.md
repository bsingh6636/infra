# Production Runbook

Use this guide to test and deploy the current configuration. For the first municipal cutover, also follow [MUNICIPAL_MIGRATION.md](MUNICIPAL_MIGRATION.md). Configuration being committed or pushed does not establish what production is running.

## Prerequisites

- Node 20+ and dependencies installed locally with `npm ci`.
- Docker Engine and Compose locally for container testing, and on the Linux server for deployment.
- Infisical login/project access and required local env files.
- SSH access to `aws` or the chosen server, and Git access to configured private sources.
- DNS and AWS inbound access for the intended hosts on ports 80/443.
- Current TLS certificates at the `cert_name` paths in `stack.yaml`.

The server deployment root is `/opt/brijesh-infra`; the active compose file is `/opt/brijesh-infra/current/compose.yaml`. Check the prior release ID, available disk space, required rollback images, and media backups before migrating services.

## 1. Validate Locally

```bash
npm run infisical:pull:production
npm run validate
npm test
npm run validate:remote
```

Use `-- --force` on the Infisical pull only when you want to overwrite local files. Validation fails for missing declared files or required env values. The existing `municipal` / `muncipal` hostname warning refers to explicitly configured hostnames; compare against ingress rather than correcting spelling automatically.

`npm test` exercises shared-image env/port handling, release packaging, the targeted migration, and static replacement/failure recovery with local fixtures. It does not contact production or replace container smoke tests.

## 2. Optional Local Routing Test

Stub outputs are suitable for testing routing. They overwrite the corresponding generated artifacts; never publish them as production application builds.

```bash
npm run build:edge-static:stub
npm run build:isolated-preview:stub
npm run build:shared-node-preview:stub
```

Choose the preview you changed:

```bash
# Static sites on 8088
npm run preview:edge-static:render
npm run preview:edge-static:up
curl -si -H 'Host: codifyteam.com' http://127.0.0.1:8088/
npm run preview:edge-static:down

# Isolated apps, including municipal backends, on 8089
npm run preview:isolated:render
npm run preview:isolated:up
curl -si -H 'Host: api-dharche.codifyteam.com' http://127.0.0.1:8089/
npm run preview:isolated:down

# Shared PM2 apps on 8090
npm run preview:shared-node:render
npm run preview:shared-node:up
curl -si -H 'Host: api-cors-proxy.brijeshkushwaha.com.np' http://127.0.0.1:8090/
curl -si -H 'Host: getdata-cors-proxy.brijeshkushwaha.com.np' http://127.0.0.1:8090/
docker compose -p infra-shared-node-preview -f generated/compose.shared-node-preview.yaml   exec -T shared-low-node pm2 list
# Expected PM2 members: cors-api and getdata.
npm run preview:shared-node:down
```

Mode previews are intentionally limited. Use an integrated release for persistent media mounts and dependencies such as Redis.

## 3. Integrated Local Release

With outputs for all enabled services present:

```bash
npm run release:publish -- --release local-check-01 --port 8091
npm run release:apply -- --release local-check-01
```

Example route checks:

```bash
curl -si -H 'Host: brijeshkushwaha.com.np' http://127.0.0.1:8091/
curl -si -H 'Host: codifyteam.com' http://127.0.0.1:8091/
curl -si -H 'Host: subsnepal.com' http://127.0.0.1:8091/
curl -si -H 'Host: api.subsnepal.com' http://127.0.0.1:8091/
curl -si -H 'Host: dharche.codifyteam.com' http://127.0.0.1:8091/api/
curl -si -H 'Host: api-siranchowk.codifyteam.com' http://127.0.0.1:8091/
curl -si -H 'Host: api-ratnagar.codifyteam.com' http://127.0.0.1:8091/
curl -si -H 'Host: api-madhyabindumun.codifyteam.com' http://127.0.0.1:8091/
curl -si -H 'Host: api-devghat.codifyteam.com' http://127.0.0.1:8091/
```

Use `config/stack.yaml` ingress for the complete host and route list. Stub API roots return 200; real applications may return authentication responses or 404 at `/`. Exercise a known application route and investigate 502/503. The release renderer drops unknown hosts with Nginx status 444, which appears to curl as an empty reply.

Verify media persistence using [MEDIA_STORAGE.md](MEDIA_STORAGE.md). To test release switching:

```bash
npm run release:publish -- --release local-check-02 --port 8091
npm run release:apply -- --release local-check-02
npm run release:rollback -- --release local-check-01
readlink generated/runtime-state/current

docker compose -p infra-local-release -f generated/runtime-state/current/compose.yaml down --remove-orphans
```

Local apply does not request `--build`; local rollback does not pull images. See [RELEASES_AND_ROLLBACK.md](RELEASES_AND_ROLLBACK.md) for the exact behavior and image requirements.

## 4. Prepare TLS On The Server

For initial provisioning or changed domains, sync current SSL tools/config to `/opt/brijesh-infra`, and ensure Node and the `yaml` dependency are available there. Keep `CLOUDFLARE_API_TOKEN` in the server repo's `.env` or environment. SSH to the server and run:

```bash
cd /opt/brijesh-infra
sudo bash ssl-setup/certbot-run.sh --grouped
sudo certbot certificates
sudo systemctl list-timers --all | grep certbot
sudo ls -l /etc/letsencrypt/renewal-hooks/deploy/
```

Grouped issuance matches configured `cert_name` paths and includes the root's ingress hostnames. Verify SAN coverage for newly added hosts. The default expiry skip is 120 days; existing expiry alone does not prove a new hostname is covered. Do not assume a renewal timer or Nginx deploy hook exists merely because issuance succeeds.

`npm run ssl:generate-domains` regenerates `domains.conf` locally. It does not update DNS, copy files to the server, or render production Nginx. The optional fallback-certificate script enables Nginx startup with self-signed certificates for missing paths; it does not replace trusted issuance. Details are in [../ssl-setup/README.md](../ssl-setup/README.md).

## 5. Build And Publish Production Artifacts

Always restore real outputs after any stub test:

```bash
npm run build:edge-static
npm run build:isolated-preview
npm run build:shared-node-preview
npm run release:publish:prod -- --release prod-YYYYMMDD-01
```

Inspect the snapshot before transfer:

```bash
grep 'listen 443' generated/runtime-state/releases/prod-YYYYMMDD-01/nginx.conf
grep 'ssl_certificate' generated/runtime-state/releases/prod-YYYYMMDD-01/nginx.conf
docker compose -p infra-review -f generated/runtime-state/releases/prod-YYYYMMDD-01/compose.yaml config --quiet
```

Confirm all enabled artifacts are current, the five municipal services point to one image/context but separate env files, ports match Nginx upstreams, and media sources use `/opt/brijesh-infra/data/...` for production.

## 6. Deploy

```bash
./scripts/server/push-release.sh prod-YYYYMMDD-01 aws
```

For the initial municipal migration, after rebuilding both backend modes, the targeted option is:

```bash
./scripts/server/push-release.sh prod-YYYYMMDD-01 aws municipal
```

That alias applies the five municipal services and the revised shared group before recreating edge. It can cause a brief municipal interruption and does not start unrelated dependencies. Use full deployment for broader changes.

`npm run server:ship -- aws` combines publish and transfer/deployment with a generated release ID, after real builds have completed. `npm run server:deploy -- <release-id>` transfers an existing published release using `SERVER`. Both shortcuts leave application source building to the operator.

The server performs Nginx validation before switching `current`; application health must still be checked. See the release guide for the limited automatic rollback and pruning behavior.

## 7. Verify Production

From the local machine:

```bash
curl -si http://codifyteam.com/
curl -si https://codifyteam.com/
curl -si https://www.codifyteam.com/
curl -si https://dharche.codifyteam.com/
curl -si https://api-dharche.codifyteam.com/
curl -si https://api-siranchowk.codifyteam.com/
curl -si https://api-ratnagar.codifyteam.com/
curl -si https://api-madhyabindumun.codifyteam.com/
curl -si https://api-devghat.codifyteam.com/
```

Check HTTP-to-HTTPS redirection, a known API route for each service, and existing media. Verify the other configured applications too, especially any shared-group or Redis consumers affected by the release.

On the server:

```bash
readlink /opt/brijesh-infra/current
docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml ps
docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml exec -T edge nginx -t
docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml exec -T shared-low-node pm2 list
docker stats --no-stream
df -h /
```

Expected configuration: edge, shared-low-node (`cors-api`, `getdata`), subsnepal-web/api, the five municipal containers, sahayog-api, stylework-api, and Redis. Static frontends are files in edge, not separate containers. `otp-api` remains disabled. Use [MUNICIPAL_MIGRATION.md](MUNICIPAL_MIGRATION.md) for the per-container port and mount checks.

## 8. Rollback And Backups

```bash
scp scripts/server/rollback-on-server.sh aws:/tmp/
ssh aws 'sudo bash /tmp/rollback-on-server.sh previous-release-id'
```

Rollback stops the current stack and uses `--pull never` to start the selected release. Verify its images remain available after pruning, and preserve the persistent data. Detailed rollback and backup requirements are in [RELEASES_AND_ROLLBACK.md](RELEASES_AND_ROLLBACK.md) and [MEDIA_STORAGE.md](MEDIA_STORAGE.md).

The [documentation archive](archive/2026-10-15-pre-doc-refresh/README.md) keeps old procedures until the migration and refreshed instructions are verified. Its removal is a later documentation cleanup, separate from production release retention.
