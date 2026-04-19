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

### Phase 6

- local release snapshots
- local publish/apply/rollback
- local municipal media bind mount

## Deferred

- TLS rendering and certificate flow in the new release runtime
- final production cutover
- production `/opt/brijesh-infra` runtime activation
- real non-stub end-to-end proof across every service
- release pruning automation
- remote/server publish flow

## Legacy Files

The old manual `docs/*.md` files were removed. The items below still exist but should not be treated as the new source of truth:

- `docs/`
- `ssl-setup/`
- old manual compose/nginx/deploy material

For the new workflow, use:

- `readme/`
- `config/stack.yaml`
- `scripts/`

## Recommended Next Step

Use the final validation phase before any production cutover:

- real builds instead of stub builds
- full integrated local release test
- final media permission and backup review
- TLS/certificate integration review
- production cutover checklist
