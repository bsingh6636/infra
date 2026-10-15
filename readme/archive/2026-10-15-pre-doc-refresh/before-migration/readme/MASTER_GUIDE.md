# Master Guide

## Purpose

This guide is the main operator manual for the new infra system in this repo.

It covers:

- validation
- preview flows
- service build flows
- local release publish/apply/rollback
- production TLS release publish and deploy
- SSL certificate issuance and renewal
- service and domain lifecycle changes

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

## Environment Management (Infisical)

We use [Infisical](https://infisical.com/) to manage the environment values for development, staging, and production. In Infisical mode, the pull script exports one dotenv payload from Infisical and writes it into every env file listed above.

### Setup

Before pulling secrets for the first time:

```bash
npm run infisical:login               # log in to your account
npm run infisical:init                # link this repo to the Infisical project
```

### Pulling Env Values

Pull all env values for a specific environment:

```bash
npm run infisical:pull:development    # pulls into local env/ files
npm run infisical:pull:staging        # pulls into local env/ files
npm run infisical:pull:production     # pulls into local env/ files
```

These commands map to the actual Infisical environment slugs used by this project:
`development` -> `dev`, `staging` -> `staging`, and `production` -> `prod`.

Advanced pull options:

```bash
# Force overwrite existing local env files
npm run infisical:pull -- --env=production --force

# Pull only for a specific service
npm run infisical:pull -- --env=production --only=subsnepal-api

# Dry run (see what would change)
npm run infisical:pull -- --env=production --dry-run
```

### Infisical Structure

- Env values are currently stored at the root `/` path in Infisical.
- The pull script exports from a single Infisical path and writes that same content into all configured local env files: `env/global.env`, `env/global.secrets.env`, `env/services/*.env`, and `env/services-secrets/*.env`.
- Local directories are created automatically if they do not exist yet.

The `npm run validate` command still checks the physical env files declared in `stack.yaml`. If you are using Infisical, run the pull first so those files exist locally. If you are managing env files manually, create/update the same files yourself before validating.

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

### Local Release Flow (HTTP, for local testing)

```bash
npm run release:publish -- --release my-release --port 8091
npm run release:apply -- --release my-release
npm run release:rollback -- --release previous-release
```

Local integrated runtime port: `8091`

### Production Release Flow (TLS, for server deploy)

```bash
npm run release:publish:prod -- --release prod-YYYYMMDD-01
./scripts/server/push-release.sh prod-YYYYMMDD-01 ubuntu@SERVER_IP
```

Or, in one command (auto-generates the release id so you don't have to copy it between steps):

```bash
npm run server:ship               # publish + push + deploy, targets the `aws` SSH alias by default
npm run server:deploy             # package + deploy the latest already-published release, target read from SERVER in .env
```

See [`RELEASES_AND_ROLLBACK.md`](./RELEASES_AND_ROLLBACK.md) for details on both shortcuts.

### SSL Certificate Management

```bash
npm run ssl:generate-domains         # sync domains.conf from stack.yaml
npm run ssl:certbot:grouped          # issue/renew one cert per root domain (recommended)
npm run ssl:certbot:dry              # dry run — simulate without issuing
sudo bash ssl-setup/certbot-run.sh --domain subsnepal.com   # single domain only
npm run ssl:certbot:force-all        # force re-issue all certs
```

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
curl -i -H 'Host: brijeshkushwaha.com.np' http://127.0.0.1:8091/
curl -i -H 'Host: api-cors-proxy.brijeshkushwaha.com.np' http://127.0.0.1:8091/
curl -i -H 'Host: subsnepal.brijeshkushwaha.com.np' http://127.0.0.1:8091/api/
curl -i -H 'Host: admin.municipa.brijeshkushwaha.com.np' http://127.0.0.1:8091/media/
curl -i -H 'Host: subsnepal.com' http://127.0.0.1:8091/
curl -i -H 'Host: api.subsnepal.com' http://127.0.0.1:8091/
```

### 7. Roll Back If Needed

```bash
npm run release:rollback -- --release 20260418-00
```

### 8. Publish A Production TLS Release

```bash
npm run release:publish:prod -- --release prod-20260418-01
# verify
grep 'listen 443' generated/runtime-state/releases/prod-20260418-01/nginx.conf
grep 'ssl_certificate' generated/runtime-state/releases/prod-20260418-01/nginx.conf
# push to server
./scripts/server/push-release.sh prod-20260418-01 ubuntu@SERVER_IP
```

## Add Or Change Services

Use [`SERVICE_MANAGEMENT.md`](./SERVICE_MANAGEMENT.md) for the full flow.

Short version:

1. edit `config/stack.yaml` — add source, service, ingress
2. if new root domain: add it under `tls.root_domains` with a `cert_name`
3. add or update env files
4. run `npm run validate`
5. run the relevant preview flow
6. publish and apply a local release
7. on server: `sudo bash ssl-setup/certbot-run.sh --grouped` (for new domains)
8. publish and push a production TLS release

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

## Production vs Local Release

| | Local | Production |
|---|---|---|
| Command | `release:publish` | `release:publish:prod` |
| nginx | HTTP only | HTTP→HTTPS redirect + TLS server blocks |
| Ports | `8091:80` | `80:80` + `443:443` |
| Cert mounts | none | `/etc/letsencrypt:ro` + `/var/www/certbot:ro` |
| Deploy | `release:apply` | `push-release.sh` → `deploy-on-server.sh` (or `npm run server:ship` / `npm run server:deploy`) |

See [`PROD_RUNBOOK.md`](./PROD_RUNBOOK.md) for the full end-to-end production guide.
See [`STATUS_AND_DEFERRED.md`](./STATUS_AND_DEFERRED.md) for current status and deferred items.
