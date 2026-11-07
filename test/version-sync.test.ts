import { describe, it, expect } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(rel: string): any {
  return JSON.parse(readFileSync(path.join(REPO, rel), 'utf8'));
}

describe('plugin version sync', () => {
  const pkg = readJson('package.json');
  const plugin = readJson('plugins/claude/.claude-plugin/plugin.json');
  const marketplace = readJson('.claude-plugin/marketplace.json');

  it('package.json and plugin.json agree on version', () => {
    expect(plugin.version).toBe(pkg.version);
  });

  it('marketplace.json entry for this plugin agrees on version', () => {
    const entry = (marketplace.plugins as { name: string; version: string }[])
      .find((p) => p.name === 'tandoor-recipes-mcp');
    expect(entry).toBeDefined();
    expect(entry!.version).toBe(pkg.version);
  });

  it('package.json and .codex-plugin/plugin.json agree on version', () => {
    expect(readJson('.codex-plugin/plugin.json').version).toBe(pkg.version);
  });

  it('package.json and the Claude Desktop extension manifest.json agree on version', () => {
    expect(readJson('manifest.json').version).toBe(pkg.version);
  });

  it('server.json carries package.json version on itself and on every package', () => {
    const server = readJson('server.json');
    expect(server.version).toBe(pkg.version);
    expect(server.packages.map((p: { identifier: string; version?: string }) => p.version ?? p.identifier)).toEqual([
      pkg.version,
      `https://github.com/Cliftonz/tandoor-recipe-mcp/releases/download/v${pkg.version}/tandoor-recipes-mcp.mcpb`,
      `ghcr.io/cliftonz/tandoor-recipes-mcp:${pkg.version}`,
    ]);
  });

  it('npm version script stages server.json after syncing', () => {
    expect(pkg.scripts.version).toMatch(/git add .*\bserver\.json\b/);
  });

  it('both plugin manifests pin the npx package to package.json version', () => {
    const pinned = `${pkg.name}@${pkg.version}`;
    expect(plugin.mcpServers.tandoor.args).toContain(pinned);
    expect(readJson('.codex-plugin/plugin.json').mcpServers.tandoor.args).toContain(pinned);
  });

  it('sync script rewrites the npx pin to a new package.json version', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'version-sync-'));
    const files = [
      'package.json',
      'scripts/sync-plugin-version.js',
      'plugins/claude/.claude-plugin/plugin.json',
      '.claude-plugin/marketplace.json',
      '.codex-plugin/plugin.json',
      'manifest.json',
      'server.json',
    ];
    for (const rel of files) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      cpSync(path.join(REPO, rel), path.join(dir, rel));
    }
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ ...pkg, version: '9.8.7' }));
    execFileSync('node', [path.join(dir, 'scripts/sync-plugin-version.js')]);
    const readTmp = (rel: string) => JSON.parse(readFileSync(path.join(dir, rel), 'utf8'));
    const claudeArgs = readTmp('plugins/claude/.claude-plugin/plugin.json').mcpServers.tandoor.args;
    const codexArgs = readTmp('.codex-plugin/plugin.json').mcpServers.tandoor.args;
    const server = readTmp('server.json');
    rmSync(dir, { recursive: true });
    expect(server.version).toBe('9.8.7');
    expect(server.packages.map((p: { identifier: string; version?: string }) => [p.identifier, p.version])).toEqual([
      [pkg.name, '9.8.7'],
      ['https://github.com/Cliftonz/tandoor-recipe-mcp/releases/download/v9.8.7/tandoor-recipes-mcp.mcpb', undefined],
      ['ghcr.io/cliftonz/tandoor-recipes-mcp:9.8.7', undefined],
    ]);
    expect(claudeArgs).toEqual(['-y', `${pkg.name}@9.8.7`]);
    expect(codexArgs).toEqual(['-y', `${pkg.name}@9.8.7`]);
  });
});
