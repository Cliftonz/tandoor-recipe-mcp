import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../../src/clients/index.js';
import { registerHouseholdTools } from '../../src/tools/household.js';
import { registerSpaceTools } from '../../src/tools/space.js';
import { invokeTool } from '../helpers/mcp.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;

async function raw(server: McpServer, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
  const res = await invokeTool(server, name, args);
  return { isError: !!res.isError, text: res.content[0].text };
}

async function call(server: McpServer, name: string, args: Record<string, unknown>): Promise<any> {
  const res = await raw(server, name, args);
  if (res.isError) throw new Error(`tool ${name} errored: ${res.text}`);
  const start = res.text.search(/[[{]/);
  return start === -1 ? res.text : JSON.parse(res.text.slice(start));
}

(url && token ? describe : describe.skip)('household lifecycle against live Tandoor', () => {
  let server: McpServer;
  let client: TandoorClient;
  let userSpaceId: number;
  let username: string;
  let householdId: number;
  let locationId: number;
  const tag = `mcp-e2e-hh-${Date.now()}`;

  beforeAll(async () => {
    server = new McpServer({ name: 'e2e', version: 'e2e' });
    client = new TandoorClient({ url: url!, token: token! });
    registerHouseholdTools(server, client);
    registerSpaceTools(server, client);
    const active = (await client.spaces.listAllPersonalUserSpaces()).find((us: any) => us.active);
    userSpaceId = active.id;
    username = active.user.display_name;
  });

  afterAll(async () => {
    await call(server, 'assign_household', { user_space_ids: [userSpaceId], household_id: null });
    expect((await client.spaces.getUserSpace(userSpaceId)).household).toBeNull();
  });

  it('creates, lists, gets and renames a household', async () => {
    const created = await call(server, 'create_household', { name: tag });
    householdId = created.id;
    expect(created).toEqual({ id: expect.any(Number), name: tag });
    const listed = await call(server, 'list_households', { page_size: 100 });
    expect(listed.results).toContainEqual({ id: householdId, name: tag });
    expect(await call(server, 'get_household', { id: householdId })).toEqual({ id: householdId, name: tag, members: [] });
    expect(await call(server, 'update_household', { id: householdId, name: `${tag}-renamed` })).toEqual({ id: householdId, name: `${tag}-renamed` });
  });

  it('assigns the user-space and get_household shows it as a member', async () => {
    const res = await call(server, 'assign_household', { user_space_ids: [userSpaceId], household_id: householdId });
    expect(res).toEqual([{ user_space_id: userSpaceId, status: 'updated' }]);
    expect((await call(server, 'get_household', { id: householdId })).members).toEqual([{ user_space_id: userSpaceId, user: username }]);
    expect((await call(server, 'get_user_space', { id: userSpaceId })).household).toEqual({ id: householdId, name: `${tag}-renamed` });
  });

  it('refuses to delete the household while the user-space is in it', async () => {
    const res = await raw(server, 'delete_household', { id: householdId });
    expect(res.isError).toBe(true);
    expect(res.text).toContain(JSON.stringify({ user_spaces: [{ user_space_id: userSpaceId, user: username }], inventory_locations: [] }));
  });

  it('unassigns the user-space', async () => {
    const res = await call(server, 'assign_household', { user_space_ids: [userSpaceId], household_id: null });
    expect(res).toEqual([{ user_space_id: userSpaceId, status: 'updated' }]);
    expect((await client.spaces.getUserSpace(userSpaceId)).household).toBeNull();
  });

  it('refuses to delete the household while an inventory location is in it, then deletes it once the location is gone', async () => {
    locationId = (await client.inventory.createLocation({ name: `${tag}-shed`, household: householdId, is_freezer: false })).id;
    const res = await raw(server, 'delete_household', { id: householdId });
    expect(res.isError).toBe(true);
    expect(res.text).toContain(JSON.stringify({ user_spaces: [], inventory_locations: [{ id: locationId, name: `${tag}-shed` }] }));
    await client.inventory.deleteLocation(locationId);
    expect(await raw(server, 'delete_household', { id: householdId })).toEqual({ isError: false, text: `Household ${householdId} deleted.` });
    expect((await call(server, 'list_households', { page_size: 100 })).results.map((h: any) => h.id)).not.toContain(householdId);
  });

  it('updates only internal_note on the user-space', async () => {
    const before = await client.spaces.getUserSpace(userSpaceId);
    await call(server, 'update_user_space', { id: userSpaceId, internal_note: tag });
    const after = await client.spaces.getUserSpace(userSpaceId);
    expect(after.internal_note).toBe(tag);
    expect(after.groups).toEqual(before.groups);
  });

  it('rejects an unknown group id in update_user_space', async () => {
    expect(await raw(server, 'update_user_space', { id: userSpaceId, groups: [999999] })).toEqual({
      isError: true,
      text: expect.stringContaining('Unknown group ids: 999999.'),
    });
  });

  it('rejects assigning to a household that does not exist', async () => {
    expect(await raw(server, 'assign_household', { user_space_ids: [userSpaceId], household_id: 999999 })).toEqual({
      isError: true,
      text: expect.stringContaining('Household 999999 not found.'),
    });
  });
});
