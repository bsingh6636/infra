function getServiceProxyTarget(stack, serviceName) {
  const service = stack.servicesByName.get(serviceName);

  if (!service) {
    throw new Error(`Cannot resolve nginx target for missing service "${serviceName}".`);
  }

  if (service.deploy.mode === "edge-static") {
    throw new Error(`Service "${serviceName}" is edge-static and cannot be proxied.`);
  }

  if (service.deploy.mode === "shared-node") {
    return `http://shared-${service.deploy.group}:${service.runtime.port}`;
  }

  if (service.kind === "frontend" && service.deploy.frontend_runtime === "static-container") {
    return `http://${service.name}:${service.runtime.container_port}`;
  }

  return `http://${service.name}:${service.runtime.port}`;
}

function indent(lines, spaces = 4) {
  const prefix = " ".repeat(spaces);
  return lines.map((line) => `${prefix}${line}`);
}

function renderProxyHeaders() {
  return [
    "proxy_set_header Host $host;",
    "proxy_set_header X-Real-IP $remote_addr;",
    "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "proxy_set_header X-Forwarded-Proto $scheme;",
  ];
}

function renderRouteLocation(stack, route) {
  const proxyTarget = getServiceProxyTarget(stack, route.service);
  const locationLines = [`location ^~ ${route.path} {`, `    proxy_pass ${proxyTarget};`];

  if (route.protocol === "websocket") {
    locationLines.push("    proxy_http_version 1.1;");
    locationLines.push("    proxy_set_header Upgrade $http_upgrade;");
    locationLines.push("    proxy_set_header Connection $connection_upgrade;");
  }

  if (route.protocol === "sse") {
    locationLines.push("    proxy_buffering off;");
    locationLines.push("    proxy_cache off;");
    locationLines.push("    proxy_read_timeout 1h;");
  }

  for (const header of renderProxyHeaders()) {
    locationLines.push(`    ${header}`);
  }

  locationLines.push("}");
  return locationLines;
}

function renderStaticUpstream(stack, entry) {
  const service = stack.servicesByName.get(entry.upstream.service);

  if (service?.deploy.mode !== "edge-static") {
    throw new Error(
      `Ingress "${entry.name}" uses static upstream but service "${entry.upstream.service}" is not edge-static.`,
    );
  }

  const lines = [`root /srv/edge-static/${service.name};`];

  if (entry.upstream.spa_fallback) {
    lines.push("location / {");
    lines.push("    try_files $uri $uri/ /index.html;");
    lines.push("}");
  } else {
    lines.push("location / {");
    lines.push("    try_files $uri $uri/ =404;");
    lines.push("}");
  }

  return lines;
}

function renderProxyUpstream(stack, entry) {
  const proxyTarget = getServiceProxyTarget(stack, entry.upstream.service);
  const lines = ["location / {", `    proxy_pass ${proxyTarget};`];

  for (const header of renderProxyHeaders()) {
    lines.push(`    ${header}`);
  }

  lines.push("}");
  return lines;
}

function renderServerBlock(stack, entry) {
  const serverLines = [
    "server {",
    ...indent(["listen 80;", `server_name ${entry.hosts.map((host) => host.name).join(" ")};`]),
    "",
    ...indent(["client_max_body_size 25m;"]),
  ];

  if (entry.routes.length > 0) {
    serverLines.push("");

    for (const route of entry.routes) {
      serverLines.push(...indent(renderRouteLocation(stack, route), 4));
      serverLines.push("");
    }
  }

  const upstreamLines =
    entry.upstream.type === "static"
      ? renderStaticUpstream(stack, entry)
      : renderProxyUpstream(stack, entry);

  serverLines.push(...indent(upstreamLines, 4));
  serverLines.push("}");

  return serverLines;
}

export function renderReleaseNginx(stack) {
  const lines = [
    "# Local release runtime config",
    "# HTTP only for Phase 6 local deployment validation.",
    "# TLS is intentionally deferred to final validation and production cutover.",
    "",
    "map $http_upgrade $connection_upgrade {",
    "    default upgrade;",
    "    '' close;",
    "}",
    "",
    "server {",
    "    listen 80 default_server;",
    "    server_name _;",
    "    return 404;",
    "}",
    "",
  ];

  for (const entry of stack.ingress) {
    lines.push(...renderServerBlock(stack, entry));
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}
