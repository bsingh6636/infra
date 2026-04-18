import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

async function collectFiles(targetPath, rootPath, bucket) {
  const targetStat = await stat(targetPath);

  if (targetStat.isFile()) {
    bucket.push(path.relative(rootPath, targetPath));
    return bucket;
  }

  const entries = (await readdir(targetPath)).sort((left, right) =>
    left.localeCompare(right),
  );

  for (const entry of entries) {
    await collectFiles(path.join(targetPath, entry), rootPath, bucket);
  }

  return bucket;
}

export async function hashPath(targetPath) {
  const targetStat = await stat(targetPath);
  const hash = createHash("sha256");

  if (targetStat.isFile()) {
    hash.update(await readFile(targetPath));
    return hash.digest("hex");
  }

  const files = await collectFiles(targetPath, targetPath, []);

  for (const relativePath of files) {
    hash.update(relativePath);
    hash.update(await readFile(path.join(targetPath, relativePath)));
  }

  return hash.digest("hex");
}
