import { describe, it, expect, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerResources } from '../src/resources/index.js';
import { registerPrompts } from '../src/prompts/index.js';

const URI = 'tandoor://pantry/on-hand';

type Page = { results: unknown[]; next: string | null };

function stubPages(pages: { entries: Page[]; foods: Page[] }): URL[] {
  const sent: URL[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = new URL(String(url));
    sent.push(u);
    const page = Number(u.searchParams.get('page') ?? '1');
    const list = u.pathname === '/api/inventory-entry/' ? pages.entries : u.pathname === '/api/food/' ? pages.foods : undefined;
    if (!list || !list[page - 1]) throw new Error(`unstubbed request ${u.pathname}${u.search}`);
    return new Response(JSON.stringify(list[page - 1]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return sent;
}

function pantryResource(): any {
  const server = new McpServer({ name: 't', version: 't' });
  registerResources(server, new TandoorClient({ url: 'https://tandoor.test', token: 't' }));
  return (server as any)._registeredResources[URI];
}

async function readPantry(): Promise<any> {
  const resource = pantryResource();
  const result = await resource.readCallback(new URL(URI), {});
  return JSON.parse(result.contents[0].text);
}

const freezer = { id: 2, name: 'Freezer', is_freezer: true };
const shelf = { id: 3, name: 'Pantry shelf', is_freezer: false };

function entry(id: number, location: object, food: { id: number; name: string }, overrides: Record<string, unknown> = {}) {
  return {
    id,
    inventory_location: location,
    sub_location: null,
    food: { ...food, food_onhand: false },
    unit: { id: 9, name: 'g' },
    amount: 100,
    expires: null,
    note: null,
    code: String(id),
    ...overrides,
  };
}

function food(id: number, name: string, onhand: boolean, category: string | null = null) {
  return { id, name, food_onhand: onhand, supermarket_category: category ? { id: 1, name: category } : null };
}

afterEach(() => vi.restoreAllMocks());

describe('tandoor://pantry/on-hand', () => {
  it('tells the model when on_hand_no_quantity is exact and where to get each full list', () => {
    const { description } = pantryResource().metadata;
    expect(description).toContain('on_hand_no_quantity is exact only when truncated.entries is false.');
    expect(description).toContain('When truncated.entries is true, use list_inventory_entries (inventory section) for the full list of entries.');
    expect(description).toContain('When truncated.on_hand_no_quantity is true, use list_foods for the full list of foods.');
  });

  it('groups stocked entries by location and lists on-hand foods that have no entry', async () => {
    stubPages({
      entries: [{
        next: null,
        results: [
          entry(11, freezer, { id: 5, name: 'peas' }, { amount: 400, expires: '2027-01-31', sub_location: 'top drawer' }),
          entry(12, shelf, { id: 6, name: 'rice' }, { amount: 2, unit: { id: 4, name: 'kg' }, note: 'basmati' }),
          entry(13, freezer, { id: 7, name: 'stock' }),
        ],
      }],
      foods: [{
        next: null,
        results: [
          food(5, 'peas', false),
          food(6, 'rice', true, 'Grains'),
          food(8, 'salt', true, 'Spices'),
          food(9, 'saffron', false),
        ],
      }],
    });

    expect(await readPantry()).toEqual({
      locations: [
        {
          id: 2,
          name: 'Freezer',
          is_freezer: true,
          entries: [
            { id: 11, food: 'peas', food_id: 5, amount: 400, unit: 'g', expires: '2027-01-31', sub_location: 'top drawer', note: null },
            { id: 13, food: 'stock', food_id: 7, amount: 100, unit: 'g', expires: null, sub_location: null, note: null },
          ],
        },
        {
          id: 3,
          name: 'Pantry shelf',
          is_freezer: false,
          entries: [
            { id: 12, food: 'rice', food_id: 6, amount: 2, unit: 'kg', expires: null, sub_location: null, note: 'basmati' },
          ],
        },
      ],
      on_hand_no_quantity: [{ id: 8, name: 'salt', supermarket_category: 'Spices' }],
      counts: { entries: 3, on_hand_no_quantity: 1 },
      truncated: { entries: false, on_hand_no_quantity: false },
    });
  });

  it('lists an on-hand food with no supermarket category with a null category', async () => {
    stubPages({ entries: [{ next: null, results: [] }], foods: [{ next: null, results: [food(8, 'salt', true)] }] });

    expect((await readPantry()).on_hand_no_quantity).toStrictEqual([{ id: 8, name: 'salt', supermarket_category: null }]);
  });

  it('shows unit null for an entry whose unit was deleted', async () => {
    stubPages({ entries: [{ next: null, results: [entry(11, shelf, { id: 6, name: 'rice' }, { unit: null })] }], foods: [{ next: null, results: [] }] });

    expect((await readPantry()).locations[0].entries[0]).toEqual({
      id: 11, food: 'rice', food_id: 6, amount: 100, unit: null, expires: null, sub_location: null, note: null,
    });
  });

  it('requests inventory entries without the empty filter', async () => {
    const sent = stubPages({ entries: [{ next: null, results: [] }], foods: [{ next: null, results: [] }] });

    await readPantry();

    const entryRequests = sent.filter((u) => u.pathname === '/api/inventory-entry/');
    expect(entryRequests).toHaveLength(1);
    expect(entryRequests[0].searchParams.has('empty')).toBe(false);
  });

  it('stops at 500 entries and 500 on-hand foods and flags each truncation', async () => {
    const entryPages: Page[] = Array.from({ length: 6 }, (_, p) => ({
      next: p < 5 ? 'more' : null,
      results: Array.from({ length: 100 }, (_, i) => entry(p * 100 + i + 1, shelf, { id: 1, name: 'flour' })),
    }));
    const foodPages: Page[] = Array.from({ length: 6 }, (_, p) => ({
      next: p < 5 ? 'more' : null,
      results: Array.from({ length: 100 }, (_, i) => food(1000 + p * 100 + i, `food ${p * 100 + i}`, true)),
    }));
    stubPages({ entries: entryPages, foods: foodPages });

    const pantry = await readPantry();

    expect(pantry.counts).toEqual({ entries: 500, on_hand_no_quantity: 500 });
    expect(pantry.locations[0].entries).toHaveLength(500);
    expect(pantry.on_hand_no_quantity).toHaveLength(500);
    expect(pantry.truncated).toEqual({ entries: true, on_hand_no_quantity: true });
  });

  it('does not flag truncation when exactly 500 exist', async () => {
    const entryPages: Page[] = Array.from({ length: 5 }, (_, p) => ({
      next: p < 4 ? 'more' : null,
      results: Array.from({ length: 100 }, (_, i) => entry(p * 100 + i + 1, shelf, { id: 1, name: 'flour' })),
    }));
    const foodPages: Page[] = Array.from({ length: 5 }, (_, p) => ({
      next: p < 4 ? 'more' : null,
      results: Array.from({ length: 100 }, (_, i) => food(1000 + p * 100 + i, `food ${p * 100 + i}`, true)),
    }));
    stubPages({ entries: entryPages, foods: foodPages });

    expect((await readPantry()).truncated).toEqual({ entries: false, on_hand_no_quantity: false });
  });
});

describe('resource titles and prompt text', () => {
  it('titles the resources without em-dashes', () => {
    const server = new McpServer({ name: 't', version: 't' });
    registerResources(server, new TandoorClient({ url: 'https://tandoor.test', token: 't' }));
    const titles = Object.fromEntries(Object.entries((server as any)._registeredResources).map(([uri, r]: [string, any]) => [uri, r.metadata.title]));
    expect(titles).toEqual({
      'tandoor://meal-plan/this-week': 'Meal Plan: This Week',
      'tandoor://pantry/on-hand': 'Pantry: On Hand',
      'tandoor://shopping-list/active': 'Shopping List: Active',
      'tandoor://meal-types': 'Meal Types',
    });
  });

  it('writes no em-dash in any prompt description or message', async () => {
    const server = new McpServer({ name: 't', version: 't' });
    registerPrompts(server, new TandoorClient({ url: 'https://tandoor.test', token: 't' }));
    const texts: string[] = [];
    for (const prompt of Object.values((server as any)._registeredPrompts) as any[]) {
      texts.push(prompt.description);
      for (const args of [{}, { use_pantry: 'true', keywords: 'quick', start_date: '2027-01-04' }, { url: 'https://example.test/r' }]) {
        const result = await prompt.callback(args, {});
        texts.push(result.description, ...result.messages.map((m: any) => m.content.text));
      }
    }
    expect(texts.filter((t) => t.includes('\u2014'))).toEqual([]);
  });
});
