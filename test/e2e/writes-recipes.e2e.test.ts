import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSurface, type Surface } from './helpers/surface.js';
import { COVERS } from './helpers/coverage.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;

const JPEG_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'local-storage', 'e2e-local-jpeg.jpg');

(url && token ? describe : describe.skip)('recipe, step, ingredient and recipe book writes against live Tandoor', () => {
  const letters = Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  const prefix = `e2e-wr-${Date.now()}-${letters}`;
  const undo = new Set<() => Promise<unknown>>();
  let s: Surface;
  let tempDir: string;
  let food: any;
  let food2: any;
  let unit: any;
  let kw1: any;
  let kw2: any;

  function track(fn: () => Promise<unknown>): () => void {
    undo.add(fn);
    return () => undo.delete(fn);
  }

  async function make(tool: string, args: Record<string, unknown>, deleteTool: string): Promise<any> {
    const created = await s.call(tool, { ...args, format: 'full' });
    track(() => s.call(deleteTool, { id: created.id }));
    return created;
  }

  async function api(method: string, apiPath: string, body?: unknown): Promise<any> {
    const res = await fetch(`${url}${apiPath}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    expect(res.ok, `${method} ${apiPath}: ${res.status}`).toBe(true);
    return res.json();
  }

  const getRecipe = (id: number) => s.call('get_recipe', { id, format: 'full' });

  function recipeWith(name: string, extra: Record<string, unknown> = {}): Promise<any> {
    return make('create_recipe', {
      name: `${prefix}-${name}`,
      servings: 1,
      keywords: [kw1.name],
      steps: [{ instruction: 'Mix.', ingredients: [{ food: food.name, amount: 100, unit: unit.name }] }],
      ...extra,
    }, 'delete_recipe');
  }

  beforeAll(async () => {
    s = await openSurface(url!, token!);
    tempDir = await mkdtemp(path.join(tmpdir(), 'tandoor-e2e-writes-'));
    track(() => rm(tempDir, { recursive: true }));
    food = await make('create_food', { name: `${prefix}-flour` }, 'delete_food');
    food2 = await make('create_food', { name: `${prefix}-salt` }, 'delete_food');
    unit = await make('create_unit', { name: `${prefix}-g` }, 'delete_unit');
    kw1 = await make('create_keyword', { name: `${prefix}-kw1` }, 'delete_keyword');
    kw2 = await make('create_keyword', { name: `${prefix}-kw2` }, 'delete_keyword');
  });

  afterAll(async () => {
    const failures: string[] = [];
    for (const step of [...undo].reverse()) {
      await step().catch((err: Error) => failures.push(err.message));
    }
    await s.close();
    expect(failures).toEqual([]);
    expect(COVERS['writes-recipes.e2e.test.ts'].filter((t) => !s.called.has(t))).toEqual([]);
  });

  it('update_recipe changes metadata and replaces keywords and steps', async () => {
    const r = await recipeWith('update');
    const oldStepId = r.steps[0].id;

    await s.call('update_recipe', {
      id: r.id,
      name: `${prefix}-updated`,
      description: 'updated description',
      servings: 6,
      keywords: [kw2.name],
      steps: [{ instruction: 'Bake.', ingredients: [{ food: food2.name, amount: 3, unit: unit.name }] }],
    });

    const back = await getRecipe(r.id);
    expect(back).toMatchObject({ name: `${prefix}-updated`, description: 'updated description', servings: 6 });
    expect(back.keywords.map((k: any) => k.name)).toEqual([kw2.name]);
    expect(back.steps.map((st: any) => st.instruction)).toEqual(['Bake.']);
    expect(back.steps[0].id).not.toBe(oldStepId);
    expect(back.steps[0].ingredients.map((i: any) => i.food.name)).toEqual([food2.name]);
  });

  it('recipe_batch_update sets keywords, servings and working time on every listed recipe', async () => {
    const a = await recipeWith('batch-a');
    const b = await recipeWith('batch-b');

    await s.call('recipe_batch_update', { recipes: [a.id, b.id], keywords_set: [kw2.id], servings: 9, working_time: 15 });

    for (const id of [a.id, b.id]) {
      const back = await getRecipe(id);
      expect(back.keywords.map((k: any) => k.name)).toEqual([kw2.name]);
      expect(back).toMatchObject({ servings: 9, working_time: 15 });
    }
  });

  it('upload_recipe_image attaches a local file as the recipe image', async () => {
    const r = await recipeWith('image');
    expect(r.image).toBeFalsy();
    const upload = path.join(tempDir, `${prefix}.jpg`);
    await copyFile(JPEG_FIXTURE, upload);

    await s.call('upload_recipe_image', { id: r.id, file_path: upload });

    expect((await getRecipe(r.id)).image).toMatch(/\.(jpe?g|png|webp)/i);
  });

  it('add_recipe_to_shopping_list adds every ingredient scaled by servings, and list_recipe rescales it', async () => {
    const r = await recipeWith('shop', {
      steps: [{ instruction: 'Mix.', ingredients: [{ food: food.name, amount: 100, unit: unit.name }, { food: food2.name, amount: 5, unit: unit.name }] }],
    });
    const amounts = async (slrId: number) => (await s.call('list_shopping_entries', { page_size: 100, format: 'full' })).results
      .filter((e: any) => e.list_recipe === slrId)
      .map((e: any) => [e.food.name, Number(e.amount)])
      .sort();

    await s.call('add_recipe_to_shopping_list', { id: r.id, servings: 2 });

    const [slr] = (await s.call('list_shopping_list_recipes', { page_size: 100, format: 'full' })).results
      .filter((x: any) => x.recipe === r.id);
    track(() => s.call('delete_shopping_list_recipe', { id: slr.id }));
    expect(await amounts(slr.id)).toEqual([[food.name, 200], [food2.name, 10]].sort());

    await s.call('add_recipe_to_shopping_list', { id: r.id, servings: 4, list_recipe: slr.id });

    expect(await amounts(slr.id)).toEqual([[food.name, 400], [food2.name, 20]].sort());
  });

  it('create_step, update_step and delete_step round-trip a step attached to a recipe', async () => {
    const r = await recipeWith('steps', { steps: [] });
    const created = await s.call('create_step', {
      instruction: `${prefix} created step`,
      time: 4,
      ingredients: [{ food_id: food.id, unit_id: unit.id, amount: 2 }],
      format: 'full',
    });
    await api('PATCH', `/api/recipe/${r.id}/`, { steps: [created] });

    const back = await s.call('get_step', { id: created.id, format: 'full' });
    expect(back).toMatchObject({ instruction: `${prefix} created step`, time: 4 });
    expect(back.ingredients.map((i: any) => [i.food.name, Number(i.amount)])).toEqual([[food.name, 2]]);

    await s.call('update_step', { id: created.id, instruction: 'changed', ingredients: [{ food_id: food2.id, amount: 5 }] });
    const updated = await s.call('get_step', { id: created.id, format: 'full' });
    expect(updated.instruction).toBe('changed');
    expect(updated.ingredients.map((i: any) => [i.food.name, Number(i.amount)])).toEqual([[food2.name, 5]]);

    await s.call('delete_step', { id: created.id });
    expect((await s.raw('get_step', { id: created.id })).isError).toBe(true);
    expect((await s.call('list_steps', { recipe: [r.id], format: 'full' })).results).toEqual([]);
  });

  it('create_ingredient, update_ingredient and delete_ingredient round-trip an ingredient on a step', async () => {
    const r = await recipeWith('ingredients');
    const step = r.steps[0];
    const created = await s.call('create_ingredient', { food_id: food2.id, unit_id: unit.id, amount: 2, note: 'created' });
    await api('PATCH', `/api/step/${step.id}/`, { ingredients: [...step.ingredients, created] });

    const back = await s.call('get_ingredient', { id: created.id });
    expect(back).toMatchObject({ note: 'created', food: { id: food2.id }, unit: { id: unit.id } });
    expect(Number(back.amount)).toBe(2);

    await s.call('update_ingredient', { id: created.id, amount: 7, unit_id: null, note: 'changed' });
    const updated = await s.call('get_ingredient', { id: created.id });
    expect(updated).toMatchObject({ note: 'changed', unit: null });
    expect(Number(updated.amount)).toBe(7);

    await s.call('delete_ingredient', { id: created.id });
    expect((await s.raw('get_ingredient', { id: created.id })).isError).toBe(true);
    const remaining = (await s.call('get_step', { id: step.id, format: 'full' })).ingredients.map((i: any) => i.id);
    expect(remaining).toEqual(step.ingredients.map((i: any) => i.id));
  });

  it('parse_ingredient splits amount, unit, food and note, creating the unit and food rows', async () => {
    const unitName = `${letters}spoon`;
    const foodName = `${letters}sugar`;

    const parsed = await s.call('parse_ingredient', { text: `3 ${unitName} ${foodName}, sifted` });
    track(() => s.call('delete_unit', { id: parsed.unit_id }));
    track(() => s.call('delete_food', { id: parsed.food_id }));

    expect(parsed).toMatchObject({ amount: 3, unit: unitName, food: foodName, note: 'sifted' });
    expect((await s.call('get_unit', { id: parsed.unit_id, format: 'full' })).name).toBe(unitName);
    expect((await s.call('get_food', { id: parsed.food_id, format: 'full' })).name).toBe(foodName);
  });

  it('update_recipe_book renames the book and changes its description', async () => {
    const book = await make('create_recipe_book', { name: `${prefix}-book` }, 'delete_recipe_book');

    await s.call('update_recipe_book', { id: book.id, name: `${prefix}-book-renamed`, description: 'renamed' });

    expect(await s.call('get_recipe_book', { id: book.id, format: 'full' }))
      .toMatchObject({ name: `${prefix}-book-renamed`, description: 'renamed' });
  });
});
