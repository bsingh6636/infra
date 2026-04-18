import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { mergeServiceEnv } from "../lib/env-merge.mjs";
import {
  generatedIsolatedPreviewRoot,
  generatedRoot,
} from "../lib/paths.mjs";
import { runCommand } from "../lib/shell.mjs";

function getIsolatedPreviewServices(stack, requestedServices = []) {
  const requestedSet = new Set(requestedServices);

  return stack.services.filter((service) => {
    if (!service.enabled || service.deploy.mode !== "isolated") {
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

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
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

function getProjectDirectory(checkoutPath, service) {
  return path.resolve(checkoutPath, service.source.context);
}

async function detectFrontendOutputDirectory(projectDirectory, service) {
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

function getPackageManagerCommands(projectDirectory) {
  return [
    {
      lockfile: "pnpm-lock.yaml",
      install: ["pnpm", "install", "--frozen-lockfile"],
      build: ["pnpm", "run", "build"],
    },
    {
      lockfile: "yarn.lock",
      install: ["yarn", "install", "--frozen-lockfile"],
      build: ["yarn", "build"],
    },
    {
      lockfile: "package-lock.json",
      install: ["npm", "ci"],
      build: ["npm", "run", "build"],
    },
    {
      lockfile: null,
      install: ["npm", "install"],
      build: ["npm", "run", "build"],
    },
  ].map((candidate) => ({
    ...candidate,
    exists: candidate.lockfile
      ? path.join(projectDirectory, candidate.lockfile)
      : null,
  }));
}

async function selectPackageManager(projectDirectory) {
  const candidates = getPackageManagerCommands(projectDirectory);

  for (const candidate of candidates) {
    if (!candidate.lockfile) {
      return candidate;
    }

    if (await pathExists(candidate.exists)) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

async function writeStaticContainerFiles(contextDirectory) {
  const nginxConfig = `server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;
  const dockerfile = `FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
EXPOSE 80
`;

  await writeFile(path.join(contextDirectory, "nginx.conf"), nginxConfig, "utf8");
  await writeFile(path.join(contextDirectory, "Dockerfile"), dockerfile, "utf8");
}

async function writeStubFrontendContext(contextDirectory, service) {
  const siteDirectory = path.join(contextDirectory, "site");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${service.name} isolated stub</title>
    <style>
      body { font-family: sans-serif; margin: 2rem; line-height: 1.5; }
      code { background: #f2f2f2; padding: 0.2rem 0.35rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>${service.name}</h1>
    <p>Phase 4 isolated frontend stub container.</p>
    <p>This validates edge proxying to an isolated static container.</p>
  </body>
</html>
`;

  await mkdir(siteDirectory, { recursive: true });
  await writeFile(path.join(siteDirectory, "index.html"), html, "utf8");
  await writeStaticContainerFiles(contextDirectory);
}

async function buildRealFrontendContext(stack, service, checkoutRoot, contextDirectory) {
  const source = stack.sources[service.source.key];
  const checkoutPath = path.join(checkoutRoot, service.name);
  const projectDirectory = getProjectDirectory(checkoutPath, service);
  const siteDirectory = path.join(contextDirectory, "site");

  await ensureEmptyDirectory(checkoutPath);
  await cloneRepo(source, checkoutPath);

  if (!(await pathExists(projectDirectory))) {
    throw new Error(
      `Source context "${service.source.context}" was not found for ${service.name}.`,
    );
  }

  const packageManager = await selectPackageManager(projectDirectory);

  await runCommand(packageManager.install[0], packageManager.install.slice(1), {
    cwd: projectDirectory,
    env: process.env,
  });

  await runCommand(packageManager.build[0], packageManager.build.slice(1), {
    cwd: projectDirectory,
    env: process.env,
  });

  const outputDirectory = await detectFrontendOutputDirectory(projectDirectory, service);

  await mkdir(siteDirectory, { recursive: true });
  await copyDirectoryContents(outputDirectory, siteDirectory);
  await writeStaticContainerFiles(contextDirectory);
}

function serializeEnvValue(value) {
  return String(value ?? "").replace(/\r?\n/g, "\\n");
}

async function writeBackendEnvFile(stack, service, envDirectory) {
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

async function writeStubBackendContext(contextDirectory, service) {
  const server = `import http from "node:http";

const port = Number(process.env.PORT || ${service.runtime.port});

const server = http.createServer((req, res) => {
  const url = new URL(req.url, \`http://\${req.headers.host || "localhost"}\`);

  if (url.pathname.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      service: "${service.name}",
      mode: "stub",
      route: "api",
      path: url.pathname,
    }));
    return;
  }

  if (url.pathname.startsWith("/events/")) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("event: ready\\n");
    res.write("data: {\\"service\\":\\"${service.name}\\",\\"mode\\":\\"stub\\"}\\n\\n");
    res.end();
    return;
  }

  if (url.pathname.startsWith("/ws/")) {
    res.writeHead(426, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      service: "${service.name}",
      mode: "stub",
      route: "ws",
      message: "Send an Upgrade: websocket request for websocket validation.",
    }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    service: "${service.name}",
    mode: "stub",
    route: "root",
    path: url.pathname,
  }));
});

server.on("upgrade", (req, socket) => {
  if (!req.url.startsWith("/ws/")) {
    socket.destroy();
    return;
  }

  socket.write(
    "HTTP/1.1 101 Switching Protocols\\r\\n" +
    "Upgrade: websocket\\r\\n" +
    "Connection: Upgrade\\r\\n" +
    "\\r\\n",
  );
  socket.end();
});

server.listen(port, "0.0.0.0", () => {
  console.log("${service.name} stub listening on", port);
});
`;
  const dockerfile = `FROM node:20-alpine
WORKDIR /srv/app
COPY server.mjs /srv/app/server.mjs
ENV PORT=${service.runtime.port}
EXPOSE ${service.runtime.port}
CMD ["node", "/srv/app/server.mjs"]
`;

  await writeFile(path.join(contextDirectory, "server.mjs"), server, "utf8");
  await writeFile(path.join(contextDirectory, "Dockerfile"), dockerfile, "utf8");
}

async function writeRealBackendContext(stack, service, checkoutRoot, contextDirectory) {
  const source = stack.sources[service.source.key];
  const checkoutPath = path.join(checkoutRoot, service.name);
  const projectDirectory = getProjectDirectory(checkoutPath, service);
  const appDirectory = path.join(contextDirectory, "app");
  const startScript = `#!/bin/sh
set -eu
cd /srv/app
export PORT="\${PORT:-${service.runtime.port}}"
exec sh -lc ${JSON.stringify(service.runtime.start)}
`;
  const dockerfile = `FROM node:20-alpine
WORKDIR /srv/app
COPY app/ /srv/app/
COPY start-service.sh /srv/start-service.sh
RUN if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile; \\
    elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile; \\
    elif [ -f package-lock.json ]; then npm ci; \\
    elif [ -f package.json ]; then npm install; \\
    else echo "No package manifest found in /srv/app" && exit 1; fi
ENV PORT=${service.runtime.port}
EXPOSE ${service.runtime.port}
CMD ["/bin/sh", "/srv/start-service.sh"]
`;

  await ensureEmptyDirectory(checkoutPath);
  await cloneRepo(source, checkoutPath);

  if (!(await pathExists(projectDirectory))) {
    throw new Error(
      `Source context "${service.source.context}" was not found for ${service.name}.`,
    );
  }

  await mkdir(appDirectory, { recursive: true });
  await copyDirectoryContents(projectDirectory, appDirectory);
  await writeFile(path.join(contextDirectory, "start-service.sh"), startScript, {
    encoding: "utf8",
    mode: 0o755,
  });
  await writeFile(path.join(contextDirectory, "Dockerfile"), dockerfile, "utf8");
}

export async function buildIsolatedPreviewServices(stack, options = {}) {
  const {
    stub = false,
    services: requestedServices = [],
  } = options;
  const isolatedServices = getIsolatedPreviewServices(stack, requestedServices);
  const buildRoot = path.join(generatedIsolatedPreviewRoot, "build");
  const envRoot = path.join(generatedIsolatedPreviewRoot, "env");
  const checkoutRoot = path.join(generatedRoot, ".work", "isolated-preview-sources");
  const builtServices = [];

  if (isolatedServices.length === 0) {
    throw new Error("No isolated services matched the requested build scope.");
  }

  await mkdir(buildRoot, { recursive: true });
  await mkdir(envRoot, { recursive: true });
  await mkdir(checkoutRoot, { recursive: true });

  for (const service of isolatedServices) {
    const contextDirectory = path.join(buildRoot, service.name);
    const envPath =
      service.kind === "backend"
        ? await writeBackendEnvFile(stack, service, envRoot)
        : null;

    await ensureEmptyDirectory(contextDirectory);

    if (service.kind === "frontend") {
      if (service.deploy.frontend_runtime !== "static-container") {
        throw new Error(
          `Isolated frontend ${service.name} must use deploy.frontend_runtime=static-container in Phase 4.`,
        );
      }

      if (stub) {
        await writeStubFrontendContext(contextDirectory, service);
      } else {
        await buildRealFrontendContext(stack, service, checkoutRoot, contextDirectory);
      }
    } else if (stub) {
      await writeStubBackendContext(contextDirectory, service);
    } else {
      await writeRealBackendContext(stack, service, checkoutRoot, contextDirectory);
    }

    builtServices.push({
      service: service.name,
      mode: stub ? "stub" : "real",
      kind: service.kind,
      contextDirectory,
      envFile: envPath,
    });
  }

  await writeFile(
    path.join(generatedIsolatedPreviewRoot, "manifest.json"),
    `${JSON.stringify({ builtServices }, null, 2)}\n`,
    "utf8",
  );

  return builtServices;
}
