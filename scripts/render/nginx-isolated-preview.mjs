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

function getProxyTarget(service) {
  if (service.kind === "frontend") {
    return `http://${service.name}:${service.runtime.container_port || 80}`;
  }

  return `http://${service.name}:${service.runtime.port}`;
}

function renderRouteLocation(stack, route) {
  const service = stack.servicesByName.get(route.service);
  const target = getProxyTarget(service);
  const lines = [`location ^~ ${route.path} {`, `    proxy_pass ${target};`];

  if (route.protocol === "websocket") {
    lines.push("    proxy_http_version 1.1;");
    lines.push("    proxy_set_header Upgrade $http_upgrade;");
    lines.push("    proxy_set_header Connection $connection_upgrade;");
  }

  if (route.protocol === "sse") {
    lines.push("    proxy_buffering off;");
    lines.push("    proxy_cache off;");
    lines.push("    proxy_read_timeout 1h;");
  }

  for (const header of renderProxyHeaders()) {
    lines.push(`    ${header}`);
  }

  lines.push("}");
  return lines;
}

function renderUpstreamLocation(service) {
  const target = getProxyTarget(service);
  const lines = ["location / {", `    proxy_pass ${target};`];

  for (const header of renderProxyHeaders()) {
    lines.push(`    ${header}`);
  }

  lines.push("}");
  return lines;
}

function renderServerBlock(stack, entry) {
  const upstreamService = stack.servicesByName.get(entry.upstream.service);
  const lines = [
    "server {",
    ...indent(["listen 80;", `server_name ${entry.hosts.map((host) => host.name).join(" ")};`]),
    "",
    ...indent(["client_max_body_size 25m;"]),
  ];

  if (entry.routes.length > 0) {
    lines.push("");

    for (const route of entry.routes) {
      lines.push(...indent(renderRouteLocation(stack, route)));
      lines.push("");
    }
  }

  lines.push(...indent(renderUpstreamLocation(upstreamService)));
  lines.push("}");

  return lines;
}

export function renderIsolatedPreviewNginx(stack) {
  const isolatedServiceNames = new Set(
    stack.services
      .filter((service) => service.enabled && service.deploy.mode === "isolated")
      .map((service) => service.name),
  );
  const entries = stack.ingress.filter((entry) =>
    isolatedServiceNames.has(entry.upstream.service),
  );
  const lines = [
    "# Phase 4 isolated-service preview config",
    "# This file serves only isolated services.",
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

  for (const entry of entries) {
    lines.push(...renderServerBlock(stack, entry));
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}
