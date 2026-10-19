import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TandoorClient } from '../../src/clients/index.js';
import { handleUpdateFood } from '../../src/handlers/foodunit.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const describeE2E = url && token ? describe : describe.skip;
const prefix = `mcp-e2e-foodprops-${Date.now()}`;

describeE2E('update_food properties against live Tandoor', () => {
  let client: TandoorClient;
  let foodId: number;
  let fatId: number;
  let proteinId: number;

  const valuesByType = async () => {
    const food = await client.foodUnits.getFood(foodId);
    return Object.fromEntries(food.properties.map((p: any) => [p.property_type.id, p.property_amount]));
  };
  const rowIdForType = async (typeId: number) => {
    const food = await client.foodUnits.getFood(foodId);
    return food.properties.find((p: any) => p.property_type.id === typeId).id;
  };

  beforeAll(async () => {
    client = new TandoorClient({ url: url!, token: token! });
    const food = await client.foodUnits.createFood({ name: `${prefix}-food` });
    foodId = food.id;
    const fat = await client.propertyTypes.createPropertyType({ name: `${prefix}-fat`, unit: 'g' });
    fatId = fat.id;
    const protein = await client.propertyTypes.createPropertyType({ name: `${prefix}-protein`, unit: 'g' });
    proteinId = protein.id;
  });

  afterAll(async () => {
    await client.foodUnits.deleteFood(foodId);
    const leftover = await client.properties.listProperties({ page_size: 1000 });
    for (const p of leftover.results.filter((r: any) => [fatId, proteinId].includes(r.property_type.id))) {
      await client.properties.deleteProperty(p.id);
    }
    await client.propertyTypes.deletePropertyType(fatId);
    await client.propertyTypes.deletePropertyType(proteinId);
  });

  it('round-trips set, update, null, and remove', async () => {
    await handleUpdateFood(client, {
      id: foodId,
      properties: [
        { property_type_id: fatId, property_amount: 10 },
        { property_type_id: proteinId, property_amount: 20 },
      ],
    });
    expect(await valuesByType()).toEqual({ [fatId]: 10, [proteinId]: 20 });
    const proteinRowId = await rowIdForType(proteinId);

    await handleUpdateFood(client, { id: foodId, properties: [{ property_type_id: fatId, property_amount: 15 }] });
    expect(await valuesByType()).toEqual({ [fatId]: 15, [proteinId]: 20 });
    expect(await rowIdForType(proteinId)).toBe(proteinRowId);

    await handleUpdateFood(client, { id: foodId, properties: [{ property_type_id: proteinId, property_amount: null }] });
    expect(await valuesByType()).toEqual({ [fatId]: 15, [proteinId]: null });

    await handleUpdateFood(client, { id: foodId, remove_property_type_ids: [fatId] });
    expect(await valuesByType()).toEqual({ [proteinId]: null });
  });

  it('surfaces Tandoor\'s response for a nonexistent property type id', async () => {
    await expect(handleUpdateFood(client, {
      id: foodId,
      properties: [{ property_type_id: 999999999, property_amount: 1 }],
    })).rejects.toThrow(/Tandoor API error: 500/);
  });
});
