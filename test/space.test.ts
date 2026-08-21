// Space + user-space + switch-active-space handler coverage.
// Each test mocks only the client sub-method under test.

import { describe, it, expect, vi } from 'vitest';
import {
  handleListSpaces,
  handleGetSpace,
  handleGetCurrentSpace,
  handleCreateSpace,
  handleUpdateSpace,
  handleListUserSpaces,
  handleGetUserSpace,
  handleUpdateUserSpace,
  handleDeleteUserSpace,
  handleListAllPersonalUserSpaces,
  handleSwitchActiveSpace,
} from '../src/handlers/space.js';
import { SpaceClient } from '../src/clients/space.js';

// ---------- Client URL construction ----------

describe('SpaceClient URL construction', () => {
  function makeClient() {
    const c = new SpaceClient({ url: 'https://tandoor.example.com', token: 't' });
    const spy = vi.spyOn(c as any, 'request').mockResolvedValue({});
    return { c, spy };
  }

  it('listSpaces hits /api/space/ with pagination', async () => {
    const { c, spy } = makeClient();
    await c.listSpaces({ page: 2, page_size: 10 });
    expect(spy).toHaveBeenCalledWith('/api/space/?page=2&page_size=10', { signal: undefined });
  });

  it('getSpace hits /api/space/{id}/', async () => {
    const { c, spy } = makeClient();
    await c.getSpace(5);
    expect(spy).toHaveBeenCalledWith('/api/space/5/', { signal: undefined });
  });

  it('getCurrentSpace hits /api/space/current/', async () => {
    const { c, spy } = makeClient();
    await c.getCurrentSpace();
    expect(spy).toHaveBeenCalledWith('/api/space/current/', { signal: undefined });
  });

  it('createSpace POSTs to /api/space/', async () => {
    const { c, spy } = makeClient();
    await c.createSpace({ name: 'S' });
    expect(spy).toHaveBeenCalledWith('/api/space/', {
      method: 'POST',
      body: JSON.stringify({ name: 'S' }),
      signal: undefined,
    });
  });

  it('patchSpace PATCHes /api/space/{id}/', async () => {
    const { c, spy } = makeClient();
    await c.patchSpace(7, { name: 'renamed' });
    expect(spy).toHaveBeenCalledWith('/api/space/7/', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'renamed' }),
      signal: undefined,
    });
  });

  it('listUserSpaces hits /api/user-space/ with pagination', async () => {
    const { c, spy } = makeClient();
    await c.listUserSpaces({ page: 1 });
    expect(spy).toHaveBeenCalledWith('/api/user-space/?page=1', { signal: undefined });
  });

  it('getUserSpace hits /api/user-space/{id}/', async () => {
    const { c, spy } = makeClient();
    await c.getUserSpace(9);
    expect(spy).toHaveBeenCalledWith('/api/user-space/9/', { signal: undefined });
  });

  it('patchUserSpace PATCHes /api/user-space/{id}/', async () => {
    const { c, spy } = makeClient();
    await c.patchUserSpace(9, { active: true });
    expect(spy).toHaveBeenCalledWith('/api/user-space/9/', {
      method: 'PATCH',
      body: JSON.stringify({ active: true }),
      signal: undefined,
    });
  });

  it('deleteUserSpace DELETEs /api/user-space/{id}/', async () => {
    const { c, spy } = makeClient();
    await c.deleteUserSpace(9);
    expect(spy).toHaveBeenCalledWith('/api/user-space/9/', { method: 'DELETE', signal: undefined });
  });

  it('listAllPersonalUserSpaces hits /api/user-space/all_personal/', async () => {
    const { c, spy } = makeClient();
    await c.listAllPersonalUserSpaces({ page: 1, page_size: 5 });
    expect(spy).toHaveBeenCalledWith('/api/user-space/all_personal/?page=1&page_size=5', { signal: undefined });
  });

  it('switchActiveSpace builds /api/switch-active-space/{spaceId}/', async () => {
    const { c, spy } = makeClient();
    await c.switchActiveSpace(42);
    expect(spy).toHaveBeenCalledWith('/api/switch-active-space/42/', { signal: undefined });
  });
});

// ---------- Handler behavior ----------

describe('space handlers', () => {
  it('handleListSpaces slims by default', async () => {
    const listSpaces = vi.fn(async () => ({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 1, name: 'Home', user_count: 3, max_recipes: 100, food_inherit: [{ id: 5 }],
        message: 'x', max_file_storage_mb: 500,
      }],
    }));
    const client = { spaces: { listSpaces } } as any;
    const out = await handleListSpaces(client, {});
    const parsed = JSON.parse(out);
    expect(parsed.results[0]).toEqual({
      id: 1, name: 'Home', user_count: 3, max_recipes: 100, food_inherit: [{ id: 5 }],
    });
    expect(parsed.results[0]).not.toHaveProperty('message');
  });

  it('handleListSpaces returns full payload when format=full', async () => {
    const listSpaces = vi.fn(async () => ({
      count: 1, next: null, previous: null,
      results: [{ id: 1, name: 'Home', message: 'welcome' }],
    }));
    const client = { spaces: { listSpaces } } as any;
    const out = await handleListSpaces(client, { format: 'full' });
    expect(JSON.parse(out).results[0].message).toBe('welcome');
  });

  it('handleGetSpace slims by default', async () => {
    const getSpace = vi.fn(async () => ({ id: 1, name: 'Home', message: 'x', user_count: 2, max_recipes: 50 }));
    const client = { spaces: { getSpace } } as any;
    const out = await handleGetSpace(client, { id: 1 });
    expect(JSON.parse(out)).toEqual({ id: 1, name: 'Home', user_count: 2, max_recipes: 50, food_inherit: undefined });
  });

  it('handleGetCurrentSpace slims by default', async () => {
    const getCurrentSpace = vi.fn(async () => ({ id: 2, name: 'Current', message: 'hi' }));
    const client = { spaces: { getCurrentSpace } } as any;
    const out = await handleGetCurrentSpace(client, {});
    expect(JSON.parse(out).id).toBe(2);
    expect(JSON.parse(out)).not.toHaveProperty('message');
  });

  it('handleCreateSpace POSTs and returns confirmation + slim body', async () => {
    const createSpace = vi.fn(async (b) => ({ id: 99, ...b }));
    const client = { spaces: { createSpace } } as any;
    const out = await handleCreateSpace(client, { name: 'New' });
    expect(createSpace).toHaveBeenCalledWith({ name: 'New' }, { signal: undefined });
    expect(out.startsWith('Space created.')).toBe(true);
    expect(out).toContain('"id":99');
  });

  it('handleUpdateSpace throws when no fields supplied', async () => {
    const patchSpace = vi.fn();
    const client = { spaces: { patchSpace } } as any;
    await expect(handleUpdateSpace(client, { id: 1 })).rejects.toThrow(/At least one field/);
    expect(patchSpace).not.toHaveBeenCalled();
  });

  it('handleUpdateSpace PATCHes with supplied fields', async () => {
    const patchSpace = vi.fn(async (id, b) => ({ id, ...b }));
    const client = { spaces: { patchSpace } } as any;
    await handleUpdateSpace(client, { id: 3, name: 'x', max_recipes: 500 });
    expect(patchSpace).toHaveBeenCalledWith(3, { name: 'x', max_recipes: 500 }, { signal: undefined });
  });

  it('handleListUserSpaces slims by default', async () => {
    const listUserSpaces = vi.fn(async () => ({
      count: 1, next: null, previous: null,
      results: [{
        id: 10, user: { id: 4 }, space: { id: 2 }, active: true,
        groups: [{ id: 1 }, { id: 2 }], invite_link: 'x', created_at: 'y',
      }],
    }));
    const client = { spaces: { listUserSpaces } } as any;
    const out = await handleListUserSpaces(client, {});
    const parsed = JSON.parse(out);
    expect(parsed.results[0]).toEqual({ id: 10, user: 4, space: 2, active: true, groups: [1, 2] });
  });

  it('handleGetUserSpace slims by default', async () => {
    const getUserSpace = vi.fn(async () => ({
      id: 10, user: { id: 4 }, space: { id: 2 }, active: false, groups: [], invite_link: 'x',
    }));
    const client = { spaces: { getUserSpace } } as any;
    const out = await handleGetUserSpace(client, { id: 10 });
    expect(JSON.parse(out)).toEqual({ id: 10, user: 4, space: 2, active: false, groups: [] });
  });

  it('handleUpdateUserSpace throws when no fields supplied', async () => {
    const patchUserSpace = vi.fn();
    const client = { spaces: { patchUserSpace } } as any;
    await expect(handleUpdateUserSpace(client, { id: 1 })).rejects.toThrow(/At least one field/);
    expect(patchUserSpace).not.toHaveBeenCalled();
  });

  it('handleUpdateUserSpace PATCHes with supplied fields', async () => {
    const patchUserSpace = vi.fn(async (id, b) => ({ id, ...b }));
    const client = { spaces: { patchUserSpace } } as any;
    await handleUpdateUserSpace(client, { id: 10, active: true, groups: [1, 2] });
    expect(patchUserSpace).toHaveBeenCalledWith(10, { active: true, groups: [1, 2] }, { signal: undefined });
  });

  it('handleDeleteUserSpace calls DELETE and returns confirmation', async () => {
    const deleteUserSpace = vi.fn(async () => undefined);
    const client = { spaces: { deleteUserSpace } } as any;
    const out = await handleDeleteUserSpace(client, { id: 10 });
    expect(deleteUserSpace).toHaveBeenCalledWith(10, { signal: undefined });
    expect(out).toContain('10');
    expect(out.toLowerCase()).toContain('delete');
  });

  it('handleListAllPersonalUserSpaces slims by default', async () => {
    const listAllPersonalUserSpaces = vi.fn(async () => ({
      count: 1, next: null, previous: null,
      results: [{ id: 10, user: { id: 4 }, space: { id: 2 }, active: true, groups: [] }],
    }));
    const client = { spaces: { listAllPersonalUserSpaces } } as any;
    const out = await handleListAllPersonalUserSpaces(client, {});
    expect(JSON.parse(out).results[0]).toEqual({
      id: 10, user: 4, space: 2, active: true, groups: [],
    });
  });

  it('handleSwitchActiveSpace calls the client and returns confirmation naming the space', async () => {
    const switchActiveSpace = vi.fn(async () => ({}));
    const client = { spaces: { switchActiveSpace } } as any;
    const out = await handleSwitchActiveSpace(client, { spaceId: 42 });
    expect(switchActiveSpace).toHaveBeenCalledWith(42, { signal: undefined });
    expect(out).toContain('42');
  });
});
