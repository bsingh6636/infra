import { readdir } from "node:fs/promises";
import path from "node:path";

import { defaultRuntimeStateRoot, ensureRuntimeStateDirectories, getRuntimeStateLayout, readCurrentReleasePath, updateCurrentReleaseSymlink, resolveStateRoot } from "../lib/runtime-state.mjs";
import { runCommand } from "../lib/shell.mjs";

function parseArgs(argv) {
  const options = {
    releaseId: null,
    stateRoot: defaultRuntimeStateRoot,
    projectName: "infra-local-release",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--release") {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error("--release requires a release id");
      }

      options.releaseId = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--state-root") {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error("--state-root requires a path");
      }

      options.stateRoot = resolveStateRoot(nextValue);
      index += 1;
      continue;
    }

    if (arg === "--project-name") {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error("--project-name requires a value");
      }

      options.projectName = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function getAvailableReleases(layout) {
  const entries = await readdir(layout.releasesRoot);
  return entries.sort((left, right) => right.localeCompare(left));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const layout = getRuntimeStateLayout(options.stateRoot);

  await ensureRuntimeStateDirectories(layout);

  const releases = await getAvailableReleases(layout);

  if (releases.length === 0) {
    throw new Error("No published releases are available to roll back.");
  }

  const currentReleasePath = await readCurrentReleasePath(layout);
  const currentReleaseId = currentReleasePath ? path.basename(currentReleasePath) : null;
  const releaseId =
    options.releaseId ??
    releases.find((candidate) => candidate !== currentReleaseId);

  if (!releaseId) {
    throw new Error("Could not determine a rollback target release.");
  }

  const releaseDirectory = path.join(layout.releasesRoot, releaseId);
  const composePath = path.join(releaseDirectory, "compose.yaml");

  await runCommand("docker", [
    "compose",
    "-p",
    options.projectName,
    "-f",
    composePath,
    "up",
    "-d",
    "--remove-orphans",
    "--pull", "never",
  ]);

  await updateCurrentReleaseSymlink(layout, releaseDirectory);

  console.log(`Rolled back to local release ${releaseId}`);
}

main().catch((error) => {
  console.error(`Rollback failed: ${error.message}`);
  process.exit(1);
});
