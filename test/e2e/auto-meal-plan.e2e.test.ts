import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TandoorClient } from '../../src/clients/index.js';
import { handleAutoMealPlan } from '../../src/handlers/mealplan.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const d = url && token ? describe : describe.skip;
const dayFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

d('auto_meal_plan against live Tandoor', () => {
  let client: TandoorClient;
  const cleanup: Array<() => Promise<unknown>> = [];
  const tag = `automeal-${Date.now()}`;
  let mealTypeId: number;
  let shared: number;
  let onlyBoth: number;
  let solo: number;
  let recipeBoth: number;
  let recipeSharedOnly: number;

  async function planRecipes(day: string): Promise<number[]> {
    const page = await client.mealPlans.listMealPlans({ from_date: day, to_date: day, meal_type: [mealTypeId] });
    for (const mp of page.results) cleanup.push(() => client.mealPlans.deleteMealPlan(mp.id));
    return page.results.map((mp) => mp.recipe!.id!);
  }

  async function autoPlan(day: string, keyword_ids: number[], keyword_mode?: 'or' | 'and') {
    await handleAutoMealPlan(client, {
      start_date: day, end_date: day, meal_type_id: mealTypeId,
      keyword_ids, servings: 1, addshopping: false, ...(keyword_mode && { keyword_mode }),
    });
    return planRecipes(day);
  }

  beforeAll(async () => {
    client = new TandoorClient({ url: url!, token: token! });
    const mt = await client.mealTypes.createMealType({ name: `${tag}-type` });
    mealTypeId = mt.id;
    cleanup.push(() => client.mealTypes.deleteMealType(mt.id));
    const k1 = await client.keywords.createKeyword({ name: `${tag}-shared` });
    const k2 = await client.keywords.createKeyword({ name: `${tag}-both` });
    const k3 = await client.keywords.createKeyword({ name: `${tag}-solo` });
    shared = k1.id;
    onlyBoth = k2.id;
    solo = k3.id;
    cleanup.push(
      () => client.keywords.deleteKeyword(k1.id),
      () => client.keywords.deleteKeyword(k2.id),
      () => client.keywords.deleteKeyword(k3.id),
    );
    const both = await client.recipes.createRecipe({
      name: `${tag}-both`, internal: true, steps: [],
      keywords: [{ id: k1.id, name: k1.name }, { id: k2.id, name: k2.name }],
    } as any);
    const sharedOnly = await client.recipes.createRecipe({
      name: `${tag}-shared-only`, internal: true, steps: [],
      keywords: [{ id: k1.id, name: k1.name }, { id: k3.id, name: k3.name }],
    } as any);
    recipeBoth = both.id!;
    recipeSharedOnly = sharedOnly.id!;
    cleanup.push(() => client.recipes.deleteRecipe(both.id!), () => client.recipes.deleteRecipe(sharedOnly.id!));
  });

  afterAll(async () => {
    for (const fn of cleanup.reverse()) await fn();
  });

  it('filters by keywords with the default mode', async () => {
    expect(await autoPlan(dayFromNow(200), [onlyBoth])).toEqual([recipeBoth]);
  });

  it("keyword_mode 'and' plans only recipes carrying every keyword", async () => {
    expect(await autoPlan(dayFromNow(201), [shared, onlyBoth], 'and')).toEqual([recipeBoth]);
  });

  it("keyword_mode 'or' plans recipes carrying any keyword", async () => {
    const [recipe] = await autoPlan(dayFromNow(202), [onlyBoth, solo], 'or');
    expect([recipeBoth, recipeSharedOnly]).toContain(recipe);
  });

  it('an empty keyword list plans a recipe', async () => {
    expect(await autoPlan(dayFromNow(203), [])).toHaveLength(1);
  });
});
