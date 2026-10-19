import { describe, it, expect, beforeAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../../src/clients/index.js';
import { registerMealTypeTools } from '../../src/tools/mealtype.js';
import { registerMealPlanTools } from '../../src/tools/mealplan.js';
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

(url && token ? describe : describe.skip)('meal type lifecycle against live Tandoor', () => {
  let server: McpServer;
  let id: number;
  const name = `mcp-e2e-mealtype-${Date.now()}`;

  beforeAll(() => {
    server = new McpServer({ name: 'e2e', version: 'e2e' });
    const client = new TandoorClient({ url: url!, token: token! });
    registerMealTypeTools(server, client);
    registerMealPlanTools(server, client);
  });

  it('creates a meal type without `default`', async () => {
    const created = await call(server, 'create_meal_type', { name, order: 3, color: '#123456' });
    expect(created).toEqual({ id: expect.any(Number), name, order: 3, color: '#123456' });
    id = created.id;
  });

  it('updates the meal type without `default`', async () => {
    const updated = await call(server, 'update_meal_type', { id, name: `${name}-renamed` });
    expect(updated).toEqual({ id, name: `${name}-renamed`, order: 3, color: '#123456' });
  });

  it('lists the meal type and Tandoor emits no `default`', async () => {
    const types: any[] = await call(server, 'list_meal_types', {});
    const found = types.find((t) => t.id === id);
    expect(found.name).toBe(`${name}-renamed`);
    expect(found).not.toHaveProperty('default');
  });

  it('deletes the meal type', async () => {
    expect(await call(server, 'delete_meal_type', { id })).toBe(`Meal type ${id} deleted.`);
    await expect(call(server, 'get_meal_type', { id })).rejects.toThrow();
  });
});
