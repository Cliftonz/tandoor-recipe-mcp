import { describe, it, expect, afterEach, vi } from 'vitest';
import { TandoorClient } from '../src/clients/index.js';
import { handleExportRecipes } from '../src/handlers/export.js';
import type { ExportRecipesArgs } from '../src/tools/export.js';

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('export_recipes custom_filter request shape', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts the stored filter id and name, which the 2.6.15 export view needs to take the filter branch', async () => {
    const posted: any[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith('/api/custom-filter/7/')) {
        return json({ id: 7, name: 'weeknight', search: '{"query":"soup"}', shared: [], created_by: 1 });
      }
      posted.push(JSON.parse(String(init!.body)));
      return json({ id: 9, type: 'DEFAULT', running: true, created_at: 't' });
    });
    const client = new TandoorClient({ url: 'https://tandoor.test', token: 't' });

    const out = await handleExportRecipes(client, { type: 'DEFAULT', custom_filter: 7 });

    expect(posted).toEqual([{ recipes: [], type: 'DEFAULT', all: false, custom_filter: { id: 7, name: 'weeknight' } }]);
    expect(out).toContain('Export started');
  });

  it.each<[ExportRecipesArgs, unknown]>([
    [{ type: 'DEFAULT', recipes: [3, 4] }, { recipes: [{ id: 3 }, { id: 4 }], type: 'DEFAULT', all: false, custom_filter: null }],
    [{ type: 'DEFAULT', all: true }, { recipes: [], type: 'DEFAULT', all: true, custom_filter: null }],
  ])('posts custom_filter null without a filter, since the export view reads the key unconditionally (%o)', async (args, expected) => {
    const posted: any[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      posted.push(JSON.parse(String(init!.body)));
      return json({ id: 9, type: 'DEFAULT', running: true, created_at: 't' });
    });
    const client = new TandoorClient({ url: 'https://tandoor.test', token: 't' });

    await handleExportRecipes(client, args);

    expect(posted).toEqual([expected]);
  });

  it("surfaces Tandoor's 404 for a filter id the caller cannot access and starts no export", async () => {
    const posted: any[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith('/api/custom-filter/7/')) {
        return new Response(JSON.stringify({ detail: 'No CustomFilter matches the given query.' }), { status: 404, statusText: 'Not Found', headers: { 'Content-Type': 'application/json' } });
      }
      posted.push(JSON.parse(String(init!.body)));
      return json({ id: 9, type: 'DEFAULT', running: true, created_at: 't' });
    });
    const client = new TandoorClient({ url: 'https://tandoor.test', token: 't' });

    await expect(handleExportRecipes(client, { type: 'DEFAULT', custom_filter: 7 })).rejects.toThrow(/Tandoor API error: 404/);
    expect(posted).toEqual([]);
  });

  it('sends no request to Tandoor when the call is already aborted', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json({ id: 7, name: 'weeknight', search: '{}', shared: [], created_by: 1 }));
    const client = new TandoorClient({ url: 'https://tandoor.test', token: 't' });
    const controller = new AbortController();
    controller.abort();

    await expect(handleExportRecipes(client, { type: 'DEFAULT', custom_filter: 7 }, { signal: controller.signal })).rejects.toBe(controller.signal.reason);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects recipes[] together with custom_filter without sending any request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client = new TandoorClient({ url: 'https://tandoor.test', token: 't' });

    await expect(handleExportRecipes(client, { type: 'DEFAULT', recipes: [1], custom_filter: 7 })).rejects.toThrow(
      /recipes\[\] and custom_filter cannot be combined/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
