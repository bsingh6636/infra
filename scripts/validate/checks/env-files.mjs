import { fileExists, getEnvFileDescriptors } from "../../lib/env-merge.mjs";

function buildResult(name) {
  return {
    name,
    errors: [],
    warnings: [],
  };
}

export async function runEnvFilesCheck({ stack }) {
  const result = buildResult("env-files");

  for (const service of stack.services) {
    const descriptors = getEnvFileDescriptors(stack, service);

    for (const descriptor of descriptors) {
      if (!(await fileExists(descriptor.path))) {
        result.errors.push(
          `Service "${service.name}" is missing env file "${descriptor.path}" (${descriptor.scope}).`,
        );
      }
    }
  }

  return result;
}
