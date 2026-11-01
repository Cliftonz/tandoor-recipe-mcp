import { describe, it, expect, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { TandoorClient } from '../src/clients/index.js';
import { addInventoryItemShape, updateInventoryEntryShape, consumeInventoryItemShape } from '../src/tools/inventory.js';
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
  handleConsumeInventoryItem,
  handleMoveInventoryItem,
  handleListInventoryLogs,
  handleGetInventoryLog,
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

describe('consume_inventory_item', () => {
  const patches = (sent: Sent[]) => sent.filter((s) => s.method !== 'GET');

  it('reads the entry by id and PATCHes the reduced amount', async () => {
    const sent = stubTandoor({
      'GET /api/inventory-entry/11/': entry(),
      'PATCH /api/inventory-entry/11/': entry({ amount: 150 }),
    });
    const out = await handleConsumeInventoryItem(client(), { entry_id: 11, amount: 250 });
    expect(patches(sent)).toEqual([{ method: 'PATCH', path: '/api/inventory-entry/11/', body: { amount: 150 } }]);
    expect(out).toBe(`Inventory item consumed.\n\n${JSON.stringify({ ...slimEntry, amount: 150 })}`);
  });

  it('rounds the new amount to the 16 decimal places Tandoor stores', async () => {
    const sent = stubTandoor({
      'GET /api/inventory-entry/11/': entry({ amount: 0.3 }),
      'PATCH /api/inventory-entry/11/': entry({ amount: 0.2 }),
    });
    await handleConsumeInventoryItem(client(), { entry_id: 11, amount: 0.1 });
    expect(patches(sent)).toEqual([{ method: 'PATCH', path: '/api/inventory-entry/11/', body: { amount: 0.2 } }]);
  });

  it('clamps at zero, keeps the entry, and warns with requested and consumed amounts', async () => {
    const sent = stubTandoor({
      'GET /api/inventory-entry/11/': entry({ amount: 3 }),
      'PATCH /api/inventory-entry/11/': entry({ amount: 0 }),
    });
    const out = await handleConsumeInventoryItem(client(), { entry_id: 11, amount: 5 });
    expect(patches(sent)).toEqual([{ method: 'PATCH', path: '/api/inventory-entry/11/', body: { amount: 0 } }]);
    const warning = 'Warning: requested 5 g of peas but only 3 were on hand; consumed 3, amount is now 0.';
    expect(out).toBe(`${warning}\n\n${JSON.stringify({ ...slimEntry, amount: 0, warning, requested: 5, consumed: 3 })}`);
  });

  it('all: true consumes the whole amount without a warning', async () => {
    const sent = stubTandoor({
      'GET /api/inventory-entry/11/': entry(),
      'PATCH /api/inventory-entry/11/': entry({ amount: 0 }),
    });
    const out = await handleConsumeInventoryItem(client(), { entry_id: 11, all: true });
    expect(patches(sent)).toEqual([{ method: 'PATCH', path: '/api/inventory-entry/11/', body: { amount: 0 } }]);
    expect(out).toBe(`Inventory item consumed.\n\n${JSON.stringify({ ...slimEntry, amount: 0 })}`);
  });

  it('finds the single entry for a food at a location', async () => {
    const sent = stubTandoor({
      'GET /api/inventory-entry/?food_id=5&inventory_location_id=2': { count: 1, next: null, previous: null, results: [entry()] },
      'PATCH /api/inventory-entry/11/': entry({ amount: 399 }),
    });
    await handleConsumeInventoryItem(client(), { food_id: 5, location_id: 2, amount: 1 });
    expect(patches(sent)).toEqual([{ method: 'PATCH', path: '/api/inventory-entry/11/', body: { amount: 399 } }]);
  });

  it('lists the candidates and changes nothing when the food has several entries', async () => {
    const pantry = { id: 7, name: 'Pantry', is_freezer: false, household };
    const sent = stubTandoor({
      'GET /api/inventory-entry/?food_id=5': {
        count: 2, next: null, previous: null,
        results: [entry(), entry({ id: 12, inventory_location: pantry, amount: 50, expires: null })],
      },
    });
    await expect(handleConsumeInventoryItem(client(), { food_id: 5, amount: 1 })).rejects.toThrow(
      'Food 5 has 2 inventory entries; pass entry_id. Candidates: ' + JSON.stringify([
        slimEntry,
        { ...slimEntry, id: 12, location: 'Pantry', location_id: 7, is_freezer: false, amount: 50, expires: null },
      ]),
    );
    expect(patches(sent)).toEqual([]);
  });

  it('says how many candidates it shows when the matches span more than one page', async () => {
    stubTandoor({
      'GET /api/inventory-entry/?food_id=5': { count: 30, next: 'n', previous: null, results: [entry(), entry({ id: 12 })] },
    });
    await expect(handleConsumeInventoryItem(client(), { food_id: 5, amount: 1 })).rejects.toThrow(
      'Food 5 has 30 inventory entries; pass entry_id. Candidates (showing 2 of 30): ' +
        JSON.stringify([slimEntry, { ...slimEntry, id: 12 }]),
    );
  });

  it('errors when the food has no entry', async () => {
    stubTandoor({ 'GET /api/inventory-entry/?food_id=5&inventory_location_id=2': { count: 0, next: null, previous: null, results: [] } });
    await expect(handleConsumeInventoryItem(client(), { food_id: 5, location_id: 2, amount: 1 })).rejects.toThrow(
      'Food 5 has no inventory entry at location 2.',
    );
  });

  it('rejects a unit that differs from the entry unit and names the entry unit', async () => {
    const sent = stubTandoor({ 'GET /api/inventory-entry/11/': entry() });
    await expect(handleConsumeInventoryItem(client(), { entry_id: 11, amount: 1, unit_id: 4 })).rejects.toThrow(
      'Entry 11 is stored in g (unit_id 3); consume in that unit. Unit conversion is not supported.',
    );
    expect(patches(sent)).toEqual([]);
  });

  it('accepts a unit_id equal to the entry unit', async () => {
    stubTandoor({ 'GET /api/inventory-entry/11/': entry(), 'PATCH /api/inventory-entry/11/': entry({ amount: 399 }) });
    await expect(handleConsumeInventoryItem(client(), { entry_id: 11, amount: 1, unit_id: 3 })).resolves.toContain('consumed');
  });

  it('requires exactly one of entry_id or food_id, and exactly one of amount or all', async () => {
    const sent = stubTandoor({});
    await expect(handleConsumeInventoryItem(client(), { amount: 1 })).rejects.toThrow('Give exactly one of entry_id or food_id.');
    await expect(handleConsumeInventoryItem(client(), { entry_id: 11, food_id: 5, amount: 1 })).rejects.toThrow('Give exactly one of entry_id or food_id.');
    await expect(handleConsumeInventoryItem(client(), { entry_id: 11 })).rejects.toThrow('Give exactly one of amount or all: true.');
    await expect(handleConsumeInventoryItem(client(), { entry_id: 11, amount: 1, all: true })).rejects.toThrow('Give exactly one of amount or all: true.');
    expect(sent).toEqual([]);
  });

  it('rejects location_id together with entry_id without sending a request', async () => {
    const sent = stubTandoor({});
    await expect(handleConsumeInventoryItem(client(), { entry_id: 11, location_id: 2, amount: 1 })).rejects.toThrow(
      'location_id narrows food_id; omit it with entry_id.',
    );
    expect(sent).toEqual([]);
  });

  it('rejects amounts at or below zero at the schema', () => {
    const consume = z.object(consumeInventoryItemShape);
    expect(consume.safeParse({ entry_id: 11, amount: 0.5 }).success).toBe(true);
    expect(consume.safeParse({ entry_id: 11, amount: 0 }).success).toBe(false);
    expect(consume.safeParse({ entry_id: 11, amount: -2 }).success).toBe(false);
    expect(consume.safeParse({ entry_id: 11, all: false }).success).toBe(false);
  });
});

describe('move_inventory_item', () => {
  const pantry = { id: 7, name: 'Pantry', is_freezer: false, household };
  const writes = (sent: Sent[]) => sent.filter((s) => s.method !== 'GET');

  it('PATCHes the new location and reports where the entry came from', async () => {
    const sent = stubTandoor({
      'GET /api/inventory-entry/11/': entry(),
      'PATCH /api/inventory-entry/11/': entry({ inventory_location: pantry }),
    });
    const out = await handleMoveInventoryItem(client(), { entry_id: 11, to_location_id: 7 });
    expect(writes(sent)).toEqual([{ method: 'PATCH', path: '/api/inventory-entry/11/', body: { inventory_location: 7 } }]);
    const moved = { ...slimEntry, location: 'Pantry', location_id: 7, is_freezer: false, from_location: 'Freezer' };
    expect(out).toBe(`Inventory item moved.\n\n${JSON.stringify(moved)}`);
  });

  it('sends sub_location with the move, and null clears it', async () => {
    const sent = stubTandoor({
      'GET /api/inventory-entry/11/': entry(),
      'PATCH /api/inventory-entry/11/': entry({ inventory_location: pantry, sub_location: null }),
    });
    await handleMoveInventoryItem(client(), { entry_id: 11, to_location_id: 7, sub_location: null });
    expect(writes(sent)).toEqual([{
      method: 'PATCH', path: '/api/inventory-entry/11/', body: { inventory_location: 7, sub_location: null },
    }]);
  });

  it('succeeds without writing when the entry is already in the target location and no sub_location is given', async () => {
    const sent = stubTandoor({ 'GET /api/inventory-entry/11/': entry() });
    const out = await handleMoveInventoryItem(client(), { entry_id: 11, to_location_id: 2 });
    expect(out).toBe('Inventory item 11 is already in Freezer.');
    expect(writes(sent)).toEqual([]);
  });

  it('PATCHes only sub_location when the location is unchanged', async () => {
    const sent = stubTandoor({
      'GET /api/inventory-entry/11/': entry(),
      'PATCH /api/inventory-entry/11/': entry({ sub_location: 'door' }),
    });
    const out = await handleMoveInventoryItem(client(), { entry_id: 11, to_location_id: 2, sub_location: 'door' });
    expect(writes(sent)).toEqual([{ method: 'PATCH', path: '/api/inventory-entry/11/', body: { sub_location: 'door' } }]);
    expect(JSON.parse(out.split('\n\n')[1])).toMatchObject({ sub_location: 'door', from_location: 'Freezer' });
  });
});

describe('inventory logs', () => {
  const pantry = { id: 7, name: 'Pantry', is_freezer: false, household };
  const log = {
    id: 30,
    entry: entry(),
    booking_type: 'move',
    old_amount: 400,
    new_amount: 400,
    old_inventory_location: freezer,
    new_inventory_location: pantry,
    note: null,
    created_at: '2026-11-01T10:00:00Z',
  };
  const slimLog = {
    id: 30, entry_id: 11, food: 'peas', booking_type: 'move', old_amount: 400, new_amount: 400,
    old_location: 'Freezer', new_location: 'Pantry', note: null, created_at: '2026-11-01T10:00:00Z',
  };

  it('lists logs filtered by entry and food, slimmed', async () => {
    stubTandoor({
      'GET /api/inventory-log/?entry_id=11&food_id=5&page=1&page_size=10': { count: 1, next: null, previous: null, results: [log] },
    });
    const out = await handleListInventoryLogs(client(), { entry_id: 11, food_id: 5, page: 1, page_size: 10 });
    expect(JSON.parse(out)).toEqual({ count: 1, next: null, previous: null, results: [slimLog] });
  });

  it('gets a log slim by default and raw with format full', async () => {
    stubTandoor({ 'GET /api/inventory-log/30/': log });
    expect(JSON.parse(await handleGetInventoryLog(client(), { id: 30 }))).toEqual(slimLog);
    expect(JSON.parse(await handleGetInventoryLog(client(), { id: 30, format: 'full' }))).toEqual(log);
  });
});

describe('format full returns the raw Tandoor object', () => {
  const page = (results: unknown[]) => ({ count: results.length, next: null, previous: null, results });
  const body = (out: string) => JSON.parse(out.slice(out.indexOf('{')));
  const log = {
    id: 30, entry: entry(), booking_type: 'add', old_amount: 0, new_amount: 400,
    old_inventory_location: freezer, new_inventory_location: freezer, note: null, created_at: 't',
  };

  it('on the list tools', async () => {
    stubTandoor({
      'GET /api/inventory-location/': page([freezer]),
      'GET /api/inventory-entry/': page([entry()]),
      'GET /api/inventory-log/': page([log]),
    });
    expect(JSON.parse(await handleListInventoryLocations(client(), { format: 'full' }))).toEqual(page([freezer]));
    expect(JSON.parse(await handleListInventoryEntries(client(), { format: 'full' }))).toEqual(page([entry()]));
    expect(JSON.parse(await handleListInventoryLogs(client(), { format: 'full' }))).toEqual(page([log]));
  });

  it('on location create and update', async () => {
    stubTandoor({
      'GET /api/user-space/all_personal/': [userSpace({ active: true, household })],
      'POST /api/inventory-location/': freezer,
      'PATCH /api/inventory-location/2/': freezer,
    });
    expect(body(await handleCreateInventoryLocation(client(), { name: 'Freezer', format: 'full' }))).toEqual(freezer);
    expect(body(await handleUpdateInventoryLocation(client(), { id: 2, name: 'Freezer', format: 'full' }))).toEqual(freezer);
  });

  it('on add and update_inventory_entry', async () => {
    stubTandoor({ 'POST /api/inventory-entry/': entry(), 'PATCH /api/inventory-entry/11/': entry() });
    const add = { food_id: 5, unit_id: 3, amount: 400, location_id: 2, format: 'full' as const };
    expect(body(await handleAddInventoryItem(client(), add))).toEqual(entry());
    expect(body(await handleUpdateInventoryEntry(client(), { id: 11, amount: 400, format: 'full' }))).toEqual(entry());
  });

  it('on consume and move', async () => {
    const pantry = { id: 7, name: 'Pantry', is_freezer: false, household };
    stubTandoor({ 'GET /api/inventory-entry/11/': entry(), 'PATCH /api/inventory-entry/11/': entry({ amount: 399 }) });
    expect(body(await handleConsumeInventoryItem(client(), { entry_id: 11, amount: 1, format: 'full' }))).toEqual(entry({ amount: 399 }));
    vi.restoreAllMocks();
    stubTandoor({ 'GET /api/inventory-entry/11/': entry(), 'PATCH /api/inventory-entry/11/': entry({ inventory_location: pantry }) });
    expect(body(await handleMoveInventoryItem(client(), { entry_id: 11, to_location_id: 7, format: 'full' })))
      .toEqual({ ...entry({ inventory_location: pantry }), from_location: 'Freezer' });
  });
});
