import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import {
  registerStringTool,
  checkToolAllowed,
  globToRegex,
  parseFilterList,
  _resetRegisteredNames,
} from '../src/lib/register.js';
import { registerJqTools } from '../src/tools/jq.js';
import { _stashClear, stashStats } from '../src/lib/stash.js';
import { invokeTool } from './helpers/mcp.js';
import { useStashEnv } from './helpers/stash-env.js';

useStashEnv();

beforeEach(() => {
  _stashClear();
  _resetRegisteredNames();
});

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

  it('respects INCLUDE_ONLY + EXCLUDE filters (pure function)', async () => {
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
    expect(globToRegex('a.b').test('a.b')).toBe(true);
    expect(globToRegex('a.b').test('axb')).toBe(false);
  });

  describe('stash gate', () => {
    it('does not stash when explicitly disabled', async () => {
      process.env.TANDOOR_MCP_STASH_ENABLED = '0';
      const server = freshServer();
      registerJqTools(server, client); // jq_query is registered → gate could fire
      const big = { results: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `r${i}` })) };
      registerStringTool(server, client, 'big_tool', {
        description: 'returns big JSON',
        inputSchema: {},
      }, async () => JSON.stringify(big));

      const result = await invokeTool(server, 'big_tool', {});
      expect(result.structuredContent).toEqual(big);
      expect(JSON.parse(result.content[0].text)).toEqual(big);
      expect(stashStats().count).toBe(0);
    });

    it('replaces large results with schema summary + handle (default on)', async () => {
      delete process.env.TANDOOR_MCP_STASH_ENABLED;
      process.env.TANDOOR_MCP_STASH_THRESHOLD = '100';
      const server = freshServer();
      registerJqTools(server, client);
      const big = {
        count: 50,
        next: null,
        previous: null,
        results: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `recipe-${i}` })),
      };
      registerStringTool(server, client, 'big_tool', {
        description: 'returns big JSON',
        inputSchema: {},
      }, async () => JSON.stringify(big));

      const result = await invokeTool(server, 'big_tool', {});
      const sc = result.structuredContent;
      expect(sc.stashed).toBe(true);
      expect(sc.handle).toMatch(/^stash_[0-9a-f-]{36}$/);
      expect(sc.size_bytes).toBeGreaterThan(100);
      expect(sc.sample_filters).toContain('.results | length');
      expect(JSON.parse(result.content[0].text)).toEqual(sc);
    });

    it('leaves small results untouched (under threshold) when on', async () => {
      delete process.env.TANDOOR_MCP_STASH_ENABLED;
      process.env.TANDOOR_MCP_STASH_THRESHOLD = '10000';
      const server = freshServer();
      registerJqTools(server, client);
      registerStringTool(server, client, 'small_tool', {
        description: 'small json',
        inputSchema: {},
      }, async () => JSON.stringify({ id: 1, name: 'x' }));

      const result = await invokeTool(server, 'small_tool', {});
      expect(result.structuredContent).toEqual({ id: 1, name: 'x' });
    });

    it('bypasses stash when jq_query was not registered (no resolver available)', async () => {
      delete process.env.TANDOOR_MCP_STASH_ENABLED;
      process.env.TANDOOR_MCP_STASH_THRESHOLD = '100';
      const server = freshServer();
      // Deliberately do NOT register jq tools — simulates an operator who
      // filtered jq_query out via TANDOOR_MCP_EXCLUDE.
      const big = { results: Array.from({ length: 50 }, (_, i) => ({ id: i })) };
      registerStringTool(server, client, 'big_tool', {
        description: 'returns big JSON',
        inputSchema: {},
      }, async () => JSON.stringify(big));

      const result = await invokeTool(server, 'big_tool', {});
      // Raw payload comes through — no orphaned stash handle.
      expect(result.structuredContent).toEqual(big);
      expect(stashStats().count).toBe(0);
    });

    it('large non-JSON text passes through unstashed (no structured value to summarize)', async () => {
      delete process.env.TANDOOR_MCP_STASH_ENABLED;
      process.env.TANDOOR_MCP_STASH_THRESHOLD = '100';
      const server = freshServer();
      registerJqTools(server, client);
      const big = 'x'.repeat(30_000);
      registerStringTool(server, client, 'plain_big', {
        description: 'plain text only',
        inputSchema: {},
      }, async () => big);

      const result = await invokeTool(server, 'plain_big', {});
      expect(result.content[0].text).toBe(big);
      expect(result.structuredContent).toBeUndefined();
      expect(stashStats().count).toBe(0);
    });

    it('preserves header text for mutating-tool confirmations when stashing', async () => {
      delete process.env.TANDOOR_MCP_STASH_ENABLED;
      process.env.TANDOOR_MCP_STASH_THRESHOLD = '100';
      const server = freshServer();
      registerJqTools(server, client);
      const big = {
        count: 50,
        next: null,
        previous: null,
        results: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `r${i}` })),
      };
      registerStringTool(server, client, 'create_thing', {
        description: 'creates and returns full payload',
        inputSchema: {},
      }, async () => `Created recipe 42.\n\n${JSON.stringify(big)}`);

      const result = await invokeTool(server, 'create_thing', {});
      // The created-entity ID is still visible to the LLM in the text channel.
      expect(result.content[0].text).toMatch(/Created recipe 42\./);
      // The structured channel is the stash summary.
      const sc = result.structuredContent;
      expect(sc.stashed).toBe(true);
      expect(sc.handle).toMatch(/^stash_/);
    });

    it('writes a stderr log line when stashing', async () => {
      delete process.env.TANDOOR_MCP_STASH_ENABLED;
      process.env.TANDOOR_MCP_STASH_THRESHOLD = '100';
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const server = freshServer();
        registerJqTools(server, client);
        const big = { results: Array.from({ length: 50 }, (_, i) => ({ id: i })) };
        registerStringTool(server, client, 'big_tool', {
          description: 'big',
          inputSchema: {},
        }, async () => JSON.stringify(big));

        await invokeTool(server, 'big_tool', {});
        const hits = spy.mock.calls.filter((c) => String(c[0]).includes('stashed') && String(c[0]).includes('big_tool'));
        expect(hits.length).toBe(1);
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('surfaces handler errors as isError:true without throwing', async () => {
    const server = new McpServer({ name: 'test', version: 'test' });
    registerStringTool(server, client, 'broken', {
      description: 'always throws',
      inputSchema: { name: z.string() },
    }, async () => { throw new Error('nope'); });

    const result = await invokeTool(server, 'broken', { name: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/nope/);
  });
});
