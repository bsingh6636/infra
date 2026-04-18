function buildResult(name) {
  return {
    name,
    errors: [],
    warnings: [],
  };
}

function looksLikeRepoUrl(repo) {
  return /^(https?:\/\/|git@)/.test(repo);
}

export async function runSourceSchemaCheck({ stack }) {
  const result = buildResult("source-schema");

  for (const [name, source] of Object.entries(stack.sources)) {
    if (!source || typeof source !== "object") {
      result.errors.push(`Source "${name}" must be an object.`);
      continue;
    }

    if (typeof source.repo !== "string" || !looksLikeRepoUrl(source.repo)) {
      result.errors.push(`Source "${name}" has invalid repo "${source.repo ?? ""}".`);
    }

    if (typeof source.ref !== "string" || source.ref.trim() === "") {
      result.errors.push(`Source "${name}" must define a non-empty ref.`);
    }
  }

  for (const service of stack.services) {
    if (!service.source.key) {
      result.errors.push(`Service "${service.name}" is missing source.key.`);
      continue;
    }

    if (!stack.sources[service.source.key]) {
      result.errors.push(
        `Service "${service.name}" references missing source "${service.source.key}".`,
      );
    }

    if (
      typeof service.source.context !== "string" ||
      service.source.context.trim() === ""
    ) {
      result.errors.push(
        `Service "${service.name}" must define a non-empty source.context.`,
      );
    }
  }

  return result;
}
