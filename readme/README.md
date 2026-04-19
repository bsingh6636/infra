# Documentation Index

This folder is the current documentation set for the new infra workflow.

## Start Here

- [`MASTER_GUIDE.md`](./MASTER_GUIDE.md) - main operator guide for validate, preview, publish, apply, rollback

## Focused Guides

- [`SERVICE_MANAGEMENT.md`](./SERVICE_MANAGEMENT.md) - how to add, update, disable, remove, and move services
- [`RELEASES_AND_ROLLBACK.md`](./RELEASES_AND_ROLLBACK.md) - how release snapshots are stored and how local apply/rollback works
- [`MEDIA_STORAGE.md`](./MEDIA_STORAGE.md) - safe handling of `municipal-api` media storage
- [`STATUS_AND_DEFERRED.md`](./STATUS_AND_DEFERRED.md) - current status, deferred work, and cutover notes

## Source Of Truth

- Config: [`../config/stack.yaml`](../config/stack.yaml)
- Scripts: [`../scripts/`](../scripts)
- Local release runtime: [`../generated/runtime-state/`](../generated/runtime-state)

## Important Note

The old manual guides in `../docs/` were removed and replaced with a redirect file. `../ssl-setup/` still exists only as legacy reference material. Use this `readme/` folder for the new system.
