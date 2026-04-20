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
  const proxyTarget = route.url || getServiceProxyTarget(stack, route.service);
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
  const proxyTarget = entry.upstream.url || getServiceProxyTarget(stack, entry.upstream.service);
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

function resolveCertNameForHost(stack, hostname) {
  const rootDomains = stack.tls?.root_domains ?? {};

  for (const [rootDomain, config] of Object.entries(rootDomains)) {
    if (hostname === rootDomain || hostname.endsWith(`.${rootDomain}`)) {
      return config.cert_name ?? rootDomain;
    }
  }

  throw new Error(
    `No TLS root domain configured for host "${hostname}". Add it to tls.root_domains in stack.yaml.`,
  );
}

function renderTlsServerBlock(stack, entry) {
  // Group hosts by cert name. An ingress entry may span multiple root domains
  // (e.g. subsnepal.brijeshdev.space + subsnepal.com). Each cert group gets
  // its own redirect block + its own SSL server block pointing to the same upstream.
  const certGroups = new Map();

  for (const host of entry.hosts) {
    const certName = resolveCertNameForHost(stack, host.name);
    const group = certGroups.get(certName) ?? [];
    group.push(host.name);
    certGroups.set(certName, group);
  }

  const upstreamLines =
    entry.upstream.type === "static"
      ? renderStaticUpstream(stack, entry)
      : renderProxyUpstream(stack, entry);

  const blocks = [];

  for (const [certName, hostNames] of certGroups) {
    const serverNames = hostNames.join(" ");
    const certBase = `/etc/letsencrypt/live/${certName}`;

    const redirectLines = [
      "server {",
      ...indent([
        "listen 80;",
        `server_name ${serverNames};`,
        "location /.well-known/acme-challenge/ { root /var/www/certbot; }",
        "location / { return 301 https://$host$request_uri; }",
      ]),
      "}",
    ];

    const sslLines = [
      "server {",
      ...indent([
        "listen 443 ssl;",
        "http2 on;",
        `server_name ${serverNames};`,
        "",
        `ssl_certificate ${certBase}/fullchain.pem;`,
        `ssl_certificate_key ${certBase}/privkey.pem;`,
        "ssl_protocols TLSv1.2 TLSv1.3;",
        "ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';",
        "ssl_prefer_server_ciphers off;",
        "",
        "client_max_body_size 25m;",
      ]),
    ];

    if (entry.routes.length > 0) {
      sslLines.push("");

      for (const route of entry.routes) {
        sslLines.push(...indent(renderRouteLocation(stack, route), 4));
        sslLines.push("");
      }
    }

    sslLines.push(...indent(upstreamLines, 4));
    sslLines.push("}");

    blocks.push(...redirectLines, "", ...sslLines);
  }

  return blocks;
}

export function renderReleaseNginx(stack, options = {}) {
  const tlsEnabled = options.tls === true;

  const headerComment = tlsEnabled
    ? "# Production release runtime config — HTTP redirects to HTTPS, TLS enabled."
    : "# Local release runtime config\n# HTTP only for Phase 6 local deployment validation.\n# TLS is intentionally deferred to final validation and production cutover.";

  // The default_server catch-all on 443 must have a certificate directive or
  // nginx refuses to start. Use the first configured root domain cert.
  const firstCertName = Object.values(stack.tls?.root_domains ?? {}).find((c) => c.cert_name)?.cert_name
    ?? Object.keys(stack.tls?.root_domains ?? {})[0]
    ?? null;

  const defaultServerListenLines = tlsEnabled
    ? [
        "listen 80 default_server;",
        "listen 443 ssl default_server;",
        ...(firstCertName ? [
          `ssl_certificate /etc/letsencrypt/live/${firstCertName}/fullchain.pem;`,
          `ssl_certificate_key /etc/letsencrypt/live/${firstCertName}/privkey.pem;`,
        ] : []),
      ]
    : ["listen 80 default_server;"];

  const lines = [
    headerComment,
    "",
    "map $http_upgrade $connection_upgrade {",
    "    default upgrade;",
    "    '' close;",
    "}",
    "",
    "server {",
    ...indent([...defaultServerListenLines, "server_name _;", "return 444;"]),
    "}",
    "",
  ];

  for (const entry of stack.ingress) {
    if (tlsEnabled) {
      lines.push(...renderTlsServerBlock(stack, entry));
    } else {
      lines.push(...renderServerBlock(stack, entry));
    }

    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}
