import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { mergeServiceEnv } from "../lib/env-merge.mjs";
import { generatedEdgeStaticRoot, generatedRoot } from "../lib/paths.mjs";
import { runCommand } from "../lib/shell.mjs";

function getEdgeStaticServices(stack, requestedServices = []) {
  const requestedSet = new Set(requestedServices);

  return stack.services.filter((service) => {
    if (!service.enabled) {
      return false;
    }

    if (service.kind !== "frontend" || service.deploy.mode !== "edge-static") {
      return false;
    }

    if (requestedSet.size === 0) {
      return true;
    }

    return requestedSet.has(service.name);
  });
}

async function ensureEmptyDirectory(directoryPath) {
  await rm(directoryPath, { recursive: true, force: true });
  await mkdir(directoryPath, { recursive: true });
}

async function cloneRepo(source, destinationPath) {
  try {
    await runCommand("git", [
      "clone",
      "--depth",
      "1",
      "--branch",
      source.ref,
      source.repo,
      destinationPath,
    ]);
  } catch {
    await runCommand("git", ["clone", source.repo, destinationPath]);
    await runCommand("git", ["checkout", source.ref], { cwd: destinationPath });
  }
}

function getProjectDirectory(checkoutPath, service) {
  return path.resolve(checkoutPath, service.source.context);
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function detectOutputDirectory(projectDirectory, service) {
  if (service.build.output_dir && service.build.output_dir !== "auto") {
    const explicitPath = path.resolve(projectDirectory, service.build.output_dir);

    if (await pathExists(explicitPath)) {
      return explicitPath;
    }

    throw new Error(
      `Configured output directory "${service.build.output_dir}" was not found for ${service.name}.`,
    );
  }

  const candidates = ["dist", "build"];

  for (const candidate of candidates) {
    const candidatePath = path.resolve(projectDirectory, candidate);

    if (await pathExists(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(
    `Could not detect build output for ${service.name}. Expected one of: ${candidates.join(", ")}.`,
  );
}

async function copyDirectoryContents(sourceDirectory, destinationDirectory) {
  const entries = await readdir(sourceDirectory);

  for (const entry of entries) {
    await cp(
      path.join(sourceDirectory, entry),
      path.join(destinationDirectory, entry),
      { recursive: true },
    );
  }
}

async function writeStubSite(outputDirectory, service) {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${service.name} stub</title>
    <style>
      body { font-family: sans-serif; margin: 2rem; line-height: 1.5; }
      code { background: #f2f2f2; padding: 0.2rem 0.35rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>${service.name}</h1>
    <p>Phase 3 stub asset for edge-static preview.</p>
    <p>Replace this with a real frontend build before final validation.</p>
  </body>
</html>
`;

  await writeFile(path.join(outputDirectory, "index.html"), html, "utf8");
}

async function buildRealSite(stack, service, checkoutRoot, outputDirectory) {
  const source = stack.sources[service.source.key];
  const checkoutPath = path.join(checkoutRoot, service.name);
  const projectDirectory = getProjectDirectory(checkoutPath, service);
  const { merged } = await mergeServiceEnv(stack, service);
  const buildEnv = {
    ...process.env,
    ...merged,
  };

  await ensureEmptyDirectory(checkoutPath);
  await cloneRepo(source, checkoutPath);

  if (!(await pathExists(projectDirectory))) {
    throw new Error(
      `Source context "${service.source.context}" was not found for ${service.name}.`,
    );
  }

  const lockfileCommands = [
    { lockfile: "pnpm-lock.yaml", install: ["pnpm", "install", "--frozen-lockfile"], build: ["pnpm", "run", "build"] },
    { lockfile: "yarn.lock", install: ["yarn", "install", "--frozen-lockfile"], build: ["yarn", "build"] },
    { lockfile: "package-lock.json", install: ["npm", "ci"], build: ["npm", "run", "build"] },
    { lockfile: null, install: ["npm", "install"], build: ["npm", "run", "build"] },
  ];

  let selected = lockfileCommands[lockfileCommands.length - 1];

  for (const candidate of lockfileCommands) {
    if (!candidate.lockfile) {
      continue;
    }

    if (await pathExists(path.join(projectDirectory, candidate.lockfile))) {
      selected = candidate;
      break;
    }
  }

  await runCommand(selected.install[0], selected.install.slice(1), {
    cwd: projectDirectory,
    env: buildEnv,
  });

  await runCommand(selected.build[0], selected.build.slice(1), {
    cwd: projectDirectory,
    env: buildEnv,
  });

  const buildOutputDirectory = await detectOutputDirectory(projectDirectory, service);
  await copyDirectoryContents(buildOutputDirectory, outputDirectory);
}

export async function buildEdgeStaticSites(stack, options = {}) {
  const {
    stub = false,
    services: requestedServices = [],
  } = options;
  const edgeStaticServices = getEdgeStaticServices(stack, requestedServices);
  const checkoutRoot = path.join(generatedRoot, ".work", "edge-static-sources");
  const builtServices = [];

  if (edgeStaticServices.length === 0) {
    throw new Error("No edge-static services matched the requested build scope.");
  }

  await mkdir(generatedEdgeStaticRoot, { recursive: true });
  await mkdir(checkoutRoot, { recursive: true });

  for (const service of edgeStaticServices) {
    const outputDirectory = path.join(generatedEdgeStaticRoot, service.name);

    await ensureEmptyDirectory(outputDirectory);

    if (stub) {
      await writeStubSite(outputDirectory, service);
    } else {
      await buildRealSite(stack, service, checkoutRoot, outputDirectory);
    }

    builtServices.push({
      service: service.name,
      mode: stub ? "stub" : "real",
      outputDirectory,
    });
  }

  await writeFile(
    path.join(generatedEdgeStaticRoot, "manifest.json"),
    `${JSON.stringify({ builtServices }, null, 2)}\n`,
    "utf8",
  );

  return builtServices;
}
