import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

import { loadStack } from "../lib/load-stack.mjs";
import { normalizeStack } from "../lib/normalize-stack.mjs";
import {
  defaultStackPath,
  generatedRoot,
  generatedSharedNodePreviewRoot,
} from "../lib/paths.mjs";
import { runCommand } from "../lib/shell.mjs";
import { renderSharedNodePreviewCompose } from "../render/compose-shared-node-preview.mjs";
import { renderSharedNodePreviewNginx } from "../render/nginx-shared-node-preview.mjs";

const PREVIEW_PROJECT = "infra-shared-node-preview";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command: command ?? "render",
    stackPath: defaultStackPath,
    port: 8090,
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

function getSharedGroups(stack) {
  return [...new Set(
    stack.services
      .filter((service) => service.enabled && service.deploy.mode === "shared-node")
      .map((service) => service.deploy.group),
  )];
}

async function ensureBuiltContexts(stack) {
  const missing = [];

  for (const groupName of getSharedGroups(stack)) {
    const dockerfilePath = path.join(
      generatedSharedNodePreviewRoot,
      "build",
      groupName,
      "Dockerfile",
    );

    if (!(await pathExists(dockerfilePath))) {
      missing.push(`${groupName} (missing Dockerfile)`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing shared-node preview build outputs: ${missing.join(", ")}. Run "npm run build:shared-node-preview" first or use the stub build.`,
    );
  }
}

async function writePreviewFiles(stack, port) {
  await mkdir(generatedRoot, { recursive: true });
  await mkdir(generatedSharedNodePreviewRoot, { recursive: true });

  const nginxPath = path.join(generatedRoot, "nginx.shared-node-preview.conf");
  const composePath = path.join(generatedRoot, "compose.shared-node-preview.yaml");

  await writeFile(nginxPath, renderSharedNodePreviewNginx(stack), "utf8");
  await writeFile(composePath, renderSharedNodePreviewCompose(stack, port), "utf8");

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

  console.log(`Shared-node preview is available on http://127.0.0.1:${options.port}`);
  console.log("Use a Host header or local hosts-file entry to test grouped backend routes.");
}

async function downPreview() {
  const composePath = path.join(generatedRoot, "compose.shared-node-preview.yaml");

  if (!(await pathExists(composePath))) {
    console.log("No shared-node preview compose file found. Nothing to stop.");
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
  console.error(`Shared-node preview failed: ${error.message}`);
  process.exit(1);
});
