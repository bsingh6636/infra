import YAML from "yaml";

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

function buildSharedNodeService(stack, groupName, services) {
  const group = stack.groups[groupName];
  const volumes = [];
  const seenVolumes = new Set();

  for (const service of services) {
    for (const storage of service.storage) {
      const source = storage.source;
      const target = storage.target;
      const volumeKey = `${source}:${target}`;

      if (storage.type !== "bind" || seenVolumes.has(volumeKey)) {
        continue;
      }

      seenVolumes.add(volumeKey);
      volumes.push(`${source}:${target}`);
    }
  }

  const exposePorts = unique(
    services
      .map((service) => getContainerExposePort(service))
      .filter((value) => Number.isInteger(value) && value > 0)
      .map(String),
  ).sort((left, right) => Number(left) - Number(right));

  const serviceDefinition = {
    image: `${stack.project.name}-shared-${groupName}:phase2-preview`,
    restart: "unless-stopped",
    networks: [stack.project.network],
  };

  if (exposePorts.length > 0) {
    serviceDefinition.expose = exposePorts;
  }

  if (volumes.length > 0) {
    serviceDefinition.volumes = volumes;
  }

  if (group.resources?.cpus || group.resources?.memory) {
    serviceDefinition.deploy = {
      resources: {
        limits: {},
      },
    };

    if (group.resources?.cpus) {
      serviceDefinition.deploy.resources.limits.cpus = group.resources.cpus;
    }

    if (group.resources?.memory) {
      serviceDefinition.deploy.resources.limits.memory = group.resources.memory;
    }
  }

  return serviceDefinition;
}

function buildIsolatedService(stack, service) {
  const exposePort = getContainerExposePort(service);
  const serviceDefinition = {
    image: `${stack.project.name}-${service.name}:phase2-preview`,
    restart: "unless-stopped",
    networks: [stack.project.network],
  };

  if (Number.isInteger(exposePort) && exposePort > 0) {
    serviceDefinition.expose = [String(exposePort)];
  }

  if (service.storage.length > 0) {
    serviceDefinition.volumes = service.storage
      .filter((entry) => entry.type === "bind")
      .map((entry) => `${entry.source}:${entry.target}`);
  }

  return serviceDefinition;
}

export function renderCompose(stack) {
  const sharedNodeServices = collectSharedNodeServices(stack);
  const isolatedServices = collectIsolatedServices(stack);
  const groupedServices = new Map();

  for (const service of sharedNodeServices) {
    const services = groupedServices.get(service.deploy.group) ?? [];
    services.push(service);
    groupedServices.set(service.deploy.group, services);
  }

  const services = {
    edge: {
      image: "nginx:1.27-alpine",
      restart: "unless-stopped",
      ports: ["80:80", "443:443"],
      networks: [stack.project.network],
      volumes: [
        "./generated/nginx.conf:/etc/nginx/conf.d/default.conf:ro",
        "./generated/edge-static:/srv/edge-static:ro",
      ],
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
    );
  }

  for (const service of isolatedServices.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    services[service.name] = buildIsolatedService(stack, service);
  }

  const document = {
    services,
    networks: {
      [stack.project.network]: {
        driver: "bridge",
      },
    },
  };

  return YAML.stringify(document, {
    lineWidth: 0,
  });
}
