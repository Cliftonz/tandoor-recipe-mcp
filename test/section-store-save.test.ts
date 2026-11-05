import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAllTools } from '../src/lib/register-all.js';
import { _resetRegisteredNames, _resetArraySkipLog } from '../src/lib/register.js';
import { parseSectionModes } from '../src/lib/sections.js';
import { loadSavedSections } from '../src/lib/section-store.js';

const INSTANCE = 'https://tandoor.example.com';
const prior = { xdg: process.env.XDG_CONFIG_HOME, cooklog: process.env.TANDOOR_MCP_COOKLOG };
let configHome: string;
let dir: string;
let file: string;

beforeEach(() => {
  configHome = mkdtempSync(join(tmpdir(), 'section-store-save-'));
  dir = join(configHome, 'tandoor-mcp');
  file = join(dir, 'sections.json');
  process.env.XDG_CONFIG_HOME = configHome;
  delete process.env.TANDOOR_MCP_COOKLOG;
});

afterEach(() => {
  for (const [key, value] of [['XDG_CONFIG_HOME', prior.xdg], ['TANDOOR_MCP_COOKLOG', prior.cooklog]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (readdirSync(configHome).length > 0) chmodSync(dir, 0o700);
  rmSync(configHome, { recursive: true, force: true });
});

async function start(url = `${INSTANCE}/`): Promise<Client> {
  _resetRegisteredNames();
  _resetArraySkipLog();
  const server = new McpServer({ name: 'store', version: 'store' });
  const tandoor = new TandoorClient({ url, token: 't' });
  registerAllTools(server, tandoor, {
    sections: parseSectionModes({}, loadSavedSections(process.env, tandoor.getBaseUrl())),
    pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
    versionCheck: { status: 'ok', level: 'note', detail: 'store stub' },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'store-client', version: '1.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> };
  expect(res.isError, res.content[0]!.text).toBeFalsy();
  return res.content[0]!.text;
}

async function visible(client: Client): Promise<string[]> {
  return (await client.listTools()).tools.map((t) => t.name);
}

const saved = () => JSON.parse(readFileSync(file, 'utf8'));

describe('saving section changes', () => {
  it('keeps an enabled section enabled after a restart, creating the file on first save', async () => {
    await call(await start(), 'enable_tool_group', { group: 'recipes' });
    expect(saved()).toEqual({ [INSTANCE]: { recipes: 'full' } });
    expect(readdirSync(dir)).toEqual(['sections.json']);
    expect(await visible(await start())).toContain('delete_step');
  });

  it('keeps a disabled section off after a restart', async () => {
    await call(await start(), 'disable_tool_group', { group: 'foods' });
    expect(saved()).toEqual({ [INSTANCE]: { foods: 'off' } });
    expect(await visible(await start())).not.toContain('list_foods');
  });

  it('changes only the touched section, keeping other sections, stale entries, and other instances', async () => {
    mkdirSync(dir);
    writeFileSync(file, JSON.stringify({
      [INSTANCE]: { cooklog: 'on', recipes: 'off', 'recipe-write': 'on' },
      'https://other.example.com': { ai: 'on' },
    }));
    await call(await start(), 'enable_tool_group', { group: 'recipes', tier: 'simple' });
    expect(saved()).toEqual({
      [INSTANCE]: { cooklog: 'on', recipes: 'simple', 'recipe-write': 'on' },
      'https://other.example.com': { ai: 'on' },
    });
    expect(readdirSync(dir)).toEqual(['sections.json']);
  });

  it('keeps saved modes written in any case or spacing when merging', async () => {
    mkdirSync(dir);
    writeFileSync(file, JSON.stringify({ [INSTANCE]: { recipes: ' FULL ' } }));
    await call(await start(), 'enable_tool_group', { group: 'cooklog' });
    expect(saved()).toEqual({ [INSTANCE]: { recipes: ' FULL ', cooklog: 'on' } });
  });

  it('saves one entry for every TANDOOR_URL path of the same instance', async () => {
    await call(await start(`${INSTANCE}/tandoor/`), 'enable_tool_group', { group: 'cooklog' });
    expect(saved()).toEqual({ [INSTANCE]: { cooklog: 'on' } });
  });

  it('saves under the origin when TANDOOR_URL has no scheme', async () => {
    await call(await start('tandoor.example.com'), 'enable_tool_group', { group: 'cooklog' });
    expect(saved()).toEqual({ [INSTANCE]: { cooklog: 'on' } });
  });

  it('updates the existing entry for this instance under its key as written, keeping unparseable keys', async () => {
    mkdirSync(dir);
    writeFileSync(file, JSON.stringify({ [`${INSTANCE}/tandoor/`]: { ai: 'on' }, 'http://': { ai: 'on' } }));
    await call(await start(), 'enable_tool_group', { group: 'cooklog' });
    expect(saved()).toEqual({ [`${INSTANCE}/tandoor/`]: { ai: 'on', cooklog: 'on' }, 'http://': { ai: 'on' } });
  });

  it('updates an existing entry whose key has no scheme', async () => {
    mkdirSync(dir);
    writeFileSync(file, JSON.stringify({ 'tandoor.example.com': { ai: 'on' } }));
    await call(await start(), 'enable_tool_group', { group: 'cooklog' });
    expect(saved()).toEqual({ 'tandoor.example.com': { ai: 'on', cooklog: 'on' } });
  });

  it('saves a change to a section whose setting is set, noting the setting wins on restart', async () => {
    process.env.TANDOOR_MCP_COOKLOG = 'off';
    const result = JSON.parse(await call(await start(), 'enable_tool_group', { group: 'cooklog' }));
    expect(saved()).toEqual({ [INSTANCE]: { cooklog: 'on' } });
    expect(result.envOverride).toBe('TANDOOR_MCP_COOKLOG is set and will override the saved value on restart.');
  });

  it('adds no setting note when the section setting is unset', async () => {
    const result = JSON.parse(await call(await start(), 'enable_tool_group', { group: 'cooklog' }));
    expect(result).not.toHaveProperty('envOverride');
    expect(result).not.toHaveProperty('notSaved');
  });

  it('adds no setting note when the save failed', async () => {
    process.env.TANDOOR_MCP_COOKLOG = 'off';
    mkdirSync(dir);
    chmodSync(dir, 0o500);
    const result = JSON.parse(await call(await start(), 'enable_tool_group', { group: 'cooklog' }));
    expect(result.notSaved).toMatch(/not saved: EACCES/);
    expect(result).not.toHaveProperty('envOverride');
  });

  it.each([
    ['enable_tool_group', { group: 'recipes', tier: 'simple' }],
    ['disable_tool_group', { group: 'cooklog' }],
  ])('writes nothing when %s leaves the mode unchanged', async (tool, args) => {
    await call(await start(), tool, args);
    expect(existsSync(dir)).toBe(false);
  });

  it('rereads the file before saving so a change made elsewhere since startup is kept', async () => {
    const client = await start();
    mkdirSync(dir);
    writeFileSync(file, JSON.stringify({ [INSTANCE]: { ai: 'on' } }));
    await call(client, 'enable_tool_group', { group: 'cooklog' });
    expect(saved()).toEqual({ [INSTANCE]: { ai: 'on', cooklog: 'on' } });
  });

  it.each([
    ['invalid JSON', '{"https://tandoor.example.com": {'],
    ['an invalid mode value', JSON.stringify({ [INSTANCE]: { cooklog: 'full' }, 'https://other.example.com': { ai: 'on' } })],
    ['a non-string mode value', JSON.stringify({ [INSTANCE]: { recipes: 1 } })],
    ['two entries for this instance', JSON.stringify({ [INSTANCE]: { recipes: 'full' }, [`${INSTANCE}/tandoor`]: { foods: 'off' } })],
    ['a top-level array', '[]'],
    ['a top-level null', 'null'],
    ['a top-level number', '3'],
    ['an instance entry that is not an object', JSON.stringify({ [INSTANCE]: 'full' })],
  ])('replaces a file holding %s with one holding only this change', async (_label, contents) => {
    mkdirSync(dir);
    writeFileSync(file, contents);
    await call(await start(), 'enable_tool_group', { group: 'ai' });
    expect(saved()).toEqual({ [INSTANCE]: { ai: 'on' } });
    expect(readdirSync(dir)).toEqual(['sections.json']);
  });

  it('applies the change for this session and says it was not saved when the directory is read-only', async () => {
    mkdirSync(dir);
    chmodSync(dir, 0o500);
    const client = await start();
    const result = JSON.parse(await call(client, 'enable_tool_group', { group: 'cooklog' }));
    expect(result.notSaved).toMatch(/^This change applies to this session only; it was not saved: EACCES/);
    expect(await visible(client)).toContain('list_cook_logs');
  });

  it('treats an unreadable file as a save failure and leaves it untouched', async () => {
    const contents = JSON.stringify({ [INSTANCE]: { ai: 'on' } });
    mkdirSync(dir);
    writeFileSync(file, contents);
    const client = await start();
    chmodSync(file, 0o000);
    const result = JSON.parse(await call(client, 'disable_tool_group', { group: 'recipes' }));
    chmodSync(file, 0o600);
    expect(result.notSaved).toMatch(/^This change applies to this session only; it was not saved: EACCES/);
    expect(await visible(client)).not.toContain('list_recipes');
    expect(readFileSync(file, 'utf8')).toBe(contents);
  });
});
