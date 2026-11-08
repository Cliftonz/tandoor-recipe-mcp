import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openSurface, type Surface } from './helpers/surface.js';
import { COVERS, skipFor } from './helpers/coverage.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

(url && token ? describe : describe.skip)('planning write tools against live Tandoor', () => {
  const prefix = `e2e-wp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const cleanup = new Map<string, () => Promise<unknown>>();
  let s: Surface;
  let unitId: number;
  let foodId: number;
  let keywordId: number;
  let recipeId: number;
  let ingredientId: number;
  let mealTypeId: number;

  function track(deleteTool: string, id: number): void {
    cleanup.set(`${deleteTool}:${id}`, () => s.call(deleteTool, { id }));
  }

  async function make(tool: string, args: Record<string, unknown>, deleteTool: string): Promise<any> {
    const created = await s.call(tool, args);
    track(deleteTool, created.id);
    return created;
  }

  async function destroy(deleteTool: string, getTool: string, id: number): Promise<void> {
    await s.call(deleteTool, { id });
    cleanup.delete(`${deleteTool}:${id}`);
    expect((await s.raw(getTool, { id })).isError).toBe(true);
  }

  const entriesOf = async (pred: (e: any) => boolean) =>
    (await s.call('list_shopping_entries', { page_size: 200 })).results.filter(pred);

  const plansOn = async (date: string, typeId: number) =>
    (await s.call('list_meal_plans', { from_date: date, to_date: date, page_size: 100 })).results.filter((p: any) => p.meal_type.id === typeId);

  beforeAll(async () => {
    s = await openSurface(url!, token!);
    unitId = (await make('create_unit', { name: `${prefix}-g` }, 'delete_unit')).id;
    foodId = (await make('create_food', { name: `${prefix}-flour` }, 'delete_food')).id;
    const keyword = await make('create_keyword', { name: `${prefix}-kw` }, 'delete_keyword');
    keywordId = keyword.id;
    const recipe = await make('create_recipe', {
      name: `${prefix}-bread`,
      servings: 2,
      keywords: [keyword.name],
      steps: [{ instruction: 'Mix and bake.', ingredients: [{ food: `${prefix}-flour`, amount: 500, unit: `${prefix}-g` }] }],
      format: 'full',
    }, 'delete_recipe');
    recipeId = recipe.id;
    ingredientId = recipe.steps[0].ingredients[0].id;
    mealTypeId = (await make('create_meal_type', { name: `${prefix}-meal` }, 'delete_meal_type')).id;
  });

  afterAll(async () => {
    const failures: string[] = [];
    for (const step of [...cleanup.values()].reverse()) {
      await step().catch((err: Error) => failures.push(err.message));
    }
    await s.close();
    expect(COVERS['writes-planning.e2e.test.ts'].filter((t) => !s.called.has(t))).toEqual([]);
    expect(failures).toEqual([]);
  });

  it('meal type: create, update, read back, delete', async () => {
    const created = await make('create_meal_type', { name: `${prefix}-brunch`, order: 1 }, 'delete_meal_type');
    await s.call('update_meal_type', { id: created.id, name: `${prefix}-lunch`, order: 4, color: '#abcdef', time: '12:30' });
    expect(await s.call('get_meal_type', { id: created.id })).toMatchObject({ name: `${prefix}-lunch`, order: 4, color: '#abcdef', time: '12:30:00' });
    await destroy('delete_meal_type', 'get_meal_type', created.id);
  });

  it('meal plan: create, update, read back, delete', async () => {
    const created = await make('create_meal_plan', { title: `${prefix}-plan`, servings: 1, from_date: day(10), meal_type_id: mealTypeId }, 'delete_meal_plan');
    await s.call('update_meal_plan', { id: created.id, title: `${prefix}-plan2`, servings: 3, note: 'updated', recipe_id: recipeId, to_date: day(11) });
    const plan = await s.call('get_meal_plan', { id: created.id });
    expect(plan).toMatchObject({ title: `${prefix}-plan2`, note: 'updated', recipe: { id: recipeId } });
    expect(Number(plan.servings)).toBe(3);
    expect(plan.to_date).toContain(day(11));
    await destroy('delete_meal_plan', 'get_meal_plan', created.id);
  });

  it('meal plan with addshopping puts the recipe ingredients on the shopping list', async () => {
    const plan = await make('create_meal_plan', { recipe_id: recipeId, servings: 2, from_date: day(12), meal_type_id: mealTypeId, addshopping: true }, 'delete_meal_plan');
    const slrs = (await s.call('list_shopping_list_recipes', { mealplan: plan.id })).results;
    expect(slrs.map((r: any) => r.recipe)).toEqual([recipeId]);
    const entries = (await s.call('list_shopping_entries', { mealplan: plan.id })).results;
    expect(entries.map((e: any) => [e.food_id, e.ingredient])).toEqual([[foodId, ingredientId]]);
    await destroy('delete_meal_plan', 'get_meal_plan', plan.id);
    expect((await s.raw('get_shopping_list_recipe', { id: slrs[0].id })).isError).toBe(true);
    expect((await s.raw('get_shopping_entry', { id: entries[0].id })).isError).toBe(true);
  });

  it('bulk_create_meal_plans creates every entry', async () => {
    const res = await s.call('bulk_create_meal_plans', {
      entries: [
        { recipe_id: recipeId, servings: 2, from_date: day(13), meal_type_id: mealTypeId },
        { title: `${prefix}-bulk`, servings: 1, from_date: day(13), meal_type_id: mealTypeId, note: 'bulk' },
      ],
    });
    for (const c of res.created) track('delete_meal_plan', c.id);
    expect(res.failed).toEqual([]);
    const plans = await plansOn(day(13), mealTypeId);
    expect(plans.map((p: any) => [p.recipe?.id ?? null, p.title]).sort()).toEqual([[recipeId, ''], [null, `${prefix}-bulk`]].sort());
    for (const c of res.created) await destroy('delete_meal_plan', 'get_meal_plan', c.id);
  });

  it('auto_meal_plan plans the keyword recipe on each day', async () => {
    await s.call('auto_meal_plan', { start_date: day(14), end_date: day(15), meal_type_id: mealTypeId, keyword_ids: [keywordId], servings: 1, addshopping: false });
    const plans = [...await plansOn(day(14), mealTypeId), ...await plansOn(day(15), mealTypeId)];
    for (const p of plans) track('delete_meal_plan', p.id);
    expect(plans.map((p: any) => p.recipe.id)).toEqual([recipeId, recipeId]);
    for (const p of plans) await destroy('delete_meal_plan', 'get_meal_plan', p.id);
  });

  it('supermarket: create, update, read back, delete', async () => {
    const created = await make('create_supermarket', { name: `${prefix}-market` }, 'delete_supermarket');
    await s.call('update_supermarket', { id: created.id, name: `${prefix}-market2`, description: 'updated' });
    expect(await s.call('get_supermarket', { id: created.id })).toMatchObject({ name: `${prefix}-market2`, description: 'updated' });
    await destroy('delete_supermarket', 'get_supermarket', created.id);
  });

  it('cook log: create, update, read back, delete', async () => {
    const created = await make('create_cook_log', { recipe: recipeId, servings: 2, rating: 3, comment: prefix }, 'delete_cook_log');
    await s.call('update_cook_log', { id: created.id, servings: 4, rating: 5, comment: `${prefix}-again` });
    expect(await s.call('get_cook_log', { id: created.id })).toMatchObject({ recipe: recipeId, servings: 4, rating: 5, comment: `${prefix}-again` });
    await destroy('delete_cook_log', 'get_cook_log', created.id);
  });

  it('shopping list: create, update, read back, delete', async () => {
    const created = await make('create_shopping_list', { name: `${prefix}-sl` }, 'delete_shopping_list');
    await s.call('update_shopping_list', { id: created.id, name: `${prefix}-sl2`, description: 'updated', color: '#112233' });
    expect(await s.call('get_shopping_list', { id: created.id })).toEqual({ id: created.id, name: `${prefix}-sl2`, description: 'updated', color: '#112233' });
    await destroy('delete_shopping_list', 'get_shopping_list', created.id);
  });

  it('shopping entries: update, bulk check, bulk update lists, delete', async () => {
    const listA = await make('create_shopping_list', { name: `${prefix}-a` }, 'delete_shopping_list');
    const listB = await make('create_shopping_list', { name: `${prefix}-b` }, 'delete_shopping_list');
    const first = await make('create_shopping_entry', { amount: 1, food_id: foodId, unit_id: unitId, shopping_list_ids: [listA.id] }, 'delete_shopping_entry');
    const second = await make('create_shopping_entry', { amount: 2, food_id: foodId, shopping_list_ids: [listA.id] }, 'delete_shopping_entry');
    const ids = [first.id, second.id];

    await s.call('update_shopping_entry', { id: first.id, amount: 3, unit_id: null });
    expect(await s.call('get_shopping_entry', { id: first.id })).toMatchObject({ amount: 3, unit_id: null, checked: false });

    await s.call('bulk_check_shopping_entries', { ids, checked: true });
    for (const id of ids) expect((await s.call('get_shopping_entry', { id })).checked).toBe(true);

    await s.call('bulk_update_shopping_entries', { ids, checked: false, shopping_lists_set: [listB.id] });
    for (const id of ids) {
      expect(await s.call('get_shopping_entry', { id })).toMatchObject({ checked: false, shopping_lists: [{ id: listB.id, name: listB.name }] });
    }

    for (const id of ids) await destroy('delete_shopping_entry', 'get_shopping_entry', id);
  });

  it('shopping list recipe: update, bulk create entries, delete cascades to entries', async () => {
    const list = await make('create_shopping_list', { name: `${prefix}-r` }, 'delete_shopping_list');
    const slr = await make('create_shopping_list_recipe', { servings: 1, name: `${prefix}-slr`, recipe: recipeId }, 'delete_shopping_list_recipe');
    const first = await make('create_shopping_entry', { amount: 1, food_id: foodId, list_recipe: slr.id }, 'delete_shopping_entry');

    await s.call('update_shopping_list_recipe', { id: slr.id, name: `${prefix}-slr2`, servings: 3 });
    expect(await s.call('get_shopping_list_recipe', { id: slr.id })).toMatchObject({ name: `${prefix}-slr2`, servings: 3, recipe: recipeId });

    await s.call('bulk_create_shopping_list_recipe_entries', {
      id: slr.id,
      entries: [{ amount: 7, food_id: foodId, unit_id: unitId, ingredient_id: null }],
      shopping_list_ids: [list.id],
    });
    const added = await entriesOf((e) => e.list_recipe === slr.id && e.id !== first.id);
    for (const e of added) track('delete_shopping_entry', e.id);
    expect(added).toMatchObject([{ amount: 7, food_id: foodId, unit_id: unitId, shopping_lists: [{ id: list.id }] }]);

    await destroy('delete_shopping_list_recipe', 'get_shopping_list_recipe', slr.id);
    for (const e of [first, ...added]) {
      expect((await s.raw('get_shopping_entry', { id: e.id })).isError).toBe(true);
      cleanup.delete(`delete_shopping_entry:${e.id}`);
    }
  });

  it('add_recipe_to_shopping_list adds every ingredient, then rescales it through list_recipe', async () => {
    await s.call('add_recipe_to_shopping_list', { id: recipeId, servings: 4 });
    const slrs = (await s.call('list_shopping_list_recipes', { page_size: 200 })).results.filter((r: any) => r.recipe === recipeId);
    for (const r of slrs) track('delete_shopping_list_recipe', r.id);
    expect(slrs).toMatchObject([{ servings: 4 }]);
    expect((await entriesOf((e) => e.list_recipe === slrs[0].id)).map((e: any) => [e.ingredient, e.amount])).toEqual([[ingredientId, 1000]]);

    await s.call('add_recipe_to_shopping_list', { id: recipeId, servings: 6, list_recipe: slrs[0].id });
    expect(await s.call('get_shopping_list_recipe', { id: slrs[0].id })).toMatchObject({ servings: 6 });
    expect((await entriesOf((e) => e.list_recipe === slrs[0].id)).map((e: any) => [e.ingredient, e.amount])).toEqual([[ingredientId, 1500]]);
    await destroy('delete_shopping_list_recipe', 'get_shopping_list_recipe', slrs[0].id);
  });

  it('food_shopping_update adds the food, and delete removes its unchecked entries', async () => {
    const salt = await make('create_food', { name: `${prefix}-salt` }, 'delete_food');
    const unit = skipFor('food_shopping_update', s.tandoorVersion, 'unit_id') ? {} : { unit_id: unitId };
    await s.call('food_shopping_update', { id: salt.id, amount: 2, ...unit });
    const added = await entriesOf((e) => e.food_id === salt.id);
    for (const e of added) track('delete_shopping_entry', e.id);
    expect(added).toMatchObject([{ amount: 2, ...unit, checked: false }]);

    await s.call('food_shopping_update', { id: salt.id, delete: true });
    expect(await entriesOf((e) => e.food_id === salt.id)).toEqual([]);
    expect((await s.raw('get_shopping_entry', { id: added[0].id })).isError).toBe(true);
    cleanup.delete(`delete_shopping_entry:${added[0].id}`);
  });

  it('inventory: update location and entry, consume, move, delete', async () => {
    const userSpace = (await s.call('list_all_personal_user_spaces', {})).find((us: any) => us.active);
    if (!userSpace.household) {
      const household = await make('create_household', { name: `${prefix}-home` }, 'delete_household');
      await s.call('assign_household', { user_space_ids: [userSpace.id], household_id: household.id });
      cleanup.set('restore-household', () => s.call('assign_household', { user_space_ids: [userSpace.id], household_id: null }));
    }
    const pantry = await make('create_inventory_location', { name: `${prefix}-pantry` }, 'delete_inventory_location');
    const fridge = await make('create_inventory_location', { name: `${prefix}-fridge` }, 'delete_inventory_location');

    await s.call('update_inventory_location', { id: fridge.id, name: `${prefix}-freezer`, is_freezer: true });
    expect(await s.call('get_inventory_location', { id: fridge.id })).toMatchObject({ name: `${prefix}-freezer`, is_freezer: true });

    const entry = await make('add_inventory_item', { food_id: foodId, unit_id: unitId, amount: 5, location_id: pantry.id }, 'delete_inventory_entry');
    await s.call('update_inventory_entry', { id: entry.id, amount: 6, note: prefix, sub_location: 'top shelf', expires: day(30) });
    expect(await s.call('get_inventory_entry', { id: entry.id })).toMatchObject({ amount: 6, note: prefix, sub_location: 'top shelf', expires: day(30) });

    await s.call('consume_inventory_item', { entry_id: entry.id, amount: 2 });
    expect((await s.call('get_inventory_entry', { id: entry.id })).amount).toBe(4);
    const afterConsume = (await s.call('list_inventory_logs', { entry_id: entry.id })).results;
    expect(afterConsume).toContainEqual(expect.objectContaining({ booking_type: 'remove', old_amount: 6, new_amount: 4 }));

    await s.call('move_inventory_item', { entry_id: entry.id, to_location_id: fridge.id, sub_location: 'door' });
    expect(await s.call('get_inventory_entry', { id: entry.id })).toMatchObject({ location_id: fridge.id, sub_location: 'door', amount: 4 });
    const afterMove = (await s.call('list_inventory_logs', { entry_id: entry.id })).results;
    expect(afterMove).toContainEqual(expect.objectContaining({ booking_type: 'move', old_location: `${prefix}-pantry`, new_location: `${prefix}-freezer` }));

    await destroy('delete_inventory_entry', 'get_inventory_entry', entry.id);
    await destroy('delete_inventory_location', 'get_inventory_location', fridge.id);
    await destroy('delete_inventory_location', 'get_inventory_location', pantry.id);
  });
});
