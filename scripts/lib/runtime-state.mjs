import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import path from "node:path";

import { generatedRoot, repoRoot } from "./paths.mjs";

export const defaultRuntimeStateRoot = path.join(generatedRoot, "runtime-state");

export function resolveStateRoot(value) {
  if (!value) {
    return defaultRuntimeStateRoot;
  }

  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

export function getRuntimeStateLayout(stateRoot) {
  return {
    stateRoot,
    releasesRoot: path.join(stateRoot, "releases"),
    currentSymlink: path.join(stateRoot, "current"),
    dataRoot: path.join(stateRoot, "data"),
  };
}

export function mapStorageSourceToStateRoot(stack, stateRoot, sourcePath) {
  if (
    stack.project.data_root &&
    sourcePath &&
    path.isAbsolute(sourcePath) &&
    (sourcePath === stack.project.data_root ||
      sourcePath.startsWith(`${stack.project.data_root}${path.sep}`))
  ) {
    const relativePath = path.relative(stack.project.data_root, sourcePath);
    return path.join(stateRoot, "data", relativePath);
  }

  return sourcePath;
}

export async function ensureRuntimeStateDirectories(layout) {
  await mkdir(layout.stateRoot, { recursive: true });
  await mkdir(layout.releasesRoot, { recursive: true });
  await mkdir(layout.dataRoot, { recursive: true });
}

export async function updateCurrentReleaseSymlink(layout, releaseDirectory) {
  const relativeTarget = path.relative(layout.stateRoot, releaseDirectory);

  try {
    const existing = await lstat(layout.currentSymlink);

    if (existing.isSymbolicLink() || existing.isDirectory() || existing.isFile()) {
      await rm(layout.currentSymlink, { recursive: true, force: true });
    }
  } catch {
    // Nothing to remove.
  }

  await symlink(relativeTarget, layout.currentSymlink, "dir");
}

export async function readCurrentReleasePath(layout) {
  try {
    const relativeTarget = await readlink(layout.currentSymlink);
    return path.resolve(layout.stateRoot, relativeTarget);
  } catch {
    return null;
  }
}
