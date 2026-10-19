import { describe, it, expect, afterEach, vi } from 'vitest';
import { TandoorClient } from '../src/clients/index.js';
import { handleExportRecipes } from '../src/handlers/export.js';

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
});
