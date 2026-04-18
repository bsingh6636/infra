import YAML from "yaml";

export function renderEdgeStaticPreviewCompose(previewPort = 8088) {
  return YAML.stringify(
    {
      services: {
        "edge-preview": {
          image: "nginx:1.27-alpine",
          restart: "unless-stopped",
          ports: [`${previewPort}:80`],
          volumes: [
            "./nginx.edge-static-preview.conf:/etc/nginx/conf.d/default.conf:ro",
            "./edge-static:/srv/edge-static:ro",
          ],
        },
      },
    },
    { lineWidth: 0 },
  );
}
