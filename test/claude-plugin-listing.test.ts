import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const marketplace = readJson('.claude-plugin/marketplace.json');
const pluginDir = path.join(
  root,
  marketplace.plugins.find((p: { name: string }) => p.name === 'tandoor-recipes-mcp').source,
);

describe('Claude plugin directory listing', () => {
  it('describes the marketplace as serving a local Tandoor instance', () => {
    expect(marketplace.description).toBe('Tandoor Recipes MCP server for your local Tandoor instance.');
  });

  it('sources the plugin from a slim folder holding only the plugin and its listing README', () => {
    expect(existsSync(path.join(pluginDir, '.claude-plugin/plugin.json'))).toBe(true);
    const entries = readdirSync(pluginDir);
    for (const repoFile of ['package.json', 'package-lock.json', 'scripts', 'src', 'test']) {
      expect(entries).not.toContain(repoFile);
    }
    const words = readFileSync(path.join(pluginDir, 'README.md'), 'utf8').split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThanOrEqual(40);
  });

  it('points icon at a square PNG the directory accepts', () => {
    const plugin = JSON.parse(readFileSync(path.join(pluginDir, '.claude-plugin/plugin.json'), 'utf8'));
    const png = readFileSync(path.join(pluginDir, plugin.icon));
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(512);
    expect(width).toBeLessThanOrEqual(2048);
    expect(png.length).toBeLessThan(2 * 1024 * 1024);
  });

  it('hands every user option to the server only under its CLAUDE_PLUGIN_OPTION name', () => {
    const plugin = JSON.parse(readFileSync(path.join(pluginDir, '.claude-plugin/plugin.json'), 'utf8'));
    expect(plugin.mcpServers.tandoor.env).toEqual(
      Object.fromEntries(Object.keys(plugin.userConfig).map((key) => [`CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`, `\${user_config.${key}}`])),
    );
  });
});
