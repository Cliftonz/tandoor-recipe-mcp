// Spawns the built MCP server as a child process and drives it over real
// stdio JSON-RPC. Catches MCP-spec compliance bugs that the in-process
// `invokeTool` helper misses, because the SDK Client validates every
// response against the spec schema before resolving — exactly what Claude
// Desktop and other strict clients do.
//
// The Tandoor HTTP boundary is stubbed by a localhost server; no live
// Tandoor instance is required, so this runs in default `npm test` on every
// CI build and on `npm publish`.
//
// IMPORTANT: do NOT add `describe.concurrent` or `test.concurrent` to this
// file. The stub server uses module-level `mode` + `tandoorVersionMode` to
// pick its canned response per scenario; concurrent execution would race
// the flag with the request handler and tear results across tests.
// beforeEach resets the flags to a known state to keep `it.only` honest.
//
// Each scenario spawns its own MCP server process so env vars (stash TTL,
// max entries, threshold, enabled flag) actually take effect — they are
// read once at process start.
//
// Requires: `npm run build` has been run, since this test spawns the
// compiled `build/index.js`. If the build is missing the suite is marked
// skipped with a clear message rather than failing silently.

import { describe, it, expect, beforeAll, beforeEach, afterAll, onTestFailed } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startStub, Stub } from './helpers/stub-http.js';
import { paginated } from './helpers/factories.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILT_INDEX = path.join(REPO, 'build', 'index.js');

// Skip clearly when the build is missing OR stale relative to src/ or top-
// level build inputs. A locally-edited register.ts that didn't trigger a
// rebuild would otherwise be tested against last build's compiled output —
// silent false-pass (QA F8). Lazy-eval at first describe-block evaluation
// so we don't walk src/ on every test-file import (Perf F1).
let _builtCache: boolean | null = null;
function buildIsFresh(): boolean {
  if (_builtCache !== null) return _builtCache;
  if (!existsSync(BUILT_INDEX)) { _builtCache = false; return false; }
  const builtMtime = statSync(BUILT_INDEX).mtimeMs;
  let newestSrc = 0;
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.ts')) {
        const m = statSync(full).mtimeMs;
        if (m > newestSrc) newestSrc = m;
      }
    }
  }
  walk(path.join(REPO, 'src'));
  // Top-level build inputs that change compiled output without touching src/.
  for (const f of ['package.json', 'tsconfig.json']) {
    const p = path.join(REPO, f);
    if (existsSync(p)) {
      const m = statSync(p).mtimeMs;
      if (m > newestSrc) newestSrc = m;
    }
  }
  _builtCache = builtMtime >= newestSrc;
  return _builtCache;
}

// Canned Tandoor payloads.
function genRecipes(n: number, opts: { descLen?: number; namePrefix?: string } = {}): any[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `${opts.namePrefix ?? 'r'}-${i + 1}`,
    description: opts.descLen ? 'x'.repeat(opts.descLen) : `desc ${i + 1}`,
    rating: (i % 5) + 1,
    keywords: [{ id: (i % 3) + 1, name: `kw-${(i % 3) + 1}` }],
    working_time: 5 + (i % 25),
    waiting_time: i % 15,
    servings: 1 + (i % 6),
    internal: true,
    image: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  }));
}

type StubMode = 'default' | 'tiny' | 'gigantic' | 'proto' | 'nullish';
let mode: StubMode = 'default';
let tandoorVersionMode = '2.0.0';
let stub: Stub;

beforeAll(async () => {
  stub = await startStub((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url?.startsWith('/api/server-settings/current/')) {
      return res.end(JSON.stringify({ version: tandoorVersionMode }));
    }
    // Endpoints that legitimately return bare top-level arrays. These exercise
    // the structuredContent guard at the register layer — without the
    // isJsonObject check, strict SDK clients reject these responses.
    if (req.url?.startsWith('/api/user-preference/')) {
      return res.end(JSON.stringify([
        { user: { id: 1, username: 'alice' }, theme: 'TANDOOR', default_page: 'PLAN' },
      ]));
    }
    if (req.url?.startsWith('/api/meal-type/')) {
      // Tandoor's meal-type list is DRF-paginated upstream; the *tool* unwraps
      // to a bare array, which is what we want to exercise.
      return res.end(JSON.stringify(paginated([
        { id: 1, name: 'Breakfast', order: 0, color: '#ff0', default: true },
        { id: 2, name: 'Lunch', order: 1, color: '#0ff', default: false },
        { id: 3, name: 'Dinner', order: 2, color: '#f0f', default: false },
      ])));
    }
    if (req.url && /\/api\/recipe\/\d+\/related\/?/.test(req.url)) {
      return res.end(JSON.stringify([
        { id: 7, name: 'related-1' },
        { id: 8, name: 'related-2' },
      ]));
    }
    if (req.url?.startsWith('/api/food/')) {
      const foods = Array.from({ length: 60 }, (_, i) => ({
        id: i + 1,
        name: `food-${i + 1}`,
        plural_name: null,
        description: `padding-padding-padding food entry ${i + 1}`,
        recipe: null,
        url: '',
        properties: [],
        properties_food_amount: 100,
        properties_food_unit: null,
        fdc_id: null,
        food_onhand: false,
        supermarket_category: null,
        parent: null,
        numchild: 0,
        numrecipe: i % 3,
        inherit_fields: [],
        ignore_shopping: false,
        substitute: [],
        substitute_siblings: false,
        substitute_children: false,
        substitute_onhand: false,
        child_inherit_fields: [],
      }));
      return res.end(JSON.stringify(paginated(foods)));
    }
    if (req.url?.startsWith('/api/recipe/')) {
      switch (mode) {
        case 'tiny':
          return res.end(JSON.stringify(paginated(genRecipes(2))));
        case 'gigantic':
          // ~5MB+ payload to exercise the stash maxBytes bypass path.
          return res.end(JSON.stringify(paginated(genRecipes(400, { descLen: 12000 }))));
        case 'proto':
          // Prototype-pollution attempt. schema-summary uses Object.create(null)
          // for untrusted-key maps; this scenario is a smoke check that the
          // SERVER does not crash on the payload — the real assertion lives
          // in test/schema-summary.test.ts where we can attest server-side
          // behavior directly.
          return res.end(JSON.stringify({
            count: 1,
            next: null,
            previous: null,
            results: [{
              id: 1,
              name: 'evil',
              __proto__: { polluted: true },
              constructor: { prototype: { polluted: true } },
            }],
          }));
        case 'nullish':
          return res.end(JSON.stringify(paginated([
            { id: 1, name: 'only', rating: null, keywords: [] },
          ])));
        default:
          return res.end(JSON.stringify(paginated(genRecipes(40))));
      }
    }
    res.statusCode = 404;
    res.end('{}');
  });
});

afterAll(async () => {
  await stub?.close();
});

// Reset module-level stub flags between scenarios so a missing per-test
// `mode = ...` assignment or an `it.only` cannot inherit state from its
// neighbour (Maintainability F7, QA F12).
beforeEach(() => {
  mode = 'default';
  tandoorVersionMode = '2.0.0';
});

interface CallResult {
  text: string;
  parsed: unknown;
  isError: boolean;
  structured: Record<string, unknown> | undefined;
}

async function withClient<T>(env: Record<string, string>, fn: (c: Client, stderrBuf: string[]) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [BUILT_INDEX],
    env: {
      ...process.env,
      TANDOOR_URL: stub.url,
      TANDOOR_TOKEN: 'tok',
      // Retries off by default so a stub momentarily delaying doesn't
      // surface as test latency / flake (QA F11). The 503 scenario already
      // wanted this; setting it in the default keeps every test on equal
      // footing.
      TANDOOR_MAX_RETRIES: '0',
      // Default to profile=full so existing e2e tests exercise every tool
      // without needing to enable_tool_group first. Gating behavior is
      // covered by test/tool-groups-gating.test.ts (unit) and one dedicated
      // e2e at the bottom of this file. Individual tests can override.
      TANDOOR_MCP_PROFILE: 'full',
      ...env,
    } as Record<string, string>,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'stdio-e2e', version: '1.0' });
  // Capture every stderr chunk into a per-call buffer. Tests get the buffer
  // back so version-warning + downgrade-log assertions can check the
  // server's actual output. On failure, vitest's `onTestFailed` hook prints
  // the buffer so flake diagnosis isn't a black box (Observability F3,
  // QA F7).
  const stderrBuf: string[] = [];
  transport.stderr?.on('data', (b: Buffer) => { stderrBuf.push(b.toString()); });
  onTestFailed(() => {
    if (stderrBuf.length) {
      // eslint-disable-next-line no-console
      console.error('[server stderr]\n' + stderrBuf.join(''));
    }
  });
  await client.connect(transport);
  try { return await fn(client, stderrBuf); }
  finally { await client.close(); }
}

async function call(c: Client, name: string, args: Record<string, unknown>): Promise<CallResult> {
  const res = await c.callTool({ name, arguments: args }) as any;
  const text: string = res.content?.[0]?.text ?? '';
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { text, parsed, isError: !!res.isError, structured: res.structuredContent };
}

/**
 * Stderr arrives via an OS pipe asynchronously — a log line written by the
 * server might not be in `buf` yet when an assertion runs. Poll the joined
 * buffer for the expected regex up to `timeoutMs`; resolve as soon as it
 * appears, throw with the current buffer on timeout. Keeps assertions
 * deterministic without burning the full timeout on the happy path.
 */
async function waitForStderr(buf: string[], pattern: RegExp, timeoutMs = 1000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const joined = buf.join('');
    if (pattern.test(joined)) return joined;
    await new Promise((r) => setTimeout(r, 25));
  }
  const joined = buf.join('');
  throw new Error(`waitForStderr: pattern ${pattern} not found within ${timeoutMs}ms. stderr:\n${joined}`);
}

// Lazy: buildIsFresh() walks src/ once on first call (cached). Avoids the
// per-test-file-import cost when other suites don't need this check.
const d = buildIsFresh() ? describe : describe.skip;

d('MCP stdio protocol e2e (strict SDK client)', () => {
  if (!buildIsFresh()) {
    it.skip('build is missing or stale relative to src/ — run `npm run build`', () => {});
    return;
  }

  it('list_recipes large payload → SchemaSummary + stash handle', async () => {
    await withClient({ TANDOOR_MCP_STASH_THRESHOLD: '500' }, async (c) => {
      const r = await call(c, 'list_recipes', { page_size: 40 });
      expect(r.isError).toBe(false);
      expect(r.structured?.stashed).toBe(true);
      expect(r.structured?.handle).toMatch(/^stash_[0-9a-f-]{36}$/);
      expect(r.text).not.toMatch(/r-1\b/);
    });
  });

  it('jq_query returning a top-level array passes strict SDK schema (no structuredContent)', async () => {
    await withClient({ TANDOOR_MCP_STASH_THRESHOLD: '500' }, async (c, stderr) => {
      const listed = await call(c, 'list_recipes', { page_size: 40 });
      const handle = listed.structured!.handle as string;
      const r = await call(c, 'jq_query', { handle, filter: '.results | map(.id)' });
      expect(r.isError).toBe(false);
      expect(Array.isArray(r.parsed)).toBe(true);
      expect((r.parsed as number[]).length).toBe(40);
      expect(r.structured).toBeUndefined();
      // The new array-skip log must fire exactly once per tool. waitForStderr
      // polls the buffer because stderr arrives via an OS pipe asynchronously
      // — the chunk may not be present at the moment the round-trip resolves.
      await waitForStderr(stderr, /structuredContent downgraded for 'jq_query'/);
    });
  });

  it('concurrent jq_query against one handle — no worker race', async () => {
    await withClient({ TANDOOR_MCP_STASH_THRESHOLD: '500' }, async (c) => {
      const listed = await call(c, 'list_recipes', { page_size: 40 });
      const handle = listed.structured!.handle as string;
      const filters = [
        '.count', '.results | length', '.results | map(.id)',
        '.results | map(.rating) | add', '.results[0].name',
        '.results | map(select(.rating == 5)) | length',
      ];
      const results = await Promise.all(filters.map((f) => call(c, 'jq_query', { handle, filter: f })));
      expect(results.every((r) => !r.isError)).toBe(true);
      expect(results[0].parsed).toBe(40);
      expect(results[3].parsed).toBe(120);
    });
  });

  it('TTL expiry surfaces as isError and does not echo handle', async () => {
    // QA F6: bumped from TTL=80/wait=150 to TTL=300/wait=800 so the assertion
    // does not race a slow stdio round-trip on a loaded CI runner.
    await withClient({
      TANDOOR_MCP_STASH_THRESHOLD: '500',
      TANDOOR_MCP_STASH_TTL_MS: '300',
    }, async (c) => {
      const listed = await call(c, 'list_recipes', { page_size: 40 });
      const handle = listed.structured!.handle as string;
      await new Promise((r) => setTimeout(r, 800));
      const after = await call(c, 'jq_query', { handle, filter: '.count' });
      expect(after.isError).toBe(true);
      expect(after.text).toMatch(/not found or expired/);
      expect(after.text).not.toContain(handle);
    });
  });

  it('LRU eviction (max=2) drops the oldest handle', async () => {
    await withClient({
      TANDOOR_MCP_STASH_THRESHOLD: '500',
      TANDOOR_MCP_STASH_MAX_ENTRIES: '2',
    }, async (c) => {
      const a = await call(c, 'list_recipes', { page_size: 40 });
      const b = await call(c, 'list_recipes', { page_size: 40 });
      const cc = await call(c, 'list_recipes', { page_size: 40 });
      const ra = await call(c, 'jq_query', { handle: a.structured!.handle as string, filter: '.count' });
      const rb = await call(c, 'jq_query', { handle: b.structured!.handle as string, filter: '.count' });
      const rc = await call(c, 'jq_query', { handle: cc.structured!.handle as string, filter: '.count' });
      expect(ra.isError).toBe(true);
      expect(rb.parsed).toBe(40);
      expect(rc.parsed).toBe(40);
    });
  });

  it('pathological filter aborts and worker recovers', async () => {
    await withClient({ TANDOOR_MCP_STASH_THRESHOLD: '500' }, async (c) => {
      const listed = await call(c, 'list_recipes', { page_size: 40 });
      const handle = listed.structured!.handle as string;
      const hang = await call(c, 'jq_query', { handle, filter: 'def f: f|f; f' });
      expect(hang.isError).toBe(true);
      expect(hang.text).toMatch(/timed out|aborted|worker exited|jq:/i);
      const ok = await call(c, 'jq_query', { handle, filter: '.count' });
      expect(ok.isError).toBe(false);
      expect(ok.parsed).toBe(40);
    });
  });

  it('multi-value jq output is wrapped into a JSON array', async () => {
    await withClient({ TANDOOR_MCP_STASH_THRESHOLD: '500' }, async (c) => {
      const listed = await call(c, 'list_recipes', { page_size: 40 });
      const handle = listed.structured!.handle as string;
      const r = await call(c, 'jq_query', { handle, filter: '.results[0:3][] | .id' });
      expect(r.isError).toBe(false);
      expect(r.parsed).toEqual([1, 2, 3]);
      expect(r.structured).toBeUndefined();
    });
  });

  it('null and empty-array jq results are handled cleanly', async () => {
    await withClient({ TANDOOR_MCP_STASH_THRESHOLD: '500' }, async (c) => {
      const listed = await call(c, 'list_recipes', { page_size: 40 });
      const handle = listed.structured!.handle as string;
      const empty = await call(c, 'jq_query', { handle, filter: '.results | map(select(.id > 999))' });
      expect(empty.isError).toBe(false);
      expect(empty.parsed).toEqual([]);
      expect(empty.structured).toBeUndefined();
      const nullR = await call(c, 'jq_query', { handle, filter: '.does_not_exist' });
      expect(nullR.isError).toBe(false);
      expect(nullR.parsed).toBeNull();
    });
  });

  it('payload with null fields and empty arrays jq-filters cleanly', async () => {
    mode = 'nullish';
    await withClient({ TANDOOR_MCP_STASH_THRESHOLD: '50' }, async (c) => {
      const listed = await call(c, 'list_recipes', { page_size: 1 });
      const handle = listed.structured!.handle as string;
      const r = await call(c, 'jq_query', {
        handle,
        filter: '.results[0] | {name, rating, kw_count: (.keywords | length)}',
      });
      expect(r.isError).toBe(false);
      expect(r.parsed).toMatchObject({ name: 'only', rating: null, kw_count: 0 });
    });
  });

  // Smoke check that the SERVER process boots and serves the proto payload
  // without crashing. The real assertion that Object.prototype is not
  // polluted lives in test/schema-summary.test.ts (closer to the defense,
  // and not subject to in-process-vs-out-of-process confusion).
  it('prototype-pollution payload does not crash the server boot or response cycle', async () => {
    mode = 'proto';
    await withClient({ TANDOOR_MCP_STASH_THRESHOLD: '50' }, async (c) => {
      const r = await call(c, 'list_recipes', { page_size: 1 });
      expect(r.isError).toBe(false);
    });
  });

  it('payload above stash maxBytes is bypassed, raw paginated object returned', async () => {
    mode = 'gigantic';
    await withClient({
      TANDOOR_MCP_STASH_THRESHOLD: '500',
      TANDOOR_MCP_STASH_MAX_BYTES: '100000',
    }, async (c) => {
      const r = await call(c, 'list_recipes', { page_size: 400 });
      expect(r.isError).toBe(false);
      expect(r.structured?.stashed).toBeUndefined();
      expect(r.structured?.count).toBe(400);
      expect(Array.isArray(r.structured?.results)).toBe(true);
    });
  });

  it('Zod regex rejects a junk handle before the handler runs', async () => {
    await withClient({}, async (c) => {
      const res = await c.callTool({
        name: 'jq_query',
        arguments: { handle: 'not-a-stash', filter: '.' },
      }) as any;
      const isErr = !!res.isError;
      const txt: string = res.content?.[0]?.text ?? '';
      expect(isErr).toBe(true);
      expect(txt).toMatch(/invalid|stash|handle/i);
    });
  });

  it('Zod max-length rejects a filter larger than 4096 chars', async () => {
    await withClient({ TANDOOR_MCP_STASH_THRESHOLD: '500' }, async (c) => {
      const listed = await call(c, 'list_recipes', { page_size: 40 });
      const handle = listed.structured!.handle as string;
      const huge = '.' + ' | tostring'.repeat(500);
      const res = await c.callTool({
        name: 'jq_query',
        arguments: { handle, filter: huge },
      }) as any;
      expect(!!res.isError).toBe(true);
    });
  });

  it('TANDOOR_MCP_STASH_ENABLED=0 → raw payload, no handle', async () => {
    await withClient({ TANDOOR_MCP_STASH_ENABLED: '0' }, async (c) => {
      const r = await call(c, 'list_recipes', { page_size: 40 });
      expect(r.isError).toBe(false);
      expect(r.structured?.stashed).toBeUndefined();
      expect(r.structured?.count).toBe(40);
    });
  });

  // ---------- Tier 1 #1: original food-list timeout reproduction ----------
  it('list_foods returns cleanly through stdio (original incident reproduction)', async () => {
    await withClient({ TANDOOR_MCP_STASH_THRESHOLD: '500' }, async (c) => {
      const r = await call(c, 'list_foods', { query: 'chicken', page_size: 60 });
      expect(r.isError).toBe(false);
      expect(r.structured?.stashed).toBe(true);
      expect(r.structured?.handle).toMatch(/^stash_[0-9a-f-]{36}$/);
      const cnt = await call(c, 'jq_query', { handle: r.structured!.handle as string, filter: '.count' });
      expect(cnt.parsed).toBe(60);
      const names = await call(c, 'jq_query', {
        handle: r.structured!.handle as string,
        filter: '.results | map(.name) | length',
      });
      expect(names.parsed).toBe(60);
    });
  }, 20_000);

  // ---------- Tier 1 #2: top-level-array endpoints ----------
  it('list_user_preferences (top-level array) passes strict SDK validation', async () => {
    await withClient({}, async (c) => {
      const r = await call(c, 'list_user_preferences', {});
      expect(r.isError).toBe(false);
      expect(Array.isArray(r.parsed)).toBe(true);
      expect(r.structured).toBeUndefined();
    });
  });

  it('list_meal_types (top-level array) passes strict SDK validation', async () => {
    await withClient({}, async (c) => {
      const r = await call(c, 'list_meal_types', {});
      expect(r.isError).toBe(false);
      expect(Array.isArray(r.parsed)).toBe(true);
      expect((r.parsed as unknown[]).length).toBe(3);
      expect(r.structured).toBeUndefined();
    });
  });

  it('related_recipes (top-level array) passes strict SDK validation', async () => {
    await withClient({}, async (c) => {
      const r = await call(c, 'related_recipes', { id: 1 });
      expect(r.isError).toBe(false);
      expect(Array.isArray(r.parsed)).toBe(true);
      expect((r.parsed as { id: number }[])[0]?.id).toBe(7);
      expect(r.structured).toBeUndefined();
    });
  });

  // ---------- Tier 2 #9: pagination + stash ----------
  it('paginated list with explicit page= preserves pagination hints in SchemaSummary', async () => {
    await withClient({ TANDOOR_MCP_STASH_THRESHOLD: '500' }, async (c) => {
      const r = await call(c, 'list_foods', { page: 1, page_size: 60 });
      expect(r.structured?.stashed).toBe(true);
      const samples = (r.structured as any).sample_filters as string[];
      expect(samples).toEqual(expect.arrayContaining(['.count']));
      expect((r.structured as any).hint).toMatch(/Tandoor paginated/i);
    });
  });

  // ---------- Tier 2 #10: concurrent tool calls with distinct handles ----------
  it('5 parallel list calls + 5 parallel jq filters resolve cleanly', async () => {
    await withClient({ TANDOOR_MCP_STASH_THRESHOLD: '500' }, async (c) => {
      const listed = await Promise.all([
        call(c, 'list_recipes', { page_size: 40 }),
        call(c, 'list_recipes', { page_size: 40 }),
        call(c, 'list_foods', { page_size: 60 }),
        call(c, 'list_foods', { page_size: 60 }),
        call(c, 'list_recipes', { page_size: 40 }),
      ]);
      const handles = listed.map((r) => r.structured!.handle as string);
      expect(new Set(handles).size).toBe(5);
      const queried = await Promise.all(handles.map((h, i) =>
        call(c, 'jq_query', { handle: h, filter: i % 2 === 0 ? '.count' : '.results | length' })
      ));
      expect(queried.every((q) => !q.isError)).toBe(true);
      expect(queried.map((q) => q.parsed).sort()).toEqual([40, 40, 40, 60, 60]);
    });
  }, 30_000);

  // ---------- Tier 3 #12: Tandoor 1.x rejection warning surfaces ----------
  it('Tandoor 1.x version → server emits warning to stderr and does not crash', async () => {
    tandoorVersionMode = '1.5.27';
    await withClient({}, async (c, stderr) => {
      const r = await call(c, 'list_recipes', { page_size: 40 });
      expect(r.isError).toBe(false);
      // Server emits the version warning on startup (stderr) before any
      // tool call resolves; the chunk may still be in flight when the
      // call returns. Poll the buffer.
      await waitForStderr(stderr, /1\.5\.27|2\.x|version/i);
    });
  }, 20_000);

  // ---------- Tier 3 #13: network failure modes at the tool surface ----------
  it('upstream 503 surfaces as isError at the tool surface (no crash)', async () => {
    const failStub = await startStub((_req, res) => {
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ detail: 'Service Unavailable' }));
    });
    try {
      const transport = new StdioClientTransport({
        command: 'node',
        args: [BUILT_INDEX],
        env: {
          ...process.env,
          TANDOOR_URL: failStub.url,
          TANDOOR_TOKEN: 'tok',
          // Retries-off lives in the default withClient now; duplicating
          // here only because this scenario builds its own transport
          // (different URL).
          TANDOOR_MAX_RETRIES: '0',
        } as Record<string, string>,
        stderr: 'pipe',
      });
      const client = new Client({ name: 'stdio-e2e-fail', version: '1.0' });
      const stderrBuf: string[] = [];
      transport.stderr?.on('data', (b: Buffer) => { stderrBuf.push(b.toString()); });
      onTestFailed(() => {
        if (stderrBuf.length) {
          // eslint-disable-next-line no-console
          console.error('[server stderr]\n' + stderrBuf.join(''));
        }
      });
      await client.connect(transport);
      try {
        const r = await call(client, 'list_recipes', { page_size: 5 });
        expect(r.isError).toBe(true);
        expect(r.text).toMatch(/503|Service Unavailable|Tandoor API error/i);
      } finally {
        await client.close();
      }
    } finally {
      await failStub.close();
    }
  }, 30_000);

  // ---- profile=core dynamic tool-gating, end-to-end through stdio ----
  // The unit tests in test/tool-groups-gating.test.ts already cover the
  // enable/disable semantics. This one is the load-bearing protocol check:
  // does the SDK actually emit tools/list_changed when we flip .enable()?
  // If a future SDK version stops emitting it on enable/disable, the unit
  // tests still pass (they poke `_registeredTools.enabled` directly) but
  // the real client never refreshes — silent breakage.
  it('profile=core hides non-core tools and enable_tool_group reveals them', async () => {
    await withClient({ TANDOOR_MCP_PROFILE: 'core' }, async (c) => {
      const initial = await c.listTools();
      const names = new Set(initial.tools.map((t) => t.name));
      // Core sentinels present.
      expect(names.has('list_recipes')).toBe(true);
      expect(names.has('list_tool_groups')).toBe(true);
      expect(names.has('enable_tool_group')).toBe(true);
      // Non-core sentinels hidden.
      expect(names.has('create_recipe')).toBe(false);
      expect(names.has('list_user_preferences')).toBe(false);

      const enabled = await call(c, 'enable_tool_group', { group: 'recipe-write' });
      expect(enabled.isError).toBe(false);
      const payload = enabled.parsed as { ok: boolean; enabled: string[] };
      expect(payload.ok).toBe(true);
      expect(payload.enabled).toContain('create_recipe');

      // After enable, the SDK must have emitted tools/list_changed; the
      // client's next listTools call should see create_recipe.
      const afterEnable = await c.listTools();
      const afterNames = new Set(afterEnable.tools.map((t) => t.name));
      expect(afterNames.has('create_recipe')).toBe(true);
      // admin group still hidden — we only enabled recipe-write.
      expect(afterNames.has('list_user_preferences')).toBe(false);

      // Symmetric: disable hides them again.
      const disabled = await call(c, 'disable_tool_group', { group: 'recipe-write' });
      expect(disabled.isError).toBe(false);
      const afterDisable = await c.listTools();
      const afterDisableNames = new Set(afterDisable.tools.map((t) => t.name));
      expect(afterDisableNames.has('create_recipe')).toBe(false);
    });
  }, 30_000);
});
