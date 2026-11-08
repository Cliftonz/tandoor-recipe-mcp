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
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const planned = daysFromNow(30);
const rescheduled = daysFromNow(32);

async function call(server: McpServer, name: string, args: Record<string, unknown>): Promise<any> {
  const res = await invokeTool(server, name, args);
  if (res.isError) throw new Error(`tool ${name} errored: ${res.content[0].text}`);
  const text: string = res.content[0].text;
  const start = text.search(/[[{]/);
  return start === -1 ? text : JSON.parse(text.slice(start));
}

(url && token ? describe : describe.skip)('update_meal_plan on a plan with shopping entries against live Tandoor', () => {
  let server: McpServer;
  let client: TandoorClient;
  const tag = `e2e-mpupd-${Date.now() % 1e8}`;
  const cleanup: Array<() => Promise<unknown>> = [];
  let mealPlanId: number;
  let entryIds: number[];

  beforeAll(async () => {
    server = new McpServer({ name: 'e2e', version: 'e2e' });
    client = new TandoorClient({ url: url!, token: token! });
    registerRecipeTools(server, client);
    registerMealTypeTools(server, client);
    registerMealPlanTools(server, client);
    registerShoppingTools(server, client);

    const mealType = await call(server, 'create_meal_type', { name: `${tag}-type` });
    cleanup.push(() => client.mealTypes.deleteMealType(mealType.id));
    const recipe = await call(server, 'create_recipe', {
      name: `${tag}-recipe`,
      servings: 2,
      format: 'full',
      steps: [{ instruction: 'Cook.', ingredients: [{ food: `${tag}-flour`, amount: 300, unit: `${tag}-g` }] }],
    });
    const ingredient = recipe.steps[0].ingredients[0];
    cleanup.push(
      () => client.foodUnits.deleteUnit(ingredient.unit.id),
      () => client.foodUnits.deleteFood(ingredient.food.id),
      () => client.recipes.deleteRecipe(recipe.id),
    );
    const plan = await call(server, 'create_meal_plan', {
      recipe_id: recipe.id, servings: 4, meal_type_id: mealType.id,
      from_date: planned, addshopping: true,
    });
    mealPlanId = plan.id;
    cleanup.push(() => client.mealPlans.deleteMealPlan(plan.id));

    const entries = await call(server, 'list_shopping_entries', { mealplan: mealPlanId });
    entryIds = entries.results.map((e: any) => e.id);
    expect(entryIds).toHaveLength(1);
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    for (const fn of cleanup.reverse()) await fn().catch((e) => errors.push(e));
    if (errors.length) throw errors[0];
  });

  it('reschedules with only new dates and keeps the linked shopping entries', async () => {
    await call(server, 'update_meal_plan', { id: mealPlanId, from_date: rescheduled, to_date: rescheduled });

    const plan = await call(server, 'get_meal_plan', { id: mealPlanId });
    expect(plan.from_date.slice(0, 10)).toBe(rescheduled);
    expect(plan.to_date.slice(0, 10)).toBe(rescheduled);
    const entries = await call(server, 'list_shopping_entries', { mealplan: mealPlanId });
    expect(entries.results.map((e: any) => e.id)).toEqual(entryIds);
  });
});
