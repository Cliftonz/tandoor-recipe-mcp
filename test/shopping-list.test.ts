import { describe, it, expect, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { TandoorClient } from '../src/clients/index.js';
import { createShoppingListShape, updateShoppingListShape, bulkUpdateShoppingEntriesShape } from '../src/tools/shopping.js';
import {
  handleListShoppingLists,
  handleGetShoppingList,
  handleCreateShoppingList,
  handleUpdateShoppingList,
  handleDeleteShoppingList,
  handleGetShoppingEntry,
  handleCreateShoppingEntry,
  handleUpdateShoppingEntry,
  handleBulkUpdateShoppingEntries,
  handleBulkCreateShoppingListRecipeEntries,
} from '../src/handlers/shopping.js';
import { handleGetFood, handleCreateFood, handleUpdateFood, handleFoodBatchUpdate, handleMoveFood, handleMergeFood } from '../src/handlers/foodunit.js';

type Sent = { method: string; path: string; body?: unknown };
type Reply = { status: number; body?: unknown };

function stubTandoor(routes: Record<string, unknown>): Sent[] {
  const sent: Sent[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const u = new URL(String(url));
    const method = init?.method ?? 'GET';
    const path = u.pathname + u.search;
    sent.push({ method, path, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    const key = `${method} ${path}`;
    if (!(key in routes)) throw new Error(`unstubbed request ${key}`);
    const route = routes[key];
    const reply: Reply = route instanceof Object && 'status' in route ? (route as Reply) : { status: 200, body: route };
    if (reply.body === undefined) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  });
  return sent;
}

const client = () => new TandoorClient({ url: 'https://tandoor.test', token: 'test-token' });

const costco = { id: 2, name: 'Costco', description: '', color: '#ff0000' };

const aldi = { id: 3, name: 'Aldi', description: 'cheap', color: null };

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 7, list_recipe: null, shopping_lists: [costco], food: { id: 1, name: 'Milk', shopping_lists: [aldi] },
    unit: null, amount: 1, order: 0, checked: false, ingredient: null, completed_at: null, delay_until: null,
    ...overrides,
  };
}

const page = (results: unknown[], next: string | null = null) => ({ count: results.length, next, previous: null, results });

const listPages = {
  'GET /api/shopping-list/?page=1&page_size=100': page([costco], 'more'),
  'GET /api/shopping-list/?page=2&page_size=100': page([aldi]),
};

const unknownListError = 'These shopping list ids do not exist in this space: 999, 1000. Nothing was changed. Use list_shopping_lists to see the lists.';

const body = (out: string) => JSON.parse(out.slice(out.search(/[[{]/)));

afterEach(() => vi.restoreAllMocks());

describe('shopping list tools', () => {
  it('lists shopping lists with paging', async () => {
    stubTandoor({ 'GET /api/shopping-list/?page=2&page_size=5': { count: 6, next: null, previous: 'p', timestamp: 't', results: [costco] } });
    const out = await handleListShoppingLists(client(), { page: 2, page_size: 5 });
    expect(JSON.parse(out)).toEqual({ count: 6, next: null, previous: 'p', results: [costco] });
  });

  it('gets a shopping list by id, keeping only id, name, description and color', async () => {
    stubTandoor({ 'GET /api/shopping-list/2/': { ...costco, created_by: { id: 1, username: 'e2e' } } });
    expect(JSON.parse(await handleGetShoppingList(client(), { id: 2 }))).toEqual(costco);
  });

  it('creates a shopping list from name, description and color', async () => {
    const sent = stubTandoor({ 'POST /api/shopping-list/': { ...costco, description: 'bulk' } });
    const out = await handleCreateShoppingList(client(), { name: 'Costco', description: 'bulk', color: '#ff0000' });
    expect(sent).toEqual([{ method: 'POST', path: '/api/shopping-list/', body: { name: 'Costco', description: 'bulk', color: '#ff0000' } }]);
    expect(out).toBe(`Shopping list created.\n\n${JSON.stringify({ ...costco, description: 'bulk' })}`);
  });

  it('updates only the given fields, and clears the color with null', async () => {
    const sent = stubTandoor({ 'PATCH /api/shopping-list/2/': { ...costco, color: null } });
    const out = await handleUpdateShoppingList(client(), { id: 2, color: null });
    expect(sent).toEqual([{ method: 'PATCH', path: '/api/shopping-list/2/', body: { color: null } }]);
    expect(body(out)).toEqual({ ...costco, color: null });
  });

  it('refuses a rename to the name of another list, in any case, and sends nothing', async () => {
    const sent = stubTandoor(listPages);
    await expect(handleUpdateShoppingList(client(), { id: 2, name: 'aLDI' })).rejects.toThrow(
      new Error('A shopping list named Aldi already exists (id 3); choose another name.'),
    );
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([]);
  });

  it('refuses a rename to another list\'s name with surrounding spaces', async () => {
    const sent = stubTandoor(listPages);
    await expect(handleUpdateShoppingList(client(), { id: 2, name: ' Aldi ' })).rejects.toThrow(
      new Error('A shopping list named Aldi already exists (id 3); choose another name.'),
    );
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([]);
  });

  it('renames a list to a variant of its own name even when another list already shares that name', async () => {
    const sent = stubTandoor({
      'GET /api/shopping-list/?page=1&page_size=100': page([costco, { ...costco, id: 5, name: 'costco' }]),
      'PATCH /api/shopping-list/2/': { ...costco, name: 'COSTCO' },
    });
    await handleUpdateShoppingList(client(), { id: 2, name: ' COSTCO ' });
    expect(sent.at(-1)).toEqual({ method: 'PATCH', path: '/api/shopping-list/2/', body: { name: ' COSTCO ' } });
  });

  it('renames a list to a case variant of its own name', async () => {
    const sent = stubTandoor({ ...listPages, 'PATCH /api/shopping-list/2/': { ...costco, name: 'COSTCO' } });
    await handleUpdateShoppingList(client(), { id: 2, name: 'COSTCO' });
    expect(sent.at(-1)).toEqual({ method: 'PATCH', path: '/api/shopping-list/2/', body: { name: 'COSTCO' } });
  });

  it('refuses an update with no field to change and sends nothing', async () => {
    const sent = stubTandoor({});
    await expect(handleUpdateShoppingList(client(), { id: 2 })).rejects.toThrow('At least one field required');
    expect(sent).toEqual([]);
  });

  it('deletes a shopping list', async () => {
    const sent = stubTandoor({ 'DELETE /api/shopping-list/2/': undefined });
    expect(await handleDeleteShoppingList(client(), { id: 2 })).toBe('Shopping list 2 deleted.');
    expect(sent).toEqual([{ method: 'DELETE', path: '/api/shopping-list/2/' }]);
  });

  it('accepts a name of 1 to 32 characters and a #rrggbb color or null', () => {
    for (const shape of [createShoppingListShape, { ...updateShoppingListShape, id: z.number().optional() }]) {
      const schema = z.object(shape);
      expect(schema.safeParse({ name: '' }).success).toBe(false);
      expect(schema.safeParse({ name: 'x'.repeat(33) }).success).toBe(false);
      expect(schema.safeParse({ name: 'x'.repeat(32) }).success).toBe(true);
      expect(schema.safeParse({ name: 'A', color: '#00FFaa' }).success).toBe(true);
      expect(schema.safeParse({ name: 'A', color: null }).success).toBe(true);
      for (const color of ['red', '#fff', '#00ff00ff', '00ff00']) {
        expect(schema.safeParse({ name: 'A', color }).success).toBe(false);
      }
    }
  });
});

describe('shopping entry lists', () => {
  it('shows the lists of an entry as {id, name}', async () => {
    stubTandoor({ 'GET /api/shopping-list-entry/7/': entry({ shopping_lists: [costco, aldi] }) });
    const out = JSON.parse(await handleGetShoppingEntry(client(), { id: 7 }));
    expect(out.shopping_lists).toEqual([{ id: 2, name: 'Costco' }, { id: 3, name: 'Aldi' }]);
  });
});

describe('shopping entry list ids', () => {
  it('creates an entry on the given lists after finding every id across the list pages', async () => {
    const sent = stubTandoor({ ...listPages, 'POST /api/shopping-list-entry/': entry({ shopping_lists: [costco, aldi] }) });
    const out = await handleCreateShoppingEntry(client(), { amount: 1, food_id: 1, shopping_list_ids: [3, 2] });
    expect(sent.at(-1)).toEqual({
      method: 'POST', path: '/api/shopping-list-entry/',
      body: { amount: 1, food: 1, unit: null, checked: false, shopping_lists: [3, 2] },
    });
    expect(body(out).shopping_lists).toEqual([{ id: 2, name: 'Costco' }, { id: 3, name: 'Aldi' }]);
  });

  it('rejects unknown list ids by name and creates nothing', async () => {
    const sent = stubTandoor(listPages);
    await expect(handleCreateShoppingEntry(client(), { amount: 1, food_id: 1, shopping_list_ids: [2, 999, 1000] }))
      .rejects.toThrow(unknownListError);
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([]);
  });

  it('replaces the lists of an entry, and [] clears them', async () => {
    const sent = stubTandoor({ 'PATCH /api/shopping-list-entry/7/': entry({ shopping_lists: [] }) });
    const out = await handleUpdateShoppingEntry(client(), { id: 7, checked: false, shopping_list_ids: [] });
    expect(sent).toEqual([{ method: 'PATCH', path: '/api/shopping-list-entry/7/', body: { checked: false, shopping_lists: [] } }]);
    expect(body(out).shopping_lists).toEqual([]);
  });

  it('rejects unknown list ids on update and patches nothing', async () => {
    const sent = stubTandoor(listPages);
    await expect(handleUpdateShoppingEntry(client(), { id: 7, checked: true, shopping_list_ids: [999, 1000] }))
      .rejects.toThrow(unknownListError);
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([]);
  });
});

describe('update_shopping_entry without checked', () => {
  it('sends the entry\'s current checked so Tandoor keeps completed_at', async () => {
    const checkedEntry = entry({ checked: true, completed_at: '2026-11-01T16:39:53Z' });
    const sent = stubTandoor({
      'GET /api/shopping-list-entry/7/': checkedEntry,
      'PATCH /api/shopping-list-entry/7/': { ...checkedEntry, amount: 3 },
    });
    await handleUpdateShoppingEntry(client(), { id: 7, amount: 3 });
    expect(sent.filter((s) => s.method === 'PATCH')).toEqual([
      { method: 'PATCH', path: '/api/shopping-list-entry/7/', body: { amount: 3, checked: true } },
    ]);
  });

  it('still refuses an id-only update without reading the entry', async () => {
    const sent = stubTandoor({});
    await expect(handleUpdateShoppingEntry(client(), { id: 7 })).rejects.toThrow('At least one field required');
    expect(sent).toEqual([]);
  });
});

describe('bulk_update_shopping_entries', () => {
  const bulkEcho = (b: object) => ({ 'POST /api/shopping-list-entry/bulk/': { ...b, shopping_lists_remove_all: false } });

  it('adds and removes lists in one call after checking the ids', async () => {
    const req = { ids: [7, 8], shopping_lists_add: [2], shopping_lists_remove: [3] };
    const sent = stubTandoor({ ...listPages, ...bulkEcho(req) });
    await handleBulkUpdateShoppingEntries(client(), req);
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      'GET /api/shopping-list/?page=1&page_size=100', 'GET /api/shopping-list/?page=2&page_size=100', 'POST /api/shopping-list-entry/bulk/',
    ]);
    expect(sent.at(-1)?.body).toEqual(req);
  });

  it('checks entries without any list change and without reading the lists', async () => {
    const sent = stubTandoor(bulkEcho({ ids: [7], checked: true }));
    await handleBulkUpdateShoppingEntries(client(), { ids: [7], checked: true });
    expect(sent).toEqual([{ method: 'POST', path: '/api/shopping-list-entry/bulk/', body: { ids: [7], checked: true } }]);
  });

  it.each([
    [{ shopping_lists_set: [2] }],
    [{ shopping_lists_remove_all: true }],
    [{ shopping_lists_set: [3], checked: false }],
  ])('sends %o', async (ops) => {
    const sent = stubTandoor({ ...listPages, ...bulkEcho({ ids: [7], ...ops }) });
    await handleBulkUpdateShoppingEntries(client(), { ids: [7], ...ops });
    expect(sent.at(-1)?.body).toEqual({ ids: [7], ...ops });
  });

  it.each([
    [{ shopping_lists_set: [2], shopping_lists_add: [3] }, 'shopping_lists_add or shopping_lists_remove, shopping_lists_set'],
    [{ shopping_lists_set: [2], shopping_lists_remove_all: true }, 'shopping_lists_set, shopping_lists_remove_all'],
    [{ shopping_lists_remove: [2], shopping_lists_remove_all: true }, 'shopping_lists_add or shopping_lists_remove, shopping_lists_remove_all'],
  ])('rejects the combination %o and sends nothing', async (ops, named) => {
    const sent = stubTandoor({});
    await expect(handleBulkUpdateShoppingEntries(client(), { ids: [7], ...ops })).rejects.toThrow(
      `Only shopping_lists_add and shopping_lists_remove can be combined; shopping_lists_set and shopping_lists_remove_all must be used alone. Got: ${named}.`,
    );
    expect(sent).toEqual([]);
  });

  it('rejects shopping_lists_set [] and points to shopping_lists_remove_all', async () => {
    const sent = stubTandoor({});
    await expect(handleBulkUpdateShoppingEntries(client(), { ids: [7], shopping_lists_set: [] })).rejects.toThrow(
      'shopping_lists_set: [] does nothing in Tandoor. To take every list off, use shopping_lists_remove_all: true.',
    );
    expect(sent).toEqual([]);
  });

  it.each([[{}], [{ shopping_lists_remove_all: false }], [{ shopping_lists_add: [] }], [{ shopping_lists_add: [], shopping_lists_remove: [] }]])('rejects %o, which has neither checked nor a list change', async (ops) => {
    const sent = stubTandoor({});
    await expect(handleBulkUpdateShoppingEntries(client(), { ids: [7], ...ops })).rejects.toThrow(
      'Give checked, a list change, or both.',
    );
    expect(sent).toEqual([]);
  });

  it('rejects unknown list ids and sends no bulk request', async () => {
    const sent = stubTandoor(listPages);
    await expect(handleBulkUpdateShoppingEntries(client(), { ids: [7], shopping_lists_add: [999], shopping_lists_remove: [1000] }))
      .rejects.toThrow(unknownListError);
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([]);
  });

  it('requires at least one entry id', () => {
    expect(z.object(bulkUpdateShoppingEntriesShape).safeParse({ ids: [], checked: true }).success).toBe(false);
  });
});

describe('bulk_create_shopping_list_recipe_entries lists', () => {
  const entries = [{ amount: 1, food_id: 1, unit_id: null, ingredient_id: null }];
  const echo = (b: object) => ({ 'POST /api/shopping-list-recipe/4/bulk_create_entries/': b });

  it('sends shopping_lists_ids [] when no lists are given, so Tandoor uses each food\'s lists', async () => {
    const sent = stubTandoor(echo({ entries, shopping_lists_ids: [] }));
    await handleBulkCreateShoppingListRecipeEntries(client(), { id: 4, entries });
    expect(sent).toEqual([{ method: 'POST', path: '/api/shopping-list-recipe/4/bulk_create_entries/', body: { entries, shopping_lists_ids: [] } }]);
  });

  it('rejects an explicit shopping_list_ids [] and creates nothing', async () => {
    const sent = stubTandoor({});
    await expect(handleBulkCreateShoppingListRecipeEntries(client(), { id: 4, entries, shopping_list_ids: [] })).rejects.toThrow(
      new Error("[] is not supported here; Tandoor would copy each food's lists. Omit shopping_list_ids for that."),
    );
    expect(sent).toEqual([]);
  });

  it('sends the given lists after checking them', async () => {
    const sent = stubTandoor({ ...listPages, ...echo({ entries, shopping_lists_ids: [3] }) });
    await handleBulkCreateShoppingListRecipeEntries(client(), { id: 4, entries, shopping_list_ids: [3] });
    expect(sent.at(-1)?.body).toEqual({ entries, shopping_lists_ids: [3] });
  });

  it('rejects unknown list ids and creates no entries', async () => {
    const sent = stubTandoor(listPages);
    await expect(handleBulkCreateShoppingListRecipeEntries(client(), { id: 4, entries, shopping_list_ids: [999, 1000] }))
      .rejects.toThrow(unknownListError);
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([]);
  });
});

describe('food shopping lists', () => {
  const milk = { id: 1, name: 'Milk', plural_name: null, full_name: 'Milk', description: '', food_onhand: false, supermarket_category: null, parent: null, numchild: 0, fdc_id: null, properties: [], shopping_lists: [] };

  it('shows the lists of a food as {id, name}', async () => {
    stubTandoor({ 'GET /api/food/1/': { ...milk, shopping_lists: [costco, aldi] } });
    expect(JSON.parse(await handleGetFood(client(), { id: 1 })).shopping_lists).toEqual([{ id: 2, name: 'Costco' }, { id: 3, name: 'Aldi' }]);
  });

  const noSuchFood = { 'GET /api/food/?query=Milk&page=1&page_size=100': page([{ ...milk, id: 8, name: 'Milk chocolate' }]) };

  it('refuses to set lists on a food that already has the name, in any case, and writes nothing', async () => {
    const sent = stubTandoor({
      ...listPages,
      'GET /api/food/?query=mILK&page=1&page_size=100': page([{ ...milk, id: 8, name: 'Milk chocolate' }], 'more'),
      'GET /api/food/?query=mILK&page=2&page_size=100': page([{ ...milk, id: 9, name: 'milk' }]),
    });
    await expect(handleCreateFood(client(), { name: 'mILK', shopping_list_ids: [2] })).rejects.toThrow(
      new Error('A food named milk already exists (id 9); use update_food to change its lists.'),
    );
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([]);
  });

  it('stops reading food pages at the first food with the name', async () => {
    const sent = stubTandoor({
      ...listPages,
      'GET /api/food/?query=Milk&page=1&page_size=100': page([{ ...milk, id: 9, name: 'MILK' }], 'more'),
    });
    await expect(handleCreateFood(client(), { name: 'Milk', shopping_list_ids: [2] })).rejects.toThrow('A food named MILK already exists (id 9)');
    expect(sent.filter((s) => s.path.startsWith('/api/food/')).map((s) => s.path)).toEqual(['/api/food/?query=Milk&page=1&page_size=100']);
  });

  it('trims the name before looking for an existing food', async () => {
    const sent = stubTandoor({
      ...listPages,
      'GET /api/food/?query=mILK&page=1&page_size=100': page([{ ...milk, id: 9, name: 'milk' }]),
    });
    await expect(handleCreateFood(client(), { name: ' mILK ', shopping_list_ids: [2] })).rejects.toThrow(
      new Error('A food named milk already exists (id 9); use update_food to change its lists.'),
    );
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([]);
  });

  it('creates a food without lists, then sets its lists with a PATCH', async () => {
    const sent = stubTandoor({
      ...listPages,
      ...noSuchFood,
      'POST /api/food/': milk,
      'PATCH /api/food/1/': { ...milk, shopping_lists: [costco] },
    });
    const out = await handleCreateFood(client(), { name: 'Milk', shopping_list_ids: [2] });
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([
      { method: 'POST', path: '/api/food/', body: { name: 'Milk' } },
      { method: 'PATCH', path: '/api/food/1/', body: { shopping_lists: [2] } },
    ]);
    expect(body(out).shopping_lists).toEqual([{ id: 2, name: 'Costco' }]);
  });

  it('creates a food with shopping_list_ids [] without a list PATCH', async () => {
    const sent = stubTandoor({ ...noSuchFood, 'POST /api/food/': milk });
    await handleCreateFood(client(), { name: 'Milk', shopping_list_ids: [] });
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([{ method: 'POST', path: '/api/food/', body: { name: 'Milk' } }]);
  });

  it('refuses shopping_list_ids [] on a food that already has the name, and writes nothing', async () => {
    const sent = stubTandoor({ 'GET /api/food/?query=Milk&page=1&page_size=100': page([{ ...milk, id: 9, name: 'milk', shopping_lists: [costco] }]) });
    await expect(handleCreateFood(client(), { name: 'Milk', shopping_list_ids: [] })).rejects.toThrow(
      new Error('A food named milk already exists (id 9); use update_food to change its lists.'),
    );
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([]);
  });

  it('reports a food created without lists when the list PATCH fails', async () => {
    stubTandoor({
      ...listPages,
      ...noSuchFood,
      'POST /api/food/': milk,
      'PATCH /api/food/1/': { status: 400, body: { shopping_lists: ['bad'] } },
    });
    await expect(handleCreateFood(client(), { name: 'Milk', shopping_list_ids: [2] })).rejects.toThrow(
      /^Food 1 was created without shopping lists; setting its lists failed: Tandoor API error: 400/,
    );
  });

  it('rejects unknown list ids before creating the food', async () => {
    const sent = stubTandoor(listPages);
    await expect(handleCreateFood(client(), { name: 'Milk', shopping_list_ids: [999, 1000] })).rejects.toThrow(unknownListError);
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([]);
  });

  it('replaces the lists of a food, and [] clears them', async () => {
    const sent = stubTandoor({ 'PATCH /api/food/1/': milk });
    await handleUpdateFood(client(), { id: 1, shopping_list_ids: [] });
    expect(sent).toEqual([{ method: 'PATCH', path: '/api/food/1/', body: { shopping_lists: [] } }]);
  });

  it('rejects unknown list ids before updating the food', async () => {
    const sent = stubTandoor(listPages);
    await expect(handleUpdateFood(client(), { id: 1, name: 'Oat milk', shopping_list_ids: [2, 999, 1000] })).rejects.toThrow(unknownListError);
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([]);
  });
});

describe('food_batch_update lists', () => {
  it('adds lists to many foods after checking the ids', async () => {
    const sent = stubTandoor({ ...listPages, 'PUT /api/food/batch_update/': {} });
    await handleFoodBatchUpdate(client(), { foods: [1, 2], shopping_lists_add: [3] });
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      'GET /api/shopping-list/?page=1&page_size=100', 'GET /api/shopping-list/?page=2&page_size=100', 'PUT /api/food/batch_update/',
    ]);
    expect(sent.at(-1)).toEqual({ method: 'PUT', path: '/api/food/batch_update/', body: { foods: [1, 2], shopping_lists_add: [3] } });
  });

  it('rejects unknown list ids and sends no batch update', async () => {
    const sent = stubTandoor(listPages);
    await expect(handleFoodBatchUpdate(client(), { foods: [1], shopping_lists_remove: [999, 1000] })).rejects.toThrow(unknownListError);
    expect(sent.filter((s) => s.method !== 'GET')).toEqual([]);
  });

  it.each([
    [{ shopping_lists_set: [2], shopping_lists_remove: [3] }, 'Only shopping_lists_add and shopping_lists_remove can be combined'],
    [{ shopping_lists_set: [] }, 'shopping_lists_set: [] does nothing in Tandoor'],
  ])('rejects %o and sends nothing', async (ops, message) => {
    const sent = stubTandoor({});
    await expect(handleFoodBatchUpdate(client(), { foods: [1], ...ops })).rejects.toThrow(message);
    expect(sent).toEqual([]);
  });

  it('leaves a batch update without list changes unchecked against the lists', async () => {
    const sent = stubTandoor({ 'PUT /api/food/batch_update/': {} });
    await handleFoodBatchUpdate(client(), { foods: [1], on_hand: true });
    expect(sent).toEqual([{ method: 'PUT', path: '/api/food/batch_update/', body: { foods: [1], on_hand: true } }]);
  });
});

describe('move_food and merge_food replies', () => {
  it('returns Tandoor\'s move message as is', async () => {
    const msg = { msg: 'Eggs was moved successfully to parent Dairy' };
    stubTandoor({ 'PUT /api/food/5/move/4/': msg });
    expect(await handleMoveFood(client(), { id: 5, parent: 4 })).toBe(`Food 5 moved under parent 4.\n\n${JSON.stringify(msg)}`);
  });

  it('returns Tandoor\'s merge message as is', async () => {
    const msg = { msg: 'Eggs was merged successfully with Egg' };
    stubTandoor({ 'PUT /api/food/7/merge/3/': msg });
    expect(await handleMergeFood(client(), { id: 7, target: 3 })).toBe(`Food 7 merged into 3.\n\n${JSON.stringify(msg)}`);
  });
});

describe('repeated shopping list ids', () => {
  const entries = [{ amount: 1, food_id: 1, unit_id: null, ingredient_id: null }];
  const repeated = (field: string) => `These shopping list ids appear more than once in ${field}: 2, 3.`;

  it.each([
    ['create_shopping_entry', () => handleCreateShoppingEntry(client(), { amount: 1, food_id: 1, shopping_list_ids: [2, 3, 2, 3, 2] })],
    ['update_shopping_entry', () => handleUpdateShoppingEntry(client(), { id: 7, shopping_list_ids: [2, 3, 2, 3] })],
    ['create_food', () => handleCreateFood(client(), { name: 'Milk', shopping_list_ids: [3, 2, 3, 2] })],
    ['update_food', () => handleUpdateFood(client(), { id: 1, shopping_list_ids: [2, 2, 3, 3] })],
    ['bulk_create_shopping_list_recipe_entries', () => handleBulkCreateShoppingListRecipeEntries(client(), { id: 4, entries, shopping_list_ids: [2, 3, 3, 2] })],
  ])('%s rejects repeated shopping_list_ids and sends nothing', async (_tool, run) => {
    const sent = stubTandoor({});
    await expect(run()).rejects.toThrow(repeated('shopping_list_ids'));
    expect(sent).toEqual([]);
  });

  it.each(['shopping_lists_add', 'shopping_lists_remove', 'shopping_lists_set'])('rejects repeated ids in %s and sends nothing', async (field) => {
    const sent = stubTandoor({});
    await expect(handleBulkUpdateShoppingEntries(client(), { ids: [7], [field]: [2, 3, 2, 3] })).rejects.toThrow(repeated(field));
    await expect(handleFoodBatchUpdate(client(), { foods: [1], [field]: [2, 3, 2, 3] })).rejects.toThrow(repeated(field));
    expect(sent).toEqual([]);
  });
});

describe('ids in both shopping_lists_add and shopping_lists_remove', () => {
  it('is rejected by name, and nothing is sent', async () => {
    const sent = stubTandoor({});
    const message = 'These shopping list ids are in both shopping_lists_add and shopping_lists_remove: 2, 3.';
    await expect(handleBulkUpdateShoppingEntries(client(), { ids: [7], shopping_lists_add: [3, 2, 4], shopping_lists_remove: [2, 3] })).rejects.toThrow(message);
    await expect(handleFoodBatchUpdate(client(), { foods: [1], shopping_lists_add: [2, 3], shopping_lists_remove: [5, 3, 2] })).rejects.toThrow(message);
    expect(sent).toEqual([]);
  });
});

describe('empty shopping_lists_add and shopping_lists_remove', () => {
  it('are not sent and do not count as a list change', async () => {
    const sent = stubTandoor({ ...listPages, 'POST /api/shopping-list-entry/bulk/': {}, 'PUT /api/food/batch_update/': {} });
    await handleBulkUpdateShoppingEntries(client(), { ids: [7], checked: true, shopping_lists_add: [] });
    await handleBulkUpdateShoppingEntries(client(), { ids: [7], shopping_lists_remove: [], shopping_lists_set: [2] });
    await handleFoodBatchUpdate(client(), { foods: [1], on_hand: true, shopping_lists_add: [], shopping_lists_remove: [] });
    expect(sent.filter((s) => s.method !== 'GET').map((s) => s.body)).toEqual([
      { ids: [7], checked: true },
      { ids: [7], shopping_lists_set: [2] },
      { foods: [1], on_hand: true },
    ]);
  });
});

describe('create_shopping_entry with shopping_list_ids []', () => {
  it('clears the lists Tandoor copied from the food with a PATCH that keeps checked', async () => {
    const sent = stubTandoor({
      'POST /api/shopping-list-entry/': entry({ checked: true, shopping_lists: [aldi] }),
      'PATCH /api/shopping-list-entry/7/': entry({ checked: true, shopping_lists: [] }),
    });
    const out = await handleCreateShoppingEntry(client(), { amount: 1, food_id: 1, checked: true, shopping_list_ids: [] });
    expect(sent.map((s) => [s.method, s.body])).toEqual([
      ['POST', { amount: 1, food: 1, unit: null, checked: true, shopping_lists: [] }],
      ['PATCH', { shopping_lists: [], checked: true }],
    ]);
    expect(body(out).shopping_lists).toEqual([]);
  });

  it('says the entry was created when clearing its lists fails', async () => {
    stubTandoor({
      'POST /api/shopping-list-entry/': entry({ shopping_lists: [aldi] }),
      'PATCH /api/shopping-list-entry/7/': { status: 400, body: { detail: 'bad' } },
    });
    await expect(handleCreateShoppingEntry(client(), { amount: 1, food_id: 1, shopping_list_ids: [] })).rejects.toThrow(
      /^Shopping entry 7 was created, possibly with its food's shopping lists; clearing its lists failed: Tandoor API error: 400/,
    );
  });
});

describe('lists Tandoor did not apply', () => {
  const milk = { id: 1, name: 'Milk', properties: [], shopping_lists: [costco] };
  const noSuchFood = { 'GET /api/food/?query=Milk&page=1&page_size=100': page([]) };

  it.each([
    ['create_food', 'Food 1 was created', ' Do not retry; use update_food on id 1.', { ...noSuchFood, 'POST /api/food/': { ...milk, shopping_lists: [] }, 'PATCH /api/food/1/': milk },
      () => handleCreateFood(client(), { name: 'Milk', shopping_list_ids: [2, 3] })],
    ['update_food', 'Food 1 was updated', '', { 'PATCH /api/food/1/': milk },
      () => handleUpdateFood(client(), { id: 1, shopping_list_ids: [2, 3] })],
    ['create_shopping_entry', 'Shopping entry 7 was created', ' Do not retry; use update_shopping_entry on id 7.', { 'POST /api/shopping-list-entry/': entry() },
      () => handleCreateShoppingEntry(client(), { amount: 1, food_id: 1, shopping_list_ids: [2, 3] })],
    ['update_shopping_entry', 'Shopping entry 7 was updated', '', { 'PATCH /api/shopping-list-entry/7/': entry() },
      () => handleUpdateShoppingEntry(client(), { id: 7, checked: false, shopping_list_ids: [2, 3] })],
  ])('%s names the requested lists missing after the write', async (_tool, done, advice, routes, run) => {
    stubTandoor({ ...listPages, ...routes });
    await expect(run()).rejects.toThrow(new Error(`${done}, but Tandoor did not put it on these shopping lists: 3.${advice}`));
  });

  it.each([
    ['update_food', 'Food 1 was updated', '', { 'PATCH /api/food/1/': { ...milk, shopping_lists: [costco, aldi] } },
      () => handleUpdateFood(client(), { id: 1, shopping_list_ids: [] })],
    ['create_shopping_entry', 'Shopping entry 7 was created', ' Do not retry; use update_shopping_entry on id 7.', {
      'POST /api/shopping-list-entry/': entry({ shopping_lists: [costco] }),
      'PATCH /api/shopping-list-entry/7/': entry({ shopping_lists: [costco, aldi] }),
    }, () => handleCreateShoppingEntry(client(), { amount: 1, food_id: 1, shopping_list_ids: [] })],
    ['update_shopping_entry', 'Shopping entry 7 was updated', '', { 'PATCH /api/shopping-list-entry/7/': entry({ shopping_lists: [costco, aldi] }) },
      () => handleUpdateShoppingEntry(client(), { id: 7, checked: false, shopping_list_ids: [] })],
  ])('%s names lists Tandoor added that were not requested', async (_tool, done, advice, routes, run) => {
    stubTandoor({ ...listPages, ...routes });
    await expect(run()).rejects.toThrow(new Error(`${done}, but Tandoor also put it on these shopping lists: 2, 3.${advice}`));
  });

  it('names both the missing and the extra lists', async () => {
    stubTandoor({ ...listPages, 'PATCH /api/shopping-list-entry/7/': entry({ shopping_lists: [costco] }) });
    await expect(handleUpdateShoppingEntry(client(), { id: 7, checked: false, shopping_list_ids: [3] })).rejects.toThrow(
      new Error('Shopping entry 7 was updated, but Tandoor did not put it on these shopping lists: 3; Tandoor also put it on these shopping lists: 2.'),
    );
  });
});

describe('update_food with failed property deletes and missing lists', () => {
  it('reports both in one error', async () => {
    const withFat = { id: 1, name: 'Milk', properties: [{ id: 11, property_amount: 1, property_type: { id: 1, name: 'fat' } }], shopping_lists: [] };
    stubTandoor({
      ...listPages,
      'GET /api/food/1/': withFat,
      'PATCH /api/food/1/': { ...withFat, properties: [], shopping_lists: [costco] },
      'DELETE /api/property/11/': { status: 400, body: { detail: 'locked' } },
    });
    await expect(handleUpdateFood(client(), { id: 1, remove_property_type_ids: [1], shopping_list_ids: [2, 3] })).rejects.toThrow(
      /^Food updated, but these property rows could not be deleted:\nproperty row 11: Tandoor API error: 400[^]*\nAlso, Tandoor did not put it on these shopping lists: 3\.$/,
    );
  });
});

describe('post-write errors on create tools', () => {
  const noSuchFood = { 'GET /api/food/?query=Milk&page=1&page_size=100': page([]) };
  const milk = { id: 1, name: 'Milk', properties: [], shopping_lists: [] };

  it.each([
    ['create_food, list PATCH fails', 'Do not retry; use update_food on id 1.',
      { ...noSuchFood, 'POST /api/food/': milk, 'PATCH /api/food/1/': { status: 400, body: { detail: 'bad' } } },
      () => handleCreateFood(client(), { name: 'Milk', shopping_list_ids: [2] })],
    ['create_food, lists do not match', 'Do not retry; use update_food on id 1.',
      { ...noSuchFood, 'POST /api/food/': milk, 'PATCH /api/food/1/': milk },
      () => handleCreateFood(client(), { name: 'Milk', shopping_list_ids: [2] })],
    ['create_shopping_entry, clearing fails', 'Do not retry; use update_shopping_entry on id 7.',
      { 'POST /api/shopping-list-entry/': entry({ shopping_lists: [aldi] }), 'PATCH /api/shopping-list-entry/7/': { status: 400, body: { detail: 'bad' } } },
      () => handleCreateShoppingEntry(client(), { amount: 1, food_id: 1, shopping_list_ids: [] })],
    ['create_shopping_entry, lists do not match', 'Do not retry; use update_shopping_entry on id 7.',
      { 'POST /api/shopping-list-entry/': entry({ shopping_lists: [] }) },
      () => handleCreateShoppingEntry(client(), { amount: 1, food_id: 1, shopping_list_ids: [2] })],
  ])('%s says not to retry', async (_case, advice, routes, run) => {
    stubTandoor({ ...listPages, ...routes });
    await expect(run()).rejects.toThrow(new RegExp(`${advice.replace(/[.]/g, '\\.')}$`));
  });
});

describe('food_batch_update with nothing to change', () => {
  it.each([
    [{ shopping_lists_add: [] }],
    [{ shopping_lists_add: [], shopping_lists_remove: [] }],
    [{ shopping_lists_remove_all: false }],
  ])('rejects %o and sends nothing', async (ops) => {
    const sent = stubTandoor({});
    await expect(handleFoodBatchUpdate(client(), { foods: [1], ...ops })).rejects.toThrow('Give a field to change, a list change, or both.');
    expect(sent).toEqual([]);
  });
});
