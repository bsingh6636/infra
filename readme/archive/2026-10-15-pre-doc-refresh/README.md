# Temporary Documentation Reference — 2026-10-15

Historical reference only. Current instructions start at [../../README.md](../../README.md).

## What Is Preserved

- [before-migration/README.md](before-migration/README.md): all 14 tracked Markdown documents from commit `9b2f406`, before municipal isolation.
- [snapshot/README.md](snapshot/README.md): all 14 tracked Markdown documents from commit `30d4987`, the municipal isolation commit, immediately before this documentation refresh.
- [manifest.json](manifest.json): full commit IDs, capture date/timezone, branch, and SHA-256 checksums for each saved document.

Copies are byte-for-byte snapshots. Their instructions and links reflect their original layout and may describe retired paths, hostnames, or behavior. Do not use them as the active deployment runbook. Runtime scripts, environment files, credentials, and media are not copied here.

## Transition Reference

[MUNICIPAL_MIGRATION.md](../../MUNICIPAL_MIGRATION.md) compares the previous and configured topologies and provides the cutover and verification steps. The current docs describe repository behavior; they do not certify that production has been migrated.

## Remove Later

Keep this archive through the migration and the first verification of the updated docs. Remove it once:

- the code and documentation updates are committed;
- production runs the intended municipal containers and the shared group only has `cors-api` and `getdata`;
- all five media mounts, service ports, and rollback requirements have been checked;
- the old instructions are no longer needed by an operator.

Then, from the repository root, remove this tracked archive in a separate cleanup commit:

```bash
git rm -r readme/archive/2026-10-15-pre-doc-refresh
```

Remove every link to this archive from the root README, documentation index, active operator/migration guides, docs redirect, SSL README, TODO, and agent references in the same change. Search for `2026-10-15-pre-doc-refresh` outside this archive to find all of them, then check local links again. This only removes documentation copies; do not delete production release directories, media, or SSL tools as part of that command. Git history continues to retain both original documentation versions.
