import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openSurface, type Surface } from './helpers/surface.js';
import { COVERS, skipFor } from './helpers/coverage.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;

(url && token ? describe : describe.skip)('food, unit, keyword, conversion and property writes against live Tandoor', () => {
  const prefix = `e2e-wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const cleanup = new Map<string, () => Promise<unknown>>();
  let s: Surface;

  async function make(tool: string, args: Record<string, unknown>, deleteTool: string): Promise<any> {
    const created = await s.call(tool, { ...args, format: 'full' });
    cleanup.set(`${deleteTool}:${created.id}`, () => s.call(deleteTool, { id: created.id }));
    return created;
  }

  function forget(deleteTool: string, id: number): void {
    cleanup.delete(`${deleteTool}:${id}`);
  }

  async function gone(tool: string, id: number): Promise<boolean> {
    return !!(await s.raw(tool, { id })).isError;
  }

  const get = (tool: string, id: number) => s.call(tool, { id, format: 'full' });
  const childIds = async (tool: string, root: number) => (await s.call(tool, { root, format: 'full' })).results.map((r: any) => r.id);

  beforeAll(async () => {
    s = await openSurface(url!, token!);
  });

  afterAll(async () => {
    const failures: string[] = [];
    for (const undo of [...cleanup.values()].reverse()) {
      await undo().catch((err: Error) => failures.push(err.message));
    }
    await s.close();
    expect(COVERS['writes-foods.e2e.test.ts'].filter((t) => !s.called.has(t))).toEqual([]);
    expect(failures).toEqual([]);
  });

  it('update_food changes fields that read back', async () => {
    const food = await make('create_food', { name: `${prefix}-food` }, 'delete_food');
    await s.call('update_food', { id: food.id, name: `${prefix}-food-renamed`, description: 'updated', food_onhand: true });
    const read = await get('get_food', food.id);
    expect(read).toMatchObject({ name: `${prefix}-food-renamed`, description: 'updated', food_onhand: true });
  });

  it('move_food reparents a food and back to root', async () => {
    const parent = await make('create_food', { name: `${prefix}-parent` }, 'delete_food');
    const child = await make('create_food', { name: `${prefix}-child` }, 'delete_food');
    await s.call('move_food', { id: child.id, parent: parent.id });
    expect(await childIds('list_foods', parent.id)).toEqual([child.id]);
    await s.call('move_food', { id: child.id, parent: 0 });
    expect(await childIds('list_foods', parent.id)).toEqual([]);
  });

  it('merge_food removes the source and moves its ingredient to the target', async () => {
    const target = await make('create_food', { name: `${prefix}-merge-target` }, 'delete_food');
    const source = await make('create_food', { name: `${prefix}-merge-source` }, 'delete_food');
    const recipe = await make('create_recipe', {
      name: `${prefix}-merge-food-recipe`,
      steps: [{ instruction: 'Stir.', ingredients: [{ food: source.name, amount: 1 }] }],
    }, 'delete_recipe');
    await s.call('merge_food', { id: source.id, target: target.id });
    forget('delete_food', source.id);
    expect(await gone('get_food', source.id)).toBe(true);
    const read = await get('get_recipe', recipe.id);
    expect(read.steps[0].ingredients[0].food.id).toBe(target.id);
  });

  const shoppingEntriesFor = async (foodId: number) => (await s.call('list_shopping_entries', { page_size: 200, format: 'full' })).results
    .filter((e: any) => e.food?.id === foodId);

  it('food_shopping_update adds the food to the shopping list and delete removes it', async () => {
    const food = await make('create_food', { name: `${prefix}-shop` }, 'delete_food');
    await s.call('food_shopping_update', { id: food.id, amount: 3 });
    expect(await shoppingEntriesFor(food.id)).toMatchObject([{ amount: 3 }]);
    await s.call('food_shopping_update', { id: food.id, delete: true });
    expect(await shoppingEntriesFor(food.id)).toEqual([]);
  });

  it('food_shopping_update with unit_id puts the unit on the entry', async (ctx) => {
    const skip = skipFor('food_shopping_update', s.tandoorVersion, 'unit_id');
    if (skip) ctx.skip(skip.reason);
    const food = await make('create_food', { name: `${prefix}-shop-unit-food` }, 'delete_food');
    const unit = await make('create_unit', { name: `${prefix}-shop-unit` }, 'delete_unit');
    await s.call('food_shopping_update', { id: food.id, amount: 3, unit_id: unit.id });
    expect(await shoppingEntriesFor(food.id)).toMatchObject([{ amount: 3, unit: { id: unit.id } }]);
    await s.call('food_shopping_update', { id: food.id, delete: true });
    expect(await shoppingEntriesFor(food.id)).toEqual([]);
  });

  it('food_batch_update applies category and on hand to every target', async () => {
    const category = await make('create_supermarket_category', { name: `${prefix}-batch-aisle` }, 'delete_supermarket_category');
    const foods = [
      await make('create_food', { name: `${prefix}-batch-a` }, 'delete_food'),
      await make('create_food', { name: `${prefix}-batch-b` }, 'delete_food'),
    ];
    await s.call('food_batch_update', { foods: foods.map((f) => f.id), category: category.id, on_hand: true });
    for (const f of foods) {
      const read = await get('get_food', f.id);
      expect(read.supermarket_category?.id).toBe(category.id);
      expect(read.food_onhand).toBe(true);
    }
  });

  it('update_unit changes fields that read back', async () => {
    const unit = await make('create_unit', { name: `${prefix}-unit` }, 'delete_unit');
    await s.call('update_unit', { id: unit.id, name: `${prefix}-unit-renamed`, plural_name: `${prefix}-units`, description: 'updated' });
    expect(await get('get_unit', unit.id)).toMatchObject({ name: `${prefix}-unit-renamed`, plural_name: `${prefix}-units`, description: 'updated' });
  });

  it('merge_unit removes the source and moves its ingredient to the target', async () => {
    const target = await make('create_unit', { name: `${prefix}-merge-target-unit` }, 'delete_unit');
    const source = await make('create_unit', { name: `${prefix}-merge-source-unit` }, 'delete_unit');
    const food = await make('create_food', { name: `${prefix}-merge-unit-food` }, 'delete_food');
    const recipe = await make('create_recipe', {
      name: `${prefix}-merge-unit-recipe`,
      steps: [{ instruction: 'Weigh.', ingredients: [{ food: food.name, amount: 2, unit: source.name }] }],
    }, 'delete_recipe');
    await s.call('merge_unit', { id: source.id, target: target.id });
    forget('delete_unit', source.id);
    expect(await gone('get_unit', source.id)).toBe(true);
    const read = await get('get_recipe', recipe.id);
    expect(read.steps[0].ingredients[0].unit.id).toBe(target.id);
  });

  it('update_keyword changes fields that read back', async () => {
    const keyword = await make('create_keyword', { name: `${prefix}-kw` }, 'delete_keyword');
    await s.call('update_keyword', { id: keyword.id, name: `${prefix}-kw-renamed`, description: 'updated' });
    expect(await get('get_keyword', keyword.id)).toMatchObject({ name: `${prefix}-kw-renamed`, description: 'updated' });
  });

  it('move_keyword reparents a keyword and back to root', async () => {
    const parent = await make('create_keyword', { name: `${prefix}-kw-parent` }, 'delete_keyword');
    const child = await make('create_keyword', { name: `${prefix}-kw-child` }, 'delete_keyword');
    await s.call('move_keyword', { id: child.id, parent: parent.id });
    expect(await childIds('list_keywords', parent.id)).toEqual([child.id]);
    await s.call('move_keyword', { id: child.id, parent: 0 });
    expect(await childIds('list_keywords', parent.id)).toEqual([]);
  });

  it('merge_keyword removes the source and retags its recipe with the target', async () => {
    const target = await make('create_keyword', { name: `${prefix}-kw-target` }, 'delete_keyword');
    const source = await make('create_keyword', { name: `${prefix}-kw-source` }, 'delete_keyword');
    const recipe = await make('create_recipe', { name: `${prefix}-merge-kw-recipe`, keywords: [source.name], steps: [{ instruction: 'Serve.', ingredients: [] }] }, 'delete_recipe');
    await s.call('merge_keyword', { id: source.id, target: target.id });
    forget('delete_keyword', source.id);
    expect(await gone('get_keyword', source.id)).toBe(true);
    const read = await get('get_recipe', recipe.id);
    expect(read.keywords.map((k: any) => k.id)).toEqual([target.id]);
  });

  it('update_unit_conversion changes amounts that read back', async () => {
    const base = await make('create_unit', { name: `${prefix}-conv-g` }, 'delete_unit');
    const converted = await make('create_unit', { name: `${prefix}-conv-kg` }, 'delete_unit');
    const conversion = await make('create_unit_conversion', {
      base_amount: 1000, base_unit_id: base.id, converted_amount: 1, converted_unit_id: converted.id,
    }, 'delete_unit_conversion');
    await s.call('update_unit_conversion', { id: conversion.id, base_amount: 500, converted_amount: 0.5 });
    const read = await get('get_unit_conversion', conversion.id);
    expect(Number(read.base_amount)).toBe(500);
    expect(Number(read.converted_amount)).toBe(0.5);
  });

  it('update_property_type changes fields that read back', async () => {
    const type = await make('create_property_type', { name: `${prefix}-ptype`, unit: 'g' }, 'delete_property_type');
    await s.call('update_property_type', { id: type.id, name: `${prefix}-ptype-renamed`, unit: 'mg', description: 'updated' });
    expect(await get('get_property_type', type.id)).toMatchObject({ name: `${prefix}-ptype-renamed`, unit: 'mg', description: 'updated' });
  });

  it('update_property changes amount and type that read back', async () => {
    const first = await make('create_property_type', { name: `${prefix}-prop-a`, unit: 'g' }, 'delete_property_type');
    const second = await make('create_property_type', { name: `${prefix}-prop-b`, unit: 'g' }, 'delete_property_type');
    const property = await make('create_property', { property_type_id: first.id, property_amount: 3 }, 'delete_property');
    await s.call('update_property', { id: property.id, property_type_id: second.id, property_amount: 7 });
    const read = await get('get_property', property.id);
    expect(Number(read.property_amount)).toBe(7);
    expect(read.property_type.id).toBe(second.id);
  });
});
