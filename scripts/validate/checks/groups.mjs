function buildResult(name) {
  return {
    name,
    errors: [],
    warnings: [],
  };
}

export async function runGroupsCheck({ stack }) {
  const result = buildResult("groups");

  for (const service of stack.services) {
    const mode = service.deploy.mode;
    const groupName = service.deploy.group;

    if (mode === "shared-node") {
      if (!groupName) {
        result.errors.push(
          `Service "${service.name}" uses shared-node mode but does not declare deploy.group.`,
        );
        continue;
      }

      const group = stack.groups[groupName];

      if (!group) {
        result.errors.push(
          `Service "${service.name}" references missing group "${groupName}".`,
        );
        continue;
      }

      if (group.mode !== "shared-node") {
        result.errors.push(
          `Service "${service.name}" references group "${groupName}" which is not shared-node mode.`,
        );
      }
    } else if (groupName) {
      result.errors.push(
        `Service "${service.name}" declares deploy.group but mode is "${mode}", not "shared-node".`,
      );
    }
  }

  return result;
}
