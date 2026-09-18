# TODO — Post-Production Checklist

Findings from production-readiness audit (2026-05-07).
Infisical is the secret source in live — `.env` is local-only and not a live concern.

---

## CRITICAL — Do Soon After Going Live

- [ ] **Merge `refactor` → `master`**
  `master` has 3 unmerged commits (legacy port fixes). `refactor` is the live system. Resolve divergence before next deploy.

- [ ] **Add `healthcheck` directives to `docker-compose.prod.yml`**
  Docker only restarts dead containers, not hung ones. Add `healthcheck` per service so hung processes get killed and restarted.

- [ ] **Validate Infisical pull before build/deploy**
  `npm run validate` should fail hard if required secrets are missing. Currently no guard — a failed pull silently produces an empty env.

- [ ] **Test SSL cert renewal end-to-end**
  `certbot-run.sh` exists but renewal hasn't been verified in a real expiry cycle. Set a calendar reminder to manually trigger renewal test within 60 days.

---

## MAJOR — Before Scaling / Team Use

- [ ] **Add CI/CD (GitHub Actions)**
  - `validate.yml` — run `npm run validate` on every PR/push
  - `build-and-test.yml` — validate config, run stub builds
  - `deploy-prod.yml` — triggered on git tag, runs publish + server deploy
  - Add Infisical API token as GitHub secret

- [ ] **Write `DISASTER_RECOVERY.md`**
  Document: server failure recovery on new hardware, MongoDB restore, which services are critical vs. non-critical.

- [ ] **Write `SECURITY.md`**
  Document: what to do if credentials are compromised, rotation procedure per service, who to notify.

- [ ] **Write `DATABASE.md`**
  MongoDB backup procedure before deploys, restore procedure, schema change runbook per service (cors-api, subsnepal-api, municipal-api).

- [ ] **Set up monitoring**
  Minimum viable: weekly `docker stats` check, log scan for errors, disk space (`df -h`).
  Longer term: Prometheus + Grafana, or at least an uptime monitor.

---

## MINOR — Nice to Have

- [ ] **Add centralized logging**
  Logs currently live only in containers (json-file, 10MB rotation). Consider Loki + Grafana or Fluent Bit → Elasticsearch for searchable, persistent logs.

- [ ] **Automate release pruning**
  Deferred in `STATUS_AND_DEFERRED.md`. Old releases accumulate in `/opt/brijesh-infra/releases/`. Add a cron or post-deploy step to prune beyond `release_retention: 10`.

- [ ] **Switch Docker image tags from `:latest` to git SHA**
  Mitigated by `--pull never` in prod compose, but using content-addressable tags (e.g. `image: bsingh6636/bsingh-nginx:abc123`) makes releases truly reproducible.

- [ ] **Monitor memory limits under real load**
  Current limit is 384MB per backend container. Run `docker stats` after first week in production and adjust if needed.

- [ ] **Add `TROUBLESHOOTING.md`**
  Common failures: container won't start, cert renewal fails, PM2 process crash, nginx 502, env var not picked up.

- [ ] **Write `MONITORING.md`**
  Document the manual monitoring procedure: what to check, how often, what's a warning vs. an incident.

- [ ] **Delete legacy files in `ssl-setup/`**
  Keep `certbot-run.sh` and `domains.conf` (both active). Delete: `setup-ssl.sh`, `bsingh-ssl.conf`, `add-domain.sh`, `deploy-ssl.sh`, `domains-multi.conf`, `docker-compose.prod-ssl.yml`.

- [ ] **Assign owners + dates to deferred items**
  Items in `STATUS_AND_DEFERRED.md` have no assigned owner or target date. Move to GitHub Issues or a planning tool.

---

## Already Good — No Action Needed

- Infisical integrated and documented
- Release snapshot system with rollback working
- TLS/Let's Encrypt automation in place
- Resource limits, restart policies, log rotation configured
- `stack.yaml` as single source of truth
- `readme/` documentation comprehensive through Phase 7
- All bug fixes documented in `STATUS_AND_DEFERRED.md`
- Local preview + smoke test workflow thorough (`PROD_RUNBOOK.md`)
