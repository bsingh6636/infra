import { readFile } from "node:fs/promises";
import YAML from "yaml";

import { defaultStackPath } from "./paths.mjs";

export async function loadStack(stackPath = defaultStackPath) {
  const contents = await readFile(stackPath, "utf8");
  const parsed = YAML.parse(contents);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Stack file must parse to an object: ${stackPath}`);
  }

  return {
    stackPath,
    contents,
    raw: parsed,
  };
}
