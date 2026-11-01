import { describe, it, expect, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { TandoorClient } from '../src/clients/index.js';
import { assignHouseholdShape, createHouseholdShape, updateHouseholdShape } from '../src/tools/household.js';
import {
  handleListHouseholds,
  handleGetHousehold,
  handleCreateHousehold,
  handleUpdateHousehold,
  handleDeleteHousehold,
  handleAssignHousehold,
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

const client = () => new TandoorClient({ url: 'https://tandoor.test', token: 'test-token' });

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

  it('assigns each user-space with its current groups and reports updated, unchanged and failed per id', async () => {
    const notFound: Reply = { status: 404, body: { detail: 'No UserSpace matches the given query.' } };
    const sent = stubTandoor({
      'GET /api/household/4/': home,
      'GET /api/user-space/1/': userSpace(1, 'ann', home),
      'GET /api/user-space/2/': { ...userSpace(2, 'bob', null), groups: [{ id: 2, name: 'user' }, { id: 3, name: 'admin' }] },
      'PATCH /api/user-space/2/': userSpace(2, 'bob', home),
      'GET /api/user-space/3/': notFound,
    });
    const out = await handleAssignHousehold(client(), { user_space_ids: [1, 2, 3], household_id: 4 });
    expect(sent.filter((s) => s.method === 'PATCH')).toEqual([
      { method: 'PATCH', path: '/api/user-space/2/', body: { groups: [2, 3], household: 4 } },
    ]);
    const { results } = JSON.parse(out.slice(out.indexOf('{')));
    expect(results).toEqual([
      { user_space_id: 1, status: 'unchanged' },
      { user_space_id: 2, status: 'updated' },
      { user_space_id: 3, status: 'failed', error: expect.stringContaining('No UserSpace matches the given query.') },
    ]);
  });

  it('unassigns with household_id null without looking up a household', async () => {
    const sent = stubTandoor({
      'GET /api/user-space/1/': userSpace(1, 'ann', home),
      'PATCH /api/user-space/1/': userSpace(1, 'ann', null),
    });
    const out = await handleAssignHousehold(client(), { user_space_ids: [1], household_id: null });
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual(['GET /api/user-space/1/', 'PATCH /api/user-space/1/']);
    expect(sent[1].body).toEqual({ groups: [2], household: null });
    expect(JSON.parse(out.slice(out.indexOf('{')))).toEqual({ results: [{ user_space_id: 1, status: 'updated' }] });
  });

  it('rejects an unknown household before touching any user-space', async () => {
    const sent = stubTandoor({ 'GET /api/household/99/': { status: 404, body: { detail: 'No Household matches the given query.' } } });
    await expect(handleAssignHousehold(client(), { user_space_ids: [1], household_id: 99 })).rejects.toThrow(/^Household 99 not found\.$/);
    expect(sent).toHaveLength(1);
  });

  it('errors when every user-space failed, carrying the space-owner hint', async () => {
    stubTandoor({
      'GET /api/user-space/1/': userSpace(1, 'ann', home),
      'PATCH /api/user-space/1/': forbidden,
    });
    await expect(handleAssignHousehold(client(), { user_space_ids: [1], household_id: null })).rejects.toThrow(
      /^No user-space was updated\. .*This call requires the space owner; space admins and members get 403\./s,
    );
  });

  it('returns the raw household with members for get_household format full', async () => {
    stubTandoor({
      'GET /api/household/4/': home,
      'GET /api/user-space/?page=1': page([userSpace(1, 'ann', home)]),
    });
    const out = await handleGetHousehold(client(), { id: 4, format: 'full' });
    expect(JSON.parse(out)).toEqual({ ...home, members: [{ user_space_id: 1, user: 'ann' }] });
  });

  it('returns the raw household for create_household and update_household format full', async () => {
    stubTandoor({ 'POST /api/household/': home, 'PATCH /api/household/4/': { ...home, name: 'Flat' } });
    expect(await handleCreateHousehold(client(), { name: 'Home', format: 'full' })).toBe(`Household created.\n\n${JSON.stringify(home)}`);
    expect(await handleUpdateHousehold(client(), { id: 4, name: 'Flat', format: 'full' }))
      .toBe(`Household updated.\n\n${JSON.stringify({ ...home, name: 'Flat' })}`);
  });

  it('reports that a 403 on reading a household means the call needs the space owner', async () => {
    stubTandoor({ 'GET /api/household/4/': forbidden });
    await expect(handleGetHousehold(client(), { id: 4 })).rejects.toThrow(
      'This call requires the space owner; space admins and members get 403.',
    );
  });

  it('rejects assign_household with the original error when the household lookup is forbidden, touching no user-space', async () => {
    const sent = stubTandoor({ 'GET /api/household/4/': forbidden });
    await expect(handleAssignHousehold(client(), { user_space_ids: [1], household_id: 4 })).rejects.toThrow(
      /^Tandoor API error: 403.*\n\nThis call requires the space owner; space admins and members get 403\.$/s,
    );
    expect(sent.map((s) => s.path)).toEqual(['/api/household/4/']);
  });

  it('rejects assign_household with the original error when the household lookup fails with a 500, touching no user-space', async () => {
    const sent = stubTandoor({ 'GET /api/household/4/': { status: 500, body: { detail: 'boom' } } });
    await expect(handleAssignHousehold(client(), { user_space_ids: [1], household_id: 4 })).rejects.toThrow(
      /^Tandoor API error: 500.*\nDetail: boom/s,
    );
    expect(sent.map((s) => s.path)).toEqual(['/api/household/4/']);
  });

  it('stops assign_household when the call is aborted instead of reporting a failed id', async () => {
    stubTandoor({});
    const aborted = new AbortController();
    aborted.abort(new Error('caller aborted'));
    await expect(handleAssignHousehold(client(), { user_space_ids: [1, 2], household_id: null }, { signal: aborted.signal }))
      .rejects.toThrow(/^caller aborted$/);
  });

  it('stops assign_household on an error that did not come from Tandoor', async () => {
    const sent = stubTandoor({ 'GET /api/user-space/2/': userSpace(2, 'bob', home) });
    await expect(handleAssignHousehold(client(), { user_space_ids: [1, 2], household_id: null })).rejects.toThrow(
      /^Failed to connect to Tandoor/,
    );
    expect(sent.map((s) => s.path)).toEqual(['/api/user-space/1/']);
  });

  it('rejects repeated user-space ids in assign_household', () => {
    const schema = z.object(assignHouseholdShape);
    expect(schema.safeParse({ user_space_ids: [1, 2, 1], household_id: 4 }).success).toBe(false);
    expect(schema.safeParse({ user_space_ids: [1, 2], household_id: 4 }).success).toBe(true);
  });

  it('accepts household names of 1 to 128 characters on create and update', () => {
    for (const schema of [z.object(createHouseholdShape), z.object(updateHouseholdShape)]) {
      expect(schema.safeParse({ id: 4, name: '' }).success).toBe(false);
      expect(schema.safeParse({ id: 4, name: 'x'.repeat(129) }).success).toBe(false);
      expect(schema.safeParse({ id: 4, name: 'x' }).success).toBe(true);
      expect(schema.safeParse({ id: 4, name: 'x'.repeat(128) }).success).toBe(true);
    }
  });

  it('reports a user-space with no groups as failed in assign_household and sends no PATCH', async () => {
    const sent = stubTandoor({
      'GET /api/user-space/1/': { ...userSpace(1, 'ann', null), groups: [] },
      'GET /api/user-space/2/': userSpace(2, 'bob', null),
      'PATCH /api/user-space/2/': userSpace(2, 'bob', home),
      'GET /api/household/4/': home,
    });
    const out = await handleAssignHousehold(client(), { user_space_ids: [1, 2], household_id: 4 });
    expect(JSON.parse(out.slice(out.indexOf('{'))).results).toEqual([
      { user_space_id: 1, status: 'failed', error: 'User-space 1 has no groups; set them with update_user_space first.' },
      { user_space_id: 2, status: 'updated' },
    ]);
    expect(sent.filter((s) => s.method === 'PATCH').map((s) => s.path)).toEqual(['/api/user-space/2/']);
  });
});

