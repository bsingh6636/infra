# Releases And Rollback

Publishing snapshots already-generated artifacts. Applying or deploying starts the selected snapshot; committing or pushing Git changes does neither.

## Release Contents

```text
generated/runtime-state/
├── current -> releases/<release-id>
├── data/
└── releases/<release-id>/
    ├── compose.yaml
    ├── nginx.conf
    ├── release.lock.yaml
    ├── edge-static/
    ├── isolated/          # omitted in registry mode
    ├── isolated-env/
    ├── shared/            # omitted in registry mode
    └── shared-env/
```

A non-registry release contains source/build contexts that Docker can build. A registry release references pushed image tags. Each municipal backend has its own env file and lock entry, while all five point to the single `municipal-backend` context or image. Persistent media and uploads live under the data root, outside releases.

`release.lock.yaml` records the release ID, creation time, port, artifact hashes or image references, env-file hashes, and mount metadata. Treat published directories as snapshots. The static deployment shortcut described below deliberately changes the current directory in place, so its content can subsequently differ from the original lock hashes and tarball.

## Build Before Publish

For production, regenerate real artifacts:

```bash
npm run validate
npm test
npm run build:edge-static
npm run build:isolated-preview
npm run build:shared-node-preview
```

For a local routing-only check, the three builders have `:stub` variants. Stub builds replace generated outputs; run real builders again before publishing production. Publish checks that inputs exist, not that they are recent or non-stub.

Use `-- --service <name>` for a single static or isolated service when other artifacts are current. Rebuild the full shared-node group when one of its services or membership changes. Rebuild all affected municipal env files after runtime configuration changes, even though the image is shared.

## Local Publish, Apply, Rollback

```bash
npm run release:publish -- --release local-check-01 --port 8091
npm run release:apply -- --release local-check-01
```

Apply creates local storage directories from `stack.yaml`, starts the release with `up -d --remove-orphans --pull missing`, then repoints `generated/runtime-state/current`. There is no explicit `--build`; Compose can perform a required initial build, but apply does not request a forced rebuild of existing images.

```bash
npm run release:publish -- --release local-check-02 --port 8091
npm run release:apply -- --release local-check-02
npm run release:rollback -- --release local-check-01
readlink generated/runtime-state/current
```

Local rollback uses `up -d --remove-orphans --pull never` and repoints `current`; it does not request an explicit image rebuild or pull. If `--release` is omitted, it selects the lexically newest available release other than the current one. Retain the required images or build inputs and check their availability before relying on rollback. Local data must survive both switches; see [MEDIA_STORAGE.md](MEDIA_STORAGE.md).

## Production Publish

Normal production releases bundle build contexts and render TLS, ports 80/443, and certificate mounts:

```bash
npm run release:publish:prod -- --release prod-YYYYMMDD-01
./scripts/server/push-release.sh prod-YYYYMMDD-01 aws
```

Registry mode builds and pushes one image per isolated image context and shared group, then publishes image references:

```bash
npm run release:publish:prod:registry -- --release prod-YYYYMMDD-01
./scripts/server/push-release.sh prod-YYYYMMDD-01 aws
```

The package script uses registry prefix `bsingh6636`. Docker registry access and compatible server architecture are prerequisites. `edge-static` assets and per-service env files are bundled in both modes.

## Shortcuts

```bash
# Publish existing generated artifacts and deploy, using a UTC timestamp ID
npm run server:ship -- aws

# Deploy an existing published release; SERVER comes from .env or environment
npm run server:deploy -- prod-YYYYMMDD-01
```

`server:ship` defaults to SSH alias `aws`. `server:deploy` can choose the lexically newest published entry if no release ID is supplied; an explicit ID avoids ambiguity. Neither shortcut clones or builds application source before publishing.

## What Server Deployment Does

The server uses project `brijesh-infra` and `/opt/brijesh-infra/{releases,current,data,incoming}`. `project.live_symlink` in the config is currently unused; the server scripts use `/opt/brijesh-infra/current`.

`deploy-on-server.sh` prepares data directories, prunes unused Docker images/build cache, and expands the incoming tarball unless that release directory already exists. For a full non-registry release it runs `up -d --build --remove-orphans --pull missing`; registry releases are pulled before starting. It does not first shut down the whole existing stack during a normal deployment.

It then runs `nginx -t` inside edge and repoints `current` only if that check succeeds. On Nginx validation failure it attempts to restore the previous compose configuration. This is not a general health check or an automatic rollback for every failed command: test application endpoints and mounts separately.

## Targeted Municipal Deployment

```bash
./scripts/server/push-release.sh prod-YYYYMMDD-municipal aws municipal
```

The fixed `municipal` alias deploys the five municipal containers plus `shared-low-node`, then recreates edge. Regenerate both isolated and shared-node artifacts first so old municipal PM2 processes are removed. Targeted deployment uses `--no-deps`; it does not apply other services or start new dependencies. Use the full deployment for wider changes. The [migration guide](MUNICIPAL_MIGRATION.md) covers ordering, the possible interruption, and verification.

## Single Static Deployment

```bash
npm run deploy:edge-static -- municipal-admin
```

This builds the named frontend from its configured source/ref, uploads an archive, extracts it into staging, replaces the service's live directory, and reloads edge. Deleted pages/assets disappear. Extraction or reload failure preserves/restores the previous directory. Other static service directories are left in place.

This changes the current release in place. It does not render ingress or create a new release/lock snapshot. Use a normal release for new hosts/services or when a distinct rollback point is required.

## Production Rollback

Copy and run the rollback script with the prior release ID:

```bash
scp scripts/server/rollback-on-server.sh aws:/tmp/
ssh aws 'sudo bash /tmp/rollback-on-server.sh prod-YYYYMMDD-00'
```

The server rollback script stops the current stack, starts the target with `--pull never`, and repoints `current`. It can cause downtime. It does not force a rebuild or fetch missing images. Deployment pruning may remove images belonging to a non-running release; verify availability or restore/pull/build the target's required images before the rollback. Keep media backups separate and preserve the data root.

## Retention And Old References

`release_retention: 10` is configured but not enforced. Docker pruning does not remove old release directories. Monitor both kinds of disk usage and retain usable rollback artifacts.

The [temporary documentation archive](archive/2026-10-15-pre-doc-refresh/README.md) is independent of production releases. Its later cleanup removes docs only, after migration and documentation verification. See [STATUS_AND_DEFERRED.md](STATUS_AND_DEFERRED.md) for remaining work.
