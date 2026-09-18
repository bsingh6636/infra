import { resolveMaybeRepoPath } from "./paths.mjs";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function normalizeHost(host) {
  if (typeof host === "string") {
    return {
      name: host,
      acknowledge_nonstandard: false,
    };
  }

  const objectHost = asObject(host);

  return {
    name: objectHost.name ?? "",
    acknowledge_nonstandard: objectHost.acknowledge_nonstandard === true,
  };
}

function normalizeRoute(route) {
  const objectRoute = asObject(route);

  return {
    path: objectRoute.path ?? "",
    service: objectRoute.service ?? "",
    url: objectRoute.url ?? "",
    protocol: objectRoute.protocol ?? "http",
  };
}

function normalizeService(name, service) {
  const objectService = asObject(service);
  const envObject = asObject(objectService.env);
  const envFiles = asObject(envObject.files);

  return {
    name,
    enabled: objectService.enabled !== false,
    kind: objectService.kind ?? "",
    image: typeof objectService.image === "string" ? objectService.image : "",
    command: Array.isArray(objectService.command) || typeof objectService.command === "string"
      ? objectService.command
      : null,
    depends_on: asArray(objectService.depends_on),
    resources: asObject(objectService.resources),
    source: {
      key: objectService.source?.key ?? "",
      context: objectService.source?.context ?? "",
    },
    build: asObject(objectService.build),
    deploy: asObject(objectService.deploy),
    runtime: asObject(objectService.runtime),
    env: {
      required: asArray(envObject.required),
      files: {
        nonsecret: resolveMaybeRepoPath(envFiles.nonsecret),
        secret: resolveMaybeRepoPath(envFiles.secret),
      },
    },
    storage: asArray(objectService.storage).map((entry) => asObject(entry)),
  };
}

function normalizeIngress(entry) {
  const objectEntry = asObject(entry);

  return {
    name: objectEntry.name ?? "",
    hosts: asArray(objectEntry.hosts).map(normalizeHost),
    upstream: {
      type: objectEntry.upstream?.type ?? "",
      service: objectEntry.upstream?.service ?? "",
      url: objectEntry.upstream?.url ?? "",
      spa_fallback: objectEntry.upstream?.spa_fallback === true,
    },
    routes: asArray(objectEntry.routes).map(normalizeRoute),
  };
}

export function normalizeStack(raw) {
  const project = asObject(raw.project);
  const env = asObject(raw.env);
  const servicesObject = asObject(raw.services);
  const groupsObject = asObject(raw.groups);
  const sourcesObject = asObject(raw.sources);
  const tls = asObject(raw.tls);

  const services = Object.entries(servicesObject).map(([name, service]) =>
    normalizeService(name, service),
  );
  const servicesByName = new Map(services.map((service) => [service.name, service]));

  return {
    version: raw.version,
    project: {
      name: project.name ?? "",
      network: project.network ?? "",
      release_root: resolveMaybeRepoPath(project.release_root),
      data_root: resolveMaybeRepoPath(project.data_root),
      live_symlink: resolveMaybeRepoPath(project.live_symlink),
      release_retention: Number(project.release_retention ?? 0),
    },
    build: asObject(raw.build),
    tls: {
      root_domains: asObject(tls.root_domains),
    },
    env: {
      global_nonsecret: resolveMaybeRepoPath(env.global_nonsecret),
      global_secret: resolveMaybeRepoPath(env.global_secret),
      service_nonsecret_dir: resolveMaybeRepoPath(env.service_nonsecret_dir),
      service_secret_dir: resolveMaybeRepoPath(env.service_secret_dir),
    },
    sources: sourcesObject,
    groups: groupsObject,
    services,
    servicesByName,
    ingress: asArray(raw.ingress).map(normalizeIngress),
  };
}
