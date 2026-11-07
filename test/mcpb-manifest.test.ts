import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(rel: string): any {
  return JSON.parse(readFileSync(path.join(REPO, rel), 'utf8'));
}

describe('Claude Desktop extension manifest', () => {
  it('passes mcpb validate', () => {
    expect(() => execSync('npm run --silent mcpb -- validate manifest.json', { cwd: REPO, stdio: 'pipe' })).not.toThrow();
  }, 120_000);

  it('mirrors the Claude plugin user config and env mapping', () => {
    const manifest = readJson('manifest.json');
    const plugin = readJson('plugins/claude/.claude-plugin/plugin.json');
    expect(manifest.user_config).toEqual(plugin.userConfig);
    expect(manifest.server.mcp_config.env).toEqual(plugin.mcpServers.tandoor.env);
  });

  it('runs build/index.js on the built-in Node 24+ on every desktop platform', () => {
    const manifest = readJson('manifest.json');
    expect(manifest.manifest_version).toBe('0.2');
    expect(manifest.server).toMatchObject({
      type: 'node',
      entry_point: 'build/index.js',
      mcp_config: { command: 'node', args: ['${__dirname}/build/index.js'] },
    });
    expect(manifest.compatibility).toEqual({
      platforms: ['darwin', 'win32', 'linux'],
      runtimes: { node: '>=24.0.0' },
    });
  });

  it('describes the Tandoor instance as local in the listing copy', () => {
    const { description, long_description } = readJson('manifest.json');
    for (const copy of [description, long_description]) {
      expect(copy).toContain('local');
      expect(copy).not.toContain('self-hosted');
    }
  });
});
