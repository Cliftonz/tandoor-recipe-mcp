import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { TandoorClient } from '../../src/clients/index.js';
import { connectAllTools } from './helpers/tools.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const describeE2E = url && token ? describe : describe.skip;

const text = (r: any): string => r.content.map((c: any) => c.text).join('\n');
const json = (s: string) => JSON.parse(s.slice(s.search(/[[{]/)));

describeE2E('update_search_preference search mode', () => {
  let mcp: Client;
  let userId: number;
  let originalSearch: string;
  let modes: string[];

  beforeAll(async () => {
    const tandoor = new TandoorClient({ url: url!, token: token! });
    mcp = await connectAllTools(tandoor, { status: 'ok', level: 'note', detail: 'e2e' });
    const { tools } = await mcp.listTools();
    const tool = tools.find((t) => t.name === 'update_search_preference')!;
    modes = (tool.inputSchema.properties as any).search.enum;
    const [pref] = json(text(await mcp.callTool({ name: 'list_search_preferences', arguments: {} })));
    userId = pref.user_id;
    originalSearch = pref.search;
  });

  afterAll(async () => {
    await new TandoorClient({ url: url!, token: token! }).housekeeping
      .patchSearchPreference(userId, { search: originalSearch });
    await mcp.close();
  });

  it('accepts every advertised search mode and persists it', async () => {
    const outcomes: Record<string, string> = {};
    for (const mode of modes) {
      const r: any = await mcp.callTool({ name: 'update_search_preference', arguments: { user: userId, search: mode } });
      if (r.isError) { outcomes[mode] = `error: ${text(r)}`; continue; }
      const [pref] = json(text(await mcp.callTool({ name: 'list_search_preferences', arguments: {} })));
      outcomes[mode] = `stored: ${pref.search}`;
    }
    expect(outcomes).toEqual(Object.fromEntries(modes.map((m) => [m, `stored: ${m}`])));
  });
});
