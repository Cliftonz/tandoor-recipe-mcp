import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('Dockerfile', () => {
  const dockerfile = read('Dockerfile');
  const runtime = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));

  it('builds on node:24-slim in more than one stage', () => {
    expect(dockerfile.match(/^FROM node:24-slim/gm)?.length).toBeGreaterThanOrEqual(2);
  });

  it('runs the final stage as the non-root node user', () => {
    expect(runtime).toMatch(/^USER node$/m);
  });

  it('defaults to remote HTTP mode listening on all interfaces with data in /data', () => {
    expect(runtime).toMatch(/TANDOOR_MCP_TRANSPORT=http\b/);
    expect(runtime).toMatch(/TANDOOR_MCP_HTTP_HOST=0\.0\.0\.0\b/);
    expect(runtime).toMatch(/TANDOOR_MCP_DATA_DIR=\/data\b/);
  });

  it('never bakes a Tandoor token into the image', () => {
    expect(dockerfile).not.toMatch(/TANDOOR_TOKEN/);
  });

  it('declares /data as a volume and exposes 3737', () => {
    expect(runtime).toMatch(/^VOLUME \/data$/m);
    expect(runtime).toMatch(/^EXPOSE 3737$/m);
  });

  it('health-checks /healthz with node on the configured port, and reports healthy outside http mode', () => {
    expect(runtime).toMatch(/^HEALTHCHECK /m);
    expect(runtime).toContain(
      `CMD ["node","-e","if(process.env.TANDOOR_MCP_TRANSPORT!=='http')process.exit(0);fetch('http://127.0.0.1:'+(process.env.TANDOOR_MCP_HTTP_PORT||3737)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]`,
    );
  });

  it('labels the image with the MCP Registry server name from server.json', () => {
    const { name } = JSON.parse(read('server.json'));
    expect(runtime).toContain(`LABEL io.modelcontextprotocol.server.name="${name}"`);
  });

  it('starts node in exec form so SIGTERM reaches the server', () => {
    expect(runtime).toMatch(/^CMD \["node", ?"build\/index\.js"\]$/m);
  });
});

describe('docker-compose.example.yml', () => {
  const service = parse(read('docker-compose.example.yml')).services['tandoor-mcp'];

  it('uses the published image', () => {
    expect(service.image).toBe('ghcr.io/cliftonz/tandoor-recipes-mcp:latest');
  });

  it('gives the server longer to stop than its 10s drain', () => {
    const seconds = Number(/^(\d+)s$/.exec(service.stop_grace_period)?.[1]);
    expect(seconds).toBeGreaterThanOrEqual(15);
  });

  it('publishes the port on loopback only', () => {
    expect(service.ports).toEqual(['127.0.0.1:3737:3737']);
  });

  it('persists /data in a named volume and restarts unless stopped', () => {
    expect(service.volumes).toHaveLength(1);
    expect(service.volumes[0]).toMatch(/^[a-z][\w-]*:\/data$/);
    expect(service.restart).toBe('unless-stopped');
  });

  it('does not set a Tandoor token', () => {
    expect(service.environment).not.toHaveProperty('TANDOOR_TOKEN');
  });
});
