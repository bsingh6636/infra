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

### Shared-Node Services

- `cors-api`
- `getdata`
- `municipal-api`

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

## Current Preview Mapping

- `edge-static` preview: `8088`
- `isolated` preview: `8089`
- `shared-node` preview: `8090`
- integrated release runtime: `8091`
