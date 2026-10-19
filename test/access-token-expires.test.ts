import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAccessTokenTools } from '../src/tools/access-token.js';
import { mockClient } from './helpers/mock-client.js';

const token = { id: 1, scope: 'read', expires: '2026-12-01T10:00:00Z', created: '2026-01-01T00:00:00Z', token: 'raw' };

describe('access token expires requires seconds', () => {
  let client: Client;
  let server: McpServer;

  beforeAll(async () => {
    server = new McpServer({ name: 'test', version: 'test' });
    registerAccessTokenTools(server, mockClient<TandoorClient>({
      accessTokens: {
        createToken: async () => token,
        patchToken: async () => token,
      },
    }));
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    client = new Client({ name: 'test-client', version: 'test' });
    await client.connect(clientT);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  const cases = [
    { name: 'create_access_token', base: { scope: 'read' }, ok: 'Access token created.' },
    { name: 'update_access_token', base: { id: 1 }, ok: 'Access token updated.' },
  ];

  for (const { name, base, ok } of cases) {
    it(`${name} tells callers expires needs seconds and a Z suffix`, async () => {
      const { tools } = await client.listTools();
      const description = tools.find((t) => t.name === name)!.description;
      expect(description).toMatch(/expires \(UTC ISO 8601 datetime with seconds and Z suffix, e\.g\. \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\)/);
    });

    it(`${name} rejects a minutes-only datetime`, async () => {
      const r = (await client.callTool({ name, arguments: { ...base, expires: '2026-12-01T10:00Z' } })) as any;
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('expires');
    });

    it(`${name} accepts a datetime with seconds`, async () => {
      const r = (await client.callTool({ name, arguments: { ...base, expires: '2026-12-01T10:00:00Z' } })) as any;
      expect(r.isError).toBeFalsy();
      expect(r.content[0].text).toContain(ok);
    });
  }
});
