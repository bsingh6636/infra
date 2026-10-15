# Follow-Up Checklist

Refreshed 2026-10-15 against the current config and scripts. Deployment completion is intentionally not inferred from a commit. The [status guide](readme/STATUS_AND_DEFERRED.md) describes implemented behavior and limits.

## Municipal Migration

- [ ] Complete the cutover and checks in [MUNICIPAL_MIGRATION.md](readme/MUNICIPAL_MIGRATION.md).
- [ ] Confirm five isolated municipal containers have the configured ports, separate media mounts, and stable memory use under the 192m limits.
- [ ] Confirm the shared group's PM2 list contains only `cors-api` and `getdata`.
- [ ] Verify known API routes, existing media, test uploads, and the required rollback images/artifacts.

## Reliability And Recovery

- [ ] Add application health checks and alerting/recovery behavior. Docker health status alone does not restart a hung but running process.
- [ ] Add CI checks for validation, regression tests, and fixture builds, then design the deployment trigger.
- [ ] Automate old release-directory retention. Docker image/build-cache pruning already runs during server deploy; `release_retention: 10` does not prune directories.
- [ ] Preserve or recover rollback images before unused-image pruning makes a previous release unavailable.
- [ ] Verify the actual server's certificate renewal timer and Nginx reload hook, including a controlled renewal test.
- [ ] Schedule off-server backups of all municipal media, Sahayog uploads, and application databases; verify restoration independently.
- [ ] Document full server/database recovery and credential rotation.
- [ ] Monitor disk, restart counts, service response health, and memory after deployments.

## Follow-Up Improvements

- [ ] Derive municipal management/deploy groups from `stack.yaml`, or keep the two fixed service lists explicitly synchronized.
- [ ] Decide whether Codify should use a real exported 404 instead of its current SPA homepage fallback.
- [ ] Define how in-place static updates should be tracked against release lock hashes and rollback snapshots.
- [ ] Reconcile the unused `project.live_symlink` with the active `/opt/brijesh-infra/current` path.
- [ ] Audit old compose/Nginx/SSL scripts and server renewal hooks before removing runtime legacy files. Keep active `certbot-run.sh`, `ensure-fallback-cert.sh`, and hostname generation.
- [ ] Assign owners and dates to deferred work.

## Temporary Documentation Cleanup

- [ ] After migration and documentation verification, remove [the dated archive](readme/archive/2026-10-15-pre-doc-refresh/README.md) and its links in a separate commit, following its checklist. Preserve production data and usable rollback releases; this is documentation cleanup only.

Prior phase-specific claims, branch-merge notes, and obsolete commands are retained in that archive with their original commit references instead of being presented as current tasks.
