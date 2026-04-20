#!/usr/bin/env node
// pull.mjs
// Pull secrets from Infisical into local env/ files.
//
// Usage:
//   node scripts/infisical/pull.mjs --env=dev
//   node scripts/infisical/pull.mjs --env=prod --force
//   node scripts/infisical/pull.mjs --env=prod --only=global
//   node scripts/infisical/pull.mjs --env=prod --only=subsnepal-api
//
// Flags:
//   --env=<slug>      Infisical environment slug (required). e.g. dev, staging, prod, oracle
//   --force           Overwrite existing files without asking
//   --only=<name>     Only pull "global" or a specific service name
//   --dry-run         Print what would be written, don't touch files
//   --path-prefix=<p> Root path inside Infisical (default: /)
//                     Services live under <prefix>/services/<service-name>
//
// Infisical session:
//   This script does NOT log you in. Run first:
//     npx infisical user switch         # if multiple accounts
//     npx infisical login               # if new account
//     npx infisical init                # link this repo → Infisical project

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const STACK_YAML = resolve(REPO_ROOT, "config/stack.yaml");
const INFISICAL_BIN = resolve(REPO_ROOT, "node_modules/@infisical/cli/bin/infisical");

function parseArgs(argv) {
  const args = { env: "", only: "", pathPrefix: "/", force: false, dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--force") args.force = true;
    else if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--env=")) args.env = raw.slice("--env=".length);
    else if (raw.startsWith("--only=")) args.only = raw.slice("--only=".length);
    else if (raw.startsWith("--path-prefix=")) args.pathPrefix = raw.slice("--path-prefix=".length);
    else throw new Error(`Unknown arg: ${raw}`);
  }
  if (!args.env) throw new Error("--env=<slug> is required (e.g. --env=dev, --env=prod)");
  return args;
}

function runInfisicalExport({ env, path }) {
  const res = spawnSync(
    INFISICAL_BIN,
    ["export", `--env=${env}`, `--path=${path}`, "--format=dotenv"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  if (res.status !== 0) {
    const stderr = (res.stderr || "").trim();
    throw new Error(`infisical export failed (env=${env}, path=${path}): ${stderr}`);
  }
  return res.stdout;
}

function loadStack() {
  return parseYaml(readFileSync(STACK_YAML, "utf8"));
}

function collectServiceTargets(stack, only) {
  const services = Object.entries(stack.services || {});
  const dir = stack.env?.service_secret_dir ?? "env/services-secrets";
  const targets = [];
  for (const [name, svc] of services) {
    if (svc?.enabled === false) continue;
    if (only && only !== name) continue;
    // Only pull for services that actually declare a secret file.
    const secretFile = svc?.env?.files?.secret;
    if (!secretFile) continue;
    targets.push({
      name,
      localPath: resolve(REPO_ROOT, secretFile),
      infisicalPath: `/services/${name}`,
    });
  }
  return targets;
}

function writeIfAllowed({ localPath, contents, force, dryRun }) {
  const exists = existsSync(localPath);
  if (dryRun) {
    console.log(`[dry-run] would write ${localPath} (${contents.length} bytes)${exists ? " [overwrite]" : ""}`);
    return "dry-run";
  }
  if (exists && !force) {
    console.log(`[skip]    ${localPath} already exists — pass --force to overwrite`);
    return "skipped";
  }
  mkdirSync(dirname(localPath), { recursive: true });
  writeFileSync(localPath, contents, "utf8");
  console.log(`[${exists ? "force" : "write"}]   ${localPath}`);
  return exists ? "overwritten" : "written";
}

async function main() {
  const args = parseArgs(process.argv);
  const stack = loadStack();

  console.log(`[infisical-pull] env=${args.env} force=${args.force} dryRun=${args.dryRun}`);

  const plan = [];

  // Global secrets
  if (!args.only || args.only === "global") {
    const globalFile = stack.env?.global_secret ?? "env/global.secrets.env";
    plan.push({
      label: "global",
      localPath: resolve(REPO_ROOT, globalFile),
      infisicalPath: args.pathPrefix === "/" ? "/" : args.pathPrefix,
    });
  }

  // Per-service secrets
  for (const target of collectServiceTargets(stack, args.only)) {
    plan.push({
      label: target.name,
      localPath: target.localPath,
      infisicalPath:
        args.pathPrefix === "/" ? target.infisicalPath : `${args.pathPrefix}${target.infisicalPath}`,
    });
  }

  if (plan.length === 0) {
    console.log("[infisical-pull] nothing to pull (check --only value)");
    return;
  }

  const summary = { written: 0, overwritten: 0, skipped: 0, "dry-run": 0 };

  for (const entry of plan) {
    console.log(`\n→ ${entry.label}  (infisical path: ${entry.infisicalPath})`);
    let contents;
    try {
      contents = runInfisicalExport({ env: args.env, path: entry.infisicalPath });
    } catch (err) {
      console.error(`[error]   ${entry.label}: ${err.message}`);
      process.exitCode = 1;
      continue;
    }
    const result = writeIfAllowed({
      localPath: entry.localPath,
      contents,
      force: args.force,
      dryRun: args.dryRun,
    });
    summary[result] = (summary[result] || 0) + 1;
  }

  console.log(`\n[infisical-pull] done: ${JSON.stringify(summary)}`);
}

main().catch((err) => {
  console.error(`[fatal] ${err.message}`);
  process.exit(1);
});
