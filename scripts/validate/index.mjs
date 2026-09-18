import { loadStack } from "../lib/load-stack.mjs";
import { normalizeStack } from "../lib/normalize-stack.mjs";
import { defaultStackPath } from "../lib/paths.mjs";

import { runDuplicateHostsCheck } from "./checks/duplicate-hosts.mjs";
import { runEnvFilesCheck } from "./checks/env-files.mjs";
import { runGroupsCheck } from "./checks/groups.mjs";
import { runHostnameLintCheck } from "./checks/hostname-lint.mjs";
import { runPortsCheck } from "./checks/ports.mjs";
import { runRequiredEnvCheck } from "./checks/required-env.mjs";
import { runRouteConflictsCheck } from "./checks/route-conflicts.mjs";
import { runServiceModesCheck } from "./checks/service-modes.mjs";
import { runServiceRefsCheck } from "./checks/service-refs.mjs";
import { runSourceRemoteCheck } from "./checks/source-remote.mjs";
import { runSourceSchemaCheck } from "./checks/source-schema.mjs";

function parseArgs(argv) {
  const options = {
    remote: false,
    stackPath: defaultStackPath,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--remote") {
      options.remote = true;
      continue;
    }

    if (arg === "--stack") {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error("--stack requires a file path");
      }

      options.stackPath = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printMessages(prefix, messages) {
  for (const message of messages) {
    console.log(`${prefix} ${message}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const loaded = await loadStack(options.stackPath);
  const stack = normalizeStack(loaded.raw);

  const context = {
    options,
    stack,
    stackPath: loaded.stackPath,
  };

  const checks = [
    runSourceSchemaCheck,
    runServiceModesCheck,
    runServiceRefsCheck,
    runDuplicateHostsCheck,
    runRouteConflictsCheck,
    runGroupsCheck,
    runPortsCheck,
    runEnvFilesCheck,
    runRequiredEnvCheck,
    runHostnameLintCheck,
  ];

  if (options.remote) {
    checks.push(runSourceRemoteCheck);
  }

  const results = [];

  for (const runCheck of checks) {
    results.push(await runCheck(context));
  }

  let errorCount = 0;
  let warningCount = 0;

  for (const result of results) {
    if (result.errors.length === 0 && result.warnings.length === 0) {
      console.log(`OK    [${result.name}]`);
      continue;
    }

    console.log(`CHECK [${result.name}]`);

    if (result.errors.length > 0) {
      errorCount += result.errors.length;
      printMessages("ERROR ", result.errors);
    }

    if (result.warnings.length > 0) {
      warningCount += result.warnings.length;
      printMessages("WARN  ", result.warnings);
    }
  }

  if (errorCount > 0) {
    console.error(
      `Validation failed with ${errorCount} error(s) and ${warningCount} warning(s).`,
    );
    process.exit(1);
  }

  console.log(`Validation passed with ${warningCount} warning(s).`);
}

main().catch((error) => {
  console.error(`Validation crashed: ${error.message}`);
  process.exit(1);
});
