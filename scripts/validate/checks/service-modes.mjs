function buildResult(name) {
  return {
    name,
    errors: [],
    warnings: [],
  };
}

export async function runServiceModesCheck({ stack }) {
  const result = buildResult("service-modes");

  for (const service of stack.services) {
    if (service.deploy.mode === "image") {
      if (!service.image) {
        result.errors.push(
          `Service "${service.name}" uses deploy.mode=image but defines no image.`,
        );
      }

      if (service.source.key) {
        result.errors.push(
          `Service "${service.name}" is image-mode and must not define source.key.`,
        );
      }

      if (service.runtime.start) {
        result.errors.push(
          `Service "${service.name}" is image-mode and must not define runtime.start.`,
        );
      }

      if (Object.keys(service.build).length > 0) {
        result.errors.push(
          `Service "${service.name}" is image-mode and must not define build settings.`,
        );
      }

      if (service.kind !== "datastore") {
        result.warnings.push(
          `Service "${service.name}" is image-mode but kind is "${service.kind}" (expected "datastore").`,
        );
      }
    } else if (service.image) {
      result.errors.push(
        `Service "${service.name}" defines image but deploy.mode is "${service.deploy.mode}" (only image-mode services may set it).`,
      );
    }

    const strategy = service.build.strategy;

    if (strategy !== undefined && strategy !== "dockerfile") {
      result.errors.push(
        `Service "${service.name}" has unknown build.strategy "${strategy}" (only "dockerfile" is supported).`,
      );
    }

    if (strategy === "dockerfile") {
      if (service.deploy.mode !== "isolated") {
        result.errors.push(
          `Service "${service.name}" uses build.strategy=dockerfile which requires deploy.mode=isolated.`,
        );
      }

      if (service.kind !== "backend") {
        result.errors.push(
          `Service "${service.name}" uses build.strategy=dockerfile which requires kind=backend.`,
        );
      }
    }

    for (const dependency of service.depends_on) {
      const target = stack.servicesByName.get(dependency);

      if (!target) {
        result.errors.push(
          `Service "${service.name}" depends_on missing service "${dependency}".`,
        );
        continue;
      }

      if (!target.enabled) {
        result.errors.push(
          `Service "${service.name}" depends_on disabled service "${dependency}".`,
        );
      }
    }

    if (
      service.depends_on.length > 0 &&
      !["isolated", "image"].includes(service.deploy.mode)
    ) {
      result.errors.push(
        `Service "${service.name}" defines depends_on but deploy.mode "${service.deploy.mode}" does not run its own container.`,
      );
    }

    if (
      Object.keys(service.resources).length > 0 &&
      !["isolated", "image"].includes(service.deploy.mode)
    ) {
      result.warnings.push(
        `Service "${service.name}" defines resources but deploy.mode "${service.deploy.mode}" ignores them (shared groups set limits on the group).`,
      );
    }
  }

  return result;
}
