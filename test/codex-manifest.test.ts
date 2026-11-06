import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

describe('Codex plugin manifests', () => {
  const marketplace = readJson('.agents/plugins/marketplace.json');
  const pkg = readJson('package.json');
  const entry = marketplace.plugins[0];
  const plugin = readJson(path.join(entry.source.path, '.codex-plugin/plugin.json'));

  it('lists the plugin as installable from the repo root under the cliftonz-tandoor marketplace', () => {
    expect(marketplace.name).toBe('cliftonz-tandoor');
    expect(marketplace.plugins).toHaveLength(1);
    expect(entry.name).toBe('tandoor-recipes-mcp');
    expect(entry.source).toEqual({ source: 'local', path: './' });
    expect(entry.policy).toEqual({ installation: 'AVAILABLE', authentication: 'ON_INSTALL' });
    expect(plugin.name).toBe(entry.name);
  });

  it('launches the published npm package and passes through only the Tandoor credentials', () => {
    expect(plugin.mcpServers.tandoor).toEqual({
      command: 'npx',
      args: ['-y', `${pkg.name}@${pkg.version}`],
      env_vars: ['TANDOOR_URL', 'TANDOOR_TOKEN'],
    });
  });

  it('keeps Codex card titles within 30 characters', () => {
    expect(plugin.interface.displayName.length).toBeLessThanOrEqual(30);
    expect(plugin.interface.shortDescription.length).toBeLessThanOrEqual(30);
  });

  it('describes the Tandoor instance as local in the listing copy', () => {
    for (const copy of [plugin.description, plugin.interface.longDescription]) {
      expect(copy).toContain('local');
      expect(copy).not.toContain('self-hosted');
    }
  });
});
