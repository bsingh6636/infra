import path from "node:path";

import YAML from "yaml";

import { mapStorageSourceToStateRoot } from "../lib/runtime-state.mjs";

function unique(values) {
  return [...new Set(values)];
}

function getRuntimeServiceName(service) {
  if (service.deploy.mode === "shared-node") {
    return `shared-${service.deploy.group}`;
  }

  return service.name;
}

function getContainerExposePort(service) {
  if (service.kind === "frontend" && service.deploy.mode === "isolated") {
    return Number(service.runtime.container_port);
  }

  return Number(service.runtime.port);
}

function getRuntimeDependencies(stack) {
  const dependencies = new Set();

  for (const entry of stack.ingress) {
    if (entry.upstream.type === "proxy") {
      dependencies.add(getRuntimeServiceName(stack.servicesByName.get(entry.upstream.service)));
    }

    for (const route of entry.routes) {
      dependencies.add(getRuntimeServiceName(stack.servicesByName.get(route.service)));
    }
  }

  return [...dependencies].sort();
}

function collectSharedNodeServices(stack) {
  return stack.services.filter(
    (service) => service.enabled && service.deploy.mode === "shared-node",
  );
}

function collectIsolatedServices(stack) {
  return stack.services.filter(
    (service) => service.enabled && service.deploy.mode === "isolated",
  );
}

function collectImageServices(stack) {
  return stack.services.filter(
    (service) => service.enabled && service.deploy.mode === "image",
  );
}

function applyResourceLimits(serviceDefinition, resources) {
  const limits = {};

  if (resources?.cpus) {
    limits.cpus = String(resources.cpus);
  }

  if (resources?.memory) {
    limits.memory = String(resources.memory);
  }

  if (Object.keys(limits).length > 0) {
    serviceDefinition.deploy = { resources: { limits } };
  }
}

function buildSharedNodeService(stack, groupName, services, stateRoot, registry, releaseId) {
  const volumes = [];
  const seenVolumes = new Set();

  for (const service of services) {
    for (const storage of service.storage) {
      if (storage.type !== "bind") {
        continue;
      }

      const source = mapStorageSourceToStateRoot(stack, stateRoot, storage.source);
      const volumeKey = `${source}:${storage.target}`;

      if (seenVolumes.has(volumeKey)) {
        continue;
      }

      seenVolumes.add(volumeKey);
      volumes.push(`${source}:${storage.target}`);
    }
  }

  const exposePorts = unique(
    services
      .map((service) => getContainerExposePort(service))
      .filter((value) => Number.isInteger(value) && value > 0)
      .map(String),
  ).sort((left, right) => Number(left) - Number(right));

  const serviceDefinition = registry
    ? { image: `${registry}/infra-${groupName}:${releaseId}`, restart: "unless-stopped" }
    : { build: { context: `./shared/${groupName}` }, restart: "unless-stopped" };

  if (exposePorts.length > 0) {
    serviceDefinition.expose = exposePorts;
  }

  if (volumes.length > 0) {
    serviceDefinition.volumes = volumes;
  }

  const envFiles = services
    .filter((s) => s.kind === "backend")
    .map((s) => `./shared-env/${s.name}.env`);

  if (envFiles.length > 0) {
    serviceDefinition.env_file = envFiles;
  }

  applyResourceLimits(serviceDefinition, stack.groups[groupName]?.resources);

  return serviceDefinition;
}

function buildIsolatedService(stack, service, stateRoot, registry, releaseId) {
  const exposePort = getContainerExposePort(service);
  const serviceDefinition = registry
    ? { image: `${registry}/${service.name}:${releaseId}`, restart: "unless-stopped" }
    : { build: { context: `./isolated/${service.name}` }, restart: "unless-stopped" };

  if (Number.isInteger(exposePort) && exposePort > 0) {
    serviceDefinition.expose = [String(exposePort)];
  }

  if (service.kind === "backend") {
    serviceDefinition.env_file = [`./isolated-env/${service.name}.env`];
  }

  if (service.storage.length > 0) {
    serviceDefinition.volumes = service.storage
      .filter((entry) => entry.type === "bind")
      .map((entry) => {
        const source = mapStorageSourceToStateRoot(stack, stateRoot, entry.source);
        return `${source}:${entry.target}`;
      });
  }

  if (service.depends_on.length > 0) {
    serviceDefinition.depends_on = [...service.depends_on];
  }

  applyResourceLimits(serviceDefinition, service.resources);

  return serviceDefinition;
}

// Compose interpolates $VAR in the file itself at parse time. Commands are
// meant literally (env vars resolve inside the container via env_file), so
// escape $ as $$ to get them past compose untouched.
function escapeComposeInterpolation(command) {
  if (typeof command === "string") {
    return command.replaceAll("$", "$$$$");
  }

  return command.map((part) => String(part).replaceAll("$", "$$$$"));
}

function buildImageService(stack, service, stateRoot) {
  const serviceDefinition = { image: service.image, restart: "unless-stopped" };

  if (service.command) {
    serviceDefinition.command = escapeComposeInterpolation(service.command);
  }

  const exposePort = Number(service.runtime.port);

  if (Number.isInteger(exposePort) && exposePort > 0) {
    serviceDefinition.expose = [String(exposePort)];
  }

  if (service.env.files.nonsecret || service.env.files.secret) {
    serviceDefinition.env_file = [`./isolated-env/${service.name}.env`];
  }

  const volumes = service.storage
    .filter((entry) => entry.type === "bind")
    .map((entry) => {
      const source = mapStorageSourceToStateRoot(stack, stateRoot, entry.source);
      return `${source}:${entry.target}`;
    });

  if (volumes.length > 0) {
    serviceDefinition.volumes = volumes;
  }

  if (service.depends_on.length > 0) {
    serviceDefinition.depends_on = [...service.depends_on];
  }

  applyResourceLimits(serviceDefinition, service.resources);

  return serviceDefinition;
}

export function renderReleaseCompose(stack, options = {}) {
  const {
    stateRoot,
    port = 8091,
    tls = false,
    registry = null,
    releaseId = null,
  } = options;
  const sharedNodeServices = collectSharedNodeServices(stack);
  const isolatedServices = collectIsolatedServices(stack);
  const imageServices = collectImageServices(stack);
  const groupedServices = new Map();

  for (const service of sharedNodeServices) {
    const services = groupedServices.get(service.deploy.group) ?? [];
    services.push(service);
    groupedServices.set(service.deploy.group, services);
  }

  const edgePorts = tls ? [`${port}:80`, "443:443"] : [`${port}:80`];
  const edgeVolumes = [
    "./nginx.conf:/etc/nginx/conf.d/default.conf:ro",
    "./edge-static:/srv/edge-static:ro",
    ...(tls ? [
      "/etc/letsencrypt:/etc/letsencrypt:ro",
      "/var/www/certbot:/var/www/certbot:ro",
    ] : []),
  ];

  const services = {
    edge: {
      image: "nginx:1.27-alpine",
      restart: "unless-stopped",
      ports: edgePorts,
      volumes: edgeVolumes,
    },
  };

  const dependencies = getRuntimeDependencies(stack);

  if (dependencies.length > 0) {
    services.edge.depends_on = dependencies;
  }

  for (const [groupName, groupServices] of [...groupedServices.entries()].sort()) {
    services[`shared-${groupName}`] = buildSharedNodeService(
      stack,
      groupName,
      groupServices,
      stateRoot,
      registry,
      releaseId,
    );
  }

  for (const service of isolatedServices.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    services[service.name] = buildIsolatedService(stack, service, stateRoot, registry, releaseId);
  }

  for (const service of imageServices.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    services[service.name] = buildImageService(stack, service, stateRoot);
  }

  return YAML.stringify({ services }, { lineWidth: 0 });
}
