import { loadStack } from "../lib/load-stack.mjs";
import { normalizeStack } from "../lib/normalize-stack.mjs";
import { defaultStackPath } from "../lib/paths.mjs";
import { buildEdgeStaticSites } from "./edge-static.mjs";
import { buildIsolatedPreviewServices } from "./isolated-preview.mjs";
import { buildSharedNodePreviewGroups } from "./shared-node-preview.mjs";

function parseArgs(argv) {
  const options = {
    stackPath: defaultStackPath,
    mode: null,
    stub: false,
    services: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--edge-static") {
      options.mode = "edge-static";
      continue;
    }

    if (arg === "--isolated-preview") {
      options.mode = "isolated-preview";
      continue;
    }

    if (arg === "--shared-node-preview") {
      options.mode = "shared-node-preview";
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

  if (!options.mode) {
    throw new Error("Choose one build mode: --edge-static or --isolated-preview.");
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const loaded = await loadStack(options.stackPath);
  const stack = normalizeStack(loaded.raw);
  const builtServices =
    options.mode === "edge-static"
      ? await buildEdgeStaticSites(stack, {
          stub: options.stub,
          services: options.services,
        })
      : options.mode === "isolated-preview"
        ? await buildIsolatedPreviewServices(stack, {
            stub: options.stub,
            services: options.services,
          })
        : await buildSharedNodePreviewGroups(stack, {
            stub: options.stub,
            services: options.services,
          });

  console.log(
    options.mode === "edge-static"
      ? "Built edge-static services:"
      : options.mode === "isolated-preview"
        ? "Built isolated preview services:"
        : "Built shared-node preview services:",
  );

  for (const item of builtServices) {
    console.log(
      `- ${item.service} (${item.mode}) -> ${item.outputDirectory ?? item.contextDirectory}`,
    );
  }
}

main().catch((error) => {
  console.error(`Build failed: ${error.message}`);
  process.exit(1);
});
