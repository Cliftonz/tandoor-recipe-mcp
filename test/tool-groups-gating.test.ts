import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAllTools } from '../src/lib/register-all.js';
import { _resetRegisteredNames, _resetArraySkipLog } from '../src/lib/register.js';
import { parseSectionModes } from '../src/lib/sections.js';

async function connect(env: Record<string, string> = {}): Promise<Client> {
  _resetRegisteredNames();
  _resetArraySkipLog();
  const server = new McpServer({ name: 'gating', version: 'gating' });
  registerAllTools(server, new TandoorClient({ url: 'https://x.test', token: 't' }), {
    sections: parseSectionModes(env),
    pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
    versionCheck: { status: 'ok', level: 'note', detail: 'gating stub' },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'gating-client', version: '1.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
  const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ text: string }> };
  return { isError: !!res.isError, text: res.content[0]!.text };
}

async function callOk(client: Client, name: string, args: Record<string, unknown>): Promise<any> {
  const res = await call(client, name, args);
  expect(res.isError, res.text).toBe(false);
  return JSON.parse(res.text);
}

async function visible(client: Client): Promise<string[]> {
  return (await client.listTools()).tools.map((t) => t.name).sort();
}

describe('startup visibility', () => {
  it('shows always-on tools plus the simple tier of every tiered section by default', async () => {
    const client = await connect();
    expect(await visible(client)).toEqual([
      'add_inventory_item', 'add_recipe_to_shopping_list', 'bulk_check_shopping_entries',
      'consume_inventory_item', 'create_food', 'create_meal_plan',
      'create_recipe', 'create_shopping_entry', 'delete_meal_plan', 'delete_shopping_entry',
      'disable_tool_group', 'enable_tool_group', 'food_shopping_update', 'get_current_space',
      'get_food', 'get_guard_stats', 'get_keyword', 'get_meal_plan', 'get_meal_type', 'get_recipe',
      'get_shopping_entry', 'get_version', 'import_recipe_from_url', 'jq_query', 'jq_stash_stats',
      'list_foods', 'list_inventory_entries', 'list_inventory_locations', 'list_keywords', 'list_meal_plans',
      'list_meal_types', 'list_recipes', 'list_recipes_flat', 'list_shopping_entries', 'list_tool_groups',
      'list_units', 'move_inventory_item', 'parse_ingredient',
      'related_recipes', 'search_recipes', 'update_food', 'update_meal_plan', 'update_recipe',
      'update_shopping_entry',
    ]);
  });

  it('applies per-section overrides at startup', async () => {
    const names = await visible(await connect({
      TANDOOR_MCP_RECIPES: 'full',
      TANDOOR_MCP_MEAL_PLAN: 'off',
      TANDOOR_MCP_COOKLOG: 'on',
    }));
    expect(names).toEqual(expect.arrayContaining(['list_recipes', 'delete_step', 'list_cook_logs', 'list_tool_groups']));
    expect(names).not.toContain('list_meal_plans');
    expect(names).not.toContain('list_recipe_books');
  });

  it('hides always-on tools from no setting', async () => {
    const names = await visible(await connect({
      TANDOOR_MCP_RECIPES: 'off',
      TANDOOR_MCP_MEAL_PLAN: 'off',
      TANDOOR_MCP_SHOPPING: 'off',
      TANDOOR_MCP_INVENTORY: 'off',
      TANDOOR_MCP_FOODS: 'off',
    }));
    expect(names).toEqual([
      'disable_tool_group', 'enable_tool_group', 'get_current_space', 'get_guard_stats',
      'get_version', 'jq_query', 'jq_stash_stats', 'list_tool_groups',
    ]);
  });
});

describe('enable_tool_group', () => {
  it('widens a tiered section to full when no tier is given', async () => {
    const client = await connect();
    const result = await callOk(client, 'enable_tool_group', { group: 'recipes' });
    expect(result).toMatchObject({ ok: true, group: 'recipes', mode: 'full' });
    expect(result.enabled).toContain('delete_step');
    expect(result.enabled).not.toContain('list_recipes');
    expect(await visible(client)).toEqual(expect.arrayContaining(['delete_step', 'list_recipes']));
  });

  it('enables only the simple tier when tier is simple', async () => {
    const client = await connect({ TANDOOR_MCP_MEAL_PLAN: 'off' });
    const result = await callOk(client, 'enable_tool_group', { group: 'meal-plan', tier: 'simple' });
    expect(result.mode).toBe('simple');
    const names = await visible(client);
    expect(names).toContain('list_meal_plans');
    expect(names).not.toContain('auto_meal_plan');
  });

  it('never narrows: tier simple on a full section leaves it full', async () => {
    const client = await connect({ TANDOOR_MCP_RECIPES: 'full' });
    const result = await callOk(client, 'enable_tool_group', { group: 'recipes', tier: 'simple' });
    expect(result).toMatchObject({ mode: 'full', enabled: [] });
    expect(await visible(client)).toContain('delete_step');
  });

  it('turns a toggle section on', async () => {
    const client = await connect();
    const result = await callOk(client, 'enable_tool_group', { group: 'cooklog' });
    expect(result).toMatchObject({ ok: true, group: 'cooklog', mode: 'on' });
    expect(await visible(client)).toContain('list_cook_logs');
  });

  it('rejects a tier for a toggle section', async () => {
    const client = await connect();
    const result = await call(client, 'enable_tool_group', { group: 'cooklog', tier: 'full' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("'cooklog' is an on/off section and takes no tier");
    expect(await visible(client)).not.toContain('list_cook_logs');
  });

  it('rejects old group names, listing the section names', async () => {
    const result = await call(await connect(), 'enable_tool_group', { group: 'recipe-write' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("unknown section 'recipe-write'");
    expect(result.text).toContain('Known sections: always, recipes, meal-plan, shopping, inventory, foods, cooklog, recipe-books, ai, import-export, household-space, admin.');
  });

  it('shows the inventory simple tier by default and widens it to full', async () => {
    const client = await connect();
    expect(await visible(client)).toEqual(expect.arrayContaining([
      'list_inventory_locations', 'list_inventory_entries', 'add_inventory_item', 'consume_inventory_item', 'move_inventory_item',
    ]));
    expect(await visible(client)).not.toContain('delete_inventory_location');
    const result = await callOk(client, 'enable_tool_group', { group: 'inventory', tier: 'full' });
    expect(result).toMatchObject({ ok: true, group: 'inventory', mode: 'full' });
    expect(await visible(client)).toEqual(expect.arrayContaining([
      'delete_inventory_location', 'list_inventory_logs', 'preview_inventory_entry_delete_cascading',
    ]));
  });

  it('keeps the household tools hidden by default and shows them with household-space', async () => {
    const household = ['list_households', 'get_household', 'create_household', 'update_household'];
    const client = await connect();
    expect((await visible(client)).filter((n) => household.includes(n))).toEqual([]);
    await callOk(client, 'enable_tool_group', { group: 'household-space' });
    expect(await visible(client)).toEqual(expect.arrayContaining(household));
  });

  it('treats the always group as a no-op', async () => {
    const client = await connect();
    const before = await visible(client);
    const result = await callOk(client, 'enable_tool_group', { group: 'always' });
    expect(result).toEqual({ ok: true, group: 'always', mode: 'on', enabled: [] });
    expect(await visible(client)).toEqual(before);
  });
});

describe('disable_tool_group', () => {
  it('turns off a section that was on at startup', async () => {
    const client = await connect({ TANDOOR_MCP_RECIPES: 'full' });
    const result = await callOk(client, 'disable_tool_group', { group: 'recipes' });
    expect(result).toMatchObject({ ok: true, group: 'recipes', mode: 'off' });
    expect(result.disabled).toEqual(expect.arrayContaining(['list_recipes', 'delete_step']));
    const names = await visible(client);
    expect(names).not.toContain('list_recipes');
    expect(names).not.toContain('delete_step');
  });

  it('lets a disabled section be enabled again', async () => {
    const client = await connect();
    await callOk(client, 'disable_tool_group', { group: 'shopping' });
    await callOk(client, 'enable_tool_group', { group: 'shopping', tier: 'simple' });
    expect(await visible(client)).toContain('list_shopping_entries');
  });

  it('refuses to disable the always group', async () => {
    const client = await connect();
    const result = await call(client, 'disable_tool_group', { group: 'always' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("cannot disable the 'always' section");
    expect(await visible(client)).toContain('get_version');
  });

  it('rejects old group names', async () => {
    const result = await call(await connect(), 'disable_tool_group', { group: 'shopping-write' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("unknown section 'shopping-write'");
  });
});

describe('list_tool_groups', () => {
  it('reports each section with tools, its current mode, and its available modes', async () => {
    const { groups } = await callOk(await connect(), 'list_tool_groups', {});
    expect(groups.map((g: { name: string }) => g.name)).toEqual([
      'always', 'recipes', 'meal-plan', 'shopping', 'inventory', 'foods',
      'cooklog', 'recipe-books', 'ai', 'import-export', 'household-space', 'admin',
    ]);
    expect(groups[0]).toEqual({
      name: 'always',
      description: expect.any(String),
      mode: 'on',
      modes: ['on'],
      tools: [
        'list_tool_groups', 'enable_tool_group', 'disable_tool_group', 'get_version',
        'jq_query', 'jq_stash_stats', 'get_guard_stats', 'get_current_space',
      ],
    });
    const mealPlan = groups.find((g: { name: string }) => g.name === 'meal-plan');
    expect(mealPlan).toEqual({
      name: 'meal-plan',
      description: expect.any(String),
      mode: 'simple',
      modes: ['off', 'simple', 'full'],
      tools: {
        simple: [
          'list_meal_plans', 'get_meal_plan', 'list_meal_types', 'get_meal_type',
          'create_meal_plan', 'update_meal_plan', 'delete_meal_plan',
        ],
        full: [
          'auto_meal_plan', 'bulk_create_meal_plans', 'create_meal_type', 'update_meal_type',
          'delete_meal_type', 'export_meal_plan_ical', 'preview_meal_type_delete_cascading',
          'preview_meal_type_delete_nulling', 'preview_meal_type_delete_protecting',
        ],
      },
    });
    expect(groups.find((g: { name: string }) => g.name === 'cooklog')).toEqual({
      name: 'cooklog',
      description: expect.any(String),
      mode: 'off',
      modes: ['off', 'on'],
      tools: ['list_cook_logs', 'get_cook_log', 'create_cook_log', 'update_cook_log', 'delete_cook_log'],
    });
  });

  it('reflects modes changed by enable and disable', async () => {
    const client = await connect();
    await callOk(client, 'enable_tool_group', { group: 'cooklog' });
    await callOk(client, 'disable_tool_group', { group: 'foods' });
    const { groups } = await callOk(client, 'list_tool_groups', {});
    const modeOf = (name: string) => groups.find((g: { name: string }) => g.name === name).mode;
    expect(modeOf('cooklog')).toBe('on');
    expect(modeOf('foods')).toBe('off');
  });
});
