import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

export function parseEnvContents(contents) {
  const parsed = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    parsed[key] = stripWrappingQuotes(value);
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
