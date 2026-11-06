import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file: string) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

describe('Claude plugin directory listing', () => {
  it('describes the marketplace as serving a local Tandoor instance', () => {
    expect(readJson('.claude-plugin/marketplace.json').description).toBe(
      'Tandoor Recipes MCP server for your local Tandoor instance.',
    );
  });

  it('points icon at a square PNG the directory accepts', () => {
    const png = readFileSync(path.join(root, readJson('.claude-plugin/plugin.json').icon));
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(512);
    expect(width).toBeLessThanOrEqual(2048);
    expect(png.length).toBeLessThan(2 * 1024 * 1024);
  });
});
