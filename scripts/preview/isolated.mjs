import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

import { loadStack } from "../lib/load-stack.mjs";
import { normalizeStack } from "../lib/normalize-stack.mjs";
import {
  defaultStackPath,
  generatedIsolatedPreviewRoot,
  generatedRoot,
} from "../lib/paths.mjs";
import { runCommand } from "../lib/shell.mjs";
import { renderIsolatedPreviewCompose } from "../render/compose-isolated-preview.mjs";
import { renderIsolatedPreviewNginx } from "../render/nginx-isolated-preview.mjs";

const PREVIEW_PROJECT = "infra-isolated-preview";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command: command ?? "render",
    stackPath: defaultStackPath,
    port: 8089,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--stack") {
      const nextValue = rest[index + 1];

      if (!nextValue) {
        throw new Error("--stack requires a file path");
      }

      options.stackPath = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--port") {
      const nextValue = Number(rest[index + 1]);

      if (!Number.isInteger(nextValue) || nextValue <= 0) {
        throw new Error("--port requires a positive integer");
      }

      options.port = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["render", "up", "down"].includes(options.command)) {
    throw new Error(`Unsupported preview command: ${options.command}`);
  }

  return options;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getIsolatedServices(stack) {
  return stack.services.filter(
    (service) => service.enabled && service.deploy.mode === "isolated",
  );
}

async function ensureBuiltContexts(stack) {
  const missing = [];

  for (const service of getIsolatedServices(stack)) {
    const dockerfilePath = path.join(
      generatedIsolatedPreviewRoot,
      "build",
      service.name,
      "Dockerfile",
    );

    if (!(await pathExists(dockerfilePath))) {
      missing.push(`${service.name} (missing Dockerfile)`);
    }

    if (service.kind === "backend") {
      const envPath = path.join(
        generatedIsolatedPreviewRoot,
        "env",
        `${service.name}.env`,
      );

      if (!(await pathExists(envPath))) {
        missing.push(`${service.name} (missing env file)`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing isolated preview build outputs: ${missing.join(", ")}. Run "npm run build:isolated-preview" first or use the stub build.`,
    );
  }
}

async function writePreviewFiles(stack, port) {
  await mkdir(generatedRoot, { recursive: true });
  await mkdir(generatedIsolatedPreviewRoot, { recursive: true });

  const nginxPath = path.join(generatedRoot, "nginx.isolated-preview.conf");
  const composePath = path.join(generatedRoot, "compose.isolated-preview.yaml");

  await writeFile(nginxPath, renderIsolatedPreviewNginx(stack), "utf8");
  await writeFile(composePath, renderIsolatedPreviewCompose(stack, port), "utf8");

  return { nginxPath, composePath };
}

async function renderPreview(options) {
  const loaded = await loadStack(options.stackPath);
  const stack = normalizeStack(loaded.raw);
  const paths = await writePreviewFiles(stack, options.port);

  console.log(`Rendered ${paths.nginxPath}`);
  console.log(`Rendered ${paths.composePath}`);
}

async function upPreview(options) {
  const loaded = await loadStack(options.stackPath);
  const stack = normalizeStack(loaded.raw);
  const paths = await writePreviewFiles(stack, options.port);

  await ensureBuiltContexts(stack);
  await runCommand("docker", [
    "compose",
    "-p",
    PREVIEW_PROJECT,
    "-f",
    paths.composePath,
    "up",
    "-d",
    "--build",
  ]);

  console.log(`Isolated preview is available on http://127.0.0.1:${options.port}`);
  console.log("Use a Host header or local hosts-file entry to test subsnepal routes.");
}

async function downPreview() {
  const composePath = path.join(generatedRoot, "compose.isolated-preview.yaml");

  if (!(await pathExists(composePath))) {
    console.log("No isolated preview compose file found. Nothing to stop.");
    return;
  }

  await runCommand("docker", [
    "compose",
    "-p",
    PREVIEW_PROJECT,
    "-f",
    composePath,
    "down",
    "--remove-orphans",
  ]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "render") {
    await renderPreview(options);
    return;
  }

  if (options.command === "up") {
    await upPreview(options);
    return;
  }

  await downPreview();
}

main().catch((error) => {
  console.error(`Isolated preview failed: ${error.message}`);
  process.exit(1);
});
