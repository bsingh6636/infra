import { loadStack } from "../lib/load-stack.mjs";
import { normalizeStack } from "../lib/normalize-stack.mjs";
import { defaultStackPath } from "../lib/paths.mjs";
import { buildEdgeStaticSites } from "./edge-static.mjs";

function parseArgs(argv) {
  const options = {
    stackPath: defaultStackPath,
    edgeStatic: false,
    stub: false,
    services: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--edge-static") {
      options.edgeStatic = true;
      continue;
    }

    if (arg === "--stub") {
      options.stub = true;
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

    if (arg === "--service") {
      const nextValue = argv[index + 1];

      if (!nextValue) {
        throw new Error("--service requires a service name");
      }

      options.services.push(nextValue);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.edgeStatic) {
    throw new Error("Phase 3 only supports --edge-static builds.");
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const loaded = await loadStack(options.stackPath);
  const stack = normalizeStack(loaded.raw);
  const builtServices = await buildEdgeStaticSites(stack, {
    stub: options.stub,
    services: options.services,
  });

  console.log("Built edge-static services:");

  for (const item of builtServices) {
    console.log(`- ${item.service} (${item.mode}) -> ${item.outputDirectory}`);
  }
}

main().catch((error) => {
  console.error(`Build failed: ${error.message}`);
  process.exit(1);
});
