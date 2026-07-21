# Service Management

## Where To Edit

All service definitions live in [`../config/stack.yaml`](../config/stack.yaml).

The main sections you will touch are:

- `sources`
- `services`
- `ingress`
- sometimes `groups`

## Current Service Types

### Edge-Static Frontends

- `portfolio-web`
- `ranju-web`
- `cors-web`
- `municipal-admin`

### Isolated Services

- `subsnepal-web`
- `subsnepal-api`
- `otp-api` (Spring Boot, built from the repo's own Dockerfile) — currently `enabled: false` in `stack.yaml`, staged but not live

### Shared-Node Services

- `cors-api`
- `getdata`
- `municipal-api`

### Datastores (image mode)

- `redis` (shared across services) — currently `enabled: false` in `stack.yaml`, staged but not live

## Add A New Edge-Static Frontend

Add:

1. a `sources.<key>` entry
2. a `services.<name>` entry with `deploy.mode: edge-static`
3. an `ingress` entry with `upstream.type: static`

Example:

```yaml
sources:
  my_frontend:
    repo: git@github.com:me/my-frontend.git
    ref: main

services:
  my-frontend:
    enabled: true
    kind: frontend
    source:
      key: my_frontend
      context: .
    build:
      output_dir: auto
    deploy:
      mode: edge-static

ingress:
  - name: my-frontend
    hosts:
      - name: my-frontend.example.com
    upstream:
      type: static
      service: my-frontend
      spa_fallback: true
```

## Add A New Isolated Backend

Add:

1. a source entry
2. a backend service with `deploy.mode: isolated`
3. env files
4. ingress

Example:

```yaml
services:
  my-api:
    enabled: true
    kind: backend
    source:
      key: my_api
      context: .
    deploy:
      mode: isolated
    runtime:
      port: 9100
      start: npm start
    env:
      files:
        nonsecret: env/services/my-api.env
        secret: env/services-secrets/my-api.env
      required:
        - API_KEY
```

## Add A Backend With Its Own Dockerfile (any runtime)

For services that are not plain Node (Spring Boot, Go, or a Node app that wants
full control of its image), set `build.strategy: dockerfile`. The pipeline
clones the repo and builds `<context>/Dockerfile` as-is instead of generating a
Node image.

Requirements:

- a `Dockerfile` at the source context root (or set `build.dockerfile: <path>`
  relative to the context — it is normalized to the context root at build time)
- the container must listen on `runtime.port`
- configuration arrives via `env_file` at **runtime**, not at build time

Per-service `resources:` limits apply to isolated and image services.

Example (`otp-api` — this is the repo's actual staged example; it is currently
`enabled: false` and its `depends_on: [redis]` line is commented out in
`stack.yaml` since `redis` is also disabled):

```yaml
services:
  otp-api:
    enabled: true
    kind: backend
    source:
      key: otpservice
      context: .
    build:
      strategy: dockerfile
    deploy:
      mode: isolated
    runtime:
      port: 8080
    resources:
      memory: 512m
      cpus: "0.50"
    depends_on:
      - redis
    env:
      files:
        nonsecret: env/services/otp-api.env
        secret: env/services-secrets/otp-api.env
```

## Add A Datastore (Redis, etc.)

Datastores run a prebuilt image: `kind: datastore`, `deploy.mode: image`, and a
top-level `image:`. No source repo, no build, and they must **not** appear in
`ingress`. Other services reach them by service name on the compose network
(e.g. `redis:6379`); persistence lives under `/opt/brijesh-infra/data/<name>`.

```yaml
services:
  redis:
    enabled: true
    kind: datastore
    image: redis:7-alpine
    deploy:
      mode: image
    runtime:
      port: 6379
    command: ["sh", "-c", "exec redis-server --appendonly yes --requirepass \"$REDIS_PASSWORD\""]
    env:
      files:
        secret: env/services-secrets/redis.env
      required:
        - REDIS_PASSWORD
    storage:
      - type: bind
        source: /opt/brijesh-infra/data/redis
        target: /data
```

Notes:

- `$VARS` in `command` are escaped for compose automatically and resolve inside
  the container from the service's env file.
- Consumers pass the same password: Spring Boot via
  `SPRING_DATA_REDIS_PASSWORD`, Node via `redis://:<password>@redis:6379`.
- Add `depends_on: [redis]` to services that need it at startup.

## Add A New Shared-Node Backend

Add the service and point it to an existing group, or create a new group first.

Example:

```yaml
groups:
  low-node:
    mode: shared-node
    runtime: node20
    process_manager: pm2
    resources:
      cpus: "0.50"
      memory: 512m

services:
  my-small-api:
    enabled: true
    kind: backend
    source:
      key: my_small_api
      context: .
    deploy:
      mode: shared-node
      group: low-node
    runtime:
      port: 4310
      start: npm start
```

## Move A Service Between Modes

This is intentionally config-only.

### Shared-Node To Isolated

Change:

```yaml
deploy:
  mode: isolated
```

Then remove the `group` field and keep the runtime port.

### Isolated To Shared-Node

Change:

```yaml
deploy:
  mode: shared-node
  group: low-node
```

Make sure the port does not conflict with another service in that group.

### Isolated Frontend To Edge-Static

Change:

```yaml
deploy:
  mode: edge-static
```

For `subsnepal-web`, do not make this move unless you explicitly want to stop treating it as isolated.

## Disable A Service

Set:

```yaml
enabled: false
```

Then validate and publish a new release.

## Remove A Service

1. set `enabled: false`
2. publish and apply one release to prove removal is safe
3. remove the `services` entry
4. remove related `ingress`
5. remove env files if no longer needed
6. remove the `sources` entry only if nothing else uses it

## Manage Service Env With Infisical

When adding a new service that requires env values, follow these steps to keep local files synced:

1. **Define the env files in `stack.yaml`**:
   ```yaml
   services:
     my-api:
       env:
         files:
           nonsecret: env/services/my-api.env
           secret: env/services-secrets/my-api.env
   ```

2. **Add env values to Infisical**:
   - Log in to the Infisical dashboard.
   - Add the env values at the root `/` path for the environment you are using.
   - Keep the local target files in `stack.yaml` aligned with the service name you want to write.

3. **Pull env values locally**:
   ```bash
   npm run infisical:pull:development -- --only=my-api
   ```
   This will create both `env/services/my-api.env` and `env/services-secrets/my-api.env` with the exported values from the selected Infisical path.

4. **Verify with validation**:
   ```bash
   npm run validate
   ```
   The validator will ensure the configured env files exist and that the merged env contains any keys marked as `required` in `stack.yaml`.

## Add A New Domain Or Subdomain

For a **new subdomain** under an existing root domain (e.g. `new.brijeshkushwaha.com.np`):

1. Add the host to the relevant `ingress` entry in `stack.yaml`
2. Run `npm run ssl:generate-domains` to sync `domains.conf`
3. On server: `sudo bash ssl-setup/certbot-run.sh --grouped` (skips certs with > 120 days left)
4. Publish and push a new release

For a **new root domain** (e.g. `newsite.io`):

1. Add it under `tls.root_domains` in `stack.yaml`:
```yaml
tls:
  root_domains:
    newsite.io:
      mode: wildcard_dns
      dns_provider: cloudflare
      cert_name: newsite.io
```
2. Add ingress entries with the new hosts
3. Run `npm run ssl:generate-domains`
4. On server: `sudo bash ssl-setup/certbot-run.sh --grouped`
5. Publish and push a new release — nginx cert paths are resolved automatically

## Host Rules

The system supports:

- one service with one host
- one service with many hosts (across multiple root domains)
- separate frontend and backend ingress entries
- extra routed paths like `/api`, `/media`, `/ws`, `/events`

**Multi-root-domain entries:** If one ingress entry lists hosts from different root domains (e.g. `subsnepal.brijeshkushwaha.com.np` and `subsnepal.com`), the nginx renderer automatically splits them into separate TLS server blocks — one per cert. Each block points to the same upstream.

Do not normalize or auto-correct hostnames such as `api.muncipal.brijeshkushwaha.com.np`. Use the exact value that is intended.

## Required Validation After Changes

Always run:

```bash
npm run validate
```

Then run the preview flow that matches the changed service mode.

### Service Mode Rules (enforced by `validate`)

`scripts/validate/checks/service-modes.mjs` enforces these constraints on every service — `npm run validate` fails hard if any are violated:

- `deploy.mode: image` services must define `image:`, and must **not** define `source.key`, `runtime.start`, or any `build` settings; `kind` should be `datastore`.
- Only `image`-mode services may set a top-level `image:`.
- `build.strategy: dockerfile` requires `deploy.mode: isolated` and `kind: backend`.
- `depends_on` targets must exist and be `enabled: true` — a disabled dependency is a hard error. `depends_on` is only allowed on `isolated`/`image`-mode services (they're the only ones that run their own container).
- `resources:` limits are only honored on `isolated`/`image`-mode services; setting them elsewhere is a warning, not an error (shared-node groups set limits on the group instead).

## Current Preview Mapping

- `edge-static` preview: `8088`
- `isolated` preview: `8089`
- `shared-node` preview: `8090`
- integrated release runtime: `8091`
