// Happy-path + error-path coverage for handlers across every domain.
// Each test mocks only the specific client method under test — the goal is
// to catch regressions in the slimming, payload-shaping, and error-wrapping
// logic that lives between the MCP boundary and the HTTP client.

import { describe, it, expect, vi } from 'vitest';
import { handleListMealPlans, handleCreateMealPlan, handleUpdateMealPlan, handleDeleteMealPlan } from '../src/handlers/mealplan.js';
import { handleListFoods, handleCreateFood, handleUpdateFood, handleMergeFood, handleFoodShoppingUpdate, handleFoodFdcLookup } from '../src/handlers/foodunit.js';
import { handleCreateCookLog, handleListCookLogs } from '../src/handlers/cooklog.js';
import { handleCreateShoppingEntry, handleBulkCheckShoppingEntries } from '../src/handlers/shopping.js';
import { handleCreateStep } from '../src/handlers/step.js';
import { handleCreateBook, handleCreateBookEntry } from '../src/handlers/recipebook.js';
import { handleSearchRecipes } from '../src/handlers/recipe.js';
import { slimPaginated, refId, emit } from '../src/lib/slim.js';

// ---------- Shared helpers from src/lib/slim.ts ----------

describe('slim library helpers', () => {
  it('slimPaginated maps each result and preserves pagination fields', () => {
    const slim = (x: { id: number; name: string }) => ({ id: x.id });
    const page = {
      count: 2,
      next: 'https://x/?page=2',
      previous: null,
      results: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }],
    };
    expect(slimPaginated(page, slim)).toEqual({
      count: 2,
      next: 'https://x/?page=2',
      previous: null,
      results: [{ id: 1 }, { id: 2 }],
    });
  });

  it('slimPaginated returns the input unchanged when it is not paginated', () => {
    expect(slimPaginated({ something: 'else' }, (x) => x)).toEqual({ something: 'else' });
    expect(slimPaginated(null, (x) => x)).toBeNull();
    expect(slimPaginated([1, 2], (x) => x)).toEqual([1, 2]);
  });

  it('refId wraps ids in the Tandoor nested envelope and passes nulls through', () => {
    expect(refId(5)).toEqual({ id: 5 });
    expect(refId(null)).toBeNull();
    expect(refId(undefined)).toBeNull();
  });

  it('emit compactly serializes without indentation', () => {
    expect(emit({ a: 1 })).toBe('{"a":1}');
  });
});

// ---------- Meal plan handlers ----------

describe('meal plan handlers', () => {
  it('handleCreateMealPlan builds the nested {recipe:{id}, meal_type:{id}} envelope', async () => {
    const createMealPlan = vi.fn(async (body) => ({ id: 10, ...body, servings: body.servings }));
    const client = { mealPlans: { createMealPlan } } as any;
    const out = await handleCreateMealPlan(client, {
      recipe_id: 42,
      meal_type_id: 1,
      servings: 2,
      from_date: '2026-04-18',
      note: 'dinner',
    });
    expect(out).toContain('Meal plan created');
    const body = createMealPlan.mock.calls[0][0];
    expect(body.recipe).toEqual({ id: 42 });
    expect(body.meal_type).toEqual({ id: 1 });
    expect(body.note).toBe('dinner');
  });

  it('handleCreateMealPlan enforces the "recipe_id OR title" rule', async () => {
    const client = { mealPlans: { createMealPlan: vi.fn() } } as any;
    await expect(
      handleCreateMealPlan(client, { meal_type_id: 1, servings: 2, from_date: '2026-04-18' })
    ).rejects.toThrow(/recipe_id or title/);
    expect(client.mealPlans.createMealPlan).not.toHaveBeenCalled();
  });

  it('handleUpdateMealPlan passes null through to clear the recipe link', async () => {
    const patchMealPlan = vi.fn(async (id, body) => ({ id, ...body }));
    const client = { mealPlans: { patchMealPlan } } as any;
    await handleUpdateMealPlan(client, { id: 5, recipe_id: null });
    expect(patchMealPlan.mock.calls[0][1].recipe).toBeNull();
  });

  it('handleDeleteMealPlan confirms the id in the success message', async () => {
    const client = { mealPlans: { deleteMealPlan: vi.fn(async () => undefined) } } as any;
    const out = await handleDeleteMealPlan(client, { id: 99 });
    expect(out).toMatch(/99 deleted/);
  });

  it('handleListMealPlans forwards filters unchanged', async () => {
    const listMealPlans = vi.fn(async () => ({ count: 0, results: [] }));
    const client = { mealPlans: { listMealPlans } } as any;
    await handleListMealPlans(client, { from_date: '2026-04-01', to_date: '2026-04-30', page_size: 10 });
    expect(listMealPlans.mock.calls[0][0]).toEqual({
      from_date: '2026-04-01',
      to_date: '2026-04-30',
      page_size: 10,
    });
  });
});

// ---------- Food handlers ----------

describe('food handlers', () => {
  it('slimFood strips nested substitute/parent/etc from the list response', async () => {
    const listFoods = vi.fn(async () => ({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 3,
          name: 'onion',
          plural_name: 'onions',
          full_name: 'onion',
          description: 'a bulb',
          food_onhand: true,
          supermarket_category: { id: 9, name: 'produce' },
          parent: null,
          numchild: 0,
          fdc_id: 111,
          // noise fields we expect to drop
          substitute: [{ id: 77 }],
          recipe: { steps: [/* enormous */] },
          created_by: { id: 1 },
        },
      ],
    }));
    const client = { foodUnits: { listFoods } } as any;
    const out = await handleListFoods(client, {});
    const parsed = JSON.parse(out);
    expect(parsed.results[0]).toMatchObject({
      id: 3,
      name: 'onion',
      supermarket_category: 'produce',
      supermarket_category_id: 9,
      food_onhand: true,
    });
    expect(parsed.results[0]).not.toHaveProperty('substitute');
    expect(parsed.results[0]).not.toHaveProperty('recipe');
  });

  it('handleCreateFood builds {supermarket_category: {id}} envelope when id provided', async () => {
    const createFood = vi.fn(async (b) => ({ id: 20, ...b }));
    const client = { foodUnits: { createFood } } as any;
    await handleCreateFood(client, { name: 'kale', supermarket_category_id: 5 });
    expect(createFood.mock.calls[0][0].supermarket_category).toEqual({ id: 5 });
  });

  it('handleCreateFood passes null supermarket_category_id through as null', async () => {
    const createFood = vi.fn(async (b) => ({ id: 20, ...b }));
    const client = { foodUnits: { createFood } } as any;
    await handleCreateFood(client, { name: 'kale', supermarket_category_id: null });
    expect(createFood.mock.calls[0][0].supermarket_category).toBeNull();
  });

  it('handleUpdateFood rejects id-only no-op patches', async () => {
    const client = { foodUnits: { patchFood: vi.fn() } } as any;
    await expect(handleUpdateFood(client, { id: 1 })).rejects.toThrow(/At least one field/);
    expect(client.foodUnits.patchFood).not.toHaveBeenCalled();
  });

  it('handleMergeFood calls the merge endpoint with both ids', async () => {
    const mergeFood = vi.fn(async () => ({ id: 3, name: 'beef' }));
    const client = { foodUnits: { mergeFood } } as any;
    const out = await handleMergeFood(client, { id: 7, target: 3 });
    expect(mergeFood).toHaveBeenCalledWith(7, 3);
    expect(out).toMatch(/7 merged into 3/);
  });

  it('handleFoodShoppingUpdate translates delete=true → delete:"true"', async () => {
    const foodShoppingUpdate = vi.fn(async () => ({}));
    const client = { foodUnits: { foodShoppingUpdate } } as any;
    await handleFoodShoppingUpdate(client, { id: 5, delete: true });
    expect(foodShoppingUpdate.mock.calls[0][1].delete).toBe('true');
  });

  it('handleFoodFdcLookup fetches current food, overlays fdc_id, and posts', async () => {
    const getFood = vi.fn(async () => ({ id: 1, name: 'x', fdc_id: null }));
    const foodFdcLookup = vi.fn(async () => ({ id: 1, name: 'x', fdc_id: 999 }));
    const client = { foodUnits: { getFood, foodFdcLookup } } as any;
    await handleFoodFdcLookup(client, { id: 1, fdc_id: 999 });
    const body = foodFdcLookup.mock.calls[0][1];
    expect(body.fdc_id).toBe(999);
    expect(body.id).toBe(1);
  });
});

// ---------- Cook log ----------

describe('cook log handlers', () => {
  it('handleCreateCookLog requires only recipe id; all other fields optional', async () => {
    const createCookLog = vi.fn(async (b) => ({ id: 1, ...b }));
    const client = { cookLogs: { createCookLog } } as any;
    await handleCreateCookLog(client, { recipe: 50 });
    expect(createCookLog.mock.calls[0][0]).toEqual({ recipe: 50 });
  });

  it('handleListCookLogs filters by recipe when provided', async () => {
    const listCookLogs = vi.fn(async () => ({ count: 0, results: [] }));
    const client = { cookLogs: { listCookLogs } } as any;
    await handleListCookLogs(client, { recipe: 42 });
    expect(listCookLogs.mock.calls[0][0]).toEqual({ recipe: 42 });
  });
});

// ---------- Shopping ----------

describe('shopping handlers', () => {
  it('handleCreateShoppingEntry sends nested food/unit and optional mealplan_id', async () => {
    const createEntry = vi.fn(async (b) => ({ id: 1, ...b }));
    const client = { shopping: { createEntry } } as any;
    await handleCreateShoppingEntry(client, {
      amount: 2,
      food_id: 3,
      unit_id: 4,
      mealplan_id: 99,
    });
    const body = createEntry.mock.calls[0][0];
    expect(body.food).toEqual({ id: 3 });
    expect(body.unit).toEqual({ id: 4 });
    expect(body.mealplan_id).toBe(99);
  });

  it('handleCreateShoppingEntry passes null unit when unit_id is null', async () => {
    const createEntry = vi.fn(async (b) => ({ id: 1, ...b }));
    const client = { shopping: { createEntry } } as any;
    await handleCreateShoppingEntry(client, { amount: 1, food_id: 3, unit_id: null });
    expect(createEntry.mock.calls[0][0].unit).toBeNull();
  });

  it('handleBulkCheckShoppingEntries rejects empty ids even with valid checked', async () => {
    const client = { shopping: { bulkCheckEntries: vi.fn() } } as any;
    await expect(
      handleBulkCheckShoppingEntries(client, { ids: [], checked: true })
    ).rejects.toThrow(/non-empty/);
    expect(client.shopping.bulkCheckEntries).not.toHaveBeenCalled();
  });
});

// ---------- Steps ----------

describe('step handler find-or-create path', () => {
  it('handleCreateStep resolves food/unit names to ids via findOrCreate', async () => {
    const findOrCreateFood = vi.fn(async (name: string) => ({ id: 10, name }));
    const findOrCreateUnit = vi.fn(async (name: string) => ({ id: 20, name }));
    const createStep = vi.fn(async (b) => ({ id: 99, ...b }));
    const client = {
      recipes: { findOrCreateFood, findOrCreateUnit },
      steps: { createStep },
    } as any;

    await handleCreateStep(client, {
      instruction: 'mix',
      ingredients: [{ food: 'flour', unit: 'cup', amount: 2 }],
    });

    expect(findOrCreateFood).toHaveBeenCalledWith('flour');
    expect(findOrCreateUnit).toHaveBeenCalledWith('cup');
    const body = createStep.mock.calls[0][0];
    expect(body.ingredients[0]).toMatchObject({
      food: { id: 10, name: 'flour' },
      unit: { id: 20, name: 'cup' },
      amount: 2,
    });
  });

  it('handleCreateStep prefers food_id/unit_id when both are provided', async () => {
    const findOrCreateFood = vi.fn();
    const findOrCreateUnit = vi.fn();
    const createStep = vi.fn(async (b) => ({ id: 1, ...b }));
    const client = {
      recipes: { findOrCreateFood, findOrCreateUnit },
      steps: { createStep },
    } as any;

    await handleCreateStep(client, {
      instruction: 'mix',
      ingredients: [{ food_id: 100, unit_id: 200, amount: 1 }],
    });

    expect(findOrCreateFood).not.toHaveBeenCalled();
    expect(findOrCreateUnit).not.toHaveBeenCalled();
    expect(createStep.mock.calls[0][0].ingredients[0].food).toEqual({ id: 100 });
  });
});

// ---------- Recipe books ----------

describe('recipe book handlers', () => {
  it('handleCreateBook maps shared_user_ids into the shared[] envelope', async () => {
    const createBook = vi.fn(async (b) => ({ id: 1, ...b }));
    const client = { recipeBooks: { createBook } } as any;
    await handleCreateBook(client, { name: 'Weeknight', shared_user_ids: [2, 3] });
    expect(createBook.mock.calls[0][0].shared).toEqual([{ id: 2 }, { id: 3 }]);
  });

  it('handleCreateBookEntry links a recipe to a book with both ids in the body', async () => {
    const createBookEntry = vi.fn(async (b) => ({ id: 500, ...b }));
    const client = { recipeBooks: { createBookEntry } } as any;
    await handleCreateBookEntry(client, { book: 10, recipe: 42 });
    expect(createBookEntry).toHaveBeenCalledWith({ book: 10, recipe: 42 });
  });
});

// ---------- search_recipes ----------

describe('search_recipes handler', () => {
  function searchClient(overrides: any = {}) {
    return {
      foodUnits: {
        listFoods: vi.fn(async ({ query }: any) => ({
          results: [
            { id: 1, name: 'chicken' },
            { id: 2, name: 'chicken breast' },
            { id: 3, name: 'broccoli' },
          ].filter((f) => f.name.includes(query)),
        })),
      },
      keywords: {
        listKeywords: vi.fn(async ({ query }: any) => ({
          results: [
            { id: 10, name: 'weeknight' },
            { id: 11, name: 'vegetarian' },
          ].filter((k) => k.name.includes(query)),
        })),
      },
      recipeBooks: {
        listBooks: vi.fn(async () => ({
          results: [
            { id: 20, name: 'Weeknight favorites' },
            { id: 21, name: 'Sunday cooking' },
          ],
        })),
      },
      recipes: {
        listRecipes: vi.fn(async () => ({
          count: 0,
          next: null,
          previous: null,
          results: [],
        })),
      },
      ...overrides,
    } as any;
  }

  it('resolves food + keyword names and forwards the right filter keys to list_recipes', async () => {
    const client = searchClient();
    await handleSearchRecipes(client, {
      foods: ['chicken', 'broccoli'],
      exclude_foods: ['peanuts'], // should not resolve
      keywords: ['weeknight'],
    });

    const listCall = client.recipes.listRecipes.mock.calls[0][0];
    expect(listCall.foods_and).toEqual([1, 3]); // "chicken" picks up id 1 (exact)
    expect(listCall.keywords_or).toEqual([10]);
    // "peanuts" unresolved → filter dropped.
    expect(listCall.foods_and_not).toBeUndefined();
  });

  it('adds _meta.unresolved when some names do not match', async () => {
    const client = searchClient();
    const out = await handleSearchRecipes(client, {
      foods: ['chicken'],
      exclude_foods: ['peanuts'],
    });
    const parsed = JSON.parse(out);
    expect(parsed._meta).toBeDefined();
    expect(parsed._meta.unresolved.exclude_foods).toContain('peanuts');
  });

  it('prefers exact name match over substring match', async () => {
    const client = searchClient();
    // "chicken" exactly matches the {id:1, name:'chicken'} row, not the
    // {id:2, name:'chicken breast'} substring row.
    await handleSearchRecipes(client, { foods: ['chicken'] });
    expect(client.recipes.listRecipes.mock.calls[0][0].foods_and).toEqual([1]);
  });

  it('forwards text-search + rating filters directly', async () => {
    const client = searchClient();
    await handleSearchRecipes(client, {
      query: 'stew',
      rating_gte: 4,
      sort_order: '-rating',
      makenow: true,
      page_size: 10,
    });
    const call = client.recipes.listRecipes.mock.calls[0][0];
    expect(call.query).toBe('stew');
    expect(call.rating_gte).toBe(4);
    expect(call.sort_order).toBe('-rating');
    expect(call.makenow).toBe(true);
    expect(call.page_size).toBe(10);
  });
});
