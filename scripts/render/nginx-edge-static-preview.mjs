function indent(lines, spaces = 4) {
  const prefix = " ".repeat(spaces);
  return lines.map((line) => `${prefix}${line}`);
}

function renderDisabledRoute(route) {
  return [
    `location ^~ ${route.path} {`,
    '    add_header Content-Type text/plain;',
    '    return 503 "Phase 3 preview: backend route is disabled in edge-static preview\\n";',
    "}",
  ];
}

function renderStaticServer(entry) {
  const serviceName = entry.upstream.service;
  const lines = [
    "server {",
    ...indent(["listen 80;", `server_name ${entry.hosts.map((host) => host.name).join(" ")};`]),
    "",
    ...indent(["client_max_body_size 25m;"]),
  ];

  if (entry.routes.length > 0) {
    lines.push("");

    for (const route of entry.routes) {
      lines.push(...indent(renderDisabledRoute(route)));
      lines.push("");
    }
  }

  lines.push(...indent([`root /srv/edge-static/${serviceName};`]));
  lines.push(
    ...indent([
      "location / {",
      "    try_files $uri $uri/ /index.html;",
      "}",
    ]),
  );
  lines.push("}");

  return lines;
}

export function renderEdgeStaticPreviewNginx(stack) {
  const entries = stack.ingress.filter((entry) => {
    const service = stack.servicesByName.get(entry.upstream.service);
    return entry.upstream.type === "static" && service?.deploy.mode === "edge-static";
  });

  const lines = [
    "# Phase 3 edge-static preview config",
    "# This file serves only edge-static frontends.",
    "# Backend routes intentionally return 503 in preview mode.",
    "",
    "server {",
    "    listen 80 default_server;",
    "    server_name _;",
    "    return 404;",
    "}",
    "",
  ];

  for (const entry of entries) {
    lines.push(...renderStaticServer(entry));
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}
