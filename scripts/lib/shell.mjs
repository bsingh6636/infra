import { spawn } from "node:child_process";

export function runCommand(command, args, options = {}) {
  const {
    cwd,
    env,
    stdio = "inherit",
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio,
      shell: false,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Command failed (${code}): ${[command, ...args].join(" ")}`,
        ),
      );
    });
  });
}

export function detectPackageManager(projectDir) {
  return [
    { lockfile: "pnpm-lock.yaml", install: ["pnpm", "install", "--frozen-lockfile"], build: ["pnpm", "run", "build"] },
    { lockfile: "yarn.lock", install: ["yarn", "install", "--frozen-lockfile"], build: ["yarn", "build"] },
    { lockfile: "package-lock.json", install: ["npm", "ci"], build: ["npm", "run", "build"] },
    { lockfile: null, install: ["npm", "install"], build: ["npm", "run", "build"] },
  ];
}
