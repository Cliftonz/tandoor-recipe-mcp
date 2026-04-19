// Shopping list tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import {
  handleListShoppingEntries,
  handleGetShoppingEntry,
  handleCreateShoppingEntry,
  handleUpdateShoppingEntry,
  handleDeleteShoppingEntry,
  handleBulkCheckShoppingEntries,
  handleListShoppingListRecipes,
  handleGetShoppingListRecipe,
  handleCreateShoppingListRecipe,
  handleUpdateShoppingListRecipe,
  handleDeleteShoppingListRecipe,
  handleBulkCreateShoppingListRecipeEntries,
} from '../handlers/shopping.js';

const formatEnum = z.enum(['slim', 'full']).optional();

export const listShoppingEntriesShape = {
  mealplan: z.number().optional(),
  updated_after: z.string().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getShoppingEntryShape = { id: z.number(), format: formatEnum } as const;

export const createShoppingEntryShape = {
  amount: z.number(),
  food_id: z.number(),
  unit_id: z.number().nullable().optional(),
  checked: z.boolean().optional(),
  list_recipe: z.number().nullable().optional(),
  ingredient: z.number().nullable().optional(),
  order: z.number().optional(),
  delay_until: z.string().optional(),
  mealplan_id: z.number().optional(),
  format: formatEnum,
} as const;

export const updateShoppingEntryShape = {
  id: z.number(),
  amount: z.number().optional(),
  food_id: z.number().nullable().optional(),
  unit_id: z.number().nullable().optional(),
  checked: z.boolean().optional(),
  order: z.number().optional(),
  delay_until: z.string().optional(),
  format: formatEnum,
} as const;

export const deleteShoppingEntryShape = { id: z.number() } as const;

export const bulkCheckShoppingEntriesShape = {
  ids: z.array(z.number()),
  checked: z.boolean(),
} as const;

export const listShoppingListRecipesShape = {
  mealplan: z.number().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getShoppingListRecipeShape = { id: z.number(), format: formatEnum } as const;

export const createShoppingListRecipeShape = {
  servings: z.number(),
  name: z.string().optional(),
  recipe: z.number().optional(),
  mealplan: z.number().optional(),
  format: formatEnum,
} as const;

export const updateShoppingListRecipeShape = {
  id: z.number(),
  name: z.string().optional(),
  servings: z.number().optional(),
  recipe: z.number().optional(),
  mealplan: z.number().optional(),
  format: formatEnum,
} as const;

export const deleteShoppingListRecipeShape = { id: z.number() } as const;

export const bulkCreateShoppingListRecipeEntriesShape = {
  id: z.number(),
  entries: z.array(
    z.object({
      amount: z.number(),
      food_id: z.number().nullable(),
      unit_id: z.number().nullable(),
      ingredient_id: z.number().nullable(),
    })
  ),
} as const;

export type ListShoppingEntriesArgs = z.infer<z.ZodObject<typeof listShoppingEntriesShape>>;
export type GetShoppingEntryArgs = z.infer<z.ZodObject<typeof getShoppingEntryShape>>;
export type CreateShoppingEntryArgs = z.infer<z.ZodObject<typeof createShoppingEntryShape>>;
export type UpdateShoppingEntryArgs = z.infer<z.ZodObject<typeof updateShoppingEntryShape>>;
export type DeleteShoppingEntryArgs = z.infer<z.ZodObject<typeof deleteShoppingEntryShape>>;
export type BulkCheckShoppingEntriesArgs = z.infer<z.ZodObject<typeof bulkCheckShoppingEntriesShape>>;
export type ListShoppingListRecipesArgs = z.infer<z.ZodObject<typeof listShoppingListRecipesShape>>;
export type GetShoppingListRecipeArgs = z.infer<z.ZodObject<typeof getShoppingListRecipeShape>>;
export type CreateShoppingListRecipeArgs = z.infer<z.ZodObject<typeof createShoppingListRecipeShape>>;
export type UpdateShoppingListRecipeArgs = z.infer<z.ZodObject<typeof updateShoppingListRecipeShape>>;
export type DeleteShoppingListRecipeArgs = z.infer<z.ZodObject<typeof deleteShoppingListRecipeShape>>;
export type BulkCreateShoppingListRecipeEntriesArgs = z.infer<z.ZodObject<typeof bulkCreateShoppingListRecipeEntriesShape>>;

export function registerShoppingTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_shopping_entries', {
    description: 'List shopping list entries (auto-filtered to unchecked + recent by Tandoor). Optional: mealplan, updated_after (ISO), page, page_size, format.',
    inputSchema: listShoppingEntriesShape,
  }, handleListShoppingEntries);

  registerStringTool(server, client, 'get_shopping_entry', {
    description: 'Get a shopping list entry by ID.',
    inputSchema: getShoppingEntryShape,
  }, handleGetShoppingEntry);

  registerStringTool(server, client, 'create_shopping_entry', {
    description: 'Create a shopping list entry. Required: amount, food_id. Optional: unit_id, checked, list_recipe, ingredient, order, delay_until, mealplan_id (links to existing/new ShoppingListRecipe for that mealplan).',
    inputSchema: createShoppingEntryShape,
  }, handleCreateShoppingEntry);

  registerStringTool(server, client, 'update_shopping_entry', {
    description: 'Update a shopping entry (PATCH). Required: id. Other fields optional.',
    inputSchema: updateShoppingEntryShape,
  }, handleUpdateShoppingEntry);

  registerStringTool(server, client, 'delete_shopping_entry', {
    description: 'Delete a shopping entry by ID.',
    inputSchema: deleteShoppingEntryShape,
  }, handleDeleteShoppingEntry);

  registerStringTool(server, client, 'bulk_check_shopping_entries', {
    description: 'Bulk check or uncheck many shopping entries by ID list.',
    inputSchema: bulkCheckShoppingEntriesShape,
  }, handleBulkCheckShoppingEntries);

  registerStringTool(server, client, 'list_shopping_list_recipes', {
    description: 'List shopping-list-recipe groupings (a recipe added to the shopping list).',
    inputSchema: listShoppingListRecipesShape,
  }, handleListShoppingListRecipes);

  registerStringTool(server, client, 'get_shopping_list_recipe', {
    description: 'Get a shopping-list-recipe by ID.',
    inputSchema: getShoppingListRecipeShape,
  }, handleGetShoppingListRecipe);

  registerStringTool(server, client, 'create_shopping_list_recipe', {
    description: 'Create a shopping-list-recipe. Required: servings. Optional: name, recipe (id), mealplan (id).',
    inputSchema: createShoppingListRecipeShape,
  }, handleCreateShoppingListRecipe);

  registerStringTool(server, client, 'update_shopping_list_recipe', {
    description: 'Update a shopping-list-recipe (PATCH). Required: id.',
    inputSchema: updateShoppingListRecipeShape,
  }, handleUpdateShoppingListRecipe);

  registerStringTool(server, client, 'delete_shopping_list_recipe', {
    description: 'Delete a shopping-list-recipe by ID.',
    inputSchema: deleteShoppingListRecipeShape,
  }, handleDeleteShoppingListRecipe);

  registerStringTool(server, client, 'bulk_create_shopping_list_recipe_entries', {
    description: 'Append many shopping entries to an existing shopping-list-recipe in one call.',
    inputSchema: bulkCreateShoppingListRecipeEntriesShape,
  }, handleBulkCreateShoppingListRecipeEntries);
}
