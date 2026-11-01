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

async function visible(client: Client): Promise<string[]> {
  return (await client.listTools()).tools.map((t) => t.name).sort();
}

describe('startup visibility', () => {
  it('shows always-on tools plus the simple tier of every tiered section by default', async () => {
    const client = await connect();
    expect(await visible(client)).toEqual([
      'add_recipe_to_shopping_list', 'bulk_check_shopping_entries', 'create_food', 'create_meal_plan',
      'create_recipe', 'create_shopping_entry', 'delete_meal_plan', 'delete_shopping_entry',
      'disable_tool_group', 'enable_tool_group', 'food_shopping_update', 'get_current_space',
      'get_food', 'get_guard_stats', 'get_keyword', 'get_meal_plan', 'get_meal_type', 'get_recipe',
      'get_shopping_entry', 'get_version', 'import_recipe_from_url', 'jq_query', 'jq_stash_stats',
      'list_foods', 'list_keywords', 'list_meal_plans', 'list_meal_types', 'list_recipes',
      'list_recipes_flat', 'list_shopping_entries', 'list_tool_groups', 'list_units', 'parse_ingredient',
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
      TANDOOR_MCP_FOODS: 'off',
    }));
    expect(names).toEqual([
      'disable_tool_group', 'enable_tool_group', 'get_current_space', 'get_guard_stats',
      'get_version', 'jq_query', 'jq_stash_stats', 'list_tool_groups',
    ]);
  });
});
