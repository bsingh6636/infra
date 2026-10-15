# Infra Repo

Config-driven Docker infrastructure for static frontends, isolated backends, PM2 groups, and Redis behind an Nginx edge. [config/stack.yaml](config/stack.yaml) defines services, routing, storage, resources, and TLS.

## Start Here

- [Documentation index](readme/README.md)
- [Master guide](readme/MASTER_GUIDE.md) — environment setup and normal workflow
- [Production runbook](readme/PROD_RUNBOOK.md) — build, deploy, verify, roll back
- [Municipal migration](readme/MUNICIPAL_MIGRATION.md) — old topology, new topology, cutover checks
- [Operations](readme/OPERATIONS.md) — logs, status, restarts, partial deployments
- [Service management](readme/SERVICE_MANAGEMENT.md) — add, move, disable, remove services
- [Media storage](readme/MEDIA_STORAGE.md) — all five municipal mounts and backups
- [Releases and rollback](readme/RELEASES_AND_ROLLBACK.md)
- [Status and deferred work](readme/STATUS_AND_DEFERRED.md)

## Current Configuration

Seven edge-static frontends include `codify-web` at `codifyteam.com` and `www.codifyteam.com`. Five municipal backends run as separate containers sharing one `municipal-backend` image, with separate ports, environment files, and media directories. Only `cors-api` and `getdata` remain in the `low-node` PM2 group. Redis is enabled; `otp-api` is disabled. TLS and production deployment are implemented.

This describes the checked-in configuration. Confirm the active production release before assuming the municipal migration has been deployed.

## Quick Start

```bash
npm ci
npm run infisical:pull:production
npm run validate
npm test
npm run render
```

Infisical login and project setup are covered in the master guide. `render` creates general preview configuration; real builds and release publishing are separate steps.

## Previous Documentation

[The dated archive](readme/archive/2026-10-15-pre-doc-refresh/README.md) preserves the docs before this refresh and before the municipal migration commit. It includes commit IDs, checksums, and a later removal checklist. Keep it until the updated instructions and production migration have been verified. Current operational instructions live in `readme/`; [ssl-setup/README.md](ssl-setup/README.md) identifies active and legacy SSL tools.
