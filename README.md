# Infra Repo

This repo now contains the new config-driven infra workflow we built in phases 1-6.

The main documentation lives in [`readme/`](./readme):

- [`readme/README.md`](./readme/README.md) - doc index
- [`readme/MASTER_GUIDE.md`](./readme/MASTER_GUIDE.md) - main operator guide
- [`readme/SERVICE_MANAGEMENT.md`](./readme/SERVICE_MANAGEMENT.md) - add, update, disable, move, remove services
- [`readme/RELEASES_AND_ROLLBACK.md`](./readme/RELEASES_AND_ROLLBACK.md) - release snapshots, apply, rollback
- [`readme/MEDIA_STORAGE.md`](./readme/MEDIA_STORAGE.md) - municipal media bind mount, backups, migration, monitoring
- [`readme/STATUS_AND_DEFERRED.md`](./readme/STATUS_AND_DEFERRED.md) - what is implemented vs deferred

## Current Status

- `config/stack.yaml` is the source of truth
- validation, preview flows, shared-node preview, and local release snapshots are implemented
- TLS and production deployment are implemented and active

## Quick Start

```bash
npm run validate
npm run render
```

For the real workflow, start with [`readme/MASTER_GUIDE.md`](./readme/MASTER_GUIDE.md).

## Legacy Docs

The old manual guides in `docs/` were removed. `ssl-setup/` is still present only as legacy reference material for the older SSL flow. Treat `readme/` as the authoritative documentation for the new system.
