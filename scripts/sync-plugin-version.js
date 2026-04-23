#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;

const targets = [
  resolve(root, '.claude-plugin/plugin.json'),
  resolve(root, '.claude-plugin/marketplace.json'),
];

for (const file of targets) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  if (json.version) json.version = version;
  if (Array.isArray(json.plugins)) {
    for (const p of json.plugins) {
      if (p.version !== undefined) p.version = version;
    }
  }
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`synced ${file.replace(root + '/', '')} → ${version}`);
}
