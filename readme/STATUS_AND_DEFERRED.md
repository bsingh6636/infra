# Status And Deferred Work

This describes implemented repository behavior as of the documentation refresh on 2026-10-15. Deployment status must be checked against the server's active release; no migration is marked complete solely because its code is committed.

## Implemented

- `config/stack.yaml` defines service sources, deployment modes, ingress, TLS, limits, env-file locations, dependencies, and storage.
- Structural/env validation and optional remote Git source validation.
- Real and stub builders for edge-static, isolated, and shared-node modes, plus disposable mode previews.
- TLS-aware production and HTTP-only local release rendering/publishing, local apply/rollback, and server deployment/rollback scripts.
- Infisical root-path exports to declared local env files, including environment aliases and scoped/forced pulls.
- Active SSL tooling in `certbot-run.sh`, hostname-list generation, and optional self-signed fallback paths.
- Dockerfile-based isolated builds and prebuilt image-mode services. Redis is enabled with cache-only settings; `otp-api` remains disabled.
- Seven edge-static frontends, including `codify-web` on `codifyteam.com` / `www.codifyteam.com`. Edge-static output detection supports `dist`, `build`, and `out`; release Nginx includes `_next` assets in its cache rule.

## Municipal Isolation Change

The five municipal backends are configured as independent containers using one shared `municipal-backend` image/context. Each has a per-service environment, its own port, limits of 0.20 CPU / 192m, and a separate host media directory mounted at `/srv/app/media`.

The `low-node` shared group now contains `cors-api` and `getdata`. The targeted `municipal` deployment includes the shared group so its former municipal PM2 processes are removed, then recreates edge. The [migration guide](MUNICIPAL_MIGRATION.md) records the previous topology, downtime window, rebuild requirements, and verification.

## Fixes And Regression Coverage

- Isolated backend env generation overlays each service's `runtime.env` and `PORT`, preventing the shared image's default port from being reused by every container.
- Targeted municipal deployment rebuilds the revised shared group.
- Static redeployment stages and replaces the named site's directory so deleted files disappear, and restores/preserves the old directory on extraction or reload failure.
- Shell service-name guards protect the static and municipal management commands from shell metacharacters in a supplied target.
- Five fixture regression tests run with `npm test`, covering shared-image runtime settings/release packaging, migration ordering, static replacement, and extraction/reload failures.

Existing env quoting and frontend dependency/env handling remain part of the builders. The production deployment requests `--build` for context-based releases. Local apply and rollback do not request forced rebuilds; do not infer stronger image immutability guarantees from earlier phase notes.

## Known Operational Limits

- A Git commit/push and release publishing are separate from a production deployment.
- Publishing checks generated inputs exist; it does not certify their age or distinguish real application outputs from stubs.
- `nginx -t` is not an application health check. Automatic recovery in server deployment covers its Nginx validation branch, not every failure.
- Rollback requires usable prior artifacts/images. Docker image/build-cache pruning can remove non-running release images; server rollback uses `--pull never` and stops the current stack.
- `deploy:edge-static` edits the current release in place; original lock hashes/tarballs are not refreshed. Use a new release for a separate rollback snapshot or ingress changes.
- Municipal deploy/management service lists are fixed shell arrays/strings; update them when adding another municipality.
- Current Codify ingress has `spa_fallback: true`; unknown paths return the homepage instead of the exported 404 page. Routing-policy changes require config and release updates.
- The `municipal` / `muncipal` hostname warning is pre-existing; use the exact configured hosts.
- `project.live_symlink` is currently unused by deployment scripts, which use `/opt/brijesh-infra/current`.

## Deferred

- Automated release-directory retention (`release_retention: 10` is not enforced).
- CI/CD, application health monitoring/alerting, and post-deploy endpoint validation.
- Verified unattended certificate renewal scheduling and Nginx deploy hooks on the actual server.
- Regular media/database backups with documented restore verification.
- Broader disaster recovery, security/credential-rotation, and database runbooks.
- Deriving shell service groups from config and strengthening rollback image availability.

Use [../TODO.md](../TODO.md) as the follow-up checklist.

## Legacy References And Removal

Current instructions live in `readme/`, `config/stack.yaml`, and `scripts/`. `docs/README.md` redirects here. Active SSL utilities and older manual scripts coexist under `ssl-setup/`; [its README](../ssl-setup/README.md) identifies them.

The [dated archive](archive/2026-10-15-pre-doc-refresh/README.md) preserves docs from `9b2f406` and `30d4987` with checksums. Remove that temporary reference only after the migration, docs, and rollback needs are verified, using its cleanup checklist. Runtime legacy files require a separate caller/hook audit; deleting documentation copies does not retire those scripts.
