import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { TandoorClient } from '../../../src/clients/index.js';
import { registerAllTools } from '../../../src/lib/register-all.js';
import { parseSectionModes } from '../../../src/lib/sections.js';
import { _resetRegisteredNames } from '../../../src/lib/register.js';
import type { VersionCheckResult } from '../../../src/lib/version-check.js';
import { ALL_SECTIONS_OPEN } from '../../helpers/mcp.js';

export async function connectAllTools(tandoor: TandoorClient, versionCheck: VersionCheckResult): Promise<Client> {
  _resetRegisteredNames();
  const server = new McpServer({ name: 'e2e', version: 'e2e' });
  registerAllTools(server, tandoor, {
    sections: parseSectionModes(ALL_SECTIONS_OPEN),
    pkg: { name: 'tandoor-mcp-e2e', version: '0.0.0-e2e' },
    versionCheck,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'e2e-client', version: '1.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

export async function allTools(): Promise<Tool[]> {
  const client = await connectAllTools(
    new TandoorClient({ url: 'https://x.test', token: 't' }),
    { status: 'ok', level: 'note', detail: 'tool list only' },
  );
  const { tools } = await client.listTools();
  await client.close();
  return tools;
}

export async function readToolNames(): Promise<string[]> {
  return (await allTools()).filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
}
