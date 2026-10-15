# Municipal Media Storage

## Why This Is Different

Most services in this repo are stateless. If you rebuild or replace them, you can recreate their containers from source and env files.

`municipal-api` is different because it uses persistent local files for media storage.

That means:

- the files must survive deploys
- the files must survive rollbacks
- backups matter
- permissions matter
- migration to a new server must copy the data explicitly

## Current Local Phase 6 Path

Local release validation uses:

```text
generated/runtime-state/data/municipal/media
```

Inside the container it is mounted at:

```text
/srv/shared/municipal-api/media
```

## Intended Production Path

The config still models the final production storage path as:

```text
/opt/brijesh-infra/data/municipal/media
```

Do not switch to that path until the final production cutover phase.

## Permissions

For the local Phase 6 runtime, the apply script creates the media directory and sets:

- mode: `775`

Check it with:

```bash
stat -f '%Sp %N' generated/runtime-state/data/municipal/media
```

For a production-style host path later, use a pattern like:

```bash
sudo mkdir -p /opt/brijesh-infra/data/municipal/media
sudo chown -R <runtime-user>:<runtime-group> /opt/brijesh-infra/data/municipal/media
sudo chmod 775 /opt/brijesh-infra/data/municipal/media
```

If you do not know the final runtime UID/GID yet, stop and verify that first before production cutover.

## Safe Bind-Mount Rules

Use these rules:

- mount only the media directory, not the whole app directory
- mount it to a dedicated media path inside the container
- create the host directory before starting the container
- confirm permissions before first write
- never delete the host path during release cleanup

## Local Persistence Validation

This was validated in Phase 6 using a probe file.

Equivalent check:

```bash
docker compose -p infra-local-release -f generated/runtime-state/current/compose.yaml exec -T shared-low-node sh -lc 'printf test-data > /srv/shared/municipal-api/media/probe.txt'
cat generated/runtime-state/data/municipal/media/probe.txt
```

Expected result:

- the host file exists
- content matches what was written inside the container
- the file survives `release:apply` to another release
- the file survives `release:rollback`

## Backups

You must back up this directory separately from stateless release artifacts.

Simple local tar backup example:

```bash
tar -czf municipal-media-$(date +%F).tgz -C generated/runtime-state/data municipal/media
```

Production-style example later:

```bash
tar -czf municipal-media-$(date +%F).tgz -C /opt/brijesh-infra/data municipal/media
```

Minimum recommendation:

- daily backup if uploads are active
- keep multiple restore points
- test at least one restore on a non-production path

## Migration To Another Server

Release snapshots do not include the media files. You must copy them separately.

Example:

```bash
rsync -aHAX /opt/brijesh-infra/data/municipal/media/ user@new-server:/opt/brijesh-infra/data/municipal/media/
```

After migration:

- verify file count
- verify a few sample files
- verify permissions on the destination
- verify the container can still write to the path

## Disk Monitoring

Check both usage and free space:

```bash
du -sh generated/runtime-state/data/municipal/media
df -h generated/runtime-state/data
```

Production-style later:

```bash
du -sh /opt/brijesh-infra/data/municipal/media
df -h /opt/brijesh-infra/data
```

Watch for:

- unexpected growth
- low free disk
- files owned by the wrong user
- write failures inside the app

## When To Move `municipal-api` To Isolated

It is currently grouped only as a short-term tradeoff.

Move it from `shared-node` to `isolated` when any of these becomes true:

- media traffic increases noticeably
- group restarts become disruptive
- disk I/O causes noisy-neighbor issues
- you want stronger failure boundaries
- you need a separate deploy cadence for municipal

When that happens, update `config/stack.yaml`, preview the isolated flow again, then publish and apply a new release.
