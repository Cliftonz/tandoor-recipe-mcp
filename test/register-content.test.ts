import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerStringTool, _resetRegisteredNames } from '../src/lib/register.js';
import { registerJqTools } from '../src/tools/jq.js';
import { _stashClear, stashStats } from '../src/lib/stash.js';
import { invokeTool } from './helpers/mcp.js';
import { useStashEnv } from './helpers/stash-env.js';

useStashEnv();

beforeEach(() => {
  _stashClear();
  _resetRegisteredNames();
});

describe('registerStringTool content-block results', () => {
  it('returns a handler content-block result unchanged and never stashes it', async () => {
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '100';
    const client = new TandoorClient({ url: 'https://x.test', token: 'x' });
    const server = new McpServer({ name: 'test', version: 'test' });
    registerJqTools(server, client);
    const blocks = {
      content: [
        { type: 'text' as const, text: JSON.stringify({ filename: 'a.png', mime: 'image/png', size: 4000, pad: 'x'.repeat(200) }) },
        { type: 'image' as const, data: 'A'.repeat(4000), mimeType: 'image/png' },
      ],
    };
    registerStringTool(server, client, 'blocks', { description: 'returns blocks', inputSchema: {} }, async () => blocks);

    const result = await invokeTool(server, 'blocks', {});
    expect(result).toEqual(blocks);
    expect(stashStats().count).toBe(0);
  });
});
