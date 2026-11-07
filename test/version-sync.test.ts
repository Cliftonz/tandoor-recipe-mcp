// Guards against version drift across the five files that must agree before
// a release is tagged:
//   - package.json
//   - plugins/claude/.claude-plugin/plugin.json
//   - .claude-plugin/marketplace.json
//   - .codex-plugin/plugin.json
//   - manifest.json
//
// The `version` npm script runs scripts/sync-plugin-version.js, but that only
// fires on `npm version`. A direct edit to package.json followed by a tag
// push would ship a desynced plugin manifest — silent today, this guard
// makes it loud.

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
    rmSync(dir, { recursive: true });
    expect(claudeArgs).toEqual(['-y', `${pkg.name}@9.8.7`]);
    expect(codexArgs).toEqual(['-y', `${pkg.name}@9.8.7`]);
  });
});
