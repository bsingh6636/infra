import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadStack } from "../lib/load-stack.mjs";
import { normalizeStack } from "../lib/normalize-stack.mjs";
import { defaultStackPath, repoRoot } from "../lib/paths.mjs";
import { renderCompose } from "./compose.mjs";
import { renderNginx } from "./nginx.mjs";

function parseArgs(argv) {
  const options = {
    stackPath: defaultStackPath,
    outputDir: path.join(repoRoot, "generated"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--stack") {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error("--stack requires a file path");
      }

      options.stackPath = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error("--output-dir requires a directory path");
      }

      options.outputDir = path.resolve(repoRoot, nextValue);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function listRuntimeServices(stack) {
  const names = new Set(["edge"]);

  for (const service of stack.services) {
    if (!service.enabled || service.deploy.mode === "edge-static") {
      continue;
    }

    if (service.deploy.mode === "shared-node") {
      names.add(`shared-${service.deploy.group}`);
      continue;
    }

    names.add(service.name);
  }

  return [...names].sort();
}

function buildIngressSummary(entry) {
  const hosts = entry.hosts.map((host) => host.name).join(", ");
  const target = `${entry.upstream.type}:${entry.upstream.service}`;
  const routeSummary =
    entry.routes.length === 0
      ? "no extra routes"
      : entry.routes
          .map((route) => `${route.path} -> ${route.service} (${route.protocol})`)
          .join("; ");

  return `- ${hosts} => ${target}; ${routeSummary}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const loaded = await loadStack(options.stackPath);
  const stack = normalizeStack(loaded.raw);

  await mkdir(options.outputDir, { recursive: true });
  await mkdir(path.join(options.outputDir, "edge-static"), { recursive: true });

  const composePath = path.join(options.outputDir, "compose.yaml");
  const nginxPath = path.join(options.outputDir, "nginx.conf");

  await writeFile(composePath, renderCompose(stack), "utf8");
  await writeFile(nginxPath, renderNginx(stack), "utf8");

  console.log(`Rendered ${composePath}`);
  console.log(`Rendered ${nginxPath}`);
  console.log("");
  console.log("Runtime services:");

  for (const serviceName of listRuntimeServices(stack)) {
    console.log(`- ${serviceName}`);
  }

  console.log("");
  console.log("Ingress summary:");

  for (const entry of stack.ingress) {
    console.log(buildIngressSummary(entry));
  }
}

main().catch((error) => {
  console.error(`Render failed: ${error.message}`);
  process.exit(1);
});
