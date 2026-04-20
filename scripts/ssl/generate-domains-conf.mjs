#!/usr/bin/env node
// generate-domains-conf.mjs
// Auto-generates ssl-setup/domains.conf from config/stack.yaml
// Usage: node scripts/ssl/generate-domains-conf.mjs [--dry-run]
//
// What it does:
//   1. Reads all hostnames from stack.yaml ingress entries
//   2. Writes them to ssl-setup/domains.conf
//   3. Preserves CERT_NAME, EMAIL, and CLOUDFLARE_API_TOKEN comment
//   4. On --dry-run, prints the output without writing

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { loadStack } from "../lib/load-stack.mjs";
import { normalizeStack } from "../lib/normalize-stack.mjs";
import { repoRoot } from "../lib/paths.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

const CERT_NAME = "cors-proxy.brijeshdev.space";
const EMAIL = "bkushwaha.dev@gmail.com";
const OUTPUT_PATH = path.join(repoRoot, "ssl-setup", "domains.conf");

async function main() {
  const { raw } = await loadStack();
  const stack = normalizeStack(raw);

  const hostnames = [];

  for (const entry of stack.ingress) {
    for (const host of entry.hosts) {
      if (!hostnames.includes(host.name)) {
        hostnames.push(host.name);
      }
    }
  }

  if (hostnames.length === 0) {
    throw new Error("No hostnames found in stack.yaml ingress entries.");
  }

  const domainsBlock = hostnames.map((h) => `    "${h}"`).join("\n");

  const output = `# SSL Configuration — AUTO-GENERATED from config/stack.yaml
# DO NOT edit manually. Run: node scripts/ssl/generate-domains-conf.mjs
# To regenerate after changing stack.yaml hostnames.

EMAIL="${EMAIL}"
CERT_NAME="${CERT_NAME}" # Do not change this unless you update nginx configs too

# Cloudflare API Token is loaded from the project root .env file (CLOUDFLARE_API_TOKEN)
# If not found there, set it here:
# CLOUDFLARE_API_TOKEN=""

DOMAINS=(
${domainsBlock}
)
`;

  console.log(`[ssl] Found ${hostnames.length} hostnames from stack.yaml:`);
  for (const h of hostnames) {
    console.log(`  - ${h}`);
  }

  if (DRY_RUN) {
    console.log("\n[ssl] --dry-run mode. Output:\n");
    console.log(output);
    return;
  }

  await writeFile(OUTPUT_PATH, output, "utf8");
  console.log(`\n[ssl] Written to: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(`[error] ${error.message}`);
  process.exit(1);
});
