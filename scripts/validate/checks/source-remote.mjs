import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function buildResult(name) {
  return {
    name,
    errors: [],
    warnings: [],
  };
}

export async function runSourceRemoteCheck({ stack }) {
  const result = buildResult("source-remote");
  const seenKeys = new Set();

  for (const service of stack.services) {
    if (!service.enabled || seenKeys.has(service.source.key)) {
      continue;
    }

    const source = stack.sources[service.source.key];

    if (!source) {
      continue;
    }

    seenKeys.add(service.source.key);

    try {
      await execFileAsync("git", ["ls-remote", "--exit-code", source.repo, source.ref]);
    } catch (error) {
      result.errors.push(
        `Remote source check failed for "${service.source.key}" (${source.repo}#${source.ref}): ${error.message}`,
      );
    }
  }

  return result;
}
