import { describe, it, expect, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerIngredientTools } from '../src/tools/ingredient.js';
import { jsonLdToScrapedRecipe } from '../src/handlers/recipe.js';
import { invokeTool, listRegisteredTools } from './helpers/mcp.js';
import { startStub, type Stub } from './helpers/stub-http.js';

interface Captured {
  method: string;
  url: string;
  body: any;
}

function parserResponse(ingredient: string) {
  const table: Record<string, any> = {
    '2 cups flour': {
      food: { id: 11, name: 'flour' },
      unit: { id: 22, name: 'cups' },
      amount: 2,
      note: '',
      original_text: '2 cups flour',
    },
    'salt': {
      food: { id: 33, name: 'salt' },
      unit: null,
      amount: 0,
      note: '',
      original_text: 'salt',
    },
  };
  return { ingredient: table[ingredient] };
}

let stub: Stub | undefined;
afterEach(async () => {
  await stub?.close();
  stub = undefined;
});

async function stubTandoor(captured: Captured[]): Promise<TandoorClient> {
  stub = await startStub((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined;
      captured.push({ method: req.method!, url: req.url!, body });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(parserResponse(body.ingredient)));
    });
  });
  return new TandoorClient({ url: stub.url, token: 't' });
}

describe('parse_ingredient against the Tandoor 2.6 ingredient-parser endpoint', () => {
  it('POSTs {ingredient} to /api/ingredient-parser/post/ and returns the flat parsed shape', async () => {
    const captured: Captured[] = [];
    const client = await stubTandoor(captured);
    const server = new McpServer({ name: 't', version: 't' });
    registerIngredientTools(server, client);

    const res = await invokeTool(server, 'parse_ingredient', { text: '2 cups flour' });

    expect(captured).toEqual([
      { method: 'POST', url: '/api/ingredient-parser/post/', body: { ingredient: '2 cups flour' } },
    ]);
    expect(JSON.parse(res.content[0].text)).toEqual({
      amount: 2,
      unit: 'cups',
      unit_id: 22,
      food: 'flour',
      food_id: 11,
      note: '',
      original_text: '2 cups flour',
    });
  });

  it('reports an empty unit and no unit_id when the parser finds none', async () => {
    const client = await stubTandoor([]);
    const server = new McpServer({ name: 't', version: 't' });
    registerIngredientTools(server, client);

    const res = await invokeTool(server, 'parse_ingredient', { text: 'salt' });

    expect(JSON.parse(res.content[0].text)).toEqual({
      amount: 0,
      unit: '',
      food: 'salt',
      food_id: 33,
      note: '',
      original_text: 'salt',
    });
  });

  it('JSON-LD import fallback builds ingredients with parsed food and unit names', async () => {
    const client = await stubTandoor([]);

    const scraped: any = await jsonLdToScrapedRecipe(
      client,
      { name: 'Bread', recipeIngredient: ['2 cups flour', 'salt'], recipeInstructions: ['Mix.'] } as any,
      'https://example.test/bread',
    );

    expect(scraped.steps[0].ingredients).toEqual([
      { amount: 2, food: { name: 'flour' }, unit: { name: 'cups' }, note: '', original_text: '2 cups flour' },
      { amount: 0, food: { name: 'salt' }, unit: null, note: '', original_text: 'salt' },
    ]);
  });
});

describe('ingredient tools no longer expose the plural flags Tandoor 2.6 removed', () => {
  it('create_ingredient and update_ingredient schemas and descriptions omit always_use_plural_*', () => {
    const server = new McpServer({ name: 't', version: 't' });
    registerIngredientTools(server, new TandoorClient({ url: 'https://x.test', token: 't' }));
    const tools = listRegisteredTools(server).filter((t) =>
      ['create_ingredient', 'update_ingredient'].includes(t.name),
    );

    expect(tools).toHaveLength(2);
    expect(JSON.stringify(tools)).not.toMatch(/always_use_plural/);
  });
});
