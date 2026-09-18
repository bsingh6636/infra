import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

// Quoted values may legitimately span multiple physical lines (e.g. a JSON
// secret with an embedded PEM key). [^'] / [^"] match newlines too, so the
// quoted alternatives below consume multi-line values correctly instead of
// stopping at the first "=" in the blob (which broke on base64 padding).
const ENV_LINE = /^[ \t]*(?:export[ \t]+)?([\w.-]+)[ \t]*=[ \t]*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"|([^#\r\n]*))?[ \t]*(?:#.*)?$/gm;

export function parseEnvContents(contents) {
  const parsed = {};
  let match;

  while ((match = ENV_LINE.exec(contents)) !== null) {
    const [, key, singleQuoted, doubleQuoted, bare] = match;
    let value;
    if (singleQuoted !== undefined) value = singleQuoted.replace(/\\'/g, "'");
    else if (doubleQuoted !== undefined) value = doubleQuoted.replace(/\\"/g, '"');
    else value = (bare ?? "").trim();

    parsed[key] = value;
  }

  return parsed;
}

export async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function loadEnvFile(filePath) {
  const contents = await readFile(filePath, "utf8");
  return parseEnvContents(contents);
}

export function getEnvFileDescriptors(stack, service) {
  const descriptors = [];

  if (stack.env.global_nonsecret) {
    descriptors.push({
      scope: "global_nonsecret",
      path: stack.env.global_nonsecret,
    });
  }

  if (stack.env.global_secret) {
    descriptors.push({
      scope: "global_secret",
      path: stack.env.global_secret,
    });
  }

  if (service.env.files.nonsecret) {
    descriptors.push({
      scope: "service_nonsecret",
      path: service.env.files.nonsecret,
    });
  }

  if (service.env.files.secret) {
    descriptors.push({
      scope: "service_secret",
      path: service.env.files.secret,
    });
  }

  return descriptors;
}

export async function mergeServiceEnv(stack, service) {
  const descriptors = getEnvFileDescriptors(stack, service);
  const merged = {};
  const missingFiles = [];

  for (const descriptor of descriptors) {
    if (!(await fileExists(descriptor.path))) {
      missingFiles.push(descriptor);
      continue;
    }

    Object.assign(merged, await loadEnvFile(descriptor.path));
  }

  return {
    merged,
    missingFiles,
    descriptors,
  };
}
