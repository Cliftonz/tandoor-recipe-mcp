import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../../src/clients/index.js';
import { registerRecipeTools } from '../../src/tools/recipe.js';
import { registerMealTypeTools } from '../../src/tools/mealtype.js';
import { registerMealPlanTools } from '../../src/tools/mealplan.js';
import { registerShoppingTools } from '../../src/tools/shopping.js';
import { invokeTool } from '../helpers/mcp.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;

async function call(server: McpServer, name: string, args: Record<string, unknown>): Promise<any> {
  const res = await invokeTool(server, name, args);
  if (res.isError) throw new Error(`tool ${name} errored: ${res.content[0].text}`);
  const text: string = res.content[0].text;
  const start = text.search(/[[{]/);
  return start === -1 ? text : JSON.parse(text.slice(start));
}

(url && token ? describe : describe.skip)('add_recipe_to_shopping_list with mealplan against live Tandoor', () => {
  let server: McpServer;
  let client: TandoorClient;
  const tag = `e2e-mplink-${Date.now() % 1e8}`;
  const cleanup: Array<() => Promise<unknown>> = [];
  let recipe: any;
  let mealPlanId: number;

  beforeAll(async () => {
    server = new McpServer({ name: 'e2e', version: 'e2e' });
    client = new TandoorClient({ url: url!, token: token! });
    registerRecipeTools(server, client);
    registerMealTypeTools(server, client);
    registerMealPlanTools(server, client);
    registerShoppingTools(server, client);

    const mealType = await call(server, 'create_meal_type', { name: `${tag}-type` });
    cleanup.push(() => client.mealTypes.deleteMealType(mealType.id));
    recipe = await call(server, 'create_recipe', {
      name: `${tag}-recipe`,
      servings: 2,
      format: 'full',
      steps: [{ instruction: 'Cook.', ingredients: [
        { food: `${tag}-flour`, amount: 300, unit: `${tag}-g` },
        { food: `${tag}-egg`, amount: 3 },
      ] }],
    });
    const ingredients = recipe.steps[0].ingredients;
    cleanup.push(
      () => client.foodUnits.deleteUnit(ingredients[0].unit.id),
      ...ingredients.map((i: any) => () => client.foodUnits.deleteFood(i.food.id)),
      () => client.recipes.deleteRecipe(recipe.id),
    );
    const plan = await call(server, 'create_meal_plan', {
      recipe_id: recipe.id, servings: 4, meal_type_id: mealType.id,
      from_date: new Date(Date.now() + 300 * 86_400_000).toISOString().slice(0, 10),
    });
    mealPlanId = plan.id;
    cleanup.push(() => client.mealPlans.deleteMealPlan(plan.id));
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    for (const fn of cleanup.reverse()) await fn().catch((e) => errors.push(e));
    if (errors.length) throw errors[0];
  });

  it('adds scaled entries linked to the meal plan in one call', async () => {
    await call(server, 'add_recipe_to_shopping_list', { id: recipe.id, servings: 4, mealplan: mealPlanId });

    const listRecipes = await call(server, 'list_shopping_list_recipes', { mealplan: mealPlanId });
    expect(listRecipes.results).toEqual([expect.objectContaining({ recipe: recipe.id, mealplan: mealPlanId })]);
    const listRecipeId = listRecipes.results[0].id;
    cleanup.push(() => client.shopping.deleteShoppingListRecipe(listRecipeId));

    const entries = await call(server, 'list_shopping_entries', { mealplan: mealPlanId });
    for (const e of entries.results) cleanup.push(() => client.shopping.deleteEntry(e.id));
    const expected = recipe.steps[0].ingredients.map((i: any) => ({
      food_id: i.food.id, amount: (Number(i.amount) * 4) / recipe.servings, list_recipe: listRecipeId,
    }));
    expect(entries.results.map((e: any) => ({ food_id: e.food_id, amount: Number(e.amount), list_recipe: e.list_recipe })))
      .toEqual(expect.arrayContaining(expected));
    expect(entries.results).toHaveLength(expected.length);
  });
});
