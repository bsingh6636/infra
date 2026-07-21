import { mergeServiceEnv } from "../../lib/env-merge.mjs";

function buildResult(name) {
  return {
    name,
    errors: [],
    warnings: [],
  };
}

export async function runRequiredEnvCheck({ stack }) {
  const result = buildResult("required-env");

  for (const service of stack.services) {
    if (!service.enabled || service.env.required.length === 0) {
      continue;
    }

    const { merged } = await mergeServiceEnv(stack, service);

    for (const key of service.env.required) {
      const value = merged[key];

      if (typeof value !== "string" || value.trim() === "") {
        result.errors.push(
          `Service "${service.name}" is missing required env var "${key}" after precedence merge.`,
        );
      }
    }
  }

  return result;
}
