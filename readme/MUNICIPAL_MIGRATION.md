# Municipal Backend Migration

The configured target is five isolated municipal containers sharing one image. Commit `30d4987` implements the migration and fixes; commit `9b2f406` is the preceding baseline. These are repository milestones, not proof of a production deployment. Check the active release and processes before and after cutover.

## Old And New Topology

| Service | Previous runtime | Configured runtime | Internal port | Host media directory |
|---|---|---|---|---|
| municipal-api (Dharche) | PM2 in shared-low-node | Isolated container | 4303 | `/opt/brijesh-infra/data/municipal/media` |
| siranchowk-municipal | PM2 in shared-low-node | Isolated container | 4304 | `/opt/brijesh-infra/data/siranchowk/media` |
| ratnagar-municipal | PM2 in shared-low-node | Isolated container | 4305 | `/opt/brijesh-infra/data/ratnagar/media` |
| madhyabindu-municipal | PM2 in shared-low-node | Isolated container | 4307 | `/opt/brijesh-infra/data/madhyabindu/media` |
| devghat-municipal | Already isolated | Shared-image isolated container | 4308 | `/opt/brijesh-infra/data/devghat/media` |

All five use `build.shared_image: municipal-backend`, with current limits of 0.20 CPU and 192m per container. Devghat previously had a 0.25 CPU / 256m limit. Check usage after deployment.

Each service receives its own `isolated-env/<service>.env`, including `PORT` and `MUNICIPAL_BACKEND_PORT`. Runtime values declared in `stack.yaml` override dotenv collisions. The image's default port belongs to its primary build service; the individual env files supply the correct ports for other containers.

Each host media directory stays in place and mounts at `/srv/app/media` in its own container. The former shared-node services used `/srv/apps/<service>/media`. Keep the host data while changing the container mount target. The `low-node` PM2 group retains only `cors-api` and `getdata`.

## Prepare

Record the current production release ID and retain its artifacts and required images for rollback. Back up all five host media directories using [MEDIA_STORAGE.md](MEDIA_STORAGE.md). Verify credentials and source access, then regenerate both backend modes:

```bash
npm run infisical:pull:production
npm run validate
npm test
npm run build:isolated-preview
npm run build:shared-node-preview
```

Build any missing or changed edge-static artifacts with `npm run build:edge-static`. Publish collects existing generated files; stale shared-node artifacts can still contain the former municipal PM2 apps. Rebuilding the whole shared group before publishing is essential.

## Publish And Deploy

```bash
npm run release:publish:prod -- --release prod-YYYYMMDD-municipal
./scripts/server/push-release.sh prod-YYYYMMDD-municipal aws municipal
```

The `municipal` target starts the five municipal services, rebuilds and starts `shared-low-node`, then recreates edge. It validates Nginx before repointing `current`. A short interruption is possible when the shared group stops serving the old municipal upstreams and before edge loads the new routes. This migration flow allows that downtime.

Use a full-stack deployment instead of the targeted alias when unrelated configuration or new dependencies must also be applied. The municipal target uses a fixed list in `deploy-on-server.sh`; `manage-municipal.sh` has its own matching list. Update both when adding another municipality. Targeted deployment does not start unrelated dependencies.

## Verify On The Server

```bash
readlink /opt/brijesh-infra/current
docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml ps

docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml   exec -T shared-low-node pm2 list
# Only cors-api and getdata should remain in this group.

for service in municipal-api siranchowk-municipal ratnagar-municipal madhyabindu-municipal devghat-municipal; do
  docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml     exec -T "$service" sh -c 'printf "PORT=%s MUNICIPAL_BACKEND_PORT=%s\n" "$PORT" "$MUNICIPAL_BACKEND_PORT"; ls -ld /srv/app/media'
done

docker stats --no-stream
```

Check the five ports against the table, confirm the host mounts, load a known existing media file for each municipality, and exercise a known API route. The frontend/API pairs are `dharche` / `api-dharche`, `siranchowk` / `api-siranchowk`, `ratnagar` / `api-ratnagar`, `madhyabindumun` / `api-madhyabindumun`, and `devghat` / `api-devghat` under `codifyteam.com`. See ingress for all aliases and paths.

`nginx -t` checks configuration syntax and upstream resolution; it does not prove each backend is listening or serving healthy responses. Check logs, API behavior, media reads/writes, and restarts separately.

## Rollback And Temporary References

Use the server rollback procedure in [RELEASES_AND_ROLLBACK.md](RELEASES_AND_ROLLBACK.md). The old release restores the old process topology while retaining host media. Keep the images required by that release available: the deployment script prunes unused Docker images and build cache, so their local retention is not guaranteed.

The [dated archive](archive/2026-10-15-pre-doc-refresh/README.md) preserves both documentation baselines. Keep it until the migration, updated instructions, and rollback requirements are verified; then remove the archive and its links in a separate cleanup commit. No production cutover or old-reference deletion is performed by a documentation update.
