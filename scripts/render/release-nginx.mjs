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

// Upstream keepalive pooling. Without a named upstream that declares `keepalive`,
// nginx opens a fresh TCP connection to the backend for every request and tears
// it down after the response — which on a cross-container hop costs ~200-400ms
// even for empty 304s. We pool connections per distinct internal target so they
// get reused across requests.
function isPoolableTarget(target) {
  // Only internal docker targets (http://service:port, no path). External https
  // upstreams and long-lived ws/sse routes are intentionally left un-pooled.
  return /^http:\/\/[a-zA-Z0-9_.-]+:\d+$/.test(target);
}

function makeUpstreamName(target) {
  return `up_${target.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function createUpstreamRegistry() {
  const targets = new Map(); // target URL -> upstream name

  return {
    resolve(target) {
      if (!isPoolableTarget(target)) return null;
      if (!targets.has(target)) targets.set(target, makeUpstreamName(target));
      return targets.get(target);
    },
    blocks() {
      const lines = [];
      for (const [target, name] of targets) {
        const server = target.replace(/^https?:\/\//, "");
        lines.push(
          `upstream ${name} {`,
          ...indent([
            `server ${server};`,
            "keepalive 32;",
            "keepalive_timeout 60s;",
            "keepalive_requests 1000;",
          ]),
          "}",
          "",
        );
      }
      return lines;
    },
  };
}

function renderUpstreamLogFormat() {
  // Superset of the combined format (so no forensic fields are lost) plus per-request
  // upstream timings. Once keepalive is working, uct (connect time) drops to 0.000
  // on reused connections — that's the before/after signal in `docker logs`.
  return [
    "log_format upstream_timing '$remote_addr - $remote_user [$time_local] "
      + "\"$request\" $status $body_bytes_sent \"$http_referer\" \"$http_user_agent\" "
      + "rt=$request_time uct=$upstream_connect_time uht=$upstream_header_time urt=$upstream_response_time';",
  ];
}

function renderErrorPages() {
  return [
    'error_page 413 @payload_too_large;',
    'location @payload_too_large {',
    '    default_type application/json;',
    '    return 413 \'{"success":false,"message":"Request too large. Maximum upload size is 25MB."}\';',
    '}',
  ];
}

function renderSecurityHeaders({ includeHsts = false } = {}) {
  // Security response headers. Placed at server level; nginx inherits add_header
  // into nested locations only when those locations declare no add_header of
  // their own (none of ours do), so this covers every route in the block.
  const lines = [];

  if (includeHsts) {
    // HSTS only on TLS responses; meaningless (and ignored by browsers) over HTTP.
    // Ramp deliberately: start at 5 minutes with NO includeSubDomains/preload so
    // the commitment stays easy to reverse. Raise to 86400, then 31536000, and
    // only add includeSubDomains/preload once every subdomain is confirmed on
    // healthy HTTPS — those two flags are effectively irreversible for ~1 year.
    lines.push('add_header Strict-Transport-Security "max-age=300" always;');
  }

  lines.push(
    'add_header X-Content-Type-Options "nosniff" always;',
    'add_header X-Frame-Options "DENY" always;',
    'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
    'add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;',
  );

  // CSP is shipped in Report-Only first so it cannot break the SPA, Telegram
  // login, or remote images. Review violation reports, then promote to an
  // enforcing Content-Security-Policy header once the policy is proven clean.
  lines.push(
    "add_header Content-Security-Policy-Report-Only \"default-src 'self'; " +
      "script-src 'self' https://telegram.org https://*.telegram.org; " +
      "frame-src https://oauth.telegram.org; img-src 'self' data: blob: https:; " +
      "style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; " +
      'base-uri \'self\'; frame-ancestors \'none\'" always;',
  );

  return lines;
}

function renderProxyHeaders() {
  return [
    "proxy_set_header Host $host;",
    "proxy_set_header X-Real-IP $remote_addr;",
    "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "proxy_set_header X-Forwarded-Proto $scheme;",
  ];
}

function renderRouteLocation(stack, route, registry) {
  const rawTarget = route.url || getServiceProxyTarget(stack, route.service);
  // Long-lived protocols must not share the keepalive pool — they hold the
  // connection open for the stream/socket lifetime, so they proxy directly.
  const isLongLived = route.protocol === "websocket" || route.protocol === "sse";
  const upstreamName = isLongLived ? null : registry.resolve(rawTarget);
  const proxyTarget = upstreamName ? `http://${upstreamName}` : rawTarget;
  const locationLines = [
    `location ^~ ${route.path} {`,
    `    proxy_pass ${proxyTarget};`,
    "    proxy_hide_header Cross-Origin-Resource-Policy;",
  ];

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

  // Enable connection reuse to the pooled upstream: HTTP/1.1 + an empty Connection
  // header keep the upstream socket in nginx's keepalive cache after the response.
  if (upstreamName) {
    locationLines.push("    proxy_http_version 1.1;");
    locationLines.push('    proxy_set_header Connection "";');
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

  // Bundlers (Vite /assets/, CRA /static/) emit content-hashed filenames there,
  // so they can be cached for a year without ever going stale. Everything else
  // (index.html, favicons) gets no-cache so deploys are picked up immediately.
  // `expires` is used instead of `add_header Cache-Control` on purpose: a
  // location-level add_header would stop nginx inheriting the server-level
  // security headers into that location.
  lines.push("location ~ ^/(assets|static)/ {");
  lines.push("    try_files $uri =404;");
  lines.push("    expires 1y;");
  lines.push("}");

  if (entry.upstream.spa_fallback) {
    lines.push("location / {");
    lines.push("    try_files $uri $uri/ /index.html;");
    lines.push("    expires -1;");
    lines.push("}");
  } else {
    lines.push("location / {");
    lines.push("    try_files $uri $uri/ =404;");
    lines.push("    expires -1;");
    lines.push("}");
  }

  return lines;
}

function renderProxyUpstream(stack, entry, registry) {
  const rawTarget = entry.upstream.url || getServiceProxyTarget(stack, entry.upstream.service);
  const upstreamName = registry.resolve(rawTarget);
  const proxyTarget = upstreamName ? `http://${upstreamName}` : rawTarget;
  const lines = [
    "location / {",
    `    proxy_pass ${proxyTarget};`,
    "    proxy_hide_header Cross-Origin-Resource-Policy;",
  ];

  if (upstreamName) {
    lines.push("    proxy_http_version 1.1;");
    lines.push('    proxy_set_header Connection "";');
  }

  for (const header of renderProxyHeaders()) {
    lines.push(`    ${header}`);
  }

  lines.push("}");
  return lines;
}

function renderServerBlock(stack, entry, registry) {
  const serverLines = [
    "server {",
    ...indent(["listen 80;", `server_name ${entry.hosts.map((host) => host.name).join(" ")};`]),
    "",
    ...indent(["access_log /var/log/nginx/access.log upstream_timing;", ""]),
    ...indent(["client_max_body_size 25m;",  ""]),
    ...indent(renderSecurityHeaders({ includeHsts: false })),
    "",
    ...indent(renderErrorPages()),
  ];

  if (entry.routes.length > 0) {
    serverLines.push("");

    for (const route of entry.routes) {
      serverLines.push(...indent(renderRouteLocation(stack, route, registry), 4));
      serverLines.push("");
    }
  }

  const upstreamLines =
    entry.upstream.type === "static"
      ? renderStaticUpstream(stack, entry)
      : renderProxyUpstream(stack, entry, registry);

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

function renderTlsServerBlock(stack, entry, registry) {
  // Group hosts by cert name. An ingress entry may span multiple root domains
  // (e.g. subsnepal.brijeshkushwaha.com.np + subsnepal.com). Each cert group gets
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
      : renderProxyUpstream(stack, entry, registry);

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
        "access_log /var/log/nginx/access.log upstream_timing;",
        "",
        `ssl_certificate ${certBase}/fullchain.pem;`,
        `ssl_certificate_key ${certBase}/privkey.pem;`,
        "ssl_protocols TLSv1.2 TLSv1.3;",
        "ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';",
        "ssl_prefer_server_ciphers off;",
        "",
        "client_max_body_size 25m;",
        "",
        ...renderSecurityHeaders({ includeHsts: true }),
        "",
      ]),
      ...indent(renderErrorPages()),
    ];

    if (entry.routes.length > 0) {
      sslLines.push("");

      for (const route of entry.routes) {
        sslLines.push(...indent(renderRouteLocation(stack, route, registry), 4));
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

  const registry = createUpstreamRegistry();

  // Render ingress first so the upstream registry is fully populated before we emit
  // the upstream blocks. nginx parses the whole http context, so block order is
  // irrelevant — but we keep the upstreams up top for readability.
  const ingressLines = [];
  for (const entry of stack.ingress) {
    if (tlsEnabled) {
      ingressLines.push(...renderTlsServerBlock(stack, entry, registry));
    } else {
      ingressLines.push(...renderServerBlock(stack, entry, registry));
    }

    ingressLines.push("");
  }

  const lines = [
    headerComment,
    "",
    "# Suppress the nginx version in the Server header to avoid CVE fingerprinting.",
    "server_tokens off;",
    "",
    "# Compress text responses. text/html is always compressed once gzip is on;",
    "# gzip_proxied any covers responses coming back from the node upstreams.",
    "gzip on;",
    "gzip_vary on;",
    "gzip_comp_level 5;",
    "gzip_min_length 1024;",
    "gzip_proxied any;",
    "gzip_types text/plain text/css text/javascript application/javascript application/json application/xml image/svg+xml;",
    "",
    ...(tlsEnabled
      ? [
          "# Shared TLS session cache so returning clients resume instead of paying a",
          "# full handshake (one RTT saved per reconnect). 10m holds ~40k sessions.",
          "ssl_session_cache shared:SSL:10m;",
          "ssl_session_timeout 1d;",
          "",
        ]
      : []),
    ...renderUpstreamLogFormat(),
    "",
    "map $http_upgrade $connection_upgrade {",
    "    default upgrade;",
    "    '' close;",
    "}",
    "",
    ...registry.blocks(),
    "server {",
    ...indent([...defaultServerListenLines, "server_name _;", "return 444;"]),
    "}",
    "",
    ...ingressLines,
  ];

  return `${lines.join("\n").trim()}\n`;
}
