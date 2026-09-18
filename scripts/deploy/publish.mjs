import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";

import { mergeServiceEnv } from "../lib/env-merge.mjs";
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
    registry: null,
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

    if (arg === "--registry") {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error("--registry requires a Docker Hub username or registry prefix");
      }

      options.registry = nextValue;
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

function dockerBuildAndPush(tag, contextPath) {
  console.log(`[registry] Building ${tag}...`);
  execSync(`docker build -t ${tag} ${contextPath}`, { stdio: "inherit" });
  console.log(`[registry] Pushing ${tag}...`);
  execSync(`docker push ${tag}`, { stdio: "inherit" });
}

function pushImagesToRegistry(stack, registry, releaseId) {
  const isolatedServices = stack.services.filter(
    (s) => s.enabled && s.deploy.mode === "isolated",
  );

  for (const service of isolatedServices) {
    const tag = `${registry}/${service.name}:${releaseId}`;
    const contextPath = path.join(generatedIsolatedPreviewRoot, "build", service.name);
    dockerBuildAndPush(tag, contextPath);
  }

  const groups = [
    ...new Set(
      stack.services
        .filter((s) => s.enabled && s.deploy.mode === "shared-node")
        .map((s) => s.deploy.group),
    ),
  ];

  for (const groupName of groups) {
    const tag = `${registry}/infra-${groupName}:${releaseId}`;
    const contextPath = path.join(generatedSharedNodePreviewRoot, "build", groupName);
    dockerBuildAndPush(tag, contextPath);
  }
}

async function copyDirectory(sourcePath, destinationPath) {
  await cp(sourcePath, destinationPath, {
    recursive: true,
    force: true,
  });
}

function serializeEnvValue(value) {
  const str = String(value ?? "").replace(/\r?\n/g, "\\n");
  return `'${str.replace(/'/g, "'\\''")}'`;
}

function serviceDeclaresEnvFiles(service) {
  return Boolean(service.env.files.nonsecret || service.env.files.secret);
}

// Image-mode services never pass through the isolated preview build, so their
// merged env files are produced here at publish time.
async function writeImageServiceEnvFile(stack, service, releaseDirectory) {
  const { merged, missingFiles } = await mergeServiceEnv(stack, service);

  if (missingFiles.length > 0) {
    throw new Error(
      `Missing env files for ${service.name}: ${missingFiles.map((item) => item.path).join(", ")}`,
    );
  }

  const lines = Object.entries(merged)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${serializeEnvValue(value)}`);

  await writeFile(
    path.join(releaseDirectory, "isolated-env", `${service.name}.env`),
    `${lines.join("\n")}\n`,
    "utf8",
  );
}

async function buildReleasePayload(stack, layout, releaseId, releaseDirectory, port, registry) {
  const edgeStaticArtifacts = {};
  const isolatedArtifacts = {};
  const sharedArtifacts = {};
  const imageArtifacts = {};
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
      const record = registry
        ? { image: `${registry}/${service.name}:${releaseId}` }
        : { path: `isolated/${service.name}`, sha256: await hashPath(path.join(releaseDirectory, "isolated", service.name)) };

      if (service.kind === "backend") {
        const envPath = path.join(releaseDirectory, "isolated-env", `${service.name}.env`);
        record.env_file = `isolated-env/${service.name}.env`;
        record.env_sha256 = await hashPath(envPath);
      }

      isolatedArtifacts[service.name] = record;
    }

    if (service.deploy.mode === "image") {
      const record = { image: service.image };

      if (serviceDeclaresEnvFiles(service)) {
        const envPath = path.join(releaseDirectory, "isolated-env", `${service.name}.env`);
        record.env_file = `isolated-env/${service.name}.env`;
        record.env_sha256 = await hashPath(envPath);
      }

      imageArtifacts[service.name] = record;
    }

    if (service.deploy.mode === "shared-node") {
      if (!sharedArtifacts[service.deploy.group]) {
        sharedArtifacts[service.deploy.group] = registry
          ? { image: `${registry}/infra-${service.deploy.group}:${releaseId}`, services: [] }
          : { path: `shared/${service.deploy.group}`, sha256: await hashPath(path.join(releaseDirectory, "shared", service.deploy.group)), services: [] };
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
      images: imageArtifacts,
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

  if (options.registry) {
    console.log(`[registry] Building and pushing images to ${options.registry}...`);
    pushImagesToRegistry(stack, options.registry, options.releaseId);
  }

  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(path.join(releaseDirectory, "edge-static"), { recursive: true });
  await mkdir(path.join(releaseDirectory, "isolated-env"), { recursive: true });

  for (const service of stack.services.filter(
    (item) => item.enabled && item.deploy.mode === "edge-static",
  )) {
    await copyDirectory(
      path.join(generatedEdgeStaticRoot, service.name),
      path.join(releaseDirectory, "edge-static", service.name),
    );
  }

  if (!options.registry) {
    await mkdir(path.join(releaseDirectory, "isolated"), { recursive: true });
    await mkdir(path.join(releaseDirectory, "shared"), { recursive: true });

    for (const service of stack.services.filter(
      (item) => item.enabled && item.deploy.mode === "isolated",
    )) {
      await copyDirectory(
        path.join(generatedIsolatedPreviewRoot, "build", service.name),
        path.join(releaseDirectory, "isolated", service.name),
      );
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
  }

  for (const service of stack.services.filter(
    (item) => item.enabled && item.deploy.mode === "isolated" && item.kind === "backend",
  )) {
    await copyDirectory(
      path.join(generatedIsolatedPreviewRoot, "env", `${service.name}.env`),
      path.join(releaseDirectory, "isolated-env", `${service.name}.env`),
    );
  }

  for (const service of stack.services.filter(
    (item) => item.enabled && item.deploy.mode === "image" && serviceDeclaresEnvFiles(item),
  )) {
    await writeImageServiceEnvFile(stack, service, releaseDirectory);
  }

  // Bundle shared-node env files (nonsecret + secret merged per service).
  // Infisical secrets and custom vars both land in these files — both are included.
  await mkdir(path.join(releaseDirectory, "shared-env"), { recursive: true });

  for (const service of stack.services.filter(
    (item) => item.enabled && item.deploy.mode === "shared-node" && item.kind === "backend",
  )) {
    const parts = [];
    if (service.env?.files?.nonsecret) {
      const content = await readFile(service.env.files.nonsecret, "utf8").catch(() => "");
      if (content.trim()) parts.push(content.trimEnd());
    }
    if (service.env?.files?.secret) {
      const content = await readFile(service.env.files.secret, "utf8").catch(() => "");
      if (content.trim()) parts.push(content.trimEnd());
    }
    await writeFile(
      path.join(releaseDirectory, "shared-env", `${service.name}.env`),
      parts.join("\n") + "\n",
      "utf8",
    );
  }

  // For production (TLS) releases, bind mount paths in compose.yaml must use the
  // server's real data path, not the local generated/ directory. Derive it from
  // stack.project.data_root so Docker on the server mounts the correct host path.
  const composeStateRoot =
    options.tls && stack.project.data_root
      ? path.dirname(stack.project.data_root)
      : layout.stateRoot;

  await writeFile(
    path.join(releaseDirectory, "compose.yaml"),
    renderReleaseCompose(stack, {
      stateRoot: composeStateRoot,
      port: options.port,
      tls: options.tls,
      registry: options.registry,
      releaseId: options.releaseId,
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
    options.registry,
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
