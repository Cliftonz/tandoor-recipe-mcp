import { describe, it, expect, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAllTools } from '../src/lib/register-all.js';
import { _resetRegisteredNames, _resetArraySkipLog } from '../src/lib/register.js';
import { parseSectionModes } from '../src/lib/sections.js';
import { ALL_SECTIONS_OPEN } from './helpers/mcp.js';

afterEach(() => {
  delete process.env.TANDOOR_MCP_PUBLIC_URL;
});

async function listTools(remote: boolean) {
  if (remote) process.env.TANDOOR_MCP_PUBLIC_URL = 'https://mcp.example.com/mcp';
  _resetRegisteredNames();
  _resetArraySkipLog();
  const server = new McpServer({ name: 'schemes', version: 'schemes' });
  registerAllTools(server, new TandoorClient({ url: 'https://x.test', token: 't' }), {
    sections: parseSectionModes(ALL_SECTIONS_OPEN),
    pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
    versionCheck: { status: 'ok', level: 'note', detail: 'schemes stub' },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'schemes-client', version: '1.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return (await client.listTools()).tools;
}

describe('ChatGPT sign-in metadata', () => {
  it('declares the oauth2 tandoor scheme under _meta on every tool in remote mode', async () => {
    const tools = await listTools(true);
    expect(tools.length).toBeGreaterThan(100);
    for (const tool of tools) expect(tool._meta, tool.name).toEqual({ securitySchemes: [{ type: 'oauth2', scopes: ['tandoor'] }] });
  });

  it('declares nothing outside remote mode', async () => {
    const tools = await listTools(false);
    expect(tools.filter((tool) => tool._meta !== undefined).map((tool) => tool.name)).toEqual([]);
  });
});
