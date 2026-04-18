import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

import { loadStack } from "../lib/load-stack.mjs";
import { normalizeStack } from "../lib/normalize-stack.mjs";
import {
  defaultStackPath,
  generatedEdgeStaticRoot,
  generatedRoot,
} from "../lib/paths.mjs";
import { runCommand } from "../lib/shell.mjs";
import { renderEdgeStaticPreviewCompose } from "../render/compose-edge-static-preview.mjs";
import { renderEdgeStaticPreviewNginx } from "../render/nginx-edge-static-preview.mjs";

const PREVIEW_PROJECT = "infra-edge-static-preview";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command: command ?? "render",
    stackPath: defaultStackPath,
    port: 8088,
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

function getEdgeStaticServices(stack) {
  return stack.services.filter(
    (service) => service.enabled && service.kind === "frontend" && service.deploy.mode === "edge-static",
  );
}

async function ensureBuiltAssets(stack) {
  const missingServices = [];

  for (const service of getEdgeStaticServices(stack)) {
    const indexPath = path.join(generatedEdgeStaticRoot, service.name, "index.html");

    if (!(await pathExists(indexPath))) {
      missingServices.push(service.name);
    }
  }

  if (missingServices.length > 0) {
    throw new Error(
      `Missing edge-static assets for: ${missingServices.join(", ")}. Run "npm run build:edge-static" first or use the stub build.`,
    );
  }
}

async function writePreviewFiles(stack, port) {
  await mkdir(generatedRoot, { recursive: true });
  await mkdir(generatedEdgeStaticRoot, { recursive: true });

  const nginxPath = path.join(generatedRoot, "nginx.edge-static-preview.conf");
  const composePath = path.join(generatedRoot, "compose.edge-static-preview.yaml");

  await writeFile(nginxPath, renderEdgeStaticPreviewNginx(stack), "utf8");
  await writeFile(composePath, renderEdgeStaticPreviewCompose(port), "utf8");

  return {
    nginxPath,
    composePath,
  };
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

  await ensureBuiltAssets(stack);
  await runCommand("docker", [
    "compose",
    "-p",
    PREVIEW_PROJECT,
    "-f",
    paths.composePath,
    "up",
    "-d",
  ]);

  console.log(`Edge-static preview is available on http://127.0.0.1:${options.port}`);
  console.log("Use a Host header or local hosts-file entry to test a specific domain.");
}

async function downPreview() {
  const composePath = path.join(generatedRoot, "compose.edge-static-preview.yaml");

  if (!(await pathExists(composePath))) {
    console.log("No preview compose file found. Nothing to stop.");
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
  console.error(`Edge-static preview failed: ${error.message}`);
  process.exit(1);
});
