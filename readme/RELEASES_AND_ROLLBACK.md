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

- ensures the local data directories exist
- runs `docker compose up -d --build --remove-orphans` from that release
- updates `generated/runtime-state/current`

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
curl -i -H 'Host: brijeshdev.space' http://127.0.0.1:8091/
curl -i -H 'Host: api-cors-proxy.brijeshdev.space' http://127.0.0.1:8091/
curl -i -H 'Host: subsnepal.brijeshdev.space' http://127.0.0.1:8091/api/
curl -i -H 'Host: admin.municipa.brijeshdev.space' http://127.0.0.1:8091/media/
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

## What Is Not Done Yet

- no retention/prune automation yet
- no remote publish target yet
- no production `/opt/brijesh-infra` release runtime yet
- no TLS yet

This release system is intentionally local-safe first.
