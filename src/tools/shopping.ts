// Shopping list tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
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
  handleListShoppingLists,
  handleGetShoppingList,
  handleCreateShoppingList,
  handleUpdateShoppingList,
  handleDeleteShoppingList,
  handleBulkUpdateShoppingEntries,
} from '../handlers/shopping.js';

export const LIST_IDS_CHECKED = 'Every list id is checked against list_shopping_lists first; unknown or repeated ids are rejected and nothing is written.';

export const LISTS_APPLIED = 'If the lists after the write differ from the request, the tool errors and names the missing and the extra lists.';

const ENTRY_LISTS = 'shopping_list_ids (ids from list_shopping_lists) puts the entry on exactly those lists; the food\'s lists are not added. '
  + 'When shopping_list_ids is omitted, Tandoor copies the food\'s lists onto the new entry if the user preference shopping_update_food_lists is on. '
  + 'With [], the tool clears any lists Tandoor copied, so the entry is on no list. '
  + 'add_recipe_to_shopping_list always copies each food\'s lists; food_shopping_update never does. '
  + `Changing a food's lists later does not change existing entries. ${LIST_IDS_CHECKED} ${LISTS_APPLIED}`;

export const listShoppingListsShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getShoppingListShape = { id: z.number(), format: formatEnum } as const;

const shoppingListName = z.string().min(1).max(32);
const shoppingListColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable();

export const createShoppingListShape = {
  name: shoppingListName,
  description: z.string().optional(),
  color: shoppingListColor.optional(),
  format: formatEnum,
} as const;

export const updateShoppingListShape = {
  id: z.number(),
  name: shoppingListName.optional(),
  description: z.string().optional(),
  color: shoppingListColor.optional(),
  format: formatEnum,
} as const;

export const deleteShoppingListShape = { id: z.number() } as const;

const shoppingListIds = z.array(z.number());

export const listOperationsShape = {
  shopping_lists_add: shoppingListIds.optional(),
  shopping_lists_remove: shoppingListIds.optional(),
  shopping_lists_set: shoppingListIds.optional(),
  shopping_lists_remove_all: z.boolean().optional(),
} as const;

export const LIST_OPERATIONS = 'shopping_lists_add and shopping_lists_remove (may be combined), shopping_lists_set (replaces the lists; must not be empty) '
  + 'or shopping_lists_remove_all: true (takes every list off). set and remove_all must be used alone. '
  + 'An empty shopping_lists_add or shopping_lists_remove counts as no change. An id may not appear in both shopping_lists_add and shopping_lists_remove. '
  + LIST_IDS_CHECKED;

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
  shopping_list_ids: shoppingListIds.optional(),
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
  shopping_list_ids: shoppingListIds.optional(),
  format: formatEnum,
} as const;

export const deleteShoppingEntryShape = { id: z.number() } as const;

export const bulkCheckShoppingEntriesShape = {
  ids: z.array(z.number()),
  checked: z.boolean(),
} as const;

export const bulkUpdateShoppingEntriesShape = {
  ids: z.array(z.number()).min(1),
  checked: z.boolean().optional(),
  ...listOperationsShape,
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
  shopping_list_ids: shoppingListIds.optional(),
} as const;

export type ListShoppingListsArgs = z.infer<z.ZodObject<typeof listShoppingListsShape>>;
export type GetShoppingListArgs = z.infer<z.ZodObject<typeof getShoppingListShape>>;
export type CreateShoppingListArgs = z.infer<z.ZodObject<typeof createShoppingListShape>>;
export type UpdateShoppingListArgs = z.infer<z.ZodObject<typeof updateShoppingListShape>>;
export type DeleteShoppingListArgs = z.infer<z.ZodObject<typeof deleteShoppingListShape>>;
export type ListShoppingEntriesArgs = z.infer<z.ZodObject<typeof listShoppingEntriesShape>>;
export type GetShoppingEntryArgs = z.infer<z.ZodObject<typeof getShoppingEntryShape>>;
export type CreateShoppingEntryArgs = z.infer<z.ZodObject<typeof createShoppingEntryShape>>;
export type UpdateShoppingEntryArgs = z.infer<z.ZodObject<typeof updateShoppingEntryShape>>;
export type DeleteShoppingEntryArgs = z.infer<z.ZodObject<typeof deleteShoppingEntryShape>>;
export type BulkCheckShoppingEntriesArgs = z.infer<z.ZodObject<typeof bulkCheckShoppingEntriesShape>>;
export type BulkUpdateShoppingEntriesArgs = z.infer<z.ZodObject<typeof bulkUpdateShoppingEntriesShape>>;
export type ListOperations = z.infer<z.ZodObject<typeof listOperationsShape>>;
export type ListShoppingListRecipesArgs = z.infer<z.ZodObject<typeof listShoppingListRecipesShape>>;
export type GetShoppingListRecipeArgs = z.infer<z.ZodObject<typeof getShoppingListRecipeShape>>;
export type CreateShoppingListRecipeArgs = z.infer<z.ZodObject<typeof createShoppingListRecipeShape>>;
export type UpdateShoppingListRecipeArgs = z.infer<z.ZodObject<typeof updateShoppingListRecipeShape>>;
export type DeleteShoppingListRecipeArgs = z.infer<z.ZodObject<typeof deleteShoppingListRecipeShape>>;
export type BulkCreateShoppingListRecipeEntriesArgs = z.infer<z.ZodObject<typeof bulkCreateShoppingListRecipeEntriesShape>>;

export function registerShoppingTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_shopping_lists', {
    description: 'List the named shopping lists of this space (for example one per store), as {id, name, description, color}. Every member of the space sees the same lists. Optional: page, page_size.',
    inputSchema: listShoppingListsShape,
  }, handleListShoppingLists);

  registerStringTool(server, client, 'get_shopping_list', {
    description: 'Get a named shopping list by ID.',
    inputSchema: getShoppingListShape,
  }, handleGetShoppingList);

  registerStringTool(server, client, 'create_shopping_list', {
    description: 'Create a named shopping list. Required: name (1 to 32 characters). Optional: description, color (#rrggbb or null). If a list with the same name already exists (case-insensitive), Tandoor returns that list instead of creating a new one, and does not change its description or color.',
    inputSchema: createShoppingListShape,
  }, handleCreateShoppingList);

  registerStringTool(server, client, 'update_shopping_list', {
    description: 'Update a named shopping list (PATCH). Required: id and at least one of name (1 to 32 characters), description, color (#rrggbb, or null to clear it). A new name that another list already has (ignoring case and surrounding spaces) is refused, because Tandoor would accept it and then fail every create_shopping_list with that name. Renaming a list to its own name is always allowed.',
    inputSchema: updateShoppingListShape,
  }, handleUpdateShoppingList);

  registerStringTool(server, client, 'delete_shopping_list', {
    description: 'Delete a named shopping list by ID. This only removes the links to the list: foods, shopping entries and supermarkets that used it keep existing. To see the links first, use preview_shopping_list_delete_cascading.',
    inputSchema: deleteShoppingListShape,
  }, handleDeleteShoppingList);

  registerStringTool(server, client, 'list_shopping_entries', {
    description: 'List shopping list entries (auto-filtered to unchecked + recent by Tandoor). Optional: mealplan, updated_after (ISO), page, page_size, format. Entries cannot be filtered by shopping list; use the shopping_lists field of the results.',
    inputSchema: listShoppingEntriesShape,
  }, handleListShoppingEntries);

  registerStringTool(server, client, 'get_shopping_entry', {
    description: 'Get a shopping list entry by ID.',
    inputSchema: getShoppingEntryShape,
  }, handleGetShoppingEntry);

  registerStringTool(server, client, 'create_shopping_entry', {
    description: `Create a shopping list entry. Required: amount, food_id. Optional: unit_id, checked, list_recipe, ingredient, order, delay_until, mealplan_id (links to existing/new ShoppingListRecipe for that mealplan), shopping_list_ids. ${ENTRY_LISTS}`,
    inputSchema: createShoppingEntryShape,
  }, handleCreateShoppingEntry);

  registerStringTool(server, client, 'update_shopping_entry', {
    description: `Update a shopping entry (PATCH). Required: id. Other fields optional. When checked is omitted, the tool reads the entry and sends its current checked value again, so a checked entry keeps its completed_at. A check made elsewhere between that read and the write is undone (last write wins). shopping_list_ids puts the entry on exactly those lists; [] clears them; omit it to keep them. ${LIST_IDS_CHECKED} ${LISTS_APPLIED}`,
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

  registerStringTool(server, client, 'bulk_update_shopping_entries', {
    description: `Update many shopping entries in one call. Required: ids (entry ids; ids that do not exist or are not visible to you are skipped). Give checked, a list change, or both. checked: true checks every entry and sets completed_at to now, also on entries already checked; without checked, checked and completed_at stay as they are. List changes do not update the entries' updated_at. List changes: ${LIST_OPERATIONS}`,
    inputSchema: bulkUpdateShoppingEntriesShape,
  }, handleBulkUpdateShoppingEntries);

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
    description: `Append many shopping entries to an existing shopping-list-recipe in one call. Tandoor answers 404 when the shopping-list-recipe has no entries yet. Optional: shopping_list_ids puts every new entry on those lists. When shopping_list_ids is omitted, each new entry gets its food's lists, whatever the user preference. An empty shopping_list_ids is rejected. ${LIST_IDS_CHECKED}`,
    inputSchema: bulkCreateShoppingListRecipeEntriesShape,
  }, handleBulkCreateShoppingListRecipeEntries);
}
