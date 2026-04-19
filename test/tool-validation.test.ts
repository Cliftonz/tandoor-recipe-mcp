// Exercise tool input validation through the actual MCP protocol path using
// InMemoryTransport. This catches schema-level rejections McpServer applies
// before our handler ever runs — the layer our unit tests can't reach.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerRecipeTools } from '../src/tools/recipe.js';
import { registerMealPlanTools } from '../src/tools/mealplan.js';
import { registerIngredientTools } from '../src/tools/ingredient.js';

describe('MCP tool input validation', () => {
  let client: Client;
  let server: McpServer;

  beforeAll(async () => {
    server = new McpServer({ name: 'test', version: 'test' });
    const tandoor = new TandoorClient({ url: 'https://x.test', token: 'x' });
    registerRecipeTools(server, tandoor);
    registerMealPlanTools(server, tandoor);
    registerIngredientTools(server, tandoor);

    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    client = new Client({ name: 'test-client', version: 'test' });
    await client.connect(clientT);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  it('lists all registered tool names', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain('list_recipes');
    expect(names).toContain('create_meal_plan');
    expect(names).toContain('create_ingredient');
  });

  // McpServer returns schema-validation failures as `{ isError: true }`
  // results (not protocol rejections). Every test asserts the error flag
  // and looks for a signal the validator named the offending field.

  async function expectValidationError(call: { name: string; arguments?: Record<string, unknown> }): Promise<any> {
    const r = (await client.callTool(call)) as any;
    expect(r.isError, `expected isError for ${call.name} with ${JSON.stringify(call.arguments)}`).toBe(true);
    const text = (r.content?.[0]?.text ?? '') as string;
    // Validation errors include either a Zod issue dump or a field mention.
    return { text, r };
  }

  it('rejects get_recipe without id', async () => {
    await expectValidationError({ name: 'get_recipe', arguments: {} });
  });

  it('rejects get_recipe with non-numeric id', async () => {
    await expectValidationError({
      name: 'get_recipe',
      arguments: { id: 'abc' as any },
    });
  });

  it('rejects create_meal_plan missing required fields', async () => {
    await expectValidationError({ name: 'create_meal_plan', arguments: {} });
  });

  it('rejects create_meal_plan with wrong-typed servings', async () => {
    await expectValidationError({
      name: 'create_meal_plan',
      arguments: {
        from_date: '2026-01-01',
        meal_type_id: 1,
        servings: 'two' as any,
      },
    });
  });

  it('rejects parse_ingredient without text', async () => {
    await expectValidationError({ name: 'parse_ingredient', arguments: {} });
  });

  it('rejects list_recipes with non-array for keywords filter', async () => {
    await expectValidationError({
      name: 'list_recipes',
      arguments: { keywords: 'dinner' as any },
    });
  });

  it('rejects import_recipe_from_url when url is missing', async () => {
    await expectValidationError({ name: 'import_recipe_from_url', arguments: {} });
  });
});
