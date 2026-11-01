import { describe, it, expect, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { TandoorClient } from '../src/clients/index.js';
import { addInventoryItemShape, updateInventoryEntryShape } from '../src/tools/inventory.js';
import {
  handleListInventoryLocations,
  handleGetInventoryLocation,
  handleCreateInventoryLocation,
  handleUpdateInventoryLocation,
  handleDeleteInventoryLocation,
  handleListInventoryEntries,
  handleGetInventoryEntry,
  handleAddInventoryItem,
  handleUpdateInventoryEntry,
  handleDeleteInventoryEntry,
} from '../src/handlers/inventory.js';

type Sent = { method: string; path: string; body?: unknown };

function stubTandoor(routes: Record<string, unknown>): Sent[] {
  const sent: Sent[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const u = new URL(String(url));
    const method = init?.method ?? 'GET';
    const path = u.pathname + u.search;
    sent.push({ method, path, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    const key = `${method} ${path}`;
    if (!(key in routes)) throw new Error(`unstubbed request ${key}`);
    const body = routes[key];
    if (body === undefined) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return sent;
}

const client = () => new TandoorClient({ url: 'https://tandoor.test', token: 't' });

const household = { id: 4, name: 'Home', created_at: 't', updated_at: 't' };
const freezer = { id: 2, name: 'Freezer', is_freezer: true, household };
const slimFreezer = { id: 2, name: 'Freezer', is_freezer: true, household: 'Home' };

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    inventory_location: freezer,
    sub_location: 'top drawer',
    code: '11',
    food: { id: 5, name: 'peas', food_onhand: false },
    unit: { id: 3, name: 'g' },
    amount: 400,
    expires: '2027-01-31',
    note: null,
    label: '#11 - 400 (g) peas',
    created_at: 't',
    created_by: 1,
    ...overrides,
  };
}

const slimEntry = {
  id: 11,
  food: 'peas',
  food_id: 5,
  amount: 400,
  unit: 'g',
  unit_id: 3,
  location: 'Freezer',
  location_id: 2,
  is_freezer: true,
  sub_location: 'top drawer',
  expires: '2027-01-31',
  note: null,
  code: '11',
};

function userSpace(overrides: Record<string, unknown>) {
  return { id: 1, user: { id: 1 }, space: 1, groups: [], household: null, active: false, ...overrides };
}

afterEach(() => vi.restoreAllMocks());

describe('inventory locations', () => {
  it('lists locations with paging, slimmed to id, name, is_freezer and household name', async () => {
    stubTandoor({
      'GET /api/inventory-location/?page=2&page_size=5': { count: 6, next: null, previous: 'p', results: [freezer] },
    });
    const out = await handleListInventoryLocations(client(), { page: 2, page_size: 5 });
    expect(JSON.parse(out)).toEqual({ count: 6, next: null, previous: 'p', results: [slimFreezer] });
  });

  it('gets a location slim by default and raw with format full', async () => {
    stubTandoor({ 'GET /api/inventory-location/2/': freezer });
    expect(JSON.parse(await handleGetInventoryLocation(client(), { id: 2 }))).toEqual(slimFreezer);
    expect(JSON.parse(await handleGetInventoryLocation(client(), { id: 2, format: 'full' }))).toEqual(freezer);
  });

  it('creates a location in the household of the active user-space, sent as a bare id', async () => {
    const sent = stubTandoor({
      'GET /api/user-space/all_personal/': [
        userSpace({ id: 8, space: 3, household: { id: 9, name: 'Other' } }),
        userSpace({ id: 1, active: true, household }),
      ],
      'POST /api/inventory-location/': freezer,
    });
    const out = await handleCreateInventoryLocation(client(), { name: 'Freezer', is_freezer: true });
    expect(sent.at(-1)).toEqual({
      method: 'POST',
      path: '/api/inventory-location/',
      body: { name: 'Freezer', is_freezer: true, household: 4 },
    });
    expect(out).toBe(`Inventory location created.\n\n${JSON.stringify(slimFreezer)}`);
  });

  it('refuses to create a location when the active user-space has no household, and sends no POST', async () => {
    const sent = stubTandoor({
      'GET /api/user-space/all_personal/': [userSpace({ active: true, household: null })],
    });
    await expect(handleCreateInventoryLocation(client(), { name: 'Pantry' })).rejects.toThrow(
      'You are not in a household in this space. Assign yourself to a household in Tandoor, then retry.',
    );
    expect(sent.filter((s) => s.method === 'POST')).toEqual([]);
  });

  it('updates only the provided fields and refuses an empty update', async () => {
    const sent = stubTandoor({ 'PATCH /api/inventory-location/2/': { ...freezer, name: 'Chest' } });
    const out = await handleUpdateInventoryLocation(client(), { id: 2, name: 'Chest' });
    expect(sent).toEqual([{ method: 'PATCH', path: '/api/inventory-location/2/', body: { name: 'Chest' } }]);
    expect(out).toBe(`Inventory location updated.\n\n${JSON.stringify({ ...slimFreezer, name: 'Chest' })}`);
    await expect(handleUpdateInventoryLocation(client(), { id: 2 })).rejects.toThrow('At least one field required');
  });

  it('deletes a location', async () => {
    const sent = stubTandoor({ 'DELETE /api/inventory-location/2/': undefined });
    expect(await handleDeleteInventoryLocation(client(), { id: 2 })).toBe('Inventory location 2 deleted.');
    expect(sent).toEqual([{ method: 'DELETE', path: '/api/inventory-location/2/' }]);
  });
});

describe('inventory entries', () => {
  it('lists entries filtered by location, food and code, slimmed, without the empty key by default', async () => {
    const sent = stubTandoor({
      'GET /api/inventory-entry/?inventory_location_id=2&food_id=5&code=11&page=1&page_size=20': {
        count: 1, next: null, previous: null, results: [entry()],
      },
    });
    const out = await handleListInventoryEntries(client(), { location_id: 2, food_id: 5, code: '11', page: 1, page_size: 20 });
    expect(JSON.parse(out)).toEqual({ count: 1, next: null, previous: null, results: [slimEntry] });
    expect(sent).toHaveLength(1);
  });

  it('sends empty=true only when include_empty is true, and omits the key when it is false', async () => {
    const page = { count: 0, next: null, previous: null, results: [] };
    const sent = stubTandoor({ 'GET /api/inventory-entry/?empty=true': page, 'GET /api/inventory-entry/': page });
    await handleListInventoryEntries(client(), { include_empty: true });
    await handleListInventoryEntries(client(), { include_empty: false });
    expect(sent.map((s) => s.path)).toEqual(['/api/inventory-entry/?empty=true', '/api/inventory-entry/']);
  });

  it('gets an entry slim by default and raw with format full', async () => {
    stubTandoor({ 'GET /api/inventory-entry/11/': entry() });
    expect(JSON.parse(await handleGetInventoryEntry(client(), { id: 11 }))).toEqual(slimEntry);
    expect(JSON.parse(await handleGetInventoryEntry(client(), { id: 11, format: 'full' }))).toEqual(entry());
  });

  it('adds an item as a new entry with bare ids for food, unit and location', async () => {
    const sent = stubTandoor({ 'POST /api/inventory-entry/': entry() });
    const out = await handleAddInventoryItem(client(), {
      food_id: 5, unit_id: 3, amount: 400, location_id: 2,
      expires: '2027-01-31', sub_location: 'top drawer', note: 'bag', code: 'X1',
    });
    expect(sent).toEqual([{
      method: 'POST',
      path: '/api/inventory-entry/',
      body: {
        food: 5, unit: 3, amount: 400, inventory_location: 2,
        expires: '2027-01-31', sub_location: 'top drawer', note: 'bag', code: 'X1',
      },
    }]);
    expect(out).toBe(`Inventory item added.\n\n${JSON.stringify(slimEntry)}`);
  });

  it('rejects add amounts at or below zero and expiry that is not YYYY-MM-DD', () => {
    const add = z.object(addInventoryItemShape);
    const ok = { food_id: 5, unit_id: 3, amount: 1, location_id: 2 };
    expect(add.safeParse(ok).success).toBe(true);
    expect(add.safeParse({ ...ok, amount: 0 }).success).toBe(false);
    expect(add.safeParse({ ...ok, amount: -1 }).success).toBe(false);
    expect(add.safeParse({ ...ok, expires: '2027-01-31T10:00:00Z' }).success).toBe(false);
    expect(add.safeParse({ food_id: 5, amount: 1, location_id: 2 }).success).toBe(false);
  });

  it('update allows amount 0 but not negative, and null clears expires', () => {
    const update = z.object(updateInventoryEntryShape);
    expect(update.safeParse({ id: 11, amount: 0 }).success).toBe(true);
    expect(update.safeParse({ id: 11, amount: -1 }).success).toBe(false);
    expect(update.safeParse({ id: 11, expires: null }).success).toBe(true);
    expect(update.safeParse({ id: 11, expires: '31/01/2027' }).success).toBe(false);
  });

  it('updates only the provided fields as bare ids, passes nulls through, and refuses an empty update', async () => {
    const sent = stubTandoor({ 'PATCH /api/inventory-entry/11/': entry({ expires: null }) });
    const out = await handleUpdateInventoryEntry(client(), { id: 11, unit_id: 3, location_id: 2, expires: null, note: null });
    expect(sent).toEqual([{
      method: 'PATCH',
      path: '/api/inventory-entry/11/',
      body: { unit: 3, inventory_location: 2, expires: null, note: null },
    }]);
    expect(out).toBe(`Inventory entry updated.\n\n${JSON.stringify({ ...slimEntry, expires: null })}`);
    await expect(handleUpdateInventoryEntry(client(), { id: 11 })).rejects.toThrow('At least one field required');
  });

  it('deletes an entry', async () => {
    const sent = stubTandoor({ 'DELETE /api/inventory-entry/11/': undefined });
    expect(await handleDeleteInventoryEntry(client(), { id: 11 })).toBe('Inventory entry 11 deleted.');
    expect(sent).toEqual([{ method: 'DELETE', path: '/api/inventory-entry/11/' }]);
  });
});
