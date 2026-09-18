# Documentation Index

This folder is the current documentation set for the new infra workflow.

## Start Here

- [`MASTER_GUIDE.md`](./MASTER_GUIDE.md) — main operator guide: validate, preview, publish, apply, rollback
- [`PROD_RUNBOOK.md`](./PROD_RUNBOOK.md) — end-to-end: local testing → SSL provisioning → production deploy → verification

## Focused Guides

- [`OPERATIONS.md`](./OPERATIONS.md) — day-to-day cheat sheet: logs, PM2, restarts, diagnostics
- [`SERVICE_MANAGEMENT.md`](./SERVICE_MANAGEMENT.md) — how to add, update, disable, remove, and move services
- [`RELEASES_AND_ROLLBACK.md`](./RELEASES_AND_ROLLBACK.md) — release snapshots, apply, rollback
- [`MEDIA_STORAGE.md`](./MEDIA_STORAGE.md) — safe handling of `municipal-api` media storage
- [`STATUS_AND_DEFERRED.md`](./STATUS_AND_DEFERRED.md) — current status, completed phases, deferred work

## Environment Management

We use **Infisical** to manage and sync local env files across environments.

| Command | What it does |
|---|---|
| `npm run infisical:login` | Log in to the Infisical CLI |
| `npm run infisical:init` | Link the repository to an Infisical project |
| `npm run infisical:pull:development` | Pull development env values locally |
| `npm run infisical:pull:staging` | Pull staging env values locally |
| `npm run infisical:pull:production` | Pull production env values locally |

The pull script accepts friendly names but calls Infisical with this project's actual slugs: `dev`, `staging`, and `prod`.

Env values are currently stored at the Infisical root path `/`.
The pull script exports from that path and writes the same dotenv payload into every local env file declared in `stack.yaml`: `env/global.env`, `env/global.secrets.env`, `env/services/*.env`, and `env/services-secrets/*.env`.
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

## Human Actions

Almost everything else in this repo is scripted — validation, builds, previews, releases, deploys,
and cert issuance are all `npm run ...` commands (see `MASTER_GUIDE.md`, or
[`../CLAUDE.md`](../CLAUDE.md) for the exhaustive AI-facing command reference). This section lists
only what still genuinely requires a human — access to a dashboard the CLI can't reach, a judgment
call, or something outside this repo entirely. If it's not here, there's a script for it.

**One-time / occasional, outside this repo:**
- **Cloudflare dashboard** — create/update DNS records for any new domain or subdomain before running cert issuance. `npm run ssl:generate-domains` only syncs local nginx config from `stack.yaml`; it does not touch DNS.
- **Infisical dashboard** — add or rotate secret/non-secret values at the project's root `/` path. `npm run infisical:pull:*` only pulls what's already there.
- **AWS Console** — confirm the EC2 security group allows inbound 80/443 (and 22 from your IP) before a first deploy or after provisioning a new server.
- **SSH key access** — provision your key to the server before any server script (`server:ship`, `server:deploy`, `server:bootstrap`) will work.

**Judgment calls (mechanism is scripted, human decides when/whether):**
- Triggering a production deploy (`npm run server:ship`) — nothing gates this.
- Rollback — deciding a release is bad enough to roll back; the mechanism (`rollback-on-server.sh`) is scripted.
- Force-reissuing certs (`ssl:certbot:force-all`) — only for a specific reason; routine renewal (`ssl:certbot:renew`) handles the normal case.
- Deleting a service (`SERVICE_MANAGEMENT.md` → "Remove A Service") — steps are scripted, confirming nothing still depends on it is on you.

**Periodic checks (no automation yet — see `STATUS_AND_DEFERRED.md` → Deferred):**
- Watch for SSL cert renewal failures — `certbot-run.sh --renew` isn't on a cron yet.
- Watch disk usage on the server — old releases aren't pruned automatically (`release_retention: 10` in `stack.yaml` is descriptive, not enforced).
- Spot-check `docker stats` / container health after a deploy — no automated alerting exists.
- Verify `municipal-api` media backups actually restore, per `MEDIA_STORAGE.md` — the backup command is scripted, restoration is not verified automatically.

## Important Note

`../ssl-setup/setup-ssl.sh` is the old script and is no longer the primary tool. Use `ssl-setup/certbot-run.sh` instead. The old `../docs/` folder was removed. Use this `readme/` folder for the new system.
