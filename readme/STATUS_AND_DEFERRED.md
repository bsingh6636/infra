# Status And Deferred Items

## Implemented

### Phase 1

- repo structure for the new system
- `config/stack.yaml`
- env file model
- validation framework

### Phase 2

- renderer for preview `compose.yaml`
- renderer for preview `nginx.conf`

### Phase 3

- `edge-static` build flow
- disposable edge-static preview

### Phase 4

- isolated preview flow
- `subsnepal-web`
- `subsnepal-api`

### Phase 5

- shared-node preview flow
- PM2-managed grouped backends
- `cors-api`
- `getdata`
- `municipal-api`

### Bug Fixes

- **env value quoting** — `serializeEnvValue` in `scripts/build/shared-node-preview.mjs`
  and `scripts/build/isolated-preview.mjs` now single-quotes all generated env values.
  Previously, values containing `&` (e.g. JWT secrets) were written unquoted; sh parsed
  the `&` as a background operator and ran the trailing text as a foreground command,
  which exited 127 under `set -e` and crashed every PM2 process on boot.
- **frontend build dependencies** — `scripts/build/edge-static.mjs` and `scripts/build/isolated-preview.mjs`
  now use `--include=dev` during `npm install`. This ensures tools like `tsc` and `vite` are
  available for builds even when `NODE_ENV=production` is set in the environment.
- **production port default** — `package.json` now defaults the production release port
  to `80` in the `release:publish:prod` script, avoiding the default local testing
  port of `8091`.

### Phase 6

- local release snapshots
- local publish/apply/rollback
- local municipal media bind mount

### Phase 7 (Production Readiness)

- real non-stub end-to-end proof across every service
- `--build` immutability fix in `apply.mjs` and `rollback/index.mjs`
- stack-driven storage directory creation in `apply.mjs` (replaces hardcoded `municipal/media`)
- TLS rendering in `release-nginx.mjs` — per-host cert resolution from `tls.root_domains`
- multi-root-domain support (`brijeshkushwaha.com.np` + `subsnepal.com` + any future domains)
- `--cert-name` removed — cert path fully automatic from `stack.yaml`
- production deploy scripts: `push-release.sh`, `deploy-on-server.sh`, `rollback-on-server.sh`
- SSL automation: `certbot-run.sh` with per-domain isolation, expiry-aware skip, `--grouped` mode
- `generate-domains-conf.mjs` — auto-syncs `domains.conf` from `stack.yaml`
- `setup-ssl.sh` renewal hooks updated to use new release system (`/opt/brijesh-infra/current/`)
- `PROD_RUNBOOK.md` — full local test + production deployment + verification guide

## Deferred

- release pruning automation
- CI/CD integration

## Legacy Files

The old manual `docs/*.md` files were removed. The items below still exist but should not be treated as the new source of truth:

- `docs/`
- `ssl-setup/setup-ssl.sh` — replaced by `ssl-setup/certbot-run.sh`
- old manual compose/nginx/deploy material

For the new workflow, use:

- `readme/`
- `config/stack.yaml`
- `scripts/`

## Recommended Next Step

- Real builds instead of stub builds
- Full integrated local release test (`PROD_RUNBOOK.md` Part 1)
- SSL cert provisioning on server (`certbot-run.sh --grouped`)
- First production deploy (`push-release.sh`)
