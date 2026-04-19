# Master Guide

## Purpose

This guide is the main operator manual for the new infra system in this repo.

It covers:

- validation
- preview flows
- service build flows
- local release publish/apply/rollback
- service lifecycle changes

It does not cover TLS cutover yet. That is still deferred.

## Source Of Truth

- Main config: [`../config/stack.yaml`](../config/stack.yaml)
- Scripts: [`../scripts/`](../scripts)
- Local release state: [`../generated/runtime-state/`](../generated/runtime-state)

## Service Modes

- `edge-static`
  - static frontend assets served directly by edge nginx
  - examples: `portfolio-web`, `ranju-web`, `cors-web`, `municipal-admin`
- `isolated`
  - one container per service
  - examples: `subsnepal-web`, `subsnepal-api`
- `shared-node`
  - one container per group, multiple PM2-managed backend processes inside it
  - current group: `low-node`
  - current services: `cors-api`, `getdata`, `municipal-api`

## Environment File Precedence

Applied in this order:

1. `env/global.env`
2. `env/global.secrets.env`
3. `env/services/<service>.env`
4. `env/services-secrets/<service>.env`

## Main Commands

### Validate

```bash
npm run validate
npm run validate:remote
```

### Render General Preview Files

```bash
npm run render
```

### Edge-Static Preview

```bash
npm run build:edge-static:stub
npm run preview:edge-static:render
npm run preview:edge-static:up
npm run preview:edge-static:down
```

Preview port: `8088`

### Isolated Preview

```bash
npm run build:isolated-preview:stub
npm run preview:isolated:render
npm run preview:isolated:up
npm run preview:isolated:down
```

Preview port: `8089`

### Shared-Node Preview

```bash
npm run build:shared-node-preview:stub
npm run preview:shared-node:render
npm run preview:shared-node:up
npm run preview:shared-node:down
```

Preview port: `8090`

### Local Release Flow

```bash
npm run release:publish -- --release my-release --port 8091
npm run release:apply -- --release my-release
npm run release:rollback -- --release previous-release
```

Local integrated runtime port: `8091`

## Recommended Workflow

### 1. Edit Config

Update [`../config/stack.yaml`](../config/stack.yaml) and the needed env files.

### 2. Validate

```bash
npm run validate
```

If repo/ref reachability matters for your change:

```bash
npm run validate:remote
```

### 3. Preview Only The Changed Area

- frontend-only static change:
  - run the `edge-static` preview flow
- isolated service change:
  - run the `isolated` preview flow
- grouped backend change:
  - run the `shared-node` preview flow

### 4. Publish A Local Release Snapshot

```bash
npm run release:publish -- --release 20260418-01 --port 8091
```

### 5. Apply The Local Release

```bash
npm run release:apply -- --release 20260418-01
```

### 6. Validate The Integrated Local Stack

Use `curl` with `Host` headers against `127.0.0.1:8091`.

Examples:

```bash
curl -i -H 'Host: brijeshdev.space' http://127.0.0.1:8091/
curl -i -H 'Host: api-cors-proxy.brijeshdev.space' http://127.0.0.1:8091/
curl -i -H 'Host: subsnepal.brijeshdev.space' http://127.0.0.1:8091/api/
curl -i -H 'Host: admin.municipa.brijeshdev.space' http://127.0.0.1:8091/media/
```

### 7. Roll Back If Needed

```bash
npm run release:rollback -- --release 20260418-00
```

## Add Or Change Services

Use [`SERVICE_MANAGEMENT.md`](./SERVICE_MANAGEMENT.md) for the full flow.

Short version:

1. edit `config/stack.yaml`
2. add or update env files
3. run `npm run validate`
4. run the relevant preview flow
5. publish and apply a local release

## Media Storage

`municipal-api` is the only service that currently needs persistent local storage.

Use [`MEDIA_STORAGE.md`](./MEDIA_STORAGE.md) before changing anything related to:

- `/media`
- bind mounts
- backups
- migration to another server
- permissions

## Current Local Release Layout

```text
generated/runtime-state/
├── current -> releases/<release-id>
├── data/
│   └── municipal/
│       └── media/
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

## Important Limits Right Now

- no TLS in the new release runtime yet
- no production cutover yet
- local release runtime currently uses `generated/runtime-state`
- production target paths in `stack.yaml` still represent the intended final deployment model

See [`STATUS_AND_DEFERRED.md`](./STATUS_AND_DEFERRED.md) for the current boundary.
