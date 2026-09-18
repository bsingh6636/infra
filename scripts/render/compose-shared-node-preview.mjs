import YAML from "yaml";

function collectSharedGroups(stack) {
  const grouped = new Map();

  for (const service of stack.services) {
    if (!service.enabled || service.deploy.mode !== "shared-node") {
      continue;
    }

    const groupServices = grouped.get(service.deploy.group) ?? [];
    groupServices.push(service);
    grouped.set(service.deploy.group, groupServices);
  }

  return new Map(
    [...grouped.entries()].map(([groupName, services]) => [
      groupName,
      services.sort((left, right) => left.name.localeCompare(right.name)),
    ]),
  );
}

export function renderSharedNodePreviewCompose(stack, previewPort = 8090) {
  const groupedServices = collectSharedGroups(stack);
  const services = {
    "edge-preview": {
      image: "nginx:1.27-alpine",
      restart: "unless-stopped",
      ports: [`${previewPort}:80`],
      volumes: [
        "./nginx.shared-node-preview.conf:/etc/nginx/conf.d/default.conf:ro",
      ],
      depends_on: [...groupedServices.keys()].map((groupName) => `shared-${groupName}`),
    },
  };

  for (const [groupName, groupServices] of groupedServices.entries()) {
    services[`shared-${groupName}`] = {
      build: {
        context: `./shared-node-preview/build/${groupName}`,
      },
      restart: "unless-stopped",
      expose: groupServices
        .map((service) => String(service.runtime.port))
        .sort((left, right) => Number(left) - Number(right)),
    };
  }

  return YAML.stringify({ services }, { lineWidth: 0 });
}
