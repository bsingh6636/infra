function buildResult(name) {
  return {
    name,
    errors: [],
    warnings: [],
  };
}

export async function runRouteConflictsCheck({ stack }) {
  const result = buildResult("route-conflicts");

  for (const entry of stack.ingress) {
    const seenPaths = new Map();

    for (const route of entry.routes) {
      if (!route.path.startsWith("/")) {
        result.errors.push(
          `Ingress "${entry.name}" route "${route.path}" must start with "/".`,
        );
      }

      const existing = seenPaths.get(route.path);

      if (!existing) {
        seenPaths.set(route.path, route);
        continue;
      }

      if (
        existing.service !== route.service ||
        existing.protocol !== route.protocol
      ) {
        result.errors.push(
          `Ingress "${entry.name}" has conflicting definitions for path "${route.path}".`,
        );
      } else {
        result.errors.push(
          `Ingress "${entry.name}" repeats the same path "${route.path}" more than once.`,
        );
      }
    }
  }

  return result;
}
