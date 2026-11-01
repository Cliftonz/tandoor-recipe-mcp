import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../../src/clients/index.js';
import { registerInventoryTools } from '../../src/tools/inventory.js';
import { registerTreeSafetyTools } from '../../src/tools/tree-safety.js';
import { invokeTool } from '../helpers/mcp.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;

async function raw(name: string, server: McpServer, args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
  const res = await invokeTool(server, name, args);
  return { isError: !!res.isError, text: res.content[0].text };
}

async function call(server: McpServer, name: string, args: Record<string, unknown>): Promise<any> {
  const res = await raw(name, server, args);
  if (res.isError) throw new Error(`tool ${name} errored: ${res.text}`);
  const start = res.text.search(/[[{]/);
  return start === -1 ? res.text : JSON.parse(res.text.slice(start));
}

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.status === 204 ? undefined : res.json();
}

(url && token ? describe : describe.skip)('inventory lifecycle against live Tandoor', () => {
  let server: McpServer;
  let client: TandoorClient;
  let userSpaceId: number;
  let startedWithoutHousehold: boolean;
  let foodId: number;
  let unitId: number;
  let freezerId: number;
  let pantryId: number;
  let entryId: number;
  const locations: number[] = [];
  const tag = `mcp-e2e-inv-${Date.now()}`;

  beforeAll(async () => {
    server = new McpServer({ name: 'e2e', version: 'e2e' });
    client = new TandoorClient({ url: url!, token: token! });
    registerInventoryTools(server, client);
    registerTreeSafetyTools(server, client);
    const active = (await client.spaces.listAllPersonalUserSpaces()).find((us: any) => us.active);
    userSpaceId = active.id;
    startedWithoutHousehold = active.household === null;
    foodId = (await client.foodUnits.createFood({ name: `${tag}-peas` })).id;
    unitId = (await client.foodUnits.createUnit({ name: `${tag}-g` })).id;
  });

  afterAll(async () => {
    for (const id of locations) await client.inventory.deleteLocation(id);
    await client.foodUnits.deleteFood(foodId);
    await client.foodUnits.deleteUnit(unitId);
  });

  it('refuses to create a location while the user has no household', async (ctx) => {
    if (!startedWithoutHousehold) ctx.skip();
    const res = await raw('create_inventory_location', server, { name: `${tag}-nohh` });
    expect(res).toEqual({
      isError: true,
      text: expect.stringContaining('You are not in a household in this space. Assign yourself to a household in Tandoor, then retry.'),
    });
  });

  it('creates a freezer and a pantry location in the user household', async () => {
    if (startedWithoutHousehold) {
      // Tandoor 2.6.15 answers 500 to PATCH /api/user-space/{id}/ with a household;
      // the admin batch_update endpoint is the API path that assigns one. It cannot be
      // unassigned afterwards, so the household stays until the stack is torn down.
      const household = await api('POST', '/api/household/', { name: `${tag}-household` });
      await api('PUT', '/api/user-space/batch_update/', { user_spaces: [userSpaceId], household: household.id, group_set: [] });
    }
    const freezer = await call(server, 'create_inventory_location', { name: `${tag}-freezer`, is_freezer: true });
    locations.push(freezer.id);
    freezerId = freezer.id;
    expect(freezer).toEqual({ id: expect.any(Number), name: `${tag}-freezer`, is_freezer: true, household: expect.any(String) });
    const pantry = await call(server, 'create_inventory_location', { name: `${tag}-pantry` });
    locations.push(pantry.id);
    pantryId = pantry.id;
    expect(pantry.is_freezer).toBe(false);
  });

  it('adds an item', async () => {
    const added = await call(server, 'add_inventory_item', {
      food_id: foodId, unit_id: unitId, amount: 10, location_id: freezerId, expires: '2027-01-31', sub_location: 'drawer',
    });
    entryId = added.id;
    expect(added).toMatchObject({
      food: `${tag}-peas`, food_id: foodId, amount: 10, unit: `${tag}-g`, unit_id: unitId,
      location: `${tag}-freezer`, location_id: freezerId, is_freezer: true, sub_location: 'drawer', expires: '2027-01-31',
    });
  });

  it('consumes part of the item', async () => {
    const res = await raw('consume_inventory_item', server, { entry_id: entryId, amount: 4 });
    expect(res.text.split('\n')[0]).toBe('Inventory item consumed.');
    expect((await call(server, 'get_inventory_entry', { id: entryId })).amount).toBe(6);
  });

  it('consuming past zero clamps to 0, warns, and keeps the entry', async () => {
    const res = await raw('consume_inventory_item', server, { entry_id: entryId, amount: 10 });
    const warning = `Warning: requested 10 ${tag}-g of ${tag}-peas but only 6 were on hand; consumed 6, amount is now 0.`;
    expect(res.text.split('\n')[0]).toBe(warning);
    expect(JSON.parse(res.text.slice(res.text.indexOf('{')))).toMatchObject({ id: entryId, amount: 0, warning, requested: 10, consumed: 6 });
    expect((await call(server, 'get_inventory_entry', { id: entryId })).amount).toBe(0);
  });

  it('hides the empty entry by default and shows it with include_empty', async () => {
    const hidden = await call(server, 'list_inventory_entries', { location_id: freezerId });
    expect(hidden.results.map((e: any) => e.id)).not.toContain(entryId);
    const shown = await call(server, 'list_inventory_entries', { location_id: freezerId, include_empty: true });
    expect(shown.results.map((e: any) => e.id)).toContain(entryId);
  });

  it('moves the entry to another location and reports where it came from', async () => {
    const moved = await call(server, 'move_inventory_item', { entry_id: entryId, to_location_id: pantryId, sub_location: null });
    expect(moved).toMatchObject({ id: entryId, location_id: pantryId, sub_location: null, from_location: `${tag}-freezer` });
  });

  it('moving to the current location is a no-op', async () => {
    const res = await raw('move_inventory_item', server, { entry_id: entryId, to_location_id: pantryId });
    expect(res).toEqual({ isError: false, text: `Inventory item ${entryId} is already in ${tag}-pantry.` });
  });

  it('logs one row per step: add, two consumes as remove, then move; the no-op move logs nothing', async () => {
    const logs = await call(server, 'list_inventory_logs', { entry_id: entryId });
    const rows = [...logs.results].sort((a: any, b: any) => a.id - b.id)
      .map((l: any) => [l.booking_type, l.old_amount, l.new_amount, l.old_location, l.new_location]);
    const f = `${tag}-freezer`;
    const p = `${tag}-pantry`;
    expect(rows).toEqual([
      ['add', 0, 10, f, f],
      ['remove', 10, 6, f, f],
      ['remove', 6, 0, f, f],
      ['move', 0, 0, f, p],
    ]);
    const first = await call(server, 'get_inventory_log', { id: logs.results[0].id });
    expect(first).toMatchObject({ entry_id: entryId, food: `${tag}-peas` });
  });

  it('consume by food_id lists the candidates when the food has several entries, and narrows by location', async () => {
    const a = await call(server, 'add_inventory_item', { food_id: foodId, unit_id: unitId, amount: 2, location_id: freezerId });
    const b = await call(server, 'add_inventory_item', { food_id: foodId, unit_id: unitId, amount: 3, location_id: pantryId });
    const res = await raw('consume_inventory_item', server, { food_id: foodId, amount: 1 });
    expect(res.isError).toBe(true);
    expect(res.text).toContain(`Food ${foodId} has 2 inventory entries; pass entry_id. Candidates: `);
    expect(res.text).toContain(`"id":${a.id}`);
    expect(res.text).toContain(`"id":${b.id}`);
    expect((await call(server, 'get_inventory_entry', { id: a.id })).amount).toBe(2);
    expect((await call(server, 'get_inventory_entry', { id: b.id })).amount).toBe(3);

    const narrowed = await call(server, 'consume_inventory_item', { food_id: foodId, location_id: pantryId, amount: 1 });
    expect(narrowed).toMatchObject({ id: b.id, amount: 2 });
  });

  it('previews the location delete cascade, including the moved entry log rows', async () => {
    const cascade = await call(server, 'preview_inventory_location_delete_cascading', { id: freezerId });
    const logIds = (await call(server, 'list_inventory_logs', { entry_id: entryId })).results.map((l: any) => l.id);
    const cascaded = cascade.results.filter((r: any) => r.model === 'InventoryLog').map((r: any) => r.id);
    expect(cascaded).toEqual(expect.arrayContaining(logIds));
  });
});
