import { describe, it, expect, afterEach, vi } from 'vitest';
import { TandoorClient } from '../src/clients/index.js';
import {
  handleListHouseholds,
  handleGetHousehold,
  handleCreateHousehold,
  handleUpdateHousehold,
  handleDeleteHousehold,
} from '../src/handlers/household.js';

type Sent = { method: string; path: string; body?: unknown };
type Reply = { status: number; body?: unknown };

const forbidden: Reply = { status: 403, body: { detail: 'You do not have permission to perform this action.' } };

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

const client = () => new TandoorClient({ url: 'https://tandoor.test', token: 't' });

const home = { id: 4, name: 'Home', created_at: 't', updated_at: 't' };

function userSpace(id: number, username: string, household: unknown) {
  return {
    id,
    user: { id: id * 10, username, display_name: username },
    space: 1,
    groups: [{ id: 2, name: 'user' }],
    household,
    active: true,
  };
}

const page = (results: unknown[], next: string | null = null) => ({ count: results.length, next, previous: null, results });

afterEach(() => vi.restoreAllMocks());

describe('household tools', () => {
  it('lists households with paging, slimmed to id and name', async () => {
    stubTandoor({ 'GET /api/household/?page=2&page_size=5': { count: 6, next: null, previous: 'p', results: [home] } });
    const out = await handleListHouseholds(client(), { page: 2, page_size: 5 });
    expect(JSON.parse(out)).toEqual({ count: 6, next: null, previous: 'p', results: [{ id: 4, name: 'Home' }] });
  });

  it('gets a household with the members found across every user-space page', async () => {
    stubTandoor({
      'GET /api/household/4/': home,
      'GET /api/user-space/?page=1': page([userSpace(1, 'ann', home), userSpace(2, 'bob', null)], 'more'),
      'GET /api/user-space/?page=2': page([userSpace(3, 'cy', { id: 9, name: 'Other' }), userSpace(5, 'di', home)]),
    });
    const out = await handleGetHousehold(client(), { id: 4 });
    expect(JSON.parse(out)).toEqual({
      id: 4,
      name: 'Home',
      members: [{ user_space_id: 1, user: 'ann' }, { user_space_id: 5, user: 'di' }],
    });
  });

  it('creates a household from a name', async () => {
    const sent = stubTandoor({ 'POST /api/household/': home });
    const out = await handleCreateHousehold(client(), { name: 'Home' });
    expect(sent).toEqual([{ method: 'POST', path: '/api/household/', body: { name: 'Home' } }]);
    expect(out).toBe(`Household created.\n\n${JSON.stringify({ id: 4, name: 'Home' })}`);
  });

  it('renames a household by sending only the name', async () => {
    const sent = stubTandoor({ 'PATCH /api/household/4/': { ...home, name: 'Flat' } });
    const out = await handleUpdateHousehold(client(), { id: 4, name: 'Flat' });
    expect(sent).toEqual([{ method: 'PATCH', path: '/api/household/4/', body: { name: 'Flat' } }]);
    expect(out).toBe(`Household updated.\n\n${JSON.stringify({ id: 4, name: 'Flat' })}`);
  });

  it('reports that a 403 means the call needs the space owner', async () => {
    stubTandoor({ 'POST /api/household/': forbidden });
    await expect(handleCreateHousehold(client(), { name: 'Home' })).rejects.toThrow(
      'This call requires the space owner; space admins and members get 403.',
    );
  });

  it('deletes a household that no user-space or inventory location references', async () => {
    const sent = stubTandoor({
      'GET /api/user-space/?page=1': page([userSpace(1, 'ann', null)]),
      'GET /api/inventory-location/?page=1': page([{ id: 7, name: 'Shed', is_freezer: false, household: { id: 9, name: 'Other' } }]),
      'DELETE /api/household/4/': undefined,
    });
    expect(await handleDeleteHousehold(client(), { id: 4 })).toBe('Household 4 deleted.');
    expect(sent.at(-1)).toEqual({ method: 'DELETE', path: '/api/household/4/' });
  });

  it('refuses to delete a household still referenced, naming the user-spaces and locations, and sends no DELETE', async () => {
    const sent = stubTandoor({
      'GET /api/user-space/?page=1': page([userSpace(1, 'ann', home), userSpace(2, 'bob', null)], 'more'),
      'GET /api/user-space/?page=2': page([userSpace(5, 'di', home)]),
      'GET /api/inventory-location/?page=1': page([{ id: 7, name: 'Freezer', is_freezer: true, household: home }]),
    });
    await expect(handleDeleteHousehold(client(), { id: 4 })).rejects.toThrow(
      'Household 4 is still in use, so it was not deleted. Unassign its user-spaces with assign_household (household_id null) '
      + 'and delete its inventory locations, then retry. '
      + JSON.stringify({
        user_spaces: [{ user_space_id: 1, user: 'ann' }, { user_space_id: 5, user: 'di' }],
        inventory_locations: [{ id: 7, name: 'Freezer' }],
      }),
    );
    expect(sent.filter((s) => s.method === 'DELETE')).toEqual([]);
  });
});
