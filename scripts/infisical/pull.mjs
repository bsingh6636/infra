#!/usr/bin/env node
// pull.mjs
// Pull env values from Infisical into local env/ files.
//
// Usage:
//   node scripts/infisical/pull.mjs --env=development
//   node scripts/infisical/pull.mjs --env=production --force
//   node scripts/infisical/pull.mjs --env=production --only=global
//   node scripts/infisical/pull.mjs --env=production --only=subsnepal-api
//
// Flags:
//   --env=<slug>      Infisical environment slug or alias (required). e.g. dev, staging, prod
//   --force           Overwrite existing files without asking
//   --only=<name>     Only pull "global" or a specific service name
//   --dry-run         Print what would be written, don't touch files
//   --path-prefix=<p> Root path inside Infisical (default: /)
//                     This repo currently pulls all secrets from that single path
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
const ENV_ALIASES = {
  dev: "dev",
  development: "dev",
  stage: "staging",
  staging: "staging",
  prod: "prod",
  production: "prod",
};

function normalizeEnvironmentName(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ENV_ALIASES[normalized] ?? normalized;
}

function normalizeInfisicalPath(value) {
  const trimmed = String(value ?? "/").trim();

  if (!trimmed || trimmed === "/") {
    return "/";
  }

  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

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
  args.env = normalizeEnvironmentName(args.env);
  args.pathPrefix = normalizeInfisicalPath(args.pathPrefix);
  if (!args.env) {
    throw new Error(
      "--env=<slug> is required (e.g. --env=dev, --env=staging, --env=prod)",
    );
  }
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

function collectGlobalTargets(stack, only) {
  if (only && only !== "global") {
    return [];
  }

  const files = [
    ["global_nonsecret", stack.env?.global_nonsecret],
    ["global_secret", stack.env?.global_secret ?? "env/global.secrets.env"],
  ];

  return files
    .filter(([, localPath]) => localPath)
    .map(([scope, localPath]) => ({
      label: `global ${scope}`,
      localPath: resolve(REPO_ROOT, localPath),
    }));
}

function collectServiceTargets(stack, only) {
  const services = Object.entries(stack.services || {});
  const targets = [];
  for (const [name, svc] of services) {
    if (svc?.enabled === false) continue;
    if (only && only !== name) continue;

    const files = [
      ["service_nonsecret", svc?.env?.files?.nonsecret],
      ["service_secret", svc?.env?.files?.secret],
    ];

    for (const [scope, localPath] of files) {
      if (!localPath) continue;
      targets.push({
        label: `${name} ${scope}`,
        localPath: resolve(REPO_ROOT, localPath),
      });
    }
  }
  return targets;
}

function addPlanEntry(plan, seenPaths, entry) {
  if (seenPaths.has(entry.localPath)) {
    return;
  }

  seenPaths.add(entry.localPath);
  plan.push(entry);
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
  const exportCache = new Map();

  console.log(
    `[infisical-pull] env=${args.env} path=${args.pathPrefix} force=${args.force} dryRun=${args.dryRun}`,
  );

  const plan = [];
  const seenPaths = new Set();

  for (const target of collectGlobalTargets(stack, args.only)) {
    addPlanEntry(plan, seenPaths, {
      ...target,
      infisicalPath: args.pathPrefix === "/" ? "/" : args.pathPrefix,
    });
  }

  for (const target of collectServiceTargets(stack, args.only)) {
    addPlanEntry(plan, seenPaths, {
      ...target,
      infisicalPath: args.pathPrefix,
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
      const cacheKey = `${args.env}:${entry.infisicalPath}`;
      if (!exportCache.has(cacheKey)) {
        exportCache.set(
          cacheKey,
          runInfisicalExport({ env: args.env, path: entry.infisicalPath }),
        );
      }
      contents = exportCache.get(cacheKey);
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
