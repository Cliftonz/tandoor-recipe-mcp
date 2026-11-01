import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../../src/clients/index.js';
import { registerResources } from '../../src/resources/index.js';
import { registerInventoryTools } from '../../src/tools/inventory.js';
import { invokeTool } from '../helpers/mcp.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.status === 204 ? undefined : res.json();
}

async function readPantry(client: TandoorClient): Promise<any> {
  const server = new McpServer({ name: 'e2e', version: 'e2e' });
  registerResources(server, client);
  const uri = 'tandoor://pantry/on-hand';
  const result = await (server as any)._registeredResources[uri].readCallback(new URL(uri), {});
  return JSON.parse(result.contents[0].text);
}

(url && token ? describe : describe.skip)('tandoor://pantry/on-hand against live Tandoor', () => {
  let client: TandoorClient;
  const tag = `mcp-e2e-pantry-${Date.now()}`;
  const foods: Record<string, number> = {};
  const locations: number[] = [];
  let unitId: number;
  let freezerId: number;
  let shelfId: number;

  beforeAll(async () => {
    client = new TandoorClient({ url: url!, token: token! });
    const active = (await client.spaces.listAllPersonalUserSpaces()).find((us: any) => us.active);
    let householdId = active.household?.id;
    if (householdId === undefined) {
      householdId = (await api('POST', '/api/household/', { name: `${tag}-household` })).id;
      await api('PUT', '/api/user-space/batch_update/', { user_spaces: [active.id], household: householdId, group_set: [] });
    }
    unitId = (await client.foodUnits.createUnit({ name: `${tag}-g` })).id;
    foods.peas = (await client.foodUnits.createFood({ name: `${tag}-peas` })).id;
    foods.rice = (await client.foodUnits.createFood({ name: `${tag}-rice`, food_onhand: true })).id;
    foods.salt = (await client.foodUnits.createFood({ name: `${tag}-salt`, food_onhand: true })).id;
    freezerId = (await client.inventory.createLocation({ name: `${tag}-freezer`, is_freezer: true, household: householdId })).id;
    locations.push(freezerId);
    shelfId = (await client.inventory.createLocation({ name: `${tag}-shelf`, is_freezer: false, household: householdId })).id;
    locations.push(shelfId);
    await client.inventory.createEntry({
      food: foods.peas,
      unit: unitId,
      amount: 400,
      inventory_location: freezerId,
      expires: '2027-01-31',
    });
    await client.inventory.createEntry({
      food: foods.rice,
      unit: unitId,
      amount: 2000,
      inventory_location: shelfId,
    });
  });

  afterAll(async () => {
    for (const id of locations) await client.inventory.deleteLocation(id);
    for (const id of Object.values(foods)) await client.foodUnits.deleteFood(id);
    await client.foodUnits.deleteUnit(unitId);
  });

  it('lists stocked entries by location and on-hand foods that have no entry', async () => {
    const pantry = await readPantry(client);

    expect(pantry.locations).toEqual(expect.arrayContaining([
      {
        id: freezerId,
        name: `${tag}-freezer`,
        is_freezer: true,
        entries: [{ id: expect.any(Number), food: `${tag}-peas`, food_id: foods.peas, amount: 400, unit: `${tag}-g`, expires: '2027-01-31', sub_location: null, note: null }],
      },
      {
        id: shelfId,
        name: `${tag}-shelf`,
        is_freezer: false,
        entries: [{ id: expect.any(Number), food: `${tag}-rice`, food_id: foods.rice, amount: 2000, unit: `${tag}-g`, expires: null, sub_location: null, note: null }],
      },
    ]));
    const onHandOnly = pantry.on_hand_no_quantity.filter((f: any) => f.name.startsWith(tag));
    expect(onHandOnly).toEqual([{ id: foods.salt, name: `${tag}-salt`, supermarket_category: null }]);
    expect(pantry.truncated).toEqual({ entries: false, on_hand_no_quantity: false });
  });

  it('leaves out an entry consumed to 0', async () => {
    foods.stock = (await client.foodUnits.createFood({ name: `${tag}-stock` })).id;
    const stock = await client.inventory.createEntry({ food: foods.stock, unit: unitId, amount: 300, inventory_location: freezerId });
    const tools = new McpServer({ name: 'e2e', version: 'e2e' });
    registerInventoryTools(tools, client);
    const consumed = await invokeTool(tools, 'consume_inventory_item', { entry_id: stock.id, all: true });
    expect(consumed.isError).toBeFalsy();
    expect((await client.inventory.getEntry(stock.id)).amount).toBe(0);

    const pantry = await readPantry(client);

    const entryIds = pantry.locations.flatMap((l: any) => l.entries.map((e: any) => e.id));
    expect(entryIds).not.toContain(stock.id);
    expect(pantry.locations.find((l: any) => l.id === freezerId).entries.map((e: any) => e.food)).toEqual([`${tag}-peas`]);
  });
});
