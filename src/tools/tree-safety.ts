// Tree-safety delete-preview tools. One BaseClient method + one handler factory
// drives 33 registrations (11 resources * 3 actions); table stays in sync with
// Tandoor's uniform /api/{resource}/{id}/{action}/ endpoint shape.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { makeTreeSafetyHandler } from '../handlers/tree-safety.js';
import type { TreeSafetyAction } from '../clients/tree-safety.js';

export const RESOURCES: { resource: string; slug: string }[] = [
  { resource: 'food', slug: 'food' },
  { resource: 'keyword', slug: 'keyword' },
  { resource: 'recipe', slug: 'recipe' },
  { resource: 'unit', slug: 'unit' },
  { resource: 'storage', slug: 'storage' },
  { resource: 'meal_type', slug: 'meal-type' },
  { resource: 'property_type', slug: 'property-type' },
  { resource: 'recipe_book', slug: 'recipe-book' },
  { resource: 'supermarket', slug: 'supermarket' },
  { resource: 'supermarket_category', slug: 'supermarket-category' },
  { resource: 'user_file', slug: 'user-file' },
];

const ACTIONS: TreeSafetyAction[] = ['cascading', 'nulling', 'protecting'];

const shape = { id: z.number() } as const;

const deleteToolNameFor: Record<string, string> = {
  food: 'delete_food',
  keyword: 'delete_keyword',
  recipe: 'delete_recipe',
  unit: 'delete_unit',
  storage: 'delete_storage',
  meal_type: 'delete_meal_type',
  property_type: 'delete_property_type',
  recipe_book: 'delete_recipe_book',
  supermarket: 'delete_supermarket',
  supermarket_category: 'delete_supermarket_category',
  user_file: 'delete_user_file',
};

export function registerTreeSafetyTools(server: McpServer, client: TandoorClient): void {
  for (const { resource, slug } of RESOURCES) {
    for (const action of ACTIONS) {
      const name = `preview_${resource}_delete_${action}`;
      const deleteTool = deleteToolNameFor[resource];
      const description = `Preview which related objects would be ${action} if you delete this ${resource.replace(/_/g, ' ')}. Read-only, use before ${deleteTool}.`;
      registerStringTool(
        server,
        client,
        name,
        { description, inputSchema: shape },
        makeTreeSafetyHandler(slug, action),
      );
    }
  }
}
