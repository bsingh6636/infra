# SSL And HTTPS

TLS is implemented in the config-driven release workflow. Manage root domains and hostnames in [../config/stack.yaml](../config/stack.yaml), then use the commands below. See the [production runbook](../readme/PROD_RUNBOOK.md) for server preparation and deployment.

## Active Files

| File | Purpose |
|---|---|
| [certbot-run.sh](certbot-run.sh) | Issue or renew certificates from `stack.yaml`; reload the current edge afterward |
| [ensure-fallback-cert.sh](ensure-fallback-cert.sh) | Optional self-signed fallback for missing certificate paths |
| [domains.conf](domains.conf) | Generated hostname list; regenerate rather than editing it |
| [../scripts/ssl/generate-domains-conf.mjs](../scripts/ssl/generate-domains-conf.mjs) | Generate `domains.conf` from ingress |

## Current Commands

From the local repo:

```bash
npm run ssl:generate-domains
npm run ssl:generate-domains:dry
```

From the server's `/opt/brijesh-infra` directory, with current `config/stack.yaml`, `ssl-setup/`, Node, and the `yaml` dependency installed:

```bash
sudo bash ssl-setup/certbot-run.sh --grouped
sudo bash ssl-setup/certbot-run.sh --grouped --dry-run
sudo certbot certificates
```

Grouped issuance uses each root's configured `cert_name`, matching the paths rendered into production Nginx configuration. It includes the ingress hostnames under that root. The default command without `--grouped` issues per-host certificates; its certificate names can differ from the configured release paths.

`--domain <host>` is single-host mode, including when `--grouped` is also supplied. It does not select a whole root-domain certificate group. Use grouped issuance for the release's multi-host certificates.

Set `CLOUDFLARE_API_TOKEN` in the server repo's `.env` or environment. DNS must already be configured. The script can install Certbot and its Cloudflare plugin if missing. Its dry run avoids certificate issuance but can still prepare dependencies and credential files.

Expiry skipping defaults to 120 days; `--skip-days N` changes it. Check certificate SANs after adding hosts: expiry skipping alone does not establish that a newly added host is covered. Use the script's renewal/force flags deliberately when a certificate must be expanded.

## Renewal

Check the actual server timer and deploy hook; `certbot-run.sh` is not itself a scheduler:

```bash
sudo systemctl list-timers --all | grep certbot
sudo ls -l /etc/letsencrypt/renewal-hooks/deploy/
```

After renewal, verify or reload the running edge with the current release's compose file. See [OPERATIONS.md](../readme/OPERATIONS.md) for the active release path. A self-signed fallback only enables Nginx startup; it does not provide a trusted certificate.

## Legacy Reference

`setup-ssl.sh`, `deploy-ssl.sh`, `add-domain.sh`, `bsingh-ssl.conf`, `domains-multi.conf`, and `docker-compose.prod-ssl.yml` belong to the previous manual flow. Their presence does not make them the current deployment entrypoint. Leave them in place until their callers and server hooks are checked.

The [dated documentation archive](../readme/archive/2026-10-15-pre-doc-refresh/README.md) preserves the old SSL README and cleanup instructions. Removing that archive later does not remove active SSL scripts or certificates.
