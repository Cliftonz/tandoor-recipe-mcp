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

  it('parse_ingredient returns the matched unit and food rows for "2 cups flour"', async () => {
    const res = await invokeTool(server, 'parse_ingredient', { text: '2 cups flour' });

    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    const unit = await client.foodUnits.getUnit(parsed.unit_id);
    const food = await client.foodUnits.getFood(parsed.food_id);
    expect(parsed).toEqual({
      amount: 2,
      unit: unit.name,
      unit_id: unit.id,
      food: food.name,
      food_id: food.id,
      note: '',
      original_text: '2 cups flour',
    });
    expect(unit.name).toMatch(/^cups?$/i);
    expect(food.name).toMatch(/^flours?$/i);
  });

  it('parse_ingredient keeps the note and reports no unit for "1 egg, beaten"', async () => {
    const res = await invokeTool(server, 'parse_ingredient', { text: '1 egg, beaten' });

    const parsed = JSON.parse(res.content[0].text);
    const food = await client.foodUnits.getFood(parsed.food_id);
    expect(parsed).toEqual({
      amount: 1,
      unit: '',
      food: food.name,
      food_id: food.id,
      note: 'beaten',
      original_text: '1 egg, beaten',
    });
    expect(food.name).toMatch(/^eggs?$/i);
  });

  it.each(['', '   '])('parse_ingredient surfaces Tandoor\'s 400 for blank input %j', async (text) => {
    const res = await invokeTool(server, 'parse_ingredient', { text });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/400/);
    expect(res.content[0].text).toMatch(/This field may not be blank\./);
  });

  it('JSON-LD import fallback parses each ingredient line through Tandoor', async () => {
    const flour = await client.ingredients.parseIngredientString('2 cups flour');
    const egg = await client.ingredients.parseIngredientString('1 egg, beaten');
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
      { amount: 2, food: { name: flour.food }, unit: { name: flour.unit }, note: '', original_text: '2 cups flour' },
      { amount: 1, food: { name: egg.food }, unit: null, note: 'beaten', original_text: '1 egg, beaten' },
    ]);
  });
});
