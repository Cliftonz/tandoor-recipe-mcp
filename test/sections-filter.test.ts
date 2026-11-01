import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const prior = { include: process.env.TANDOOR_MCP_INCLUDE_ONLY, exclude: process.env.TANDOOR_MCP_EXCLUDE };
let client: Client;

beforeAll(async () => {
  process.env.TANDOOR_MCP_INCLUDE_ONLY = 'list_tool_groups,enable_tool_group,list_recipes,delete_recipe,delete_step';
  process.env.TANDOOR_MCP_EXCLUDE = 'delete_step';
  const { registerAllTools } = await import('../src/lib/register-all.js');
  const { parseSectionModes } = await import('../src/lib/sections.js');
  const { TandoorClient } = await import('../src/clients/index.js');
  const server = new McpServer({ name: 'filter', version: 'filter' });
  registerAllTools(server, new TandoorClient({ url: 'https://x.test', token: 't' }), {
    sections: parseSectionModes({}),
    pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
    versionCheck: { status: 'ok', level: 'note', detail: 'filter stub' },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'filter-client', version: '1.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
});

afterAll(() => {
  for (const [key, value] of [['TANDOOR_MCP_INCLUDE_ONLY', prior.include], ['TANDOOR_MCP_EXCLUDE', prior.exclude]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function callJson(name: string, args: Record<string, unknown>): Promise<any> {
  const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }> };
  return JSON.parse(res.content[0]!.text);
}

describe('sections over INCLUDE_ONLY / EXCLUDE filtered tools', () => {
  it('lists only sections and tools that were registered', async () => {
    const { groups } = await callJson('list_tool_groups', {});
    expect(groups.map((g: { name: string; tools: unknown }) => [g.name, g.tools])).toEqual([
      ['always', ['list_tool_groups', 'enable_tool_group']],
      ['recipes', { simple: ['list_recipes'], full: ['delete_recipe'] }],
    ]);
  });

  it('never enables a filtered tool', async () => {
    const result = await callJson('enable_tool_group', { group: 'recipes' });
    expect(result.enabled).toEqual(['delete_recipe']);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('delete_recipe');
    expect(names).not.toContain('delete_step');
  });
});
