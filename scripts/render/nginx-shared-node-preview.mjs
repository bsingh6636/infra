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

function getSharedNodeProxyTarget(stack, serviceName) {
  const service = stack.servicesByName.get(serviceName);
  return `http://shared-${service.deploy.group}:${service.runtime.port}`;
}

function renderRouteLocation(stack, route) {
  const lines = [
    `location ^~ ${route.path} {`,
    `    proxy_pass ${getSharedNodeProxyTarget(stack, route.service)};`,
  ];

  for (const header of renderProxyHeaders()) {
    lines.push(`    ${header}`);
  }

  lines.push("}");
  return lines;
}

function renderDisabledRoot(message) {
  return [
    "location / {",
    "    add_header Content-Type text/plain;",
    `    return 503 "${message}\\n";`,
    "}",
  ];
}

function renderServerBlock(stack, entry) {
  const lines = [
    "server {",
    ...indent(["listen 80;", `server_name ${entry.hosts.map((host) => host.name).join(" ")};`]),
    "",
    ...indent(["client_max_body_size 25m;"]),
  ];
  const upstreamService = stack.servicesByName.get(entry.upstream.service);
  const upstreamIsShared = upstreamService?.deploy.mode === "shared-node";
  const sharedRoutes = entry.routes.filter(
    (route) => stack.servicesByName.get(route.service)?.deploy.mode === "shared-node",
  );

  if (sharedRoutes.length > 0) {
    lines.push("");

    for (const route of sharedRoutes) {
      lines.push(...indent(renderRouteLocation(stack, route)));
      lines.push("");
    }
  }

  if (entry.upstream.type === "proxy" && upstreamIsShared) {
    lines.push(
      ...indent([
        "location / {",
        `    proxy_pass ${getSharedNodeProxyTarget(stack, entry.upstream.service)};`,
        ...renderProxyHeaders().map((header) => `    ${header}`),
        "}",
      ]),
    );
  } else {
    lines.push(
      ...indent(
        renderDisabledRoot(
          "Phase 5 preview: frontend route is not included in shared-node preview",
        ),
      ),
    );
  }

  lines.push("}");
  return lines;
}

export function renderSharedNodePreviewNginx(stack) {
  const entries = stack.ingress.filter((entry) => {
    const upstreamService = stack.servicesByName.get(entry.upstream.service);

    if (upstreamService?.deploy.mode === "shared-node") {
      return true;
    }

    return entry.routes.some(
      (route) => stack.servicesByName.get(route.service)?.deploy.mode === "shared-node",
    );
  });
  const lines = [
    "# Phase 5 shared-node preview config",
    "# This file serves only shared-node backend routes.",
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
