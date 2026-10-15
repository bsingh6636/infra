# Documentation Index

These guides describe the current configuration and scripts. A commit or push does not deploy production; verify `/opt/brijesh-infra/current` separately.

## Start Here

- [MASTER_GUIDE.md](MASTER_GUIDE.md) — setup, environments, builds, previews
- [PROD_RUNBOOK.md](PROD_RUNBOOK.md) — production release and verification
- [MUNICIPAL_MIGRATION.md](MUNICIPAL_MIGRATION.md) — migration from shared PM2 processes to isolated containers

## Focused Guides

- [OPERATIONS.md](OPERATIONS.md) — logs, restarts, diagnostics, partial deployments
- [SERVICE_MANAGEMENT.md](SERVICE_MANAGEMENT.md) — service and domain lifecycle
- [RELEASES_AND_ROLLBACK.md](RELEASES_AND_ROLLBACK.md) — snapshots, registry mode, apply, rollback
- [MEDIA_STORAGE.md](MEDIA_STORAGE.md) — five municipal media mounts and backups
- [STATUS_AND_DEFERRED.md](STATUS_AND_DEFERRED.md) — implemented behavior and remaining work
- [../ssl-setup/README.md](../ssl-setup/README.md) — active SSL commands and legacy files
- [../CLAUDE.md](../CLAUDE.md) — agent reference
- [../TODO.md](../TODO.md) — follow-up checklist

## Environment Management

```bash
npm run infisical:login
npm run infisical:init
npm run infisical:pull:development
npm run infisical:pull:staging
npm run infisical:pull:production
```

The environment aliases map to `dev`, `staging`, and `prod`. The pull script exports a single dotenv payload from Infisical's `/` path to the configured global and enabled-service env files. It creates missing directories. Use `-- --force` to overwrite existing files or `-- --only=<service>` to scope the pull.

For isolated backends, the build then overlays `runtime.env` and sets `PORT` from `runtime.port` in each service's generated env file. Rebuild affected artifacts after environment or runtime configuration changes.

## Source Of Truth

- [../config/stack.yaml](../config/stack.yaml) — services, sources, ingress, storage, TLS
- [../package.json](../package.json) — npm commands
- [../scripts/](../scripts/) — builders, renderers, validators, deployment
- [../ssl-setup/certbot-run.sh](../ssl-setup/certbot-run.sh) — current certificate tool

`npm run ssl:generate-domains` updates `ssl-setup/domains.conf`; it does not update DNS or Nginx configuration. Production Nginx configuration is rendered by release publishing.

## Operator Responsibilities

Set up DNS, SSH access, Cloudflare credentials, and AWS network access before provisioning a server or adding domains. Add or rotate values in Infisical before pulling them. Trigger deployments and rollbacks deliberately, check container health and disk usage, and verify media backups restore. Release retention and monitoring are not automated. Check the server's certificate renewal timer and Nginx reload hook; issuance does not prove unattended renewal works.

## Old References And Later Cleanup

[2026-10-15 documentation archive](archive/2026-10-15-pre-doc-refresh/README.md) contains exact copies from commits `9b2f406` and `30d4987`. Those are historical references; use the guides above for current commands. The archive README lists the conditions and links to remove when it is no longer needed. No old references are deleted by this update.
