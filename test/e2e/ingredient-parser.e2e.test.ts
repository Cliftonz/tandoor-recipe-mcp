import { describe, it, expect, beforeAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../../src/clients/index.js';
import { registerIngredientTools } from '../../src/tools/ingredient.js';
import { jsonLdToScrapedRecipe } from '../../src/handlers/recipe.js';
import { invokeTool } from '../helpers/mcp.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const d = url && token ? describe : describe.skip;

d('ingredient parsing against live Tandoor', () => {
  let client: TandoorClient;
  let server: McpServer;

  beforeAll(() => {
    client = new TandoorClient({ url: url!, token: token! });
    server = new McpServer({ name: 'e2e', version: 'e2e' });
    registerIngredientTools(server, client);
  });

  it('parse_ingredient splits "2 cups flour" into amount, unit and food', async () => {
    const res = await invokeTool(server, 'parse_ingredient', { text: '2 cups flour' });

    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual({
      amount: 2,
      unit: 'cups',
      food: 'flour',
      note: '',
      original_text: '2 cups flour',
    });
  });

  it('parse_ingredient keeps the note and reports no unit for "1 egg, beaten"', async () => {
    const res = await invokeTool(server, 'parse_ingredient', { text: '1 egg, beaten' });

    expect(JSON.parse(res.content[0].text)).toEqual({
      amount: 1,
      unit: '',
      food: 'egg',
      note: 'beaten',
      original_text: '1 egg, beaten',
    });
  });

  it('JSON-LD import fallback parses each ingredient line through Tandoor', async () => {
    const scraped: any = await jsonLdToScrapedRecipe(
      client,
      {
        name: 'mcp-e2e parser bread',
        recipeIngredient: ['2 cups flour', '1 egg, beaten'],
        recipeInstructions: ['Mix.'],
      } as any,
      'https://example.test/bread',
    );

    expect(scraped.steps[0].ingredients).toEqual([
      { amount: 2, food: { name: 'flour' }, unit: { name: 'cups' }, note: '', original_text: '2 cups flour' },
      { amount: 1, food: { name: 'egg' }, unit: null, note: 'beaten', original_text: '1 egg, beaten' },
    ]);
  });
});
