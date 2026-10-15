# Releases And Rollback

## Purpose

The release system creates versioned local runtime snapshots so deployment stays reversible.

Each release contains:

- rendered `compose.yaml`
- rendered `nginx.conf`
- `release.lock.yaml`
- edge-static assets
- isolated service build contexts
- isolated backend env files
- shared-node build contexts

## Release Folder Layout

```text
generated/runtime-state/
├── current -> releases/<release-id>
├── data/
└── releases/
    └── <release-id>/
        ├── compose.yaml
        ├── nginx.conf
        ├── release.lock.yaml
        ├── edge-static/
        ├── isolated/
        ├── isolated-env/
        └── shared/
```

## Publish

Publish collects the already-generated build outputs and snapshots them into a release directory.

Command:

```bash
npm run release:publish -- --release my-release --port 8091
```

This command expects that the earlier phase builders have already been run.

Typical prep:

```bash
npm run build:edge-static:stub
npm run build:isolated-preview:stub
npm run build:shared-node-preview:stub
npm run release:publish -- --release my-release --port 8091
```

## Apply

Apply builds and runs the published release locally, then updates `current`.

Command:

```bash
npm run release:apply -- --release my-release
```

What it does:

- ensures the local data directories exist (from `stack.yaml` storage entries)
- runs `docker compose up -d --remove-orphans --pull never` from that release
- updates `generated/runtime-state/current`

> `--pull never` is intentional — apply never pulls or rebuilds images. The release snapshot is treated as immutable.

## Rollback

Rollback re-applies an older release and then repoints `current`.

Command:

```bash
npm run release:rollback -- --release older-release
```

If you omit `--release`, the script chooses the newest release that is not the current one.

## Release Lock

`release.lock.yaml` records:

- release id
- created time
- port
- artifact hashes
- local data mount info

Use it as the summary of what was published into that release.

## Local Validation Flow

### 1. Publish First Release

```bash
npm run release:publish -- --release phase6-r1 --port 8091
```

### 2. Apply First Release

```bash
npm run release:apply -- --release phase6-r1
```

### 3. Check Current Pointer

```bash
readlink generated/runtime-state/current
```

### 4. Check Routes

```bash
curl -i -H 'Host: brijeshkushwaha.com.np' http://127.0.0.1:8091/
curl -i -H 'Host: api-cors-proxy.brijeshkushwaha.com.np' http://127.0.0.1:8091/
curl -i -H 'Host: subsnepal.brijeshkushwaha.com.np' http://127.0.0.1:8091/api/
curl -i -H 'Host: admin.municipa.brijeshkushwaha.com.np' http://127.0.0.1:8091/media/
```

### 5. Publish Second Release

```bash
npm run release:publish -- --release phase6-r2 --port 8091
npm run release:apply -- --release phase6-r2
```

### 6. Roll Back

```bash
npm run release:rollback -- --release phase6-r1
```

## What To Expect

- `current` should move from `phase6-r1` to `phase6-r2` and back again
- local data in `generated/runtime-state/data/` should survive release switches
- edge, shared-node, and isolated services should all be rebuilt from the selected release snapshot

## Production Release

A production release bakes TLS nginx config and wires the compose file for port 443 + cert mounts.

```bash
# Publish a TLS-enabled release snapshot
npm run release:publish:prod -- --release prod-YYYYMMDD-01

# Push to server and deploy
./scripts/server/push-release.sh prod-YYYYMMDD-01 ubuntu@SERVER_IP
```

### One-Command Shortcuts

Two npm scripts wrap the steps above so you don't have to hand-copy the release id:

```bash
# Publish a new release AND deploy it, in one shot (release id auto-generated as UTC timestamp)
npm run server:ship             # deploys to the `aws` SSH alias by default
npm run server:ship -- aws
npm run server:ship -- ubuntu@1.2.3.4

# Package + deploy a release that was already published (defaults to the latest one)
npm run server:deploy [-- <release-id>]
```

`server:deploy` reads the target server from `SERVER=user@host` in `.env` (falls back to erroring if unset). `server:ship` takes the server as a positional arg (default `aws`, an SSH config alias).

The server-side deploy script (`deploy-on-server.sh`) does:
- expands the tarball under `/opt/brijesh-infra/releases/<id>/`
- stops the previous stack
- starts the new stack with `--pull never`
- flips `/opt/brijesh-infra/current` symlink

For rollback on the server, `deploy-on-server.sh` is not persisted on the server — copy `rollback-on-server.sh` up first:
```bash
scp scripts/server/rollback-on-server.sh user@server-ip:/tmp/
ssh user@server-ip "sudo bash /tmp/rollback-on-server.sh prod-YYYYMMDD-00"
```

## What Is Still Deferred

- release retention/prune automation
- CI/CD integration

See [`STATUS_AND_DEFERRED.md`](./STATUS_AND_DEFERRED.md) for full status.
