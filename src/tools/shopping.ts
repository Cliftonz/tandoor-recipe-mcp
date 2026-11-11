// Shopping list tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
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

const page = z.number().optional().describe('Page number, starting at 1.');
const pageSize = z.number().optional().describe('Results per page.');
const listIdsToSet = 'Shopping list IDs, from list_shopping_lists.';

export const listShoppingListsShape = {
  page,
  page_size: pageSize,
  format: formatEnum,
} as const;

export const getShoppingListShape = { id: z.number().describe('Shopping list ID, from list_shopping_lists.'), format: formatEnum } as const;

const shoppingListName = z.string().min(1).max(32);
const shoppingListColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable();

export const createShoppingListShape = {
  name: shoppingListName.describe('List name. An existing name (any case) returns that list.'),
  description: z.string().optional().describe('Free-text description.'),
  color: shoppingListColor.optional().describe('Color as #rrggbb, or null for none.'),
  format: formatEnum,
} as const;

export const updateShoppingListShape = {
  id: z.number().describe('Shopping list ID, from list_shopping_lists.'),
  name: shoppingListName.optional().describe('New name. Must not match another list, ignoring case.'),
  description: z.string().optional().describe('Free-text description.'),
  color: shoppingListColor.optional().describe('Color as #rrggbb, or null to clear it.'),
  format: formatEnum,
} as const;

export const deleteShoppingListShape = { id: z.number().describe('Shopping list ID, from list_shopping_lists.') } as const;

const shoppingListIds = z.array(z.number());

export const listOperationsShape = {
  shopping_lists_add: shoppingListIds.optional().describe('Shopping list IDs to add, from list_shopping_lists.'),
  shopping_lists_remove: shoppingListIds.optional().describe('Shopping list IDs to remove.'),
  shopping_lists_set: shoppingListIds.optional().describe('Replaces all lists with these IDs. Must not be empty.'),
  shopping_lists_remove_all: z.boolean().optional().describe('true takes every list off.'),
} as const;

export const LIST_OPERATIONS = 'shopping_lists_add and shopping_lists_remove (may be combined), shopping_lists_set (replaces the lists; must not be empty) '
  + 'or shopping_lists_remove_all: true (takes every list off). set and remove_all must be used alone. '
  + 'Empty arrays and shopping_lists_remove_all: false count as no change and are not sent. An id may not appear in both shopping_lists_add and shopping_lists_remove. '
  + LIST_IDS_CHECKED;

export const listShoppingEntriesShape = {
  mealplan: z.number().optional().describe('Only entries for this meal plan ID, from list_meal_plans.'),
  updated_after: z.string().optional().describe('Only entries updated at or after this ISO 8601 datetime.'),
  page,
  page_size: pageSize,
  format: formatEnum,
} as const;

export const getShoppingEntryShape = { id: z.number().describe('Shopping entry ID, from list_shopping_entries.'), format: formatEnum } as const;

export const createShoppingEntryShape = {
  amount: z.number().describe('Amount, in unit_id.'),
  food_id: z.number().describe('Food ID, from list_foods.'),
  unit_id: z.number().nullable().optional().describe('Unit ID, from list_units. Default none.'),
  checked: z.boolean().optional().describe('Already bought. Default false.'),
  list_recipe: z.number().nullable().optional().describe('Shopping list recipe ID, from list_shopping_list_recipes.'),
  ingredient: z.number().nullable().optional().describe('Recipe ingredient ID this entry comes from.'),
  order: z.number().optional().describe('Sort position.'),
  delay_until: z.string().optional().describe('ISO 8601 datetime to postpone the entry until.'),
  mealplan_id: z.number().optional().describe('Meal plan ID, from list_meal_plans.'),
  shopping_list_ids: shoppingListIds.optional().describe(`${listIdsToSet} [] puts it on no list.`),
  format: formatEnum,
} as const;

export const updateShoppingEntryShape = {
  id: z.number().describe('Shopping entry ID, from list_shopping_entries.'),
  amount: z.number().optional().describe('Amount, in the entry unit.'),
  food_id: z.number().nullable().optional().describe('Food ID, from list_foods.'),
  unit_id: z.number().nullable().optional().describe('Unit ID, from list_units. null clears it.'),
  checked: z.boolean().optional().describe('Bought or not. Omitted keeps the current value.'),
  order: z.number().optional().describe('Sort position.'),
  delay_until: z.string().optional().describe('ISO 8601 datetime to postpone the entry until.'),
  shopping_list_ids: shoppingListIds.optional().describe(`${listIdsToSet} [] clears, omitted keeps.`),
  format: formatEnum,
} as const;

export const deleteShoppingEntryShape = { id: z.number().describe('Shopping entry ID, from list_shopping_entries.') } as const;

export const bulkCheckShoppingEntriesShape = {
  ids: z.array(z.number()).describe('Shopping entry IDs, from list_shopping_entries.'),
  checked: z.boolean().describe('true checks, false unchecks.'),
} as const;

export const bulkUpdateShoppingEntriesShape = {
  ids: z.array(z.number()).min(1).describe('Shopping entry IDs, from list_shopping_entries.'),
  checked: z.boolean().optional().describe('true checks, false unchecks. Omitted keeps each value.'),
  ...listOperationsShape,
} as const;

export const listShoppingListRecipesShape = {
  mealplan: z.number().optional().describe('Only those for this meal plan ID, from list_meal_plans.'),
  page,
  page_size: pageSize,
  format: formatEnum,
} as const;

export const getShoppingListRecipeShape = { id: z.number().describe('Shopping list recipe ID, from list_shopping_list_recipes.'), format: formatEnum } as const;

export const createShoppingListRecipeShape = {
  servings: z.number().describe('Number of servings.'),
  name: z.string().optional().describe('Display name, up to 32 characters.'),
  recipe: z.number().optional().describe('Recipe ID, from search_recipes.'),
  mealplan: z.number().optional().describe('Meal plan ID, from list_meal_plans.'),
  format: formatEnum,
} as const;

export const updateShoppingListRecipeShape = {
  id: z.number().describe('Shopping list recipe ID, from list_shopping_list_recipes.'),
  name: z.string().optional().describe('Display name, up to 32 characters.'),
  servings: z.number().optional().describe('Number of servings.'),
  recipe: z.number().optional().describe('Recipe ID, from search_recipes.'),
  mealplan: z.number().optional().describe('Meal plan ID, from list_meal_plans.'),
  format: formatEnum,
} as const;

export const deleteShoppingListRecipeShape = { id: z.number().describe('Shopping list recipe ID, from list_shopping_list_recipes.') } as const;

export const bulkCreateShoppingListRecipeEntriesShape = {
  id: z.number().describe('Shopping list recipe ID, from list_shopping_list_recipes.'),
  entries: z.array(
    z.object({
      amount: z.number().describe('Amount, in unit_id.'),
      food_id: z.number().nullable().describe('Food ID, from list_foods. null or unknown skips the entry.'),
      unit_id: z.number().nullable().describe('Unit ID, from list_units, or null. Unknown skips the entry.'),
      ingredient_id: z.number().nullable().describe('Recipe ingredient ID, or null. Unknown skips the entry.'),
    })
  ).describe('Entries to append.'),
  shopping_list_ids: shoppingListIds.optional().describe(`${listIdsToSet} Must not be empty.`),
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
    title: 'List shopping lists',
    annotations: READ,
    description: 'List the named shopping lists of this space (for example one per store), as {id, name, description, color}. Every member of the space sees the same lists. Optional: page, page_size.',
    inputSchema: listShoppingListsShape,
  }, handleListShoppingLists);

  registerStringTool(server, client, 'get_shopping_list', {
    title: 'Get shopping list',
    annotations: READ,
    description: 'Get a named shopping list by ID.',
    inputSchema: getShoppingListShape,
  }, handleGetShoppingList);

  registerStringTool(server, client, 'create_shopping_list', {
    title: 'Create shopping list',
    annotations: { ...CREATE, idempotentHint: true },
    description: 'Create a named shopping list. Required: name (1 to 32 characters). Optional: description, color (#rrggbb or null). If a list with the same name already exists (case-insensitive), Tandoor returns that list instead of creating a new one, and does not change its description or color.',
    inputSchema: createShoppingListShape,
  }, handleCreateShoppingList);

  registerStringTool(server, client, 'update_shopping_list', {
    title: 'Update shopping list',
    annotations: UPDATE,
    description: 'Update a named shopping list (PATCH). Required: id and at least one of name (1 to 32 characters), description, color (#rrggbb, or null to clear it). A new name that another list already has (ignoring case and surrounding spaces) is refused, because Tandoor would accept it and then fail every create_shopping_list with that name. Renaming a list to its own name is always allowed.',
    inputSchema: updateShoppingListShape,
  }, handleUpdateShoppingList);

  registerStringTool(server, client, 'delete_shopping_list', {
    title: 'Delete shopping list',
    annotations: DELETE,
    description: 'Delete a named shopping list by ID. This only removes the links to the list: foods, shopping entries and supermarkets that used it keep existing. To see the links first, use preview_shopping_list_delete_cascading.',
    inputSchema: deleteShoppingListShape,
  }, handleDeleteShoppingList);

  registerStringTool(server, client, 'list_shopping_entries', {
    title: 'List shopping entries',
    annotations: READ,
    description: 'List the shopping list entries of you and your household. Tandoor returns only unchecked entries and entries checked since the start of the day N days ago, where N is the shopping_recent_days preference capped at 14, and at most 1000 entries; to read an older checked entry, use get_shopping_entry. mealplan keeps only entries added from that meal plan. Entries cannot be filtered by shopping list; use the shopping_lists field of the results. Returns {count, next, previous, results}, 50 per page by default.',
    inputSchema: listShoppingEntriesShape,
  }, handleListShoppingEntries);

  registerStringTool(server, client, 'get_shopping_entry', {
    title: 'Get shopping entry',
    annotations: READ,
    description: 'Get a shopping list entry by ID, including old checked entries that list_shopping_entries hides.',
    inputSchema: getShoppingEntryShape,
  }, handleGetShoppingEntry);

  registerStringTool(server, client, 'create_shopping_entry', {
    title: 'Create shopping entry',
    annotations: CREATE,
    description: `Create a shopping list entry. Required: amount, food_id. Optional: unit_id, checked, list_recipe, ingredient, order, delay_until, mealplan_id (links to existing/new ShoppingListRecipe for that mealplan), shopping_list_ids. ${ENTRY_LISTS}`,
    inputSchema: createShoppingEntryShape,
  }, handleCreateShoppingEntry);

  registerStringTool(server, client, 'update_shopping_entry', {
    title: 'Update shopping entry',
    annotations: UPDATE,
    description: `Update a shopping entry (PATCH). Required: id. Other fields optional. When checked is omitted, the tool reads the entry and sends its current checked value again, so a checked entry keeps its completed_at. A check made elsewhere between that read and the write is undone (last write wins). shopping_list_ids puts the entry on exactly those lists; [] clears them; omit it to keep them. ${LIST_IDS_CHECKED} ${LISTS_APPLIED}`,
    inputSchema: updateShoppingEntryShape,
  }, handleUpdateShoppingEntry);

  registerStringTool(server, client, 'delete_shopping_entry', {
    title: 'Delete shopping entry',
    annotations: DELETE,
    description: 'Delete a shopping entry by ID. To mark bought, use update_shopping_entry or bulk_check_shopping_entries.',
    inputSchema: deleteShoppingEntryShape,
  }, handleDeleteShoppingEntry);

  registerStringTool(server, client, 'bulk_check_shopping_entries', {
    title: 'Bulk check shopping entries',
    annotations: UPDATE,
    description: 'Check or uncheck many shopping entries in one call. Checking sets completed_at to now, also on entries already checked; unchecking clears it. Ids that do not exist or are not visible to you are skipped, and the entries need not share a shopping list. Returns the ids and checked value sent plus a timestamp; it does not return the entries or say which ids were skipped. To change lists too, use bulk_update_shopping_entries; to change other fields, use update_shopping_entry.',
    inputSchema: bulkCheckShoppingEntriesShape,
  }, handleBulkCheckShoppingEntries);

  registerStringTool(server, client, 'bulk_update_shopping_entries', {
    title: 'Bulk update shopping entries',
    annotations: UPDATE,
    description: `Update many shopping entries in one call. Required: ids (entry ids; ids that do not exist or are not visible to you are skipped). Give checked, a list change, or both. checked: true checks every entry and sets completed_at to now, also on entries already checked; without checked, checked and completed_at stay as they are. List changes do not update the entries' updated_at. List changes: ${LIST_OPERATIONS}`,
    inputSchema: bulkUpdateShoppingEntriesShape,
  }, handleBulkUpdateShoppingEntries);

  registerStringTool(server, client, 'list_shopping_list_recipes', {
    title: 'List shopping list recipes',
    annotations: READ,
    description: 'List shopping-list-recipe groupings (a recipe added to the shopping list).',
    inputSchema: listShoppingListRecipesShape,
  }, handleListShoppingListRecipes);

  registerStringTool(server, client, 'get_shopping_list_recipe', {
    title: 'Get shopping list recipe',
    annotations: READ,
    description: 'Get a shopping-list-recipe by ID.',
    inputSchema: getShoppingListRecipeShape,
  }, handleGetShoppingListRecipe);

  registerStringTool(server, client, 'create_shopping_list_recipe', {
    title: 'Create shopping list recipe',
    annotations: CREATE,
    description: 'Create a shopping-list-recipe. Required: servings. Optional: name, recipe (id), mealplan (id).',
    inputSchema: createShoppingListRecipeShape,
  }, handleCreateShoppingListRecipe);

  registerStringTool(server, client, 'update_shopping_list_recipe', {
    title: 'Update shopping list recipe',
    annotations: UPDATE,
    description: 'Update a shopping-list-recipe (PATCH). Required: id.',
    inputSchema: updateShoppingListRecipeShape,
  }, handleUpdateShoppingListRecipe);

  registerStringTool(server, client, 'delete_shopping_list_recipe', {
    title: 'Delete shopping list recipe',
    annotations: DELETE,
    description: 'Delete a shopping-list-recipe by ID.',
    inputSchema: deleteShoppingListRecipeShape,
  }, handleDeleteShoppingListRecipe);

  registerStringTool(server, client, 'bulk_create_shopping_list_recipe_entries', {
    title: 'Bulk create shopping list recipe entries',
    annotations: CREATE,
    description: `Append many shopping entries to an existing shopping-list-recipe in one call. Tandoor answers 404 when the shopping-list-recipe has no entries yet. Optional: shopping_list_ids puts every new entry on those lists. When shopping_list_ids is omitted, each new entry gets its food's lists, whatever the user preference. An empty shopping_list_ids is rejected. ${LIST_IDS_CHECKED}`,
    inputSchema: bulkCreateShoppingListRecipeEntriesShape,
  }, handleBulkCreateShoppingListRecipeEntries);
}
