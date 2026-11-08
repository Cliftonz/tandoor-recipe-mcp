import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../../src/clients/index.js';
import { registerMealTypeTools } from '../../src/tools/mealtype.js';
import { registerMealPlanTools } from '../../src/tools/mealplan.js';
import { invokeTool } from '../helpers/mcp.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function call(server: McpServer, name: string, args: Record<string, unknown>): Promise<any> {
  const res = await invokeTool(server, name, args);
  if (res.isError) throw new Error(`tool ${name} errored: ${res.content[0].text}`);
  const text: string = res.content[0].text;
  const start = text.search(/[[{]/);
  return start === -1 ? text : JSON.parse(text.slice(start));
}

(url && token ? describe : describe.skip)('meal plans outside Tandoor\'s default date window against live Tandoor', () => {
  let server: McpServer;
  let client: TandoorClient;
  let mealTypeId: number;
  const tag = `e2e-mpwin-${Date.now() % 1e8}`;

  beforeAll(async () => {
    server = new McpServer({ name: 'e2e', version: 'e2e' });
    client = new TandoorClient({ url: url!, token: token! });
    registerMealTypeTools(server, client);
    registerMealPlanTools(server, client);
    mealTypeId = (await call(server, 'create_meal_type', { name: `${tag}-type` })).id;
  });

  afterAll(async () => {
    await client.mealTypes.deleteMealType(mealTypeId);
  });

  it.each([
    ['more than 360 days ahead', 400],
    ['more than 90 days ago', -200],
  ])('gets, updates and deletes a plan ending %s', async (_label, offset) => {
    const date = daysFromNow(offset);
    const plan = await call(server, 'create_meal_plan', {
      title: `${tag}${offset}`, servings: 2, meal_type_id: mealTypeId, from_date: date,
    });

    expect((await call(server, 'get_meal_plan', { id: plan.id })).to_date.slice(0, 10)).toBe(date);

    await call(server, 'update_meal_plan', { id: plan.id, note: `${tag}-note` });
    expect((await call(server, 'get_meal_plan', { id: plan.id })).note).toBe(`${tag}-note`);

    await call(server, 'delete_meal_plan', { id: plan.id });
    const listed = await call(server, 'list_meal_plans', { from_date: date, to_date: date });
    expect(listed.results.map((p: any) => p.id)).not.toContain(plan.id);
  });
});
