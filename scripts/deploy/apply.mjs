import { chmod, mkdir, readdir, stat } from "node:fs/promises";
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

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function getLatestReleaseId(layout) {
  const entries = await readdir(layout.releasesRoot);
  const sorted = entries.sort((left, right) => right.localeCompare(left));
  return sorted[0] ?? null;
}

async function ensureMediaDirectories(layout) {
  const municipalMediaRoot = path.join(layout.dataRoot, "municipal", "media");

  await mkdir(municipalMediaRoot, { recursive: true });
  await chmod(municipalMediaRoot, 0o775);

  return {
    municipalMediaRoot,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const layout = getRuntimeStateLayout(options.stateRoot);

  await ensureRuntimeStateDirectories(layout);

  const releaseId = options.releaseId ?? (await getLatestReleaseId(layout));

  if (!releaseId) {
    throw new Error("No release id specified and no published releases were found.");
  }

  const releaseDirectory = path.join(layout.releasesRoot, releaseId);
  const composePath = path.join(releaseDirectory, "compose.yaml");

  if (!(await pathExists(composePath))) {
    throw new Error(`Release ${releaseId} does not exist at ${releaseDirectory}`);
  }

  await ensureMediaDirectories(layout);

  await runCommand("docker", [
    "compose",
    "-p",
    options.projectName,
    "-f",
    composePath,
    "up",
    "-d",
    "--build",
    "--remove-orphans",
  ]);

  await updateCurrentReleaseSymlink(layout, releaseDirectory);

  console.log(`Applied local release ${releaseId}`);
  console.log(`Current release: ${await readCurrentReleasePath(layout)}`);
}

main().catch((error) => {
  console.error(`Release apply failed: ${error.message}`);
  process.exit(1);
});
