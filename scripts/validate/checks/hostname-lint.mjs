function buildResult(name) {
  return {
    name,
    errors: [],
    warnings: [],
  };
}

function getFallbackRootDomain(hostname) {
  const labels = hostname.split(".");

  if (labels.length < 2) {
    return hostname;
  }

  return labels.slice(-2).join(".");
}

function getConfiguredRootDomain(hostname, configuredRootDomains) {
  const matchingRoot = configuredRootDomains
    .filter((rootDomain) => hostname === rootDomain || hostname.endsWith(`.${rootDomain}`))
    .sort((left, right) => right.length - left.length)[0];

  return matchingRoot ?? getFallbackRootDomain(hostname);
}

function getDomainStem(hostname, rootDomain) {
  if (hostname === rootDomain) {
    return "";
  }

  const suffix = `.${rootDomain}`;

  if (hostname.endsWith(suffix)) {
    const prefixLabels = hostname.slice(0, -suffix.length).split(".");
    return prefixLabels[prefixLabels.length - 1] ?? "";
  }

  const labels = hostname.split(".");

  return labels[labels.length - 3];
}

function levenshtein(left, right) {
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0),
  );

  for (let index = 0; index <= left.length; index += 1) {
    matrix[index][0] = index;
  }

  for (let index = 0; index <= right.length; index += 1) {
    matrix[0][index] = index;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;

      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );
    }
  }

  return matrix[left.length][right.length];
}

function stripNumericSuffix(value) {
  return value.replace(/[0-9]+$/, "");
}

const hostPattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export async function runHostnameLintCheck({ stack }) {
  const result = buildResult("hostname-lint");
  const hosts = [];
  const configuredRootDomains = Object.keys(stack.tls.root_domains);

  for (const entry of stack.ingress) {
    for (const host of entry.hosts) {
      if (!hostPattern.test(host.name)) {
        result.errors.push(`Host "${host.name}" is not a valid lowercase hostname.`);
        continue;
      }

      const rootDomain = getConfiguredRootDomain(host.name, configuredRootDomains);

      if (!stack.tls.root_domains[rootDomain]) {
        result.warnings.push(
          `Host "${host.name}" uses root domain "${rootDomain}" which is not configured under tls.root_domains.`,
        );
      }

      hosts.push({
        ingress: entry.name,
        name: host.name,
        rootDomain,
        stem: getDomainStem(host.name, rootDomain),
        acknowledged: host.acknowledge_nonstandard,
      });
    }
  }

  for (let index = 0; index < hosts.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < hosts.length; compareIndex += 1) {
      const left = hosts[index];
      const right = hosts[compareIndex];

      if (left.rootDomain !== right.rootDomain) {
        continue;
      }

      if (left.acknowledged || right.acknowledged) {
        continue;
      }

      if (!left.stem || !right.stem || left.stem === right.stem) {
        continue;
      }

      if (stripNumericSuffix(left.stem) === stripNumericSuffix(right.stem)) {
        continue;
      }

      if (left.stem.length < 6 || right.stem.length < 6) {
        continue;
      }

      const distance = levenshtein(left.stem, right.stem);

      if (distance > 0 && distance <= 2) {
        result.warnings.push(
          `Hosts "${left.name}" and "${right.name}" have similar domain stems ("${left.stem}" vs "${right.stem}"). Confirm this is intentional.`,
        );
      }
    }
  }

  return result;
}
