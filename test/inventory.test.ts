import { describe, it, expect, afterEach, vi } from 'vitest';
import { TandoorClient } from '../src/clients/index.js';
import {
  handleListInventoryLocations,
  handleGetInventoryLocation,
  handleCreateInventoryLocation,
  handleUpdateInventoryLocation,
  handleDeleteInventoryLocation,
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
