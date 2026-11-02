import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../../src/clients/index.js';
import { registerInventoryTools } from '../../src/tools/inventory.js';
import { registerTreeSafetyTools } from '../../src/tools/tree-safety.js';
import { invokeTool } from '../helpers/mcp.js';
import { handleAssignHousehold } from '../../src/handlers/household.js';

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
      text: expect.stringContaining('You are not in a household in this space. Create one with create_household and assign yourself with assign_household (household-space section, space owner only), or ask the space owner.'),
    });
  });

  it('creates a freezer and a pantry location in the user household', async () => {
    if (startedWithoutHousehold) {
      const household = await client.households.createHousehold({ name: `${tag}-household` });
      await handleAssignHousehold(client, { user_space_ids: [userSpaceId], household_id: household.id });
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

  it('consuming an entry at 0 writes nothing', async () => {
    const res = await raw('consume_inventory_item', server, { entry_id: entryId, all: true });
    expect(res).toEqual({ isError: false, text: `Inventory item ${entryId} has nothing on hand (amount 0); nothing consumed.` });
    const logs = await call(server, 'list_inventory_logs', { entry_id: entryId });
    expect(logs.count).toBe(3);
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

  it('list_inventory_logs food_id returns only that food rows', async () => {
    const otherFood = (await client.foodUnits.createFood({ name: `${tag}-corn` })).id;
    try {
      const other = await call(server, 'add_inventory_item', { food_id: otherFood, unit_id: unitId, amount: 1, location_id: pantryId });
      const logs = await call(server, 'list_inventory_logs', { food_id: foodId, page_size: 100 });
      const entryIds = logs.results.map((l: any) => l.entry_id);
      expect(entryIds).toContain(entryId);
      expect(entryIds).not.toContain(other.id);
      expect(new Set(logs.results.map((l: any) => l.food))).toEqual(new Set([`${tag}-peas`]));
    } finally {
      await client.foodUnits.deleteFood(otherFood);
    }
  });

  it('an entry whose unit was deleted shows a null unit and cannot be consumed', async () => {
    const doomed = (await client.foodUnits.createUnit({ name: `${tag}-doomed` })).id;
    const added = await call(server, 'add_inventory_item', { food_id: foodId, unit_id: doomed, amount: 5, location_id: pantryId });
    await client.foodUnits.deleteUnit(doomed);
    expect(await call(server, 'get_inventory_entry', { id: added.id })).toMatchObject({ unit: null, unit_id: null, amount: 5 });
    const res = await raw('consume_inventory_item', server, { entry_id: added.id, amount: 1 });
    expect(res).toEqual({ isError: true, text: expect.stringContaining(`Entry ${added.id} has no unit; set one with update_inventory_entry.`) });
    expect((await call(server, 'get_inventory_entry', { id: added.id })).amount).toBe(5);
  });
});
