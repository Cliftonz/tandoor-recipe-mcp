import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerRecipeTools } from '../src/tools/recipe.js';
import { registerMealPlanTools } from '../src/tools/mealplan.js';
import { registerIngredientTools } from '../src/tools/ingredient.js';
import { registerShoppingTools } from '../src/tools/shopping.js';
import { registerAiTools } from '../src/tools/ai.js';
import { registerFoodUnitTools } from '../src/tools/foodunit.js';
import { registerCookLogTools } from '../src/tools/cooklog.js';
import { registerRecipeBookTools } from '../src/tools/recipebook.js';
import { registerMiscTools } from '../src/tools/misc.js';
import { registerStepTools } from '../src/tools/step.js';
import { registerAdminTools } from '../src/tools/admin.js';
import { registerResources } from '../src/resources/index.js';
import { registerPrompts } from '../src/prompts/index.js';

describe('server registration', () => {
  it('registers every tool group without duplicate names or bad schemas', () => {
    const server = new McpServer({ name: 'tandoor-mcp-test', version: 'test' });
    const client = new TandoorClient({ url: 'https://example.test', token: 'x' });

    expect(() => {
      registerRecipeTools(server, client);
      registerMealPlanTools(server, client);
      registerIngredientTools(server, client);
      registerShoppingTools(server, client);
      registerAiTools(server, client);
      registerFoodUnitTools(server, client);
      registerCookLogTools(server, client);
      registerRecipeBookTools(server, client);
      registerMiscTools(server, client);
      registerStepTools(server, client);
      registerAdminTools(server, client);
      registerResources(server, client);
      registerPrompts(server, client);
    }).not.toThrow();
  });

  it('registers expected resources', () => {
    const server = new McpServer({ name: 't', version: 't' });
    const client = new TandoorClient({ url: 'https://x.test', token: 'x' });
    registerResources(server, client);
    const resources = (server as any)._registeredResources;
    expect(Object.keys(resources)).toEqual(
      expect.arrayContaining([
        'tandoor://meal-plan/this-week',
        'tandoor://pantry/on-hand',
        'tandoor://shopping-list/active',
        'tandoor://meal-types',
      ])
    );
  });

  it('registers expected prompts', () => {
    const server = new McpServer({ name: 't', version: 't' });
    const client = new TandoorClient({ url: 'https://x.test', token: 'x' });
    registerPrompts(server, client);
    const prompts = (server as any)._registeredPrompts;
    expect(Object.keys(prompts)).toEqual(
      expect.arrayContaining(['plan_week', 'grocery_list_for_plan', 'what_can_i_make_tonight', 'import_and_plan'])
    );
  });
});
