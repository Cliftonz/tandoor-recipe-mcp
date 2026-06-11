// End-to-end test of the stash + jq_query pipeline.
//
// Drives the real `registerStringTool` middleware, the real stash module, the
// real schema-summary module, the real jq_query handler, the real worker-
// isolated runner, and the real `jq-wasm` WebAssembly binary. The only thing
// stubbed is the Tandoor HTTP boundary (`client.recipes.listRecipes`, etc) —
// we feed canned payloads so the test is deterministic and doesn't need a
// live server.
//
// What this guarantees:
//   - large list_recipes responses come back as a SchemaSummary, not the
//     full payload, when the stash is enabled
//   - the LLM can resolve a stash handle by calling jq_query with a real
//     jq filter and get back the focused subset
//   - small responses bypass the stash entirely
//   - jq_query results that are themselves large get re-stashed (recursion)
//   - expired / unknown handles surface as MCP `isError: true`
//   - bad jq filters surface as MCP `isError: true` without crashing
//   - LRU eviction is observable end-to-end through the MCP surface
//   - pathological filters time out inside the worker, leaving the server
//     responsive to subsequent requests

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerRecipeTools } from '../src/tools/recipe.js';
import { registerJqTools } from '../src/tools/jq.js';
import { _stashClear, stashStats } from '../src/lib/stash.js';
import { _resetRegisteredNames } from '../src/lib/register.js';
import { _resetJqWorker } from '../src/lib/jq-runner.js';
import { invokeTool } from './helpers/mcp.js';
import { useStashEnv } from './helpers/stash-env.js';

useStashEnv();

function freshServer(): { server: McpServer; client: TandoorClient } {
  const server = new McpServer({ name: 'test', version: 'test' });
  const client = new TandoorClient({ url: 'https://x.test', token: 'tok' });
  _resetRegisteredNames();
  registerRecipeTools(server, client);
  registerJqTools(server, client);
  return { server, client };
}

function bigPayload(n: number) {
  return {
    count: n,
    next: n > 25 ? 'http://x?page=2' : null,
    previous: null,
    results: Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      name: `e2e-recipe-${i + 1}`,
      description: `A reasonably long description for recipe number ${i + 1} that pads the payload so the threshold is exceeded comfortably.`,
      rating: (i % 5) + 1,
      keywords: [{ id: (i % 3) + 1, name: `kw-${(i % 3) + 1}` }],
      working_time: 5 + (i % 25),
      waiting_time: i % 15,
      servings: 1 + (i % 6),
      internal: true,
      image: `https://example.test/img/${i}.jpg`,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    })),
  };
}

function stubListRecipes(client: TandoorClient, payload: unknown) {
  (client.recipes as any).listRecipes = async () => payload;
}

beforeEach(() => {
  _stashClear();
});
afterEach(() => {
  _stashClear();
});
afterAll(async () => {
  // Tear down the persistent jq worker so the test process exits cleanly.
  await _resetJqWorker();
});

describe('stash + jq_query end-to-end through the real MCP surface', () => {
  it('large list_recipes response → SchemaSummary with stash handle', async () => {
    delete process.env.TANDOOR_MCP_STASH_ENABLED;
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '500';

    const { server, client } = freshServer();
    stubListRecipes(client, bigPayload(50));

    const result = await invokeTool(server, 'list_recipes', { page_size: 50 });

    expect(result.isError).toBeFalsy();
    const sc = result.structuredContent;
    expect(sc.stashed).toBe(true);
    expect(sc.handle).toMatch(/^stash_[0-9a-f-]{36}$/);
    expect(sc.size_bytes).toBeGreaterThan(500);
    expect(sc.hint).toMatch(/Tandoor paginated/);
    expect(sc.sample_filters).toEqual(
      expect.arrayContaining(['.count', '.results | length', '.results[0]', '.results | map({id, name})']),
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.handle).toBe(sc.handle);

    // Critical invariant: the LLM should NOT see the raw payload anywhere.
    expect(result.content[0].text).not.toMatch(/e2e-recipe-1\b/);
  });

  it('small list_recipes response → full payload passes through (no stash)', async () => {
    delete process.env.TANDOOR_MCP_STASH_ENABLED;
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '50000';

    const { server, client } = freshServer();
    stubListRecipes(client, bigPayload(2));

    const result = await invokeTool(server, 'list_recipes', { page_size: 2 });

    expect(result.structuredContent.stashed).toBeUndefined();
    expect(result.structuredContent.results).toHaveLength(2);
    expect(result.structuredContent.results[0].name).toBe('e2e-recipe-1');
    expect(stashStats().count).toBe(0);
  });

  it('jq_query against a stashed handle returns the focused subset (real WASM)', async () => {
    delete process.env.TANDOOR_MCP_STASH_ENABLED;
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '500';

    const { server, client } = freshServer();
    stubListRecipes(client, bigPayload(20));

    const listed = await invokeTool(server, 'list_recipes', { page_size: 20 });
    const handle: string = listed.structuredContent.handle;

    const countRes = await invokeTool(server, 'jq_query', { handle, filter: '.results | length' });
    expect(countRes.isError).toBeFalsy();
    expect(JSON.parse(countRes.content[0].text)).toBe(20);

    const idsRes = await invokeTool(server, 'jq_query', {
      handle,
      filter: '.results | map(.id)',
    });
    expect(JSON.parse(idsRes.content[0].text)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    const filteredRes = await invokeTool(server, 'jq_query', {
      handle,
      filter: '.results | map(select(.rating >= 4)) | map({id, name, rating})',
    });
    const filtered = JSON.parse(filteredRes.content[0].text);
    expect(Array.isArray(filtered)).toBe(true);
    expect(filtered.every((r: any) => r.rating >= 4)).toBe(true);
    for (const r of filtered) {
      expect(Object.keys(r).sort()).toEqual(['id', 'name', 'rating']);
    }
  });

  it('jq_query result that is itself big gets re-stashed (recursion)', async () => {
    delete process.env.TANDOOR_MCP_STASH_ENABLED;
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '500';

    const { server, client } = freshServer();
    stubListRecipes(client, bigPayload(50));

    const listed = await invokeTool(server, 'list_recipes', { page_size: 50 });
    const handle1: string = listed.structuredContent.handle;

    const broadRes = await invokeTool(server, 'jq_query', {
      handle: handle1,
      filter: '.results | map({id, name, description, keywords, working_time, image})',
    });
    expect(broadRes.isError).toBeFalsy();
    expect(broadRes.structuredContent.stashed).toBe(true);
    expect(broadRes.structuredContent.handle).toMatch(/^stash_/);
    expect(broadRes.structuredContent.handle).not.toBe(handle1);

    const handle2: string = broadRes.structuredContent.handle;
    const lenRes = await invokeTool(server, 'jq_query', { handle: handle2, filter: 'length' });
    expect(JSON.parse(lenRes.content[0].text)).toBe(50);
  });

  it('unknown handle → isError:true with a generic recoverable message (no echo)', async () => {
    delete process.env.TANDOOR_MCP_STASH_ENABLED;

    const { server } = freshServer();
    const ghost = 'stash_00000000-0000-0000-0000-000000000000';
    const result = await invokeTool(server, 'jq_query', {
      handle: ghost,
      filter: '.',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found or expired/);
    expect(result.content[0].text).toMatch(/Re-run the original tool/);
    expect(result.content[0].text).not.toContain(ghost);
  });

  it('expired handle (TTL) → isError:true', async () => {
    delete process.env.TANDOOR_MCP_STASH_ENABLED;
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '500';
    process.env.TANDOOR_MCP_STASH_TTL_MS = '30';

    const { server, client } = freshServer();
    stubListRecipes(client, bigPayload(10));

    const listed = await invokeTool(server, 'list_recipes', { page_size: 10 });
    const handle: string = listed.structuredContent.handle;

    await new Promise((r) => setTimeout(r, 60));

    const result = await invokeTool(server, 'jq_query', { handle, filter: '.results | length' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found or expired/);
  });

  it('bad jq filter → isError:true with the jq stderr message', async () => {
    delete process.env.TANDOOR_MCP_STASH_ENABLED;
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '500';

    const { server, client } = freshServer();
    stubListRecipes(client, bigPayload(10));

    const listed = await invokeTool(server, 'list_recipes', { page_size: 10 });
    const handle: string = listed.structuredContent.handle;

    const result = await invokeTool(server, 'jq_query', { handle, filter: '... not valid' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/jq:/);
  });

  it('LRU eviction: oldest handle becomes unreachable through the MCP surface', async () => {
    delete process.env.TANDOOR_MCP_STASH_ENABLED;
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '500';
    process.env.TANDOOR_MCP_STASH_MAX_ENTRIES = '2';

    const { server, client } = freshServer();

    stubListRecipes(client, bigPayload(10));
    const a = await invokeTool(server, 'list_recipes', { page_size: 10 });
    stubListRecipes(client, bigPayload(20));
    const b = await invokeTool(server, 'list_recipes', { page_size: 20 });
    stubListRecipes(client, bigPayload(30));
    const c = await invokeTool(server, 'list_recipes', { page_size: 30 });

    const aHit = await invokeTool(server, 'jq_query', { handle: a.structuredContent.handle, filter: '.count' });
    expect(aHit.isError).toBe(true);

    const bHit = await invokeTool(server, 'jq_query', { handle: b.structuredContent.handle, filter: '.count' });
    expect(JSON.parse(bHit.content[0].text)).toBe(20);

    const cHit = await invokeTool(server, 'jq_query', { handle: c.structuredContent.handle, filter: '.count' });
    expect(JSON.parse(cHit.content[0].text)).toBe(30);
  });

  it('multiple jq_query calls against the same handle reuse the cached value', async () => {
    delete process.env.TANDOOR_MCP_STASH_ENABLED;
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '500';

    const { server, client } = freshServer();
    let callCount = 0;
    (client.recipes as any).listRecipes = async () => {
      callCount++;
      return bigPayload(15);
    };

    const listed = await invokeTool(server, 'list_recipes', { page_size: 15 });
    const handle: string = listed.structuredContent.handle;

    expect(callCount).toBe(1);

    for (const filter of [
      '.results | length',
      '.results | map(.id)',
      '.results[0]',
      '.results | map(.rating) | add',
      '.results | map(select(.id <= 3)) | length',
    ]) {
      const res = await invokeTool(server, 'jq_query', { handle, filter });
      expect(res.isError).toBeFalsy();
    }

    expect(callCount).toBe(1);
  });

  it('jq_stash_stats reports current stash size end-to-end', async () => {
    delete process.env.TANDOOR_MCP_STASH_ENABLED;
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '500';

    const { server, client } = freshServer();
    stubListRecipes(client, bigPayload(15));
    await invokeTool(server, 'list_recipes', { page_size: 15 });
    stubListRecipes(client, bigPayload(40));
    await invokeTool(server, 'list_recipes', { page_size: 40 });

    const stats = await invokeTool(server, 'jq_stash_stats', {});
    const parsed = JSON.parse(stats.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.bytes).toBeGreaterThan(0);
  });

  it('TANDOOR_MCP_STASH_ENABLED=0 → stash bypassed, raw payload like pre-feature behavior', async () => {
    process.env.TANDOOR_MCP_STASH_ENABLED = '0';

    const { server, client } = freshServer();
    stubListRecipes(client, bigPayload(50));

    const result = await invokeTool(server, 'list_recipes', { page_size: 50 });

    expect(result.structuredContent.stashed).toBeUndefined();
    expect(result.structuredContent.count).toBe(50);
    expect(result.structuredContent.results).toHaveLength(50);
    expect(stashStats().count).toBe(0);
  });

  it('pathological filter times out inside the worker, server stays responsive', async () => {
    delete process.env.TANDOOR_MCP_STASH_ENABLED;
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '500';

    const { server, client } = freshServer();
    stubListRecipes(client, bigPayload(5));
    const listed = await invokeTool(server, 'list_recipes', { page_size: 5 });
    const handle: string = listed.structuredContent.handle;

    // Non-terminating recursion. Either jq-wasm hits its internal recursion
    // limit and aborts the WASM (`Aborted()` from Emscripten) — which kills
    // the worker, surfacing as a generic worker exit error — or our
    // JQ_TIMEOUT_MS guard fires first. Both paths must show up as isError
    // and (critically) must not hang the test runner.
    const hangRes = await invokeTool(server, 'jq_query', {
      handle,
      filter: 'def f: f|f; f',
    });
    expect(hangRes.isError).toBe(true);
    expect(hangRes.content[0].text).toMatch(/timed out|jq:|aborted|Aborted|worker exited/i);

    // The next request must succeed — the worker was replaced.
    const okRes = await invokeTool(server, 'jq_query', { handle, filter: '.count' });
    expect(okRes.isError).toBeFalsy();
    expect(JSON.parse(okRes.content[0].text)).toBe(5);
  }, 15_000);
});
