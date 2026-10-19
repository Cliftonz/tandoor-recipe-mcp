import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
  let client: TandoorClient;
  let id: number;
  const created: number[] = [];
  const name = `mcp-e2e-mealtype-${Date.now()}`;

  beforeAll(() => {
    server = new McpServer({ name: 'e2e', version: 'e2e' });
    client = new TandoorClient({ url: url!, token: token! });
    registerMealTypeTools(server, client);
    registerMealPlanTools(server, client);
  });

  afterAll(async () => {
    for (const leftover of created) await client.mealTypes.deleteMealType(leftover);
  });

  it('creates a meal type without `default`', async () => {
    const result = await call(server, 'create_meal_type', { name, order: 3, color: '#123456' });
    expect(result).toEqual({ id: expect.any(Number), name, order: 3, color: '#123456', time: null });
    id = result.id;
    created.push(id);
  });

  it('updates the meal type without `default`', async () => {
    const updated = await call(server, 'update_meal_type', { id, name: `${name}-renamed` });
    expect(updated).toEqual({ id, name: `${name}-renamed`, order: 3, color: '#123456', time: null });
  });

  it('round-trips `time` through create and update', async () => {
    const timed = await call(server, 'create_meal_type', { name: `${name}-timed`, time: '08:30' });
    created.push(timed.id);
    expect(timed.time).toBe('08:30:00');
    const updated = await call(server, 'update_meal_type', { id: timed.id, time: '19:45' });
    expect(updated.time).toBe('19:45:00');
    expect((await call(server, 'get_meal_type', { id: timed.id })).time).toBe('19:45:00');
  });

  it('clears `time` with null on update', async () => {
    const timed = await call(server, 'create_meal_type', { name: `${name}-cleared`, time: '12:00' });
    created.push(timed.id);
    expect(timed.time).toBe('12:00:00');
    expect((await call(server, 'update_meal_type', { id: timed.id, time: null })).time).toBeNull();
    expect((await call(server, 'get_meal_type', { id: timed.id })).time).toBeNull();
  });

  it('creating an existing name returns the existing row with its original values', async () => {
    const dupName = `${name}-dup`;
    const first = await call(server, 'create_meal_type', { name: dupName, order: 1, color: '#111111', time: '06:00' });
    created.push(first.id);
    const second = await call(server, 'create_meal_type', { name: dupName, order: 9, color: '#999999', time: '22:00' });
    if (second.id !== first.id) created.push(second.id);
    expect(second).toEqual(first);
    const upper = await call(server, 'create_meal_type', { name: dupName.toUpperCase() });
    if (upper.id !== first.id) created.push(upper.id);
    expect(upper.id).toBe(first.id);
  });

  it('lists the meal type and Tandoor emits no `default`', async () => {
    const types: any[] = await call(server, 'list_meal_types', {});
    const found = types.find((t) => t.id === id);
    expect(found.name).toBe(`${name}-renamed`);
    expect(found).not.toHaveProperty('default');
  });

  it('deletes the meal type', async () => {
    expect(await call(server, 'delete_meal_type', { id })).toBe(`Meal type ${id} deleted.`);
    created.splice(created.indexOf(id), 1);
    await expect(call(server, 'get_meal_type', { id })).rejects.toThrow();
  });
});
