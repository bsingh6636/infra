function buildResult(name) {
  return {
    name,
    errors: [],
    warnings: [],
  };
}

export async function runDuplicateHostsCheck({ stack }) {
  const result = buildResult("duplicate-hosts");
  const seenHosts = new Map();

  for (const entry of stack.ingress) {
    for (const host of entry.hosts) {
      const normalizedHost = host.name.toLowerCase();

      if (!normalizedHost) {
        result.errors.push(`Ingress "${entry.name}" contains an empty host entry.`);
        continue;
      }

      if (seenHosts.has(normalizedHost)) {
        result.errors.push(
          `Host "${host.name}" is declared in both ingress "${seenHosts.get(normalizedHost)}" and "${entry.name}".`,
        );
        continue;
      }

      seenHosts.set(normalizedHost, entry.name);
    }
  }

  return result;
}
