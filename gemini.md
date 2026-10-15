# Infrastructure Agent Reference

Use [CLAUDE.md](CLAUDE.md) for the repository command/architecture reference and [readme/README.md](readme/README.md) for operator guides. [config/stack.yaml](config/stack.yaml) is the source of truth; generated outputs are rebuilt by scripts.

Current configuration: seven edge-static frontends, isolated application containers (including five municipalities on one shared image with separate runtime env files), `cors-api` / `getdata` in the `low-node` PM2 group, and enabled cache-only Redis. `otp-api` is disabled. TLS and production releases are implemented. Production state must be verified from the active server release.

Read [MUNICIPAL_MIGRATION.md](readme/MUNICIPAL_MIGRATION.md) before changing the municipal deployment or storage. Run `npm run validate` and the relevant checks after implementation changes. `npm test` covers deployment regressions with local fixtures. Publishing/deploying, runtime source builds, and Git commits/pushes are separate actions.

[Previous documentation](readme/archive/2026-10-15-pre-doc-refresh/README.md) is retained temporarily with provenance and removal criteria. Its historical architecture goals do not override current config or operator instructions.
