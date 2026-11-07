import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BUILT_INDEX = resolve(__dirname, '..', 'build', 'index.js');

let configHome: string;
let file: string;

beforeEach(() => {
  configHome = mkdtempSync(join(tmpdir(), 'section-store-boot-'));
  file = join(configHome, 'tandoor-mcp', 'sections.json');
});

afterEach(() => {
  rmSync(configHome, { recursive: true, force: true });
});

function save(contents: string): void {
  mkdirSync(join(configHome, 'tandoor-mcp'), { recursive: true });
  writeFileSync(file, contents);
}

function bootLog(env: Record<string, string> = {}): Promise<string> {
  return new Promise((done) => {
    const child = spawn('node', [BUILT_INDEX], {
      cwd: configHome,
      env: {
        PATH: process.env.PATH!,
        XDG_CONFIG_HOME: configHome,
        TANDOOR_URL: 'http://127.0.0.1:1',
        TANDOOR_TOKEN: 'tok',
        TANDOOR_MAX_RETRIES: '0',
        ...env,
      },
    });
    let stderr = '';
    child.stderr.on('data', (b: Buffer) => {
      stderr += b.toString();
      if (/sections=.*\n/.test(stderr)) child.kill();
    });
    child.on('exit', () => done(stderr));
  });
}

describe('saved sections at startup', () => {
  it('fills sections whose setting is unset from the saved file', async () => {
    save(JSON.stringify({ 'http://127.0.0.1:1': { recipes: 'full', cooklog: 'on' } }));
    const log = await bootLog();
    expect(log).toContain('sections=recipes=full, meal-plan=simple, shopping=simple, inventory=simple, foods=simple, cooklog=on,');
  }, 15_000);

  it('lets a set section setting win over the saved file, and treats a blank setting as unset', async () => {
    save(JSON.stringify({ 'http://127.0.0.1:1': { recipes: 'full', cooklog: 'on' } }));
    const log = await bootLog({ TANDOOR_MCP_RECIPES: 'off', TANDOOR_MCP_COOKLOG: '   ' });
    expect(log).toContain('recipes=off,');
    expect(log).toContain('cooklog=on,');
  }, 15_000);

  it('matches the saved entry for a differently written TANDOOR_URL of the same instance', async () => {
    save(JSON.stringify({ 'http://127.0.0.1:1': { foods: 'off' } }));
    const log = await bootLog({ TANDOOR_URL: 'http://127.0.0.1:1/tandoor/' });
    expect(log).toContain('foods=off,');
  }, 15_000);

  it('matches a saved key that has a path, skipping keys that do not parse', async () => {
    save(JSON.stringify({ 'http://': { recipes: 'full' }, 'http://127.0.0.1:1/tandoor/': { foods: 'off' } }));
    const log = await bootLog();
    expect(log).toContain('recipes=simple,');
    expect(log).toContain('foods=off,');
    expect(log).not.toContain('WARNING');
  }, 15_000);

  it('matches a saved key without a scheme as https', async () => {
    save(JSON.stringify({ '127.0.0.1:1': { foods: 'off' } }));
    const log = await bootLog({ TANDOOR_URL: 'https://127.0.0.1:1' });
    expect(log).toContain('foods=off,');
  }, 15_000);

  it('applies saved sections when TANDOOR_URL has no scheme', async () => {
    save(JSON.stringify({ 'https://127.0.0.1:1': { foods: 'off' } }));
    const log = await bootLog({ TANDOOR_URL: '127.0.0.1:1' });
    expect(log).toContain('foods=off,');
  }, 15_000);

  it('still reports an unparseable TANDOOR_URL with the client error', async () => {
    const log = await bootLog({ TANDOOR_URL: 'http://' });
    expect(log).toContain("Invalid TANDOOR_URL (or the plugin's Tandoor URL setting): value does not parse as a URL");
    expect(log).not.toContain('TypeError');
  }, 15_000);

  it('reads saved modes case-insensitively and trimmed', async () => {
    save(JSON.stringify({ 'http://127.0.0.1:1': { recipes: ' FULL ', cooklog: 'On' } }));
    const log = await bootLog();
    expect(log).toContain('recipes=full,');
    expect(log).toContain('cooklog=on,');
    expect(log).not.toContain('WARNING');
  }, 15_000);

  it('ignores entries saved for another instance', async () => {
    save(JSON.stringify({ 'http://127.0.0.1:2': { foods: 'off' } }));
    const log = await bootLog();
    expect(log).toContain('foods=simple,');
  }, 15_000);

  it('skips sections that no longer exist without a warning', async () => {
    save(JSON.stringify({ 'http://127.0.0.1:1': { 'recipe-write': 'on', foods: 'full' } }));
    const log = await bootLog();
    expect(log).toContain('foods=full,');
    expect(log).not.toContain('WARNING');
  }, 15_000);

  it('reads the saved file in HTTP mode', async () => {
    save(JSON.stringify({ 'http://127.0.0.1:1': { cooklog: 'on' } }));
    const log = await bootLog({ TANDOOR_MCP_TRANSPORT: 'http', TANDOOR_MCP_HTTP_PORT: '0' });
    expect(log).toContain('cooklog=on,');
  }, 15_000);

  it.each([
    ['invalid JSON', '{"http://127.0.0.1:1": {"recipes": "full"'],
    ['an invalid mode value', JSON.stringify({ 'http://127.0.0.1:1': { recipes: 'full', cooklog: 'full' } })],
    ['an invalid mode value for another instance', JSON.stringify({ 'http://127.0.0.1:1': { recipes: 'full' }, 'http://127.0.0.1:2': { ai: 'yes' } })],
    ['a non-string mode value', JSON.stringify({ 'http://127.0.0.1:1': { recipes: 'full', cooklog: 1 } })],
    ['two entries for this instance', JSON.stringify({ 'http://127.0.0.1:1': { recipes: 'full' }, 'http://127.0.0.1:1/tandoor': { foods: 'off' } })],
    ['a top-level array', '[]'],
    ['a top-level null', 'null'],
    ['a top-level number', '3'],
    ['an instance entry that is not an object', JSON.stringify({ 'http://127.0.0.1:1': 'full' })],
  ])('ignores the whole file with one warning when it holds %s, leaving it untouched', async (_label, contents) => {
    save(contents);
    const log = await bootLog({ TANDOOR_MCP_FOODS: 'full' });
    expect(log.match(new RegExp(`WARNING: .*${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'))).toHaveLength(1);
    expect(log).toContain('recipes=simple,');
    expect(log).toContain('foods=full,');
    expect(log).toContain('on stdio');
    expect(readFileSync(file, 'utf8')).toBe(contents);
  }, 15_000);

  it('ignores an unreadable file with one warning naming it, leaving it untouched', async () => {
    mkdirSync(file, { recursive: true });
    const log = await bootLog();
    expect(log.match(/WARNING/g)).toHaveLength(1);
    expect(log).toContain(file);
    expect(log).toContain('EISDIR');
    expect(log).toContain('recipes=simple,');
    expect(statSync(file).isDirectory()).toBe(true);
    expect(readdirSync(file)).toEqual([]);
  }, 15_000);

  it('starts with env settings only when no file exists', async () => {
    const log = await bootLog({ TANDOOR_MCP_AI: 'on' });
    expect(log).toContain('sections=recipes=simple, meal-plan=simple, shopping=simple, inventory=simple, foods=simple, cooklog=off, recipe-books=off, ai=on,');
    expect(log).not.toContain('WARNING');
  }, 15_000);
});
