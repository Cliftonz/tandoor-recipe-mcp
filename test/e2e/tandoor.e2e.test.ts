/**
 * End-to-end test against a live Tandoor instance.
 *
 * WARNING: This suite creates and deletes real rows in the configured Tandoor
 * space. Run it only against an ISOLATED test space. Every resource the suite
 * creates is tracked and cleaned up in the `afterAll` hook, in reverse order.
 *
 * Required env:
 *   TANDOOR_URL    — base URL of the Tandoor instance
 *   TANDOOR_TOKEN  — API token with write access to the test space
 *
 * Optional env:
 *   TANDOOR_E2E_KEEP=1                 — skip cleanup (leaves resources in place for manual inspection)
 *   TANDOOR_E2E_SKIP_IMPORT=1          — skip the URL-import step (useful if the runner has no internet)
 *   TANDOOR_E2E_IMPORT_URL=<url>       — override the default recipe URL used for import
 *   TANDOOR_E2E_AI_PROVIDER=<id>       — run AI-import against this provider id (otherwise skipped)
 *
 * Run: `npm run test:e2e`
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TandoorClient } from '../../src/clients/index.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const haveCreds = !!(url && token);

// Cleanup registry: each entry runs in LIFO order. Keep labels so the teardown
// log is readable when something fails halfway.
interface CleanupTask {
  label: string;
  fn: () => Promise<any>;
}

const cleanup: CleanupTask[] = [];

// Shared across tests — populated as the workflow progresses.
const ctx: Record<string, any> = {};

function describeE2E(name: string, fn: () => void) {
  const d = haveCreds ? describe : describe.skip;
  return d(name, fn);
}

describeE2E('Tandoor E2E workflow', () => {
  let client: TandoorClient;

  beforeAll(() => {
    client = new TandoorClient({ url: url!, token: token! });
    // eslint-disable-next-line no-console
    console.log(`\n  Using Tandoor @ ${url}\n  Keep resources on failure: ${!!process.env.TANDOOR_E2E_KEEP}\n`);
  });

  afterAll(async () => {
    if (process.env.TANDOOR_E2E_KEEP === '1') {
      // eslint-disable-next-line no-console
      console.log(`\n  TANDOOR_E2E_KEEP=1 — leaving ${cleanup.length} resource(s) behind for inspection.`);
      for (const t of cleanup) console.log(`    • ${t.label}`);
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`\n  Cleaning up ${cleanup.length} resource(s)...`);
    let failed = 0;
    while (cleanup.length > 0) {
      const task = cleanup.pop()!;
      try {
        await task.fn();
      } catch (err) {
        failed++;
        // eslint-disable-next-line no-console
        console.error(`    ✗ ${task.label}: ${(err as Error).message}`);
      }
    }
    if (failed > 0) {
      // eslint-disable-next-line no-console
      console.error(`  ${failed} cleanup step(s) failed — inspect manually.`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`  All cleanup complete.`);
    }
  });

  // ---------------- read-only sanity ----------------

  it('server-settings endpoint responds', async () => {
    const s = await client.serverSettings.getCurrent();
    expect(s).toBeDefined();
  });

  it('list meal types returns something iterable', async () => {
    const types = await client.mealPlans.listMealTypes();
    expect(Array.isArray(types)).toBe(true);
    ctx.mealTypeId = types[0]?.id;
    // Create a meal type on the fly if none exist so downstream steps work.
    if (!ctx.mealTypeId) {
      // Use the raw endpoint — create-meal-type isn't exposed via tools, but
      // it's just a POST /api/meal-type/
      const created: any = await (client.mealPlans as any).request('/api/meal-type/', {
        method: 'POST',
        body: JSON.stringify({ name: `e2e-meal-type-${Date.now()}` }),
      });
      ctx.mealTypeId = created.id;
      cleanup.push({
        label: `meal-type ${created.id}`,
        fn: () => (client.mealPlans as any).request(`/api/meal-type/${created.id}/`, { method: 'DELETE' }),
      });
    }
    expect(ctx.mealTypeId).toBeGreaterThan(0);
  });

  // ---------------- foundation resources ----------------

  it('creates a food', async () => {
    const suffix = Date.now();
    const f = await client.foodUnits.createFood({ name: `e2e-food-${suffix}` });
    ctx.foodId = f.id;
    cleanup.push({ label: `food ${f.id}`, fn: () => client.foodUnits.deleteFood(f.id) });
    expect(f.id).toBeGreaterThan(0);
    expect(f.name).toContain('e2e-food-');
  });

  it('creates a unit', async () => {
    const suffix = Date.now();
    const u = await client.foodUnits.createUnit({ name: `e2e-unit-${suffix}` });
    ctx.unitId = u.id;
    cleanup.push({ label: `unit ${u.id}`, fn: () => client.foodUnits.deleteUnit(u.id) });
    expect(u.id).toBeGreaterThan(0);
  });

  it('creates a keyword', async () => {
    const suffix = Date.now();
    const k = await client.keywords.createKeyword({ name: `e2e-kw-${suffix}` });
    ctx.keywordId = k.id;
    cleanup.push({ label: `keyword ${k.id}`, fn: () => client.keywords.deleteKeyword(k.id) });
    expect(k.id).toBeGreaterThan(0);
  });

  // ---------------- recipe write/update ----------------

  it('creates a recipe with keyword, step, and ingredient (nested objects)', async () => {
    const recipe = await client.recipes.createRecipe({
      name: `e2e-recipe-${Date.now()}`,
      description: 'Created by E2E suite',
      servings: 2,
      working_time: 10,
      waiting_time: 0,
      internal: true,
      keywords: [{ id: ctx.keywordId, name: 'kw' } as any],
      steps: [
        {
          instruction: 'Mix everything.',
          time: 5,
          ingredients: [
            {
              food: { id: ctx.foodId } as any,
              unit: { id: ctx.unitId } as any,
              amount: 2,
              note: 'diced',
            },
          ],
        } as any,
      ],
    });
    ctx.recipeId = recipe.id;
    cleanup.push({ label: `recipe ${recipe.id}`, fn: () => (client.recipes as any).request(`/api/recipe/${recipe.id}/`, { method: 'DELETE' }) });
    expect(recipe.id).toBeGreaterThan(0);
    expect(Array.isArray(recipe.steps)).toBe(true);
    expect(recipe.steps[0].ingredients[0].food.id).toBe(ctx.foodId);
  });

  it('get recipe returns the created recipe', async () => {
    const r = await client.recipes.getRecipe(ctx.recipeId);
    expect(r.id).toBe(ctx.recipeId);
  });

  it('list_recipes finds the new recipe via query', async () => {
    const list = await client.recipes.listRecipes({ query: 'e2e-recipe', page_size: 25 });
    const hit = list.results.find((x: any) => x.id === ctx.recipeId);
    expect(hit).toBeDefined();
  });

  it('list_recipes accepts expanded filter params (rating_gte, keywords_or)', async () => {
    // Just assert the API accepts the params (non-zero result not required).
    const list = await client.recipes.listRecipes({
      keywords_or: [ctx.keywordId],
      rating_gte: 0,
      sort_order: '-created_at',
      page_size: 10,
    });
    expect(list).toBeDefined();
    expect(Array.isArray(list.results)).toBe(true);
  });

  it('patches the recipe description', async () => {
    const r = await client.recipes.patchRecipe(ctx.recipeId, { description: 'Updated by E2E' });
    expect(r.description).toBe('Updated by E2E');
  });

  // ---------------- standalone step CRUD ----------------

  it('adds a step via step CRUD and deletes it', async () => {
    const s = await client.steps.createStep({
      instruction: 'Extra step added via /api/step/',
      ingredients: [],
      order: 99,
    });
    expect(s.id).toBeGreaterThan(0);
    await client.steps.deleteStep(s.id);
  });

  // ---------------- recipe actions ----------------

  it('related_recipes returns an array', async () => {
    const r = await client.recipes.relatedRecipes(ctx.recipeId);
    expect(Array.isArray(r) || Array.isArray(r?.results)).toBe(true);
  });

  // ---------------- meal plan ----------------

  it('creates a meal plan for the recipe', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const mp = await client.mealPlans.createMealPlan({
      recipe: { id: ctx.recipeId } as any,
      meal_type: { id: ctx.mealTypeId } as any,
      servings: 2,
      from_date: today,
    } as any);
    ctx.mealPlanId = mp.id;
    cleanup.push({ label: `meal-plan ${mp.id}`, fn: () => client.mealPlans.deleteMealPlan(mp.id) });
    expect(mp.id).toBeGreaterThan(0);
  });

  it('patches the meal plan servings', async () => {
    const r = await client.mealPlans.patchMealPlan(ctx.mealPlanId, { servings: 3 });
    expect(Number(r.servings)).toBe(3);
  });

  // ---------------- shopping list ----------------

  it('adds the recipe to the shopping list', async () => {
    const r = await client.recipes.recipeShoppingUpdate(ctx.recipeId, {
      servings: 1,
      ingredients: [],
    });
    expect(r).toBeDefined();
    // Find the list_recipe just created (for later cleanup).
    const lrList = await client.shopping.listShoppingListRecipes({ page_size: 50 });
    const match = (lrList.results || []).find((x: any) => x.recipe === ctx.recipeId);
    if (match) {
      ctx.shoppingListRecipeId = match.id;
      cleanup.push({
        label: `shopping-list-recipe ${match.id}`,
        fn: () => client.shopping.deleteShoppingListRecipe(match.id),
      });
    }
  });

  it('creates a standalone shopping entry and bulk-checks it', async () => {
    const entry = await client.shopping.createEntry({
      amount: 1,
      food: { id: ctx.foodId },
      unit: { id: ctx.unitId },
      checked: false,
    });
    ctx.shoppingEntryId = entry.id;
    cleanup.push({ label: `shopping-entry ${entry.id}`, fn: () => client.shopping.deleteEntry(entry.id) });
    const bulk = await client.shopping.bulkCheckEntries([entry.id], true);
    expect(bulk).toBeDefined();
  });

  // ---------------- cook log ----------------

  it('creates a cook log entry', async () => {
    const cl = await client.cookLogs.createCookLog({
      recipe: ctx.recipeId,
      rating: 4,
      comment: 'E2E cook log',
    });
    ctx.cookLogId = cl.id;
    cleanup.push({ label: `cook-log ${cl.id}`, fn: () => client.cookLogs.deleteCookLog(cl.id) });
    expect(cl.id).toBeGreaterThan(0);
  });

  // ---------------- recipe book ----------------

  it('creates a recipe book and attaches the recipe', async () => {
    const suffix = Date.now();
    const book = await client.recipeBooks.createBook({
      name: `e2e-book-${suffix}`,
      shared: [],
    });
    ctx.bookId = book.id;
    cleanup.push({ label: `recipe-book ${book.id}`, fn: () => client.recipeBooks.deleteBook(book.id) });

    const entry = await client.recipeBooks.createBookEntry({ book: book.id, recipe: ctx.recipeId });
    cleanup.push({ label: `book-entry ${entry.id}`, fn: () => client.recipeBooks.deleteBookEntry(entry.id) });
    expect(entry.id).toBeGreaterThan(0);
  });

  // ---------------- misc: custom filter, property type, supermarket category ----------------

  it('creates a custom filter', async () => {
    const cf = await client.customFilters.createFilter({
      name: `e2e-filter-${Date.now()}`,
      search: 'e2e-recipe',
      shared: [],
    });
    ctx.customFilterId = cf.id;
    cleanup.push({ label: `custom-filter ${cf.id}`, fn: () => client.customFilters.deleteFilter(cf.id) });
    expect(cf.id).toBeGreaterThan(0);
  });

  it('creates a property type and a property, then cleans them up', async () => {
    const pt = await client.propertyTypes.createPropertyType({
      name: `e2e-ptype-${Date.now()}`,
      unit: 'g',
    });
    ctx.propertyTypeId = pt.id;
    cleanup.push({ label: `property-type ${pt.id}`, fn: () => client.propertyTypes.deletePropertyType(pt.id) });

    const p = await client.properties.createProperty({
      property_amount: 42,
      property_type: { id: pt.id },
    });
    cleanup.push({ label: `property ${p.id}`, fn: () => client.properties.deleteProperty(p.id) });
    expect(p.id).toBeGreaterThan(0);
  });

  it('creates a supermarket category', async () => {
    const sc = await client.supermarketCategories.createCategory({
      name: `e2e-cat-${Date.now()}`,
    });
    ctx.supermarketCategoryId = sc.id;
    cleanup.push({ label: `supermarket-category ${sc.id}`, fn: () => client.supermarketCategories.deleteCategory(sc.id) });
    expect(sc.id).toBeGreaterThan(0);
  });

  // ---------------- optional: URL import ----------------

  it('imports a recipe from a URL (may be skipped)', async () => {
    if (process.env.TANDOOR_E2E_SKIP_IMPORT === '1') {
      // eslint-disable-next-line no-console
      console.log('    (skipped: TANDOOR_E2E_SKIP_IMPORT=1)');
      return;
    }
    const importUrl =
      process.env.TANDOOR_E2E_IMPORT_URL ||
      'https://www.allrecipes.com/recipe/23600/worlds-best-lasagna/';
    try {
      const resp = await client.recipes.recipeFromSource({ url: importUrl });
      expect(resp).toBeDefined();
      // We do not attempt to save the import here — just verify the parse
      // round-trip works. Saved URL import is exercised indirectly by the
      // main recipe flow above.
    } catch (err) {
      // Don't fail the whole suite if the remote scrape is blocked/offline.
      // eslint-disable-next-line no-console
      console.warn(`    URL import soft-failed: ${(err as Error).message}`);
    }
  });

  // ---------------- optional: AI import ----------------

  it('AI-imports a recipe from text (only when TANDOOR_E2E_AI_PROVIDER is set)', async () => {
    const providerId = Number(process.env.TANDOOR_E2E_AI_PROVIDER);
    if (!providerId) {
      // eslint-disable-next-line no-console
      console.log('    (skipped: set TANDOOR_E2E_AI_PROVIDER=<id> to run)');
      return;
    }
    const resp = await client.ai.aiImport({
      ai_provider_id: providerId,
      text: 'Simple e2e test: 1 cup water, 2 cups flour. Mix and bake at 350F for 30 minutes.',
    });
    expect(resp).toBeDefined();
  });
});
