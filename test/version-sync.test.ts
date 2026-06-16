// Guards against version drift across the three files that must agree before
// a release is tagged:
//   - package.json
//   - .claude-plugin/plugin.json
//   - .claude-plugin/marketplace.json
//
// The `version` npm script runs scripts/sync-plugin-version.js, but that only
// fires on `npm version`. A direct edit to package.json followed by a tag
// push would ship a desynced plugin manifest — silent today, this guard
// makes it loud.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(rel: string): any {
  return JSON.parse(readFileSync(path.join(REPO, rel), 'utf8'));
}

describe('plugin version sync', () => {
  const pkg = readJson('package.json');
  const plugin = readJson('.claude-plugin/plugin.json');
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
});
