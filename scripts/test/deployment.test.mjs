import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import YAML from "yaml";

import { loadEnvFile } from "../lib/env-merge.mjs";
import { repoRoot } from "../lib/paths.mjs";

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "infra-deployment-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(repoRoot, "scripts"), path.join(root, "scripts"), { recursive: true });
  await symlink(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"), "dir");
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  return root;
}

async function importScript(root, script) {
  return import(pathToFileURL(path.join(root, "scripts", script)));
}

async function executable(directory, name, contents) {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), `#!/usr/bin/env bash\nset -euo pipefail\n${contents}\n`, { mode: 0o755 });
}

test("shared municipal images retain each service's runtime settings through publishing", async (t) => {
  const root = await workspace(t);
  const raw = YAML.parse(await readFile(path.join(repoRoot, "config/stack.yaml"), "utf8"));
  raw.env = {};
  for (const service of Object.values(raw.services)) service.env = {};

  const fixture = path.join(root, "source");
  await mkdir(fixture);
  await writeFile(path.join(fixture, "package.json"), JSON.stringify({ scripts: { start: "node server.mjs" } }));
  await writeFile(path.join(fixture, "server.mjs"), 'console.log(JSON.stringify({port: process.env.PORT, municipalPort: process.env.MUNICIPAL_BACKEND_PORT, tenant: process.env.TEST_TENANT, fromFile: process.env.FROM_FILE}));');
  for (const args of [
    ["init", "-b", "main"],
    ["add", "."],
    ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"],
  ]) execFileSync("git", args, { cwd: fixture, stdio: "pipe" });
  raw.sources.municipal_backend = { repo: pathToFileURL(fixture).href, ref: "main" };

  const envFile = path.join(root, "fixture.env");
  await writeFile(envFile, "PORT=1\nMUNICIPAL_BACKEND_PORT=1\nFROM_FILE=preserved\n");
  const municipalNames = Object.entries(raw.services)
    .filter(([, service]) => service.build?.shared_image === "municipal-backend")
    .map(([name, service]) => {
      service.runtime.env.TEST_TENANT = name;
      service.env.files = { nonsecret: envFile };
      return name;
    });
  assert.equal(municipalNames.length, 5);

  const { normalizeStack } = await importScript(root, "lib/normalize-stack.mjs");
  const { buildIsolatedPreviewServices } = await importScript(root, "build/isolated-preview.mjs");
  const stack = normalizeStack(raw);
  const built = await buildIsolatedPreviewServices(stack, { services: municipalNames });
  assert.equal(new Set(built.map((record) => record.contextDirectory)).size, 1);
  const context = built[0].contextDirectory;
  const dockerfile = await readFile(path.join(context, "Dockerfile"), "utf8");
  const imagePort = dockerfile.match(/^ENV PORT=(\d+)$/m)[1];
  const startScript = (await readFile(path.join(context, "start-service.sh"), "utf8"))
    .replace("cd /srv/app", `cd ${shellQuote(path.join(context, "app"))}`);
  for (const record of built) {
    const service = stack.servicesByName.get(record.service);
    const env = await loadEnvFile(record.envFile);
    const stdout = execFileSync("/bin/sh", ["-c", startScript], {
      env: { ...process.env, PORT: imagePort, ...env },
      encoding: "utf8",
    });
    assert.deepEqual(JSON.parse(stdout.trim().split("\n").at(-1)), {
      port: String(service.runtime.port),
      municipalPort: String(service.runtime.port),
      tenant: service.name,
      fromFile: "preserved",
    });
  }

  // A targeted rebuild can choose a different primary service for the same image.
  await buildIsolatedPreviewServices(stack, { services: [municipalNames.at(-1)] });
  for (const name of municipalNames) {
    assert.equal((await loadEnvFile(path.join(root, "generated/isolated-preview/env", `${name}.env`))).PORT,
      String(stack.servicesByName.get(name).runtime.port));
  }

  const { buildEdgeStaticSites } = await importScript(root, "build/edge-static.mjs");
  const { buildSharedNodePreviewGroups } = await importScript(root, "build/shared-node-preview.mjs");
  await buildEdgeStaticSites(stack, { stub: true });
  await buildSharedNodePreviewGroups(stack, { stub: true });
  await buildIsolatedPreviewServices(stack, { stub: true });
  await writeFile(path.join(root, "stack.yaml"), YAML.stringify(raw));
  execFileSync(process.execPath, [path.join(root, "scripts/deploy/publish.mjs"),
    "--stack", path.join(root, "stack.yaml"), "--state-root", path.join(root, "state"),
    "--release", "fixture", "--tls"], { stdio: "pipe" });
  const release = path.join(root, "state/releases/fixture");
  const compose = YAML.parse(await readFile(path.join(release, "compose.yaml"), "utf8"));
  assert.equal(new Set(municipalNames.map((name) => compose.services[name].image)).size, 1);
  for (const name of municipalNames) {
    const env = await loadEnvFile(path.resolve(release, compose.services[name].env_file[0]));
    assert.equal(env.PORT, String(stack.servicesByName.get(name).runtime.port));
    assert.equal(env.MUNICIPAL_BACKEND_PORT, env.PORT);
    assert.deepEqual(compose.services[name].expose, [env.PORT]);
  }
  const pm2 = await readFile(path.join(release, "shared/low-node/pm2/low-node.ecosystem.config.js"), "utf8");
  for (const name of municipalNames) assert.ok(!pm2.includes(name));
});

test("municipal deployment updates the shared group before switching the edge", async (t) => {
  const root = await workspace(t);
  const server = path.join(root, "server");
  for (const release of ["old", "new"]) {
    await mkdir(path.join(server, "releases", release), { recursive: true });
    await writeFile(path.join(server, "releases", release, "compose.yaml"), "services: {}\n");
  }
  await symlink("releases/old", path.join(server, "current"));
  const script = path.join(root, "scripts/server/deploy-on-server.sh");
  await writeFile(script, (await readFile(script, "utf8")).replace('INFRA_ROOT="/opt/brijesh-infra"', `INFRA_ROOT=${shellQuote(server)}`));
  const bin = path.join(root, "bin");
  const log = path.join(root, "docker.log");
  await executable(bin, "docker", 'printf "%s\\n" "$*" >> "$REVIEW_LOG"');
  execFileSync("bash", [script, "new", "municipal"], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REVIEW_LOG: log },
    stdio: "pipe",
  });
  const commands = (await readFile(log, "utf8")).trim().split("\n");
  const starts = commands.filter((command) => command.includes(" up -d --no-deps "));
  for (const service of ["municipal-api", "siranchowk-municipal", "ratnagar-municipal", "madhyabindu-municipal", "devghat-municipal", "shared-low-node"]) {
    assert.ok(starts.some((command) => command.endsWith(` ${service}`)), `missing deployment for ${service}`);
  }
  assert.ok(starts.findIndex((command) => command.endsWith(" shared-low-node")) <
    starts.findIndex((command) => command.endsWith(" edge")));
  assert.ok(commands.some((command) => command.endsWith(" build shared-low-node")));
});

for (const failure of [null, "extract", "reload"]) {
  test(`static deployment ${failure ? `restores the live site after ${failure} failure` : "replaces removed files without changing other services"}`, async (t) => {
    const root = await workspace(t);
    const server = path.join(root, "server");
    const release = path.join(server, "releases/live");
    const staticRoot = path.join(release, "edge-static");
    const live = path.join(staticRoot, "codify-web");
    const output = path.join(root, "generated/edge-static/codify-web");
    await mkdir(live, { recursive: true });
    await mkdir(output, { recursive: true });
    await writeFile(path.join(release, "compose.yaml"), "services: {}\n");
    await symlink("releases/live", path.join(server, "current"));
    await writeFile(path.join(live, "index.html"), "old");
    await writeFile(path.join(live, "removed.html"), "removed from new build");
    await writeFile(path.join(staticRoot, "other-service.txt"), "untouched");
    await writeFile(path.join(output, "index.html"), "new");
    await writeFile(path.join(output, "new.js"), "new asset");
    const script = path.join(root, "scripts/server/deploy-edge-static.sh");
    await writeFile(script, (await readFile(script, "utf8")).replaceAll("/opt/brijesh-infra", server));
    const bin = path.join(root, "bin");
    const transferLog = path.join(root, "transfer.log");
    await executable(bin, "node", "exit 0");
    await executable(bin, "sudo", 'exec "$@"');
    await executable(bin, "ssh", 'shift 2\nexec bash -c "$1"');
    await executable(bin, "scp", 'destination="${!#}"\nremote="${destination#*:}"\nprintf "%s" "$remote" > "$REVIEW_TRANSFER_LOG"\ncp -- "$3" "$remote"');
    await executable(bin, "docker", failure === "reload" ? "exit 1" : "exit 0");
    if (failure === "extract") {
      await executable(bin, "tar", 'if [[ "$1" == "-xzf" ]]; then exit 1; fi\nexec /usr/bin/tar "$@"');
    }
    t.after(async () => {
      const remote = await readFile(transferLog, "utf8").catch(() => "");
      if (remote) await rm(remote, { force: true });
    });
    const deploy = () => execFileSync("bash", [script, "codify-web", "fixture"], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: root, REVIEW_TRANSFER_LOG: transferLog },
      stdio: "pipe",
    });
    if (failure) assert.throws(deploy);
    else deploy();
    assert.equal(await readFile(path.join(live, "index.html"), "utf8"), failure ? "old" : "new");
    assert.deepEqual((await readdir(live)).sort(), failure ? ["index.html", "removed.html"] : ["index.html", "new.js"]);
    assert.equal(await readFile(path.join(staticRoot, "other-service.txt"), "utf8"), "untouched");
    assert.deepEqual((await readdir(staticRoot)).sort(), ["codify-web", "other-service.txt"]);
    assert.equal((await stat(live)).mode & 0o777, 0o755);
    const remote = await readFile(transferLog, "utf8");
    await assert.rejects(stat(remote), { code: "ENOENT" });
    assert.ok(!(await readdir(root)).some((name) => name.startsWith("codify-web-static.")));
  });
}
