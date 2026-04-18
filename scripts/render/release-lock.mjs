import YAML from "yaml";

export function renderReleaseLock(payload) {
  return YAML.stringify(payload, { lineWidth: 0 });
}
