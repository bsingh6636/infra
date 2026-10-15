# Master Guide

This is the operator overview for the config-driven infrastructure. [config/stack.yaml](../config/stack.yaml) defines the target stack; [PROD_RUNBOOK.md](PROD_RUNBOOK.md) covers deployment and verification. Check the server's current release separately to determine what is live.

## Service Modes

| Mode | Current enabled services | Runtime |
|---|---|---|
| `edge-static` | portfolio-web, ranju-web, cors-web, municipal-admin, sahayog-web, stylework-web, codify-web | Static files served by edge Nginx |
| `shared-node` | cors-api, getdata | PM2 in `shared-low-node` |
| `isolated` | subsnepal-web, subsnepal-api, municipal-api, siranchowk-municipal, ratnagar-municipal, madhyabindu-municipal, devghat-municipal, sahayog-api, stylework-api | One container per service |
| `image` | redis | Prebuilt image |

`otp-api` is a disabled isolated service using its repository Dockerfile. Redis is enabled and `subsnepal-api` depends on it.

## Environments

Install local dependencies and connect Infisical:

```bash
npm ci
npm run infisical:login
npm run infisical:init
npm run infisical:pull:production
```

Development and staging use `infisical:pull:development` and `infisical:pull:staging`. The script maps environment aliases to `dev`, `staging`, and `prod`, exports from `/`, and writes the same payload to the declared global and enabled-service env files. It does not split one export by service.

```bash
npm run infisical:pull:production -- --force
npm run infisical:pull:production -- --only=subsnepal-api
npm run infisical:pull:production -- --dry-run
```

The dotenv merge order is global nonsecret, global secret, service nonsecret, service secret. Later files override earlier ones. Isolated backend builds then overlay `runtime.env` and finally set `PORT` from `runtime.port`. Each backend gets its own generated env file, including when multiple services share an image. Shared-node start scripts also apply their declared `runtime.env` after loading the merged files. Image-mode env files are generated at publish time.

Frontend build values must be present before building; restarting a container does not rebuild static bundles. Keep secrets in the ignored env files. The separate root `.env` supplies the deployment `SERVER`; the server copy can also contain `CLOUDFLARE_API_TOKEN` for SSL tooling.

## Validate And Build

```bash
npm run validate
npm test
npm run validate:remote
npm run render
```

`validate:remote` additionally checks Git source access. `render` creates general preview configuration, not deployable application artifacts. Regression tests use local fixtures and mocked server commands.

Production artifacts require real builds:

```bash
npm run build:edge-static
npm run build:isolated-preview
npm run build:shared-node-preview
```

Static output auto-detection checks `dist`, `build`, and `out` for edge-static services. `codify-web` uses a Next.js static export. Isolated static frontend auto-detection currently checks `dist` and `build`; set `build.output_dir` explicitly if needed there.

For isolated backends, `build.shared_image: municipal-backend` deduplicates the municipal build context and release image. Ports, environment files, limits, and media mounts remain separate. Rebuild all isolated services after changing runtime settings for several municipalities. Rebuild the entire shared-node group whenever its membership changes.

## Local Previews

Use stub builds for local routing tests only. They overwrite the corresponding generated artifacts; run real builds again before production publishing.

| Scope | Build | Preview commands | Port |
|---|---|---|---|
| Static | `npm run build:edge-static:stub` | `npm run preview:edge-static:render`, `:up`, `:down` | 8088 |
| Isolated | `npm run build:isolated-preview:stub` | `npm run preview:isolated:render`, `:up`, `:down` | 8089 |
| Shared group | `npm run build:shared-node-preview:stub` | `npm run preview:shared-node:render`, `:up`, `:down` | 8090 |

In the command column, replace the final action with `render`, `up`, or `down`. Mode previews are disposable; use an integrated release to validate image-mode dependencies and persistent mounts.

## Release And Deployment

After builders have produced all enabled services' inputs:

```bash
npm run release:publish -- --release local-check-01 --port 8091
npm run release:apply -- --release local-check-01
npm run release:rollback -- --release previous-local-release
```

Production publishing enables TLS, mounts certificates, and maps ports 80 and 443:

```bash
npm run release:publish:prod -- --release prod-YYYYMMDD-01
./scripts/server/push-release.sh prod-YYYYMMDD-01 aws
```

`npm run server:ship -- aws` publishes and deploys already-built artifacts using an automatically generated release ID. `npm run server:deploy -- <release-id>` deploys an existing release using `SERVER` from `.env`. Neither shortcut rebuilds application sources. Committing or pushing Git changes also does not deploy the server.

See [RELEASES_AND_ROLLBACK.md](RELEASES_AND_ROLLBACK.md) for registry publishing, image availability during rollback, and in-place static deployments.

## Municipal Migration And Operations

Follow [MUNICIPAL_MIGRATION.md](MUNICIPAL_MIGRATION.md) for the first cutover. It requires regenerating isolated and shared-node artifacts before publishing. The `municipal` deploy target also rebuilds `shared-low-node` to retire its previous municipal processes. A brief interruption can occur before the edge is recreated.

```bash
npm run municipal:status
npm run municipal:restart -- ratnagar
npm run municipal:logs -- devghat
npm run deploy:edge-static -- municipal-admin
```

The static shortcut replaces one service's files in the current release. Use a normal published release for changed ingress, a new service, or a separate rollback snapshot.

## SSL

```bash
npm run ssl:generate-domains
```

On the prepared server, with current configuration and Cloudflare credentials:

```bash
sudo bash ssl-setup/certbot-run.sh --grouped
sudo certbot certificates
```

TLS is implemented. The generator updates `domains.conf`, not DNS or Nginx. Release publishing renders Nginx. Check renewal scheduling and reload hooks on the server; see [../ssl-setup/README.md](../ssl-setup/README.md).

## Storage And Layout

All five municipal media directories and Sahayog uploads live outside release directories. Municipal containers mount their own media at `/srv/app/media`. Redis is configured as bounded cache-only soft state, with persistence disabled even though a `/data` bind mount exists. See [MEDIA_STORAGE.md](MEDIA_STORAGE.md).

```text
generated/runtime-state/
├── current -> releases/<release-id>
├── data/
└── releases/<release-id>/
    ├── compose.yaml
    ├── nginx.conf
    ├── release.lock.yaml
    ├── edge-static/
    ├── isolated/           # build contexts in non-registry releases
    ├── isolated-env/
    ├── shared/             # build contexts in non-registry releases
    └── shared-env/
```

The production layout is `/opt/brijesh-infra/{releases,current,data,incoming}`. Scripts use `/opt/brijesh-infra/current`, rather than the currently unused `project.live_symlink` config value.

[Service management](SERVICE_MANAGEMENT.md), [operations](OPERATIONS.md), and [status](STATUS_AND_DEFERRED.md) cover the remaining workflows. [Previous documentation](archive/2026-10-15-pre-doc-refresh/README.md) is retained temporarily with removal criteria.
