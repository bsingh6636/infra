function buildResult(name) {
  return {
    name,
    errors: [],
    warnings: [],
  };
}

export async function runServiceRefsCheck({ stack }) {
  const result = buildResult("service-refs");

  for (const entry of stack.ingress) {
    const upstreamService = stack.servicesByName.get(entry.upstream.service);

    if (!upstreamService) {
      result.errors.push(
        `Ingress "${entry.name}" references missing upstream service "${entry.upstream.service}".`,
      );
    } else if (!upstreamService.enabled) {
      result.errors.push(
        `Ingress "${entry.name}" references disabled upstream service "${entry.upstream.service}".`,
      );
    }

    if (entry.upstream.type === "static" && upstreamService?.kind !== "frontend") {
      result.errors.push(
        `Ingress "${entry.name}" is static but points to non-frontend service "${entry.upstream.service}".`,
      );
    }

    for (const route of entry.routes) {
      const routeService = stack.servicesByName.get(route.service);

      if (!routeService) {
        result.errors.push(
          `Ingress "${entry.name}" route "${route.path}" references missing service "${route.service}".`,
        );
        continue;
      }

      if (!routeService.enabled) {
        result.errors.push(
          `Ingress "${entry.name}" route "${route.path}" references disabled service "${route.service}".`,
        );
      }
    }
  }

  return result;
}
