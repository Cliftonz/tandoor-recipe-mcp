import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../../src/clients/index.js';
import { registerShoppingTools } from '../../src/tools/shopping.js';
import { registerFoodUnitTools } from '../../src/tools/foodunit.js';
import { registerTreeSafetyTools } from '../../src/tools/tree-safety.js';
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

const ids = (lists: { id: number }[]) => lists.map((l) => l.id).sort((a, b) => a - b);

(url && token ? describe : describe.skip)('named shopping lists against live Tandoor', () => {
  let server: McpServer;
  let client: TandoorClient;
  const tag = `e2e-sl-${Date.now() % 1e8}`;
  let listA: number;
  let listB: number;
  let foodId: number;
  let otherFoodId: number;
  let entryId: number;
  let checkedEntryId: number;
  let listRecipeId: number;
  const foods: number[] = [];
  const entries: number[] = [];

  beforeAll(() => {
    server = new McpServer({ name: 'e2e', version: 'e2e' });
    client = new TandoorClient({ url: url!, token: token! });
    registerShoppingTools(server, client);
    registerFoodUnitTools(server, client);
    registerTreeSafetyTools(server, client);
  });

  afterAll(async () => {
    for (const id of entries) await client.shopping.deleteEntry(id).catch(() => undefined);
    if (listRecipeId) await client.shopping.deleteShoppingListRecipe(listRecipeId).catch(() => undefined);
    for (const id of foods) await client.foodUnits.deleteFood(id).catch(() => undefined);
    for (const id of [listA, listB]) if (id) await client.shopping.deleteShoppingList(id).catch(() => undefined);
  });

  it('creates two lists, and a case-variant name returns the existing list unchanged', async () => {
    const a = await call(server, 'create_shopping_list', { name: `${tag}-a`, color: '#ff0000' });
    listA = a.id;
    expect(a).toEqual({ id: expect.any(Number), name: `${tag}-a`, description: '', color: '#ff0000' });
    const again = await call(server, 'create_shopping_list', { name: `${tag}-A`.toUpperCase(), description: 'ignored' });
    expect(again).toEqual(a);
    listB = (await call(server, 'create_shopping_list', { name: `${tag}-b` })).id;
    expect(await raw(server, 'update_shopping_list', { id: listB, name: `${tag}-A` })).toEqual({
      isError: true,
      text: expect.stringContaining(`A shopping list named ${tag}-a already exists (id ${listA}); choose another name.`),
    });
    const all = await call(server, 'list_shopping_lists', { page_size: 100 });
    expect(all.results.filter((l: any) => l.name.startsWith(tag)).map((l: any) => l.id).sort()).toEqual([listA, listB].sort());
  });

  it('creates a food with lists through the POST then PATCH path', async () => {
    const food = await call(server, 'create_food', { name: `${tag}-milk`, shopping_list_ids: [listA] });
    foodId = food.id;
    foods.push(foodId);
    expect(food.shopping_lists).toEqual([{ id: listA, name: `${tag}-a` }]);
    expect(ids((await client.foodUnits.getFood(foodId)).shopping_lists)).toEqual([listA]);
  });

  it('replaces and then clears the lists of a food', async () => {
    expect((await call(server, 'update_food', { id: foodId, shopping_list_ids: [listB] })).shopping_lists).toEqual([{ id: listB, name: `${tag}-b` }]);
    expect((await call(server, 'update_food', { id: foodId, shopping_list_ids: [] })).shopping_lists).toEqual([]);
    await call(server, 'update_food', { id: foodId, shopping_list_ids: [listA] });
  });

  it('rejects an unknown list id before writing anything', async () => {
    const res = await raw(server, 'create_food', { name: `${tag}-ghost`, shopping_list_ids: [listA, 999999] });
    expect(res).toEqual({ isError: true, text: expect.stringContaining('These shopping list ids do not exist in this space: 999999.') });
    expect((await client.foodUnits.listFoods({ query: `${tag}-ghost` })).results).toEqual([]);
    expect((await raw(server, 'update_food', { id: foodId, shopping_list_ids: [999999] })).isError).toBe(true);
    expect(ids((await client.foodUnits.getFood(foodId)).shopping_lists)).toEqual([listA]);
  });

  it('refuses to set lists on an existing food through create_food', async () => {
    expect(await raw(server, 'create_food', { name: `${tag}-MILK`, shopping_list_ids: [listB] })).toEqual({
      isError: true,
      text: expect.stringContaining(`A food named ${tag}-milk already exists (id ${foodId}); use update_food to change its lists.`),
    });
    expect(ids((await client.foodUnits.getFood(foodId)).shopping_lists)).toEqual([listA]);
  });

  it('creates an entry on the given lists', async () => {
    const e = await call(server, 'create_shopping_entry', { amount: 1, food_id: foodId, shopping_list_ids: [listB] });
    entryId = e.id;
    entries.push(entryId);
    expect(e.shopping_lists).toEqual([{ id: listB, name: `${tag}-b` }]);
  });

  it('keeps a checked entry checked, with its completed_at, when update_shopping_entry omits checked', async () => {
    const e = await call(server, 'create_shopping_entry', { amount: 1, food_id: foodId, shopping_list_ids: [] });
    expect(e.shopping_lists).toEqual([]);
    checkedEntryId = e.id;
    entries.push(checkedEntryId);
    const checked = await call(server, 'update_shopping_entry', { id: checkedEntryId, checked: true });
    expect(checked.completed_at).not.toBeNull();
    const after = await call(server, 'update_shopping_entry', { id: checkedEntryId, amount: 3 });
    expect(after).toMatchObject({ amount: 3, checked: true, completed_at: expect.any(String) });
  });

  it('adds, removes, sets and clears entry lists in bulk', async () => {
    const both = [entryId, checkedEntryId];
    const listsOf = async (id: number) => ids((await client.shopping.getEntry(id)).shopping_lists);
    await call(server, 'bulk_update_shopping_entries', { ids: both, shopping_lists_add: [listA], shopping_lists_remove: [listB] });
    expect([await listsOf(entryId), await listsOf(checkedEntryId)]).toEqual([[listA], [listA]]);
    await call(server, 'bulk_update_shopping_entries', { ids: both, shopping_lists_set: [listA, listB] });
    expect(await listsOf(entryId)).toEqual([listA, listB].sort((a, b) => a - b));
    await call(server, 'bulk_update_shopping_entries', { ids: both, shopping_lists_remove_all: true });
    expect([await listsOf(entryId), await listsOf(checkedEntryId)]).toEqual([[], []]);
    expect(await client.shopping.getEntry(checkedEntryId)).toMatchObject({ checked: true, completed_at: expect.any(String) });
  });

  it('rejects the list combinations Tandoor would apply silently', async () => {
    for (const ops of [
      { shopping_lists_set: [listA], shopping_lists_add: [listB] },
      { shopping_lists_set: [listA], shopping_lists_remove_all: true },
      { shopping_lists_add: [listA], shopping_lists_remove_all: true },
      { shopping_lists_set: [] },
      {},
    ]) {
      expect((await raw(server, 'bulk_update_shopping_entries', { ids: [entryId], ...ops })).isError).toBe(true);
    }
    expect((await raw(server, 'bulk_update_shopping_entries', { ids: [entryId], shopping_lists_add: [999999] })).text)
      .toContain('These shopping list ids do not exist in this space: 999999.');
    expect((await client.shopping.getEntry(entryId)).shopping_lists).toEqual([]);
  });

  it('adds a list to many foods with food_batch_update', async () => {
    otherFoodId = (await call(server, 'create_food', { name: `${tag}-eggs` })).id;
    foods.push(otherFoodId);
    await call(server, 'food_batch_update', { foods: [foodId, otherFoodId], shopping_lists_add: [listB] });
    expect(ids((await client.foodUnits.getFood(foodId)).shopping_lists)).toEqual([listA, listB].sort((a, b) => a - b));
    expect(ids((await client.foodUnits.getFood(otherFoodId)).shopping_lists)).toEqual([listB]);
  });

  it('bulk-creates recipe entries without list ids, and they get the food\'s lists', async () => {
    listRecipeId = (await call(server, 'create_shopping_list_recipe', { servings: 1, name: tag })).id;
    // Tandoor answers 404 for a shopping-list-recipe that has no entries yet.
    const seed = await call(server, 'create_shopping_entry', { amount: 1, food_id: foodId, list_recipe: listRecipeId });
    entries.push(seed.id);
    expect(ids(seed.shopping_lists)).toEqual([listA, listB].sort((a, b) => a - b));
    const res = await raw(server, 'bulk_create_shopping_list_recipe_entries', {
      id: listRecipeId,
      entries: [{ amount: 2, food_id: otherFoodId, unit_id: null, ingredient_id: null }],
    });
    expect(res.isError, res.text).toBe(false);
    const created = (await client.shopping.listEntries({ page_size: 200 })).results.filter((e: any) => e.list_recipe === listRecipeId && e.id !== seed.id);
    entries.push(...created.map((e: any) => e.id));
    expect(created.map((e: any) => ids(e.shopping_lists))).toEqual([[listB]]);
  });

  it('deletes a list but keeps the food and the entry that used it', async () => {
    await call(server, 'update_shopping_entry', { id: entryId, shopping_list_ids: [listA] });
    const preview = await call(server, 'preview_shopping_list_delete_cascading', { id: listA });
    expect(preview.results.map((r: any) => r.model).sort()).toEqual(['Food_shopping_lists', 'ShoppingListEntry_shopping_lists', 'ShoppingListEntry_shopping_lists']);
    expect(await raw(server, 'delete_shopping_list', { id: listA })).toEqual({ isError: false, text: `Shopping list ${listA} deleted.` });
    expect(ids((await client.foodUnits.getFood(foodId)).shopping_lists)).toEqual([listB]);
    expect((await client.shopping.getEntry(entryId)).shopping_lists).toEqual([]);
    listA = 0;
  });
});
