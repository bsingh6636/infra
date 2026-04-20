import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { hashPath } from "../lib/hash.mjs";
import { loadStack } from "../lib/load-stack.mjs";
import { normalizeStack } from "../lib/normalize-stack.mjs";
import { defaultStackPath, generatedEdgeStaticRoot, generatedIsolatedPreviewRoot, generatedSharedNodePreviewRoot } from "../lib/paths.mjs";
import { createReleaseId } from "../lib/release-id.mjs";
import { defaultRuntimeStateRoot, ensureRuntimeStateDirectories, getRuntimeStateLayout, mapStorageSourceToStateRoot, resolveStateRoot } from "../lib/runtime-state.mjs";
import { renderReleaseCompose } from "../render/release-compose.mjs";
import { renderReleaseLock } from "../render/release-lock.mjs";
import { renderReleaseNginx } from "../render/release-nginx.mjs";

function parseArgs(argv) {
  const options = {
    stackPath: defaultStackPath,
    releaseId: createReleaseId(),
    stateRoot: defaultRuntimeStateRoot,
    port: 8091,
    tls: false,
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

    if (arg === "--port") {
      const nextValue = Number(argv[index + 1]);

      if (!Number.isInteger(nextValue) || nextValue <= 0) {
        throw new Error("--port requires a positive integer");
      }

      options.port = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--tls") {
      options.tls = true;
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

async function ensureReleaseInputs(stack) {
  const missing = [];

  for (const service of stack.services) {
    if (!service.enabled) {
      continue;
    }

    if (service.deploy.mode === "edge-static") {
      const serviceRoot = path.join(generatedEdgeStaticRoot, service.name);

      if (!(await pathExists(serviceRoot))) {
        missing.push(`${service.name} edge-static assets (${serviceRoot})`);
      }
    }

    if (service.deploy.mode === "isolated") {
      const buildContext = path.join(generatedIsolatedPreviewRoot, "build", service.name);

      if (!(await pathExists(path.join(buildContext, "Dockerfile")))) {
        missing.push(`${service.name} isolated context (${buildContext})`);
      }

      if (service.kind === "backend") {
        const envFile = path.join(generatedIsolatedPreviewRoot, "env", `${service.name}.env`);

        if (!(await pathExists(envFile))) {
          missing.push(`${service.name} isolated env (${envFile})`);
        }
      }
    }

    if (service.deploy.mode === "shared-node") {
      const buildContext = path.join(
        generatedSharedNodePreviewRoot,
        "build",
        service.deploy.group,
      );

      if (!(await pathExists(path.join(buildContext, "Dockerfile")))) {
        missing.push(`${service.deploy.group} shared context (${buildContext})`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing generated inputs for release publish:\n- ${missing.join("\n- ")}`,
    );
  }
}

async function copyDirectory(sourcePath, destinationPath) {
  await cp(sourcePath, destinationPath, {
    recursive: true,
    force: true,
  });
}

async function buildReleasePayload(stack, layout, releaseId, releaseDirectory, port) {
  const edgeStaticArtifacts = {};
  const isolatedArtifacts = {};
  const sharedArtifacts = {};
  const dataMounts = {};

  for (const service of stack.services) {
    if (!service.enabled) {
      continue;
    }

    if (service.deploy.mode === "edge-static") {
      const artifactPath = path.join(releaseDirectory, "edge-static", service.name);
      edgeStaticArtifacts[service.name] = {
        path: `edge-static/${service.name}`,
        sha256: await hashPath(artifactPath),
      };
    }

    if (service.deploy.mode === "isolated") {
      const artifactPath = path.join(releaseDirectory, "isolated", service.name);
      const record = {
        path: `isolated/${service.name}`,
        sha256: await hashPath(artifactPath),
      };

      if (service.kind === "backend") {
        const envPath = path.join(releaseDirectory, "isolated-env", `${service.name}.env`);
        record.env_file = `isolated-env/${service.name}.env`;
        record.env_sha256 = await hashPath(envPath);
      }

      isolatedArtifacts[service.name] = record;
    }

    if (service.deploy.mode === "shared-node") {
      const artifactPath = path.join(releaseDirectory, "shared", service.deploy.group);

      if (!sharedArtifacts[service.deploy.group]) {
        sharedArtifacts[service.deploy.group] = {
          path: `shared/${service.deploy.group}`,
          sha256: await hashPath(artifactPath),
          services: [],
        };
      }

      sharedArtifacts[service.deploy.group].services.push(service.name);
    }

    for (const storage of service.storage.filter((entry) => entry.type === "bind")) {
      dataMounts[service.name] = {
        host_path: mapStorageSourceToStateRoot(stack, layout.stateRoot, storage.source),
        container_path: storage.target,
      };
    }
  }

  return {
    release: {
      id: releaseId,
      created_at: new Date().toISOString(),
      port,
      state_root: layout.stateRoot,
    },
    artifacts: {
      edge_static: edgeStaticArtifacts,
      isolated: isolatedArtifacts,
      shared: sharedArtifacts,
    },
    data_mounts: dataMounts,
    targets: {
      compose_file: "compose.yaml",
      nginx_file: "nginx.conf",
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const loaded = await loadStack(options.stackPath);
  const stack = normalizeStack(loaded.raw);
  const layout = getRuntimeStateLayout(options.stateRoot);
  const releaseDirectory = path.join(layout.releasesRoot, options.releaseId);

  await ensureReleaseInputs(stack);
  await ensureRuntimeStateDirectories(layout);

  if (await pathExists(releaseDirectory)) {
    throw new Error(`Release ${options.releaseId} already exists at ${releaseDirectory}`);
  }

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(path.join(releaseDirectory, "edge-static"), { recursive: true });
  await mkdir(path.join(releaseDirectory, "isolated"), { recursive: true });
  await mkdir(path.join(releaseDirectory, "isolated-env"), { recursive: true });
  await mkdir(path.join(releaseDirectory, "shared"), { recursive: true });

  for (const service of stack.services.filter(
    (item) => item.enabled && item.deploy.mode === "edge-static",
  )) {
    await copyDirectory(
      path.join(generatedEdgeStaticRoot, service.name),
      path.join(releaseDirectory, "edge-static", service.name),
    );
  }

  for (const service of stack.services.filter(
    (item) => item.enabled && item.deploy.mode === "isolated",
  )) {
    await copyDirectory(
      path.join(generatedIsolatedPreviewRoot, "build", service.name),
      path.join(releaseDirectory, "isolated", service.name),
    );

    if (service.kind === "backend") {
      await copyDirectory(
        path.join(generatedIsolatedPreviewRoot, "env", `${service.name}.env`),
        path.join(releaseDirectory, "isolated-env", `${service.name}.env`),
      );
    }
  }

  const sharedGroups = [
    ...new Set(
      stack.services
        .filter((item) => item.enabled && item.deploy.mode === "shared-node")
        .map((item) => item.deploy.group),
    ),
  ];

  for (const groupName of sharedGroups) {
    await copyDirectory(
      path.join(generatedSharedNodePreviewRoot, "build", groupName),
      path.join(releaseDirectory, "shared", groupName),
    );
  }

  await writeFile(
    path.join(releaseDirectory, "compose.yaml"),
    renderReleaseCompose(stack, {
      stateRoot: layout.stateRoot,
      port: options.port,
      tls: options.tls,
    }),
    "utf8",
  );

  await writeFile(
    path.join(releaseDirectory, "nginx.conf"),
    renderReleaseNginx(stack, { tls: options.tls }),
    "utf8",
  );

  const payload = await buildReleasePayload(
    stack,
    layout,
    options.releaseId,
    releaseDirectory,
    options.port,
  );

  await writeFile(
    path.join(releaseDirectory, "release.lock.yaml"),
    renderReleaseLock(payload),
    "utf8",
  );

  console.log(`Published local release ${options.releaseId}`);
  console.log(`Release directory: ${releaseDirectory}`);
}

main().catch((error) => {
  console.error(`Release publish failed: ${error.message}`);
  process.exit(1);
});
