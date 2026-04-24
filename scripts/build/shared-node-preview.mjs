import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { mergeServiceEnv } from "../lib/env-merge.mjs";
import {
  generatedRoot,
  generatedSharedNodePreviewRoot,
} from "../lib/paths.mjs";
import { runCommand } from "../lib/shell.mjs";

function getSharedNodeServices(stack, requestedServices = []) {
  const requestedSet = new Set(requestedServices);

  return stack.services.filter((service) => {
    if (!service.enabled || service.deploy.mode !== "shared-node") {
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

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
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

function serializeEnvValue(value) {
  const str = String(value ?? "").replace(/\r?\n/g, "\\n");
  return `'${str.replace(/'/g, "'\\''")}'`;
}

function groupServicesByName(services) {
  const groups = new Map();

  for (const service of services) {
    const groupServices = groups.get(service.deploy.group) ?? [];
    groupServices.push(service);
    groups.set(service.deploy.group, groupServices);
  }

  return new Map(
    [...groups.entries()].map(([groupName, groupServices]) => [
      groupName,
      groupServices.sort((left, right) => left.name.localeCompare(right.name)),
    ]),
  );
}

async function writeServiceEnvFile(stack, service, envDirectory) {
  const { merged, missingFiles } = await mergeServiceEnv(stack, service);

  if (missingFiles.length > 0) {
    throw new Error(
      `Missing env files for ${service.name}: ${missingFiles.map((item) => item.path).join(", ")}`,
    );
  }

  const envPath = path.join(envDirectory, `${service.name}.env`);
  const lines = Object.entries(merged)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${serializeEnvValue(value)}`);

  await mkdir(envDirectory, { recursive: true });
  await writeFile(envPath, `${lines.join("\n")}\n`, "utf8");

  return envPath;
}

function buildStubServerSource(service) {
  return `import http from "node:http";

const port = Number(process.env.PORT || ${service.runtime.port});

const server = http.createServer((req, res) => {
  const url = new URL(req.url, \`http://\${req.headers.host || "localhost"}\`);
  const route = url.pathname.startsWith("/api/")
    ? "api"
    : url.pathname.startsWith("/media/")
      ? "media"
      : "root";

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    service: "${service.name}",
    group: "${service.deploy.group}",
    mode: "stub",
    route,
    path: url.pathname,
    port,
  }));
});

server.listen(port, "0.0.0.0", () => {
  console.log("${service.name} stub listening on", port);
});
`;
}

async function writeStubServiceApp(appDirectory, service) {
  await mkdir(appDirectory, { recursive: true });
  await writeFile(
    path.join(appDirectory, "server.mjs"),
    buildStubServerSource(service),
    "utf8",
  );
}

function getProjectDirectory(checkoutPath, service) {
  return path.resolve(checkoutPath, service.source.context);
}

async function writeRealServiceApp(stack, service, checkoutRoot, appDirectory) {
  const source = stack.sources[service.source.key];
  const checkoutPath = path.join(checkoutRoot, service.name);
  const projectDirectory = getProjectDirectory(checkoutPath, service);

  await ensureEmptyDirectory(checkoutPath);
  await cloneRepo(source, checkoutPath);

  if (!(await pathExists(projectDirectory))) {
    throw new Error(
      `Source context "${service.source.context}" was not found for ${service.name}.`,
    );
  }

  await mkdir(appDirectory, { recursive: true });
  await copyDirectoryContents(projectDirectory, appDirectory);
}

async function writeStartScript(scriptsDirectory, service, stub) {
  const scriptPath = path.join(scriptsDirectory, `${service.name}.sh`);
  const command = stub
    ? `exec node /srv/apps/${service.name}/server.mjs`
    : `exec sh -lc ${JSON.stringify(service.runtime.start)}`;
  const contents = `#!/bin/sh
set -eu
set -a
. /srv/env/${service.name}.env
set +a
export PORT="\${PORT:-${service.runtime.port}}"
cd /srv/apps/${service.name}
${command}
`;

  await mkdir(scriptsDirectory, { recursive: true });
  await writeFile(scriptPath, contents, {
    encoding: "utf8",
    mode: 0o755,
  });

  return scriptPath;
}

async function writePm2Ecosystem(pm2Directory, groupName, services) {
  const apps = services.map((service) => ({
    name: service.name,
    script: "/bin/sh",
    args: `/srv/start-scripts/${service.name}.sh`,
    autorestart: true,
    max_restarts: 10,
    kill_timeout: 5000,
  }));
  const ecosystemPath = path.join(pm2Directory, `${groupName}.ecosystem.config.js`);
  const contents = `module.exports = ${JSON.stringify({ apps }, null, 2)};\n`;

  await mkdir(pm2Directory, { recursive: true });
  await writeFile(ecosystemPath, contents, "utf8");

  return ecosystemPath;
}

async function writeGroupDockerfile(contextDirectory, groupName, services) {
  const exposePorts = services
    .map((service) => Number(service.runtime.port))
    .filter((port) => Number.isInteger(port) && port > 0)
    .sort((left, right) => left - right)
    .map(String);
  const dockerfile = `FROM node:20-alpine
WORKDIR /srv
RUN npm install -g pm2
COPY apps/ /srv/apps/
COPY env/ /srv/env/
COPY start-scripts/ /srv/start-scripts/
COPY pm2/ /srv/pm2/
RUN chmod +x /srv/start-scripts/*.sh && \\
    for dir in /srv/apps/*; do \\
      if [ -f "$dir/pnpm-lock.yaml" ]; then \\
        corepack enable && (cd "$dir" && pnpm install --frozen-lockfile); \\
      elif [ -f "$dir/yarn.lock" ]; then \\
        corepack enable && (cd "$dir" && yarn install --frozen-lockfile); \\
      elif [ -f "$dir/package-lock.json" ]; then \\
        (cd "$dir" && npm ci); \\
      elif [ -f "$dir/package.json" ]; then \\
        (cd "$dir" && npm install); \\
      else \\
        echo "Skipping dependency install for $dir"; \\
      fi; \\
    done
${exposePorts.map((port) => `EXPOSE ${port}`).join("\n")}
CMD ["pm2-runtime", "start", "/srv/pm2/${groupName}.ecosystem.config.js"]
`;

  await writeFile(path.join(contextDirectory, "Dockerfile"), dockerfile, "utf8");
}

export async function buildSharedNodePreviewGroups(stack, options = {}) {
  const {
    stub = false,
    services: requestedServices = [],
  } = options;
  const sharedServices = getSharedNodeServices(stack, requestedServices);
  const groupedServices = groupServicesByName(sharedServices);
  const buildRoot = path.join(generatedSharedNodePreviewRoot, "build");
  const checkoutRoot = path.join(generatedRoot, ".work", "shared-node-preview-sources");
  const builtServices = [];

  if (sharedServices.length === 0) {
    throw new Error("No shared-node services matched the requested build scope.");
  }

  await mkdir(buildRoot, { recursive: true });
  await mkdir(checkoutRoot, { recursive: true });

  for (const [groupName, services] of groupedServices.entries()) {
    const contextDirectory = path.join(buildRoot, groupName);
    const appsDirectory = path.join(contextDirectory, "apps");
    const startScriptsDirectory = path.join(contextDirectory, "start-scripts");
    const pm2Directory = path.join(contextDirectory, "pm2");
    const groupEnvDirectory = path.join(contextDirectory, "env");

    await ensureEmptyDirectory(contextDirectory);
    await mkdir(appsDirectory, { recursive: true });

    for (const service of services) {
      const appDirectory = path.join(appsDirectory, service.name);

      if (stub) {
        await writeStubServiceApp(appDirectory, service);
      } else {
        await writeRealServiceApp(stack, service, checkoutRoot, appDirectory);
      }

      const envPath = await writeServiceEnvFile(stack, service, groupEnvDirectory);
      await writeStartScript(startScriptsDirectory, service, stub);

      builtServices.push({
        service: service.name,
        group: groupName,
        mode: stub ? "stub" : "real",
        contextDirectory,
        envFile: envPath,
      });
    }

    await writePm2Ecosystem(pm2Directory, groupName, services);
    await writeGroupDockerfile(contextDirectory, groupName, services);
  }

  await writeFile(
    path.join(generatedSharedNodePreviewRoot, "manifest.json"),
    `${JSON.stringify({ builtServices }, null, 2)}\n`,
    "utf8",
  );

  return builtServices;
}
