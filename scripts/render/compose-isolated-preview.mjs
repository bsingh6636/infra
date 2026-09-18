import YAML from "yaml";

function getIsolatedServices(stack) {
  return stack.services
    .filter((service) => service.enabled && service.deploy.mode === "isolated")
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildIsolatedService(service) {
  const definition = {
    build: {
      context: `./isolated-preview/build/${service.name}`,
    },
    restart: "unless-stopped",
  };

  if (service.kind === "frontend") {
    definition.expose = [String(service.runtime.container_port || 80)];
  } else {
    definition.expose = [String(service.runtime.port)];
    definition.env_file = [`./isolated-preview/env/${service.name}.env`];
  }

  return definition;
}

export function renderIsolatedPreviewCompose(stack, previewPort = 8089) {
  const isolatedServices = getIsolatedServices(stack);
  const services = {
    "edge-preview": {
      image: "nginx:1.27-alpine",
      restart: "unless-stopped",
      ports: [`${previewPort}:80`],
      volumes: [
        "./nginx.isolated-preview.conf:/etc/nginx/conf.d/default.conf:ro",
      ],
      depends_on: isolatedServices.map((service) => service.name),
    },
  };

  for (const service of isolatedServices) {
    services[service.name] = buildIsolatedService(service);
  }

  return YAML.stringify({ services }, { lineWidth: 0 });
}
