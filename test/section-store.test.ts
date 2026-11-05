import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { instanceKey, sectionsFile } from '../src/lib/section-store.js';

describe('instanceKey', () => {
  it.each([
    ['https://Tandoor.Example.COM:443/', 'https://tandoor.example.com'],
    ['  tandoor.example.com/recipes  ', 'https://tandoor.example.com'],
    ['http://tandoor.example.com:80/recipes/', 'http://tandoor.example.com'],
    ['http://tandoor.example.com:8080', 'http://tandoor.example.com:8080'],
    ['https://user:pw@Tandoor.example.com/Sub/Path?q=1#top', 'https://tandoor.example.com'],
  ])('normalizes %s to %s', (url, key) => {
    expect(instanceKey(url)).toBe(key);
  });
});

describe('sectionsFile', () => {
  it('lives under XDG_CONFIG_HOME when it is set', () => {
    expect(sectionsFile({ XDG_CONFIG_HOME: '/cfg' })).toBe(join('/cfg', 'tandoor-mcp', 'sections.json'));
  });

  it.each([undefined, '', '   ', 'relative/config'])('falls back to ~/.config when XDG_CONFIG_HOME is %j', (value) => {
    expect(sectionsFile({ XDG_CONFIG_HOME: value })).toBe(join(homedir(), '.config', 'tandoor-mcp', 'sections.json'));
  });
});
