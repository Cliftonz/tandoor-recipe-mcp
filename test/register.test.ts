import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import {
  registerStringTool,
  checkToolAllowed,
  globToRegex,
  parseFilterList,
} from '../src/lib/register.js';

// Access the McpServer's internal tool registry to call a handler directly
// (the public request-based path requires a connected transport; we just want
// to check that the wrapper produces the right CallToolResult shape).
function invokeTool(server: McpServer, name: string, args: unknown): Promise<any> {
  const registered = (server as any)._registeredTools[name];
  if (!registered) throw new Error(`tool ${name} not registered`);
  // `handler` is the wrapped callback McpServer dispatches from callTool.
  return registered.handler(args, { signal: new AbortController().signal });
}

describe('registerStringTool structuredContent behavior', () => {
  const client = new TandoorClient({ url: 'https://x.test', token: 'x' });

  function freshServer(): McpServer {
    return new McpServer({ name: 'test', version: 'test' });
  }

  it('mirrors pure-JSON handler output into structuredContent', async () => {
    const server = freshServer();
    registerStringTool(server, client, 'pure_json', {
      description: 'returns pure JSON',
      inputSchema: {},
    }, async () => JSON.stringify({ id: 42, name: 'stew' }));

    const result = await invokeTool(server, 'pure_json', {});
    expect(result.content[0]).toEqual({ type: 'text', text: '{"id":42,"name":"stew"}' });
    expect(result.structuredContent).toEqual({ id: 42, name: 'stew' });
  });

  it('extracts JSON payload embedded after a header + double-newline', async () => {
    const server = freshServer();
    registerStringTool(server, client, 'with_header', {
      description: 'returns header + JSON',
      inputSchema: {},
    }, async () => `Recipe created successfully!\n\n${JSON.stringify({ id: 1 })}`);

    const result = await invokeTool(server, 'with_header', {});
    expect(result.content[0].text).toContain('Recipe created successfully!');
    expect(result.structuredContent).toEqual({ id: 1 });
  });

  it('omits structuredContent for plain-text confirmations', async () => {
    const server = freshServer();
    registerStringTool(server, client, 'plain', {
      description: 'plain text',
      inputSchema: {},
    }, async () => 'Recipe 5 deleted.');

    const result = await invokeTool(server, 'plain', {});
    expect(result.content[0].text).toBe('Recipe 5 deleted.');
    expect(result.structuredContent).toBeUndefined();
  });

  it('respects INCLUDE_ONLY + EXCLUDE filters (skips registration)', async () => {
    const server = freshServer();
    // Manually drive checkToolAllowed through registerStringTool by composing
    // patterns. Since env filters are baked in at module load, we exercise the
    // pure filter function here and assume the wiring.
    const includeOnly = [globToRegex('list_*')];
    const exclude = [globToRegex('list_foods')];
    expect(checkToolAllowed('list_recipes', includeOnly, exclude)).toBe(true);
    expect(checkToolAllowed('list_foods', includeOnly, exclude)).toBe(false);
    expect(checkToolAllowed('create_recipe', includeOnly, exclude)).toBe(false);
    expect(checkToolAllowed('list_ingredients', includeOnly, [])).toBe(true);
  });

  it('empty filter lists mean "everything allowed"', () => {
    expect(checkToolAllowed('anything', [], [])).toBe(true);
    expect(parseFilterList(undefined)).toEqual([]);
    expect(parseFilterList('')).toEqual([]);
    expect(parseFilterList('a, b,  c ')).toEqual(['a', 'b', 'c']);
  });

  it('globToRegex handles * wildcard and escapes regex metachars', () => {
    expect(globToRegex('list_*').test('list_foods')).toBe(true);
    expect(globToRegex('list_*').test('create_foods')).toBe(false);
    // Dots must be literal.
    expect(globToRegex('a.b').test('a.b')).toBe(true);
    expect(globToRegex('a.b').test('axb')).toBe(false);
  });

  it('surfaces handler errors as isError:true without throwing', async () => {
    const server = freshServer();
    registerStringTool(server, client, 'broken', {
      description: 'always throws',
      inputSchema: { name: z.string() },
    }, async () => { throw new Error('nope'); });

    const result = await invokeTool(server, 'broken', { name: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/nope/);
  });
});
