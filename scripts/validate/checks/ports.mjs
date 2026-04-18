function buildResult(name) {
  return {
    name,
    errors: [],
    warnings: [],
  };
}

function isValidPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

export async function runPortsCheck({ stack }) {
  const result = buildResult("ports");
  const sharedGroupPorts = new Map();

  for (const service of stack.services) {
    if (service.kind === "backend") {
      const port = Number(service.runtime.port);

      if (!isValidPort(port)) {
        result.errors.push(
          `Backend service "${service.name}" must define a valid runtime.port.`,
        );
        continue;
      }

      if (service.deploy.mode === "shared-node") {
        const key = service.deploy.group;
        const usedPorts = sharedGroupPorts.get(key) ?? new Map();

        if (usedPorts.has(port)) {
          result.errors.push(
            `Shared-node group "${key}" has duplicate port ${port} on services "${usedPorts.get(port)}" and "${service.name}".`,
          );
        } else {
          usedPorts.set(port, service.name);
          sharedGroupPorts.set(key, usedPorts);
        }
      }
    }

    if (
      service.kind === "frontend" &&
      service.deploy.mode === "isolated" &&
      service.deploy.frontend_runtime === "static-container"
    ) {
      const containerPort = Number(service.runtime.container_port);

      if (!isValidPort(containerPort)) {
        result.errors.push(
          `Isolated static frontend "${service.name}" must define a valid runtime.container_port.`,
        );
      }
    }
  }

  return result;
}
