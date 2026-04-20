# Documentation Index

This folder is the current documentation set for the new infra workflow.

## Start Here

- [`MASTER_GUIDE.md`](./MASTER_GUIDE.md) — main operator guide: validate, preview, publish, apply, rollback
- [`PROD_RUNBOOK.md`](./PROD_RUNBOOK.md) — end-to-end: local testing → SSL provisioning → production deploy → verification

## Focused Guides

- [`SERVICE_MANAGEMENT.md`](./SERVICE_MANAGEMENT.md) — how to add, update, disable, remove, and move services
- [`RELEASES_AND_ROLLBACK.md`](./RELEASES_AND_ROLLBACK.md) — release snapshots, apply, rollback
- [`MEDIA_STORAGE.md`](./MEDIA_STORAGE.md) — safe handling of `municipal-api` media storage
- [`STATUS_AND_DEFERRED.md`](./STATUS_AND_DEFERRED.md) — current status, completed phases, deferred work

## Secrets Management

We use **Infisical** to manage and sync `.secrets.env` files across environments.

| Command | What it does |
|---|---|
| `npm run infisical:login` | Log in to the Infisical CLI |
| `npm run infisical:init` | Link the repository to an Infisical project |
| `npm run infisical:pull:development` | Pull development secrets locally |
| `npm run infisical:pull:staging` | Pull staging secrets locally |
| `npm run infisical:pull:production` | Pull production secrets locally |

Secrets are currently stored at the Infisical root path `/`.
The pull script exports from that path and writes the result into the local `.secrets.env` files declared in `stack.yaml`.
Missing local directories are created automatically before writing.

See [`MASTER_GUIDE.md`](./MASTER_GUIDE.md) for full Infisical details.

## SSL

All cert operations are driven from `config/stack.yaml` as single source of truth.

| Command | What it does |
|---|---|
| `npm run ssl:generate-domains` | Regenerate `ssl-setup/domains.conf` from stack.yaml |
| `npm run ssl:certbot:grouped` | Issue one cert per root domain (recommended for production) |
| `npm run ssl:certbot` | Issue one cert per individual hostname |
| `npm run ssl:certbot:dry` | Dry run — simulate without issuing |
| `sudo bash ssl-setup/certbot-run.sh --domain foo.com` | Issue/renew a single domain |
| `npm run ssl:certbot:force-all` | Force re-issue all certs regardless of expiry |

To add a new root domain:
1. Add it to `tls.root_domains` in `config/stack.yaml` with a `cert_name`
2. Add hostnames to ingress entries
3. `npm run ssl:generate-domains`
4. `npm run ssl:certbot:grouped` on the server
5. `npm run release:publish:prod -- --release prod-YYYYMMDD-01` then push

## Source Of Truth

- Config: [`../config/stack.yaml`](../config/stack.yaml)
- Scripts: [`../scripts/`](../scripts)
- SSL scripts: [`../ssl-setup/certbot-run.sh`](../ssl-setup/certbot-run.sh)
- Server scripts: [`../scripts/server/`](../scripts/server)
- Local release runtime: [`../generated/runtime-state/`](../generated/runtime-state)

## Important Note

`../ssl-setup/setup-ssl.sh` is the old script and is no longer the primary tool. Use `ssl-setup/certbot-run.sh` instead. The old `../docs/` folder was removed. Use this `readme/` folder for the new system.
