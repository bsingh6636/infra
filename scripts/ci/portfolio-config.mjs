import fs from 'node:fs';
import YAML from 'yaml';

// Read only the public deployment contract; unrelated app secrets are unnecessary.
const stack = YAML.parse(fs.readFileSync(new URL('../../config/stack.yaml', import.meta.url), 'utf8'));
const service = stack.services['portfolio-web'];
if (!service?.enabled || service.kind !== 'frontend' || service.deploy.mode !== 'edge-static') {
  throw new Error('portfolio-web must be an enabled edge-static frontend');
}
if (stack.sources[service.source.key].repo !== 'https://github.com/bsingh6636/myPortfolio.git') {
  throw new Error('Unexpected portfolio source repository');
}
const entries = stack.ingress.filter(entry => entry.upstream.service === 'portfolio-web');
if (!entries.length || entries.some(entry => entry.upstream.type !== 'static')) {
  throw new Error('Portfolio ingress must use the shared static edge');
}
const hosts = entries.flatMap(entry => entry.hosts.map(host => typeof host === 'string' ? host : host.name));
if (hosts.some(host => !/^[a-z0-9.-]+$/.test(host))) throw new Error('Invalid portfolio hostname');
process.stdout.write(JSON.stringify({ service: 'portfolio-web', project: 'brijesh-infra', hosts }, null, 2) + '\n');
