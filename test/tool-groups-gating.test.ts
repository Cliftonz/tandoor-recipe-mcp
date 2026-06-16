// Behavior tests for the dynamic tool-gating contract.
//
// Exercises the three meta tools (`list_tool_groups`, `enable_tool_group`,
// `disable_tool_group`) against a real McpServer with the full tool registry
// in place. Verifies:
//
//   - profile=core disables every non-core tool at boot
//   - profile=full leaves every tool enabled at boot
//   - list_tool_groups reports accurate enabled-state per group
//   - enable_tool_group enables every tool in the named group
//   - enable_tool_group is idempotent (calling twice doesn't re-toggle)
//   - disable_tool_group disables every tool in the named group
//   - core cannot be disabled
//   - unknown group names produce a helpful error listing known groups

import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAllTools } from '../src/lib/register-all.js';
import { _resetRegisteredNames, _resetArraySkipLog } from '../src/lib/register.js';
import { CORE_TOOLS, TOOL_GROUPS } from '../src/lib/tool-groups.js';
import { invokeTool } from './helpers/mcp.js';

interface RegisteredToolEntry {
  enabled: boolean;
}

function getRegistry(server: McpServer): Record<string, RegisteredToolEntry> {
  return (server as unknown as { _registeredTools: Record<string, RegisteredToolEntry> })._registeredTools;
}

function buildServer(profile: 'core' | 'full' | 'basic'): McpServer {
  _resetRegisteredNames();
  _resetArraySkipLog();
  const server = new McpServer({ name: 'gating', version: 'gating' });
  const client = new TandoorClient({ url: 'https://x.test', token: 't' });
  registerAllTools(server, client, {
    profile,
    pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
    versionCheck: { status: 'ok', level: 'note', detail: 'gating stub' },
  });
  return server;
}

/** Parse the JSON payload out of a meta-tool CallToolResult. */
function parseResult(result: { content: Array<{ type: string; text: string }>; isError?: boolean }): any {
  expect(result.isError, `tool returned isError=true: ${JSON.stringify(result.content)}`).toBeFalsy();
  const txt = result.content[0]!.text;
  return JSON.parse(txt);
}

describe('profile=core boot gate', () => {
  let server: McpServer;
  beforeEach(() => {
    server = buildServer('core');
  });

  it('every core tool is enabled at boot', () => {
    const reg = getRegistry(server);
    for (const name of CORE_TOOLS) {
      expect(reg[name], `core tool '${name}' must be registered`).toBeDefined();
      expect(reg[name]!.enabled, `core tool '${name}' must be enabled at boot`).toBe(true);
    }
  });

  it('every non-core tool is disabled at boot', () => {
    const reg = getRegistry(server);
    for (const g of TOOL_GROUPS) {
      for (const name of g.tools) {
        const entry = reg[name];
        if (!entry) continue; // unregistered — separate completeness test catches stale names
        expect(entry.enabled, `non-core tool '${name}' (group=${g.name}) must be disabled at boot under profile=core`).toBe(false);
      }
    }
  });
});

describe('profile=full leaves every tool enabled at boot', () => {
  it('every registered tool is enabled', () => {
    const server = buildServer('full');
    const reg = getRegistry(server);
    for (const name of Object.keys(reg)) {
      expect(reg[name]!.enabled, `tool '${name}' must be enabled at boot under profile=full`).toBe(true);
    }
  });
});

describe('list_tool_groups', () => {
  it('reports core as permanent + enabled and non-core groups as disabled at boot', async () => {
    const server = buildServer('core');
    const result = parseResult(await invokeTool(server, 'list_tool_groups', {}));
    const core = result.groups.find((g: any) => g.name === 'core');
    expect(core).toBeDefined();
    expect(core.permanent).toBe(true);
    expect(core.enabled).toBe(true);
    expect(core.tools).toEqual(expect.arrayContaining([...CORE_TOOLS]));

    const recipeWrite = result.groups.find((g: any) => g.name === 'recipe-write');
    expect(recipeWrite).toBeDefined();
    expect(recipeWrite.permanent).toBe(false);
    expect(recipeWrite.enabled).toBe(false);
  });

  it('returns groups in a stable order — core first, then TOOL_GROUPS', async () => {
    const server = buildServer('core');
    const result = parseResult(await invokeTool(server, 'list_tool_groups', {}));
    const expected = ['core', ...TOOL_GROUPS.map((g) => g.name)];
    expect(result.groups.map((g: any) => g.name)).toEqual(expected);
  });
});

describe('enable_tool_group', () => {
  it('enables every tool in the named group', async () => {
    const server = buildServer('core');
    const reg = getRegistry(server);
    const group = TOOL_GROUPS.find((g) => g.name === 'recipe-write')!;
    for (const t of group.tools) expect(reg[t]!.enabled).toBe(false);

    const result = parseResult(await invokeTool(server, 'enable_tool_group', { group: 'recipe-write' }));
    expect(result.ok).toBe(true);
    expect(result.group).toBe('recipe-write');
    expect(new Set(result.enabled)).toEqual(new Set(group.tools));

    for (const t of group.tools) expect(reg[t]!.enabled, `tool '${t}' must be enabled after enable_tool_group`).toBe(true);
  });

  it('is idempotent — second call reports already_enabled', async () => {
    const server = buildServer('core');
    await invokeTool(server, 'enable_tool_group', { group: 'recipe-write' });
    const result = parseResult(await invokeTool(server, 'enable_tool_group', { group: 'recipe-write' }));
    expect(result.enabled).toEqual([]);
    expect(new Set(result.already_enabled)).toEqual(
      new Set(TOOL_GROUPS.find((g) => g.name === 'recipe-write')!.tools),
    );
  });

  it('treats core as a no-op', async () => {
    const server = buildServer('core');
    const result = parseResult(await invokeTool(server, 'enable_tool_group', { group: 'core' }));
    expect(result.ok).toBe(true);
    expect(result.note).toMatch(/permanent/);
  });

  it('returns isError with helpful message for unknown groups', async () => {
    const server = buildServer('core');
    const result = await invokeTool(server, 'enable_tool_group', { group: 'definitely-not-a-group' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/unknown tool group/);
    expect(result.content[0].text).toMatch(/recipe-write/); // names a known group so the LLM has signal
  });

  it('flips list_tool_groups enabled state to true after enabling', async () => {
    const server = buildServer('core');
    await invokeTool(server, 'enable_tool_group', { group: 'cooklog' });
    const list = parseResult(await invokeTool(server, 'list_tool_groups', {}));
    const cooklog = list.groups.find((g: any) => g.name === 'cooklog');
    expect(cooklog.enabled).toBe(true);
  });
});

describe('disable_tool_group', () => {
  it('disables every tool in the named group', async () => {
    const server = buildServer('full');
    const reg = getRegistry(server);
    const group = TOOL_GROUPS.find((g) => g.name === 'shopping-write')!;
    for (const t of group.tools) expect(reg[t]!.enabled).toBe(true);

    const result = parseResult(await invokeTool(server, 'disable_tool_group', { group: 'shopping-write' }));
    expect(result.ok).toBe(true);
    expect(new Set(result.disabled)).toEqual(new Set(group.tools));

    for (const t of group.tools) expect(reg[t]!.enabled, `tool '${t}' must be disabled after disable_tool_group`).toBe(false);
  });

  it('is idempotent — second call reports already_disabled', async () => {
    const server = buildServer('core'); // non-core groups start disabled
    const result = parseResult(await invokeTool(server, 'disable_tool_group', { group: 'shopping-write' }));
    expect(result.disabled).toEqual([]);
    expect(new Set(result.already_disabled)).toEqual(
      new Set(TOOL_GROUPS.find((g) => g.name === 'shopping-write')!.tools),
    );
  });

  it('refuses to disable core', async () => {
    const server = buildServer('full');
    const result = await invokeTool(server, 'disable_tool_group', { group: 'core' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/cannot disable 'core'/);
  });

  it('returns isError for unknown groups', async () => {
    const server = buildServer('full');
    const result = await invokeTool(server, 'disable_tool_group', { group: 'whoops' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/unknown tool group/);
  });
});
