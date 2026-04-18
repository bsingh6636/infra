import path from "node:path";
import { fileURLToPath } from "node:url";

const libDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(libDir, "..", "..");
export const defaultStackPath = path.join(repoRoot, "config", "stack.yaml");
export const generatedRoot = path.join(repoRoot, "generated");
export const generatedEdgeStaticRoot = path.join(generatedRoot, "edge-static");
export const generatedIsolatedPreviewRoot = path.join(generatedRoot, "isolated-preview");
export const generatedSharedNodePreviewRoot = path.join(generatedRoot, "shared-node-preview");

export function resolveFromRepo(...segments) {
  return path.resolve(repoRoot, ...segments);
}

export function resolveMaybeRepoPath(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

export function relativeToRepo(value) {
  return path.relative(repoRoot, value);
}
