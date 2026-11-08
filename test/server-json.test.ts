import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

describe('server.json for the MCP Registry', () => {
  const server = readJson('server.json');
  const pkg = readJson('package.json');
  const byType = (type: string) => server.packages.find((p: { registryType: string }) => p.registryType === type);
  const envNamed = (p: { environmentVariables: { name: string }[] }, name: string) =>
    p.environmentVariables.find((e) => e.name === name);

  it('targets the 2025-12-11 schema', () => {
    expect(server.$schema).toBe('https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json');
  });

  it('is named in the repo owner GitHub namespace and matches package.json mcpName', () => {
    expect(server.name).toBe('io.github.Cliftonz/tandoor-recipe-mcp');
    expect(pkg.mcpName).toBe(server.name);
  });

  it('describes a local or self-hosted Tandoor server within 100 characters', () => {
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.description).toMatch(/local or self-hosted Tandoor/);
  });

  it('points at the GitHub repository and lists no remotes', () => {
    expect(server.repository).toEqual({ url: 'https://github.com/Cliftonz/tandoor-recipe-mcp', source: 'github' });
    expect(server).not.toHaveProperty('remotes');
  });

  it('lists exactly the npm, mcpb and oci packages, all over stdio', () => {
    expect(server.packages.map((p: { registryType: string }) => p.registryType)).toEqual(['npm', 'mcpb', 'oci']);
    for (const p of server.packages) expect(p.transport).toEqual({ type: 'stdio' });
  });

  it('runs the npm package with npx and requires the Tandoor URL and secret token', () => {
    const npm = byType('npm');
    expect(npm.identifier).toBe(pkg.name);
    expect(npm.runtimeHint).toBe('npx');
    expect(envNamed(npm, 'TANDOOR_URL')).toMatchObject({ isRequired: true });
    expect(envNamed(npm, 'TANDOOR_TOKEN')).toMatchObject({ isRequired: true, isSecret: true });
  });

  it('downloads the mcpb from the versioned GitHub release, leaving the sha256 to the release workflow', () => {
    const mcpb = byType('mcpb');
    expect(mcpb.identifier).toBe(
      `https://github.com/Cliftonz/tandoor-recipe-mcp/releases/download/v${pkg.version}/tandoor-recipes-mcp.mcpb`,
    );
    expect(mcpb).not.toHaveProperty('fileSha256');
  });

  it('runs the GHCR image in stdio mode with the Tandoor URL and secret token', () => {
    const oci = byType('oci');
    expect(oci.identifier).toBe(`ghcr.io/cliftonz/tandoor-recipes-mcp:${pkg.version}`);
    expect(oci).not.toHaveProperty('version');
    expect(envNamed(oci, 'TANDOOR_MCP_TRANSPORT')).toMatchObject({ value: 'stdio' });
    expect(envNamed(oci, 'TANDOOR_URL')).toMatchObject({ isRequired: true });
    expect(envNamed(oci, 'TANDOOR_TOKEN')).toMatchObject({ isRequired: true, isSecret: true });
  });
});

describe('glama.json', () => {
  it('names Cliftonz as maintainer under the Glama schema', () => {
    expect(readJson('glama.json')).toEqual({
      $schema: 'https://glama.ai/mcp/schemas/server.json',
      maintainers: ['Cliftonz'],
    });
  });
});

describe('.mcp.json for directory auto-detection', () => {
  it('runs the published npm package with npx and declares the Tandoor URL and token', () => {
    const { mcpServers } = readJson('.mcp.json');
    expect(mcpServers.tandoor).toMatchObject({
      command: 'npx',
      args: ['-y', readJson('package.json').name],
    });
    expect(Object.keys(mcpServers.tandoor.env)).toEqual(['TANDOOR_URL', 'TANDOOR_TOKEN']);
  });
});
