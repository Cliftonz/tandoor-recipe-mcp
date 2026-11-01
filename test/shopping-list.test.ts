import { describe, it, expect, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { TandoorClient } from '../src/clients/index.js';
import { createShoppingListShape, updateShoppingListShape } from '../src/tools/shopping.js';
import {
  handleListShoppingLists,
  handleGetShoppingList,
  handleCreateShoppingList,
  handleUpdateShoppingList,
  handleDeleteShoppingList,
  handleGetShoppingEntry,
} from '../src/handlers/shopping.js';

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

const body = (out: string) => JSON.parse(out.slice(out.search(/[[{]/)));

afterEach(() => vi.restoreAllMocks());

describe('shopping list tools', () => {
  it('lists shopping lists with paging', async () => {
    stubTandoor({ 'GET /api/shopping-list/?page=2&page_size=5': { count: 6, next: null, previous: 'p', timestamp: 't', results: [costco] } });
    const out = await handleListShoppingLists(client(), { page: 2, page_size: 5 });
    expect(JSON.parse(out)).toEqual({ count: 6, next: null, previous: 'p', results: [costco] });
  });

  it('gets a shopping list by id', async () => {
    stubTandoor({ 'GET /api/shopping-list/2/': costco });
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
