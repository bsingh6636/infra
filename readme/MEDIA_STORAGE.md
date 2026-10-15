# Persistent Media And Upload Storage

Municipal media and Sahayog uploads must survive container replacement, deployment, and rollback. Release snapshots contain configuration and application artifacts; they do not contain these uploaded files.

## Municipal Mounts

Each municipal backend is configured as an isolated container. All mount their own media directory at `/srv/app/media`.

| Service | Production host path | Local host path |
|---|---|---|
| municipal-api | `/opt/brijesh-infra/data/municipal/media` | `generated/runtime-state/data/municipal/media` |
| siranchowk-municipal | `/opt/brijesh-infra/data/siranchowk/media` | `generated/runtime-state/data/siranchowk/media` |
| ratnagar-municipal | `/opt/brijesh-infra/data/ratnagar/media` | `generated/runtime-state/data/ratnagar/media` |
| madhyabindu-municipal | `/opt/brijesh-infra/data/madhyabindu/media` | `generated/runtime-state/data/madhyabindu/media` |
| devghat-municipal | `/opt/brijesh-infra/data/devghat/media` | `generated/runtime-state/data/devghat/media` |

These host paths are retained during the [municipal migration](MUNICIPAL_MIGRATION.md). The old shared-node container paths are documented there for historical comparison. Use `/srv/app/media` for the configured isolated containers.

Sahayog mounts `/opt/brijesh-infra/data/sahayog/uploads` at `/srv/app/uploads`; the default local equivalent is `generated/runtime-state/data/sahayog/uploads`. Back up those uploads separately as well. Redis has a `/data` mount but is currently configured with AOF and RDB persistence disabled; treat it as cache-only soft state.

## Directories And Permissions

Local `release:apply` creates storage directories from `stack.yaml` with mode `775`. The server deployment script creates the current municipal and Sahayog host directories with mode `775`. Ownership still needs to allow the actual container user to read and write.

```bash
# On the server
ls -ld /opt/brijesh-infra/data/{municipal,siranchowk,ratnagar,madhyabindu,devghat}/media

docker compose -p brijesh-infra -f /opt/brijesh-infra/current/compose.yaml   exec -T municipal-api sh -c 'id; ls -ld /srv/app/media'
```

Match ownership to the actual runtime UID/GID when provisioning or restoring data. Mount only the media/upload directory, rather than replacing the application directory. Release cleanup must not delete `/opt/brijesh-infra/data` or its local equivalent.

## Local Persistence Check

Use an integrated local release after `release:apply`; isolated mode previews do not attach these production media mounts.

```bash
docker compose -p infra-local-release -f generated/runtime-state/current/compose.yaml   exec -T municipal-api sh -c 'printf test-data > /srv/app/media/infra-probe.txt'
cat generated/runtime-state/data/municipal/media/infra-probe.txt
```

Apply a second release, roll back, and confirm the host file and its contents remain. Repeat with each municipal service and its matching host directory. Remove the probe after validation. For production, prefer reading an existing known media file and use an agreed test upload to check write permissions.

## Back Up All Municipal Media

Run on the production server before migration and regularly while uploads are active:

```bash
sudo tar -czf /opt/brijesh-infra/municipal-media-backup-$(date +%Y%m%d-%H%M%S).tar.gz   -C /opt/brijesh-infra/data   municipal/media siranchowk/media ratnagar/media madhyabindu/media devghat/media
```

Copy the selected archive off the server. For a consistent backup, pause writes while collecting files, or use a storage snapshot suited to the application. Include Sahayog uploads in their own backup procedure. Application databases require separate backups.

For local test data, use the same directory list with `-C generated/runtime-state/data`. Restore an archive into an empty temporary directory first and verify sample files and counts. A backup file alone does not prove recovery works.

## Move To Another Server

Copy each persistent directory separately from the release artifacts. On Linux hosts with suitable permissions, one municipal example is:

```bash
rsync -aHAX /opt/brijesh-infra/data/municipal/media/ user@new-server:/opt/brijesh-infra/data/municipal/media/
```

Repeat for siranchowk, ratnagar, madhyabindu, devghat, and Sahayog uploads. Check file counts, representative media, ownership, and container write access before directing traffic to the new server.

## Disk Monitoring

```bash
# Production
du -sh /opt/brijesh-infra/data/{municipal,siranchowk,ratnagar,madhyabindu,devghat}/media
du -sh /opt/brijesh-infra/data/sahayog/uploads
df -h /opt/brijesh-infra/data

# Local
du -sh generated/runtime-state/data/*
df -h generated/runtime-state/data
```

Watch for growth, low free space, unexpected ownership, and failed writes. Monitor these independently of image/build-cache pruning and old release cleanup.
