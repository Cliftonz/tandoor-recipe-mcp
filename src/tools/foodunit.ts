// Food + Unit tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListFoods,
  handleGetFood,
  handleCreateFood,
  handleUpdateFood,
  handleDeleteFood,
  handleMergeFood,
  handleMoveFood,
  handleFoodShoppingUpdate,
  handleFoodFdcLookup,
  handleListUnits,
  handleGetUnit,
  handleCreateUnit,
  handleUpdateUnit,
  handleDeleteUnit,
  handleMergeUnit,
  handleFoodBatchUpdate,
} from '../handlers/foodunit.js';
import { LIST_IDS_CHECKED, LISTS_APPLIED, LIST_OPERATIONS, listOperationsShape } from './shopping.js';

const FOOD_LISTS = 'Changing a food\'s lists does not change its existing shopping entries. '
  + 'add_recipe_to_shopping_list copies the food\'s lists onto new entries. '
  + 'create_shopping_entry without shopping_list_ids copies them when the user preference shopping_update_food_lists is on. '
  + 'bulk_create_shopping_list_recipe_entries without shopping_list_ids copies each food\'s lists whatever the user preference. '
  + `${LIST_IDS_CHECKED} ${LISTS_APPLIED}`;


export const listFoodsShape = {
  query: z.string().optional().describe('Name filter, or similarity ranking when Tandoor fuzzy search is on.'),
  limit: z.number().optional().describe('Maximum number of foods to return.'),
  page: z.number().optional().describe('Page number, from 1.'),
  page_size: z.number().optional().describe('Results per page. Default 50, max 200.'),
  random: z.string().optional().describe('String. Any non-empty value shuffles the order, even "false".'),
  root: z.number().optional().describe('Parent food ID; lists its direct children. 0 lists top-level foods.'),
  root_tree: z.number().optional().describe('Food ID; lists the whole tree that food belongs to.'),
  tree: z.number().optional().describe('Food ID; lists that food and all its descendants.'),
  updated_at: z.string().optional().describe('No effect: Tandoor foods have no updated_at field.'),
  format: formatEnum,
} as const;

export const getFoodShape = { id: z.number().describe('Food ID, from list_foods.'), format: formatEnum } as const;

export const createFoodShape = {
  name: z.string().describe('Food name, e.g. tomato.'),
  plural_name: z.string().optional().describe('Plural form, e.g. tomatoes.'),
  description: z.string().optional().describe('Free-text description.'),
  food_onhand: z.boolean().optional().describe('True marks the food on hand for your household.'),
  fdc_id: z.number().optional().describe('USDA FoodData Central ID, used by food_fdc_lookup.'),
  supermarket_category_id: z.number().nullable().optional().describe('Supermarket category ID, from list_supermarket_categories.'),
  shopping_list_ids: z.array(z.number()).optional().describe('Shopping list IDs, from list_shopping_lists.'),
  format: formatEnum,
} as const;

export const updateFoodShape = {
  id: z.number().describe('Food ID, from list_foods.'),
  name: z.string().optional().describe('New food name.'),
  plural_name: z.string().optional().describe('Plural form, e.g. tomatoes.'),
  description: z.string().optional().describe('Free-text description.'),
  food_onhand: z.boolean().optional().describe('True or false sets on hand for your household.'),
  fdc_id: z.number().optional().describe('USDA FoodData Central ID, used by food_fdc_lookup.'),
  supermarket_category_id: z.number().nullable().optional().describe('Supermarket category ID, from list_supermarket_categories.'),
  properties: z.array(z.object({
    property_type_id: z.number().describe('Property type ID, from list_property_types.'),
    property_amount: z.number().nullable().describe('Value per properties_food_amount; null means unknown.'),
  })).optional().describe('Property values to set, one per type.'),
  remove_property_type_ids: z.array(z.number()).optional().describe('Property type IDs whose values to delete.'),
  properties_food_amount: z.number().optional().describe('Food amount the property values refer to, e.g. 100.'),
  properties_food_unit_id: z.number().nullable().optional().describe('Unit ID for properties_food_amount, from list_units.'),
  shopping_list_ids: z.array(z.number()).optional().describe('Replaces the food\'s shopping lists; [] clears them.'),
  format: formatEnum,
} as const;

export const deleteFoodShape = { id: z.number().describe('Food ID, from list_foods.') } as const;
export const mergeFoodShape = {
  id: z.number().describe('Food ID to absorb; it is deleted.'),
  target: z.number().describe('Food ID that remains and takes the references.'),
} as const;
export const moveFoodShape = {
  id: z.number().describe('Food ID to move.'),
  parent: z.number().describe('New parent food ID; 0 moves it to the top level.'),
} as const;

export const foodFdcLookupShape = {
  id: z.number().describe('Food ID, from list_foods.'),
  fdc_id: z.number().optional().describe('USDA FDC ID to set before the lookup.'),
  format: formatEnum,
} as const;

export const foodShoppingUpdateShape = {
  id: z.number().describe('Food ID, from list_foods.'),
  amount: z.number().nullable().optional().describe('Amount to add. Tandoor defaults to 1 when omitted.'),
  unit_id: z.number().nullable().optional().describe('Unit ID, from list_units.'),
  delete: z.boolean().optional().describe('True removes the food\'s unchecked entries instead of adding.'),
} as const;

export const listUnitsShape = {
  query: z.string().optional().describe('Name filter, or similarity ranking when Tandoor fuzzy search is on.'),
  limit: z.number().optional().describe('Maximum number of units to return.'),
  page: z.number().optional().describe('Page number, from 1.'),
  page_size: z.number().optional().describe('Results per page. Default 50, max 200.'),
  random: z.string().optional().describe('String. Any non-empty value shuffles the order, even "false".'),
  updated_at: z.string().optional().describe('No effect: Tandoor units have no updated_at field.'),
  format: formatEnum,
} as const;

export const getUnitShape = { id: z.number().describe('Unit ID, from list_units.'), format: formatEnum } as const;

export const createUnitShape = {
  name: z.string().describe('Unit name, e.g. cup. Unique per space.'),
  plural_name: z.string().optional().describe('Plural form, e.g. cups.'),
  description: z.string().optional().describe('Free-text description.'),
  base_unit: z.string().optional().describe('Standard unit for automatic conversion, e.g. g, kg, ml, l, tsp.'),
  format: formatEnum,
} as const;

export const updateUnitShape = {
  id: z.number().describe('Unit ID, from list_units.'),
  name: z.string().optional().describe('New unit name. Unique per space.'),
  plural_name: z.string().optional().describe('Plural form, e.g. cups.'),
  description: z.string().optional().describe('Free-text description.'),
  base_unit: z.string().optional().describe('Standard unit for automatic conversion, e.g. g, kg, ml, l, tsp.'),
  format: formatEnum,
} as const;

export const deleteUnitShape = { id: z.number().describe('Unit ID, from list_units.') } as const;
export const mergeUnitShape = {
  id: z.number().describe('Unit ID to absorb; it is deleted.'),
  target: z.number().describe('Unit ID that remains and takes the references.'),
} as const;

// Mirrors Tandoor's FoodBatchUpdate serializer. `foods` is the target set;
// all other fields are optional mutations applied across that set.
export const foodBatchUpdateShape = {
  foods: z.array(z.number()).describe('Food IDs to update, from list_foods.'),
  category: z.number().nullable().optional().describe('Supermarket category ID, from list_supermarket_categories.'),
  substitute_add: z.array(z.number()).optional().describe('Food IDs to add as substitutes.'),
  substitute_remove: z.array(z.number()).optional().describe('Substitute food IDs to remove.'),
  substitute_set: z.array(z.number()).optional().describe('Food IDs that replace all substitutes.'),
  substitute_remove_all: z.boolean().optional().describe('True removes all substitutes.'),
  inherit_fields_add: z.array(z.number()).optional().describe('Inherit field IDs to add, from list_food_inherit_fields.'),
  inherit_fields_remove: z.array(z.number()).optional().describe('Inherit field IDs to remove.'),
  inherit_fields_set: z.array(z.number()).optional().describe('Inherit field IDs that replace the current ones.'),
  inherit_fields_remove_all: z.boolean().optional().describe('True removes all inherit fields.'),
  child_inherit_fields_add: z.array(z.number()).optional().describe('Child inherit field IDs to add, from list_food_inherit_fields.'),
  child_inherit_fields_remove: z.array(z.number()).optional().describe('Child inherit field IDs to remove.'),
  child_inherit_fields_set: z.array(z.number()).optional().describe('Child inherit field IDs that replace the current ones.'),
  child_inherit_fields_remove_all: z.boolean().optional().describe('True removes all child inherit fields.'),
  substitute_children: z.boolean().nullable().optional().describe('Child foods count as substitutes. Null leaves it unchanged.'),
  substitute_siblings: z.boolean().nullable().optional().describe('Sibling foods count as substitutes. Null leaves it unchanged.'),
  ignore_shopping: z.boolean().nullable().optional().describe('True skips these foods when recipes go to shopping. Null: no change.'),
  on_hand: z.boolean().nullable().optional().describe('Sets on hand for your household. Null leaves it unchanged.'),
  parent_remove: z.boolean().nullable().optional().describe('True moves the foods to the top level.'),
  parent_set: z.number().nullable().optional().describe('Parent food ID to move the foods under.'),
  ...listOperationsShape,
} as const;

export type ListFoodsArgs = z.infer<z.ZodObject<typeof listFoodsShape>>;
export type GetFoodArgs = z.infer<z.ZodObject<typeof getFoodShape>>;
export type CreateFoodArgs = z.infer<z.ZodObject<typeof createFoodShape>>;
export type UpdateFoodArgs = z.infer<z.ZodObject<typeof updateFoodShape>>;
export type DeleteFoodArgs = z.infer<z.ZodObject<typeof deleteFoodShape>>;
export type MergeFoodArgs = z.infer<z.ZodObject<typeof mergeFoodShape>>;
export type MoveFoodArgs = z.infer<z.ZodObject<typeof moveFoodShape>>;
export type FoodFdcLookupArgs = z.infer<z.ZodObject<typeof foodFdcLookupShape>>;
export type FoodShoppingUpdateArgs = z.infer<z.ZodObject<typeof foodShoppingUpdateShape>>;
export type ListUnitsArgs = z.infer<z.ZodObject<typeof listUnitsShape>>;
export type GetUnitArgs = z.infer<z.ZodObject<typeof getUnitShape>>;
export type CreateUnitArgs = z.infer<z.ZodObject<typeof createUnitShape>>;
export type UpdateUnitArgs = z.infer<z.ZodObject<typeof updateUnitShape>>;
export type DeleteUnitArgs = z.infer<z.ZodObject<typeof deleteUnitShape>>;
export type MergeUnitArgs = z.infer<z.ZodObject<typeof mergeUnitShape>>;
export type FoodBatchUpdateArgs = z.infer<z.ZodObject<typeof foodBatchUpdateShape>>;

export function registerFoodUnitTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_foods', {
    title: 'List foods',
    annotations: READ,
    description: 'List foods (ingredients). Optional: query (name filter, or similarity ranking if fuzzy search is on), root (parent id, 0 for top-level), tree (id, with its descendants), root_tree, random, limit. root, tree and root_tree ignore query, random, limit and updated_at.',
    inputSchema: listFoodsShape,
  }, handleListFoods);

  registerStringTool(server, client, 'get_food', {
    title: 'Get food',
    annotations: READ,
    description: 'Get food (ingredient) by ID. Find IDs with list_foods.',
    inputSchema: getFoodShape,
  }, handleGetFood);

  registerStringTool(server, client, 'create_food', {
    title: 'Create food',
    annotations: { ...CREATE, idempotentHint: true },
    description: `Create food. Required: name. Optional: plural_name, description, food_onhand, fdc_id, supermarket_category_id, shopping_list_ids (ids from list_shopping_lists). If a food with this name exists, Tandoor returns it instead of creating one. With shopping_list_ids (including []), the tool looks up the name first and, if a food with that name exists (ignoring case and surrounding spaces), refuses and changes nothing; use update_food. Tandoor also returns an existing food whose plural name matches; the tool detects that from the create reply and refuses the same way, setting no lists. With non-empty shopping_list_ids, the tool creates the food first and then sets its lists, because Tandoor cannot set lists while creating a food. With any shopping_list_ids (including []), if a step after the create fails, the error gives the new food's id and says not to retry. ${FOOD_LISTS}`,
    inputSchema: createFoodShape,
  }, handleCreateFood);

  registerStringTool(server, client, 'update_food', {
    title: 'Update food',
    annotations: { ...UPDATE, destructiveHint: true },
    description: `Update food (PATCH). Required: id. Optional properties[] {property_type_id, property_amount} sets one value per property type (amount null = unknown), updating the existing value of that type in place and deleting any duplicate values of that type; remove_property_type_ids[] deletes values by type. Other existing property values are kept. A type may appear once across both lists. properties_food_amount and properties_food_unit_id set the food amount the property values refer to (e.g. 100 g); properties_food_unit_id null clears the unit. Deleting a property row removes it from every food or recipe it is linked to. If a row delete fails, the food is already updated and the tool returns an error naming those rows. shopping_list_ids replaces the food's lists; [] clears them; omit it to keep them. ${FOOD_LISTS}`,
    inputSchema: updateFoodShape,
  }, handleUpdateFood);

  registerStringTool(server, client, 'delete_food', {
    title: 'Delete food',
    annotations: DELETE,
    description: 'Delete food by ID. Destructive + irreversible. Before calling, recommend: (1) check recipe usage via list_recipes({foods: [id]}); if recipes reference it, they will lose the ingredient link; (2) if the intent is deduplication not removal, use merge_food instead so references follow the merge.',
    inputSchema: deleteFoodShape,
  }, handleDeleteFood);

  registerStringTool(server, client, 'merge_food', {
    title: 'Merge food',
    annotations: DELETE,
    description: 'Merge food `id` into `target` food (deduplication). All references to id will point to target. Destructive + irreversible. Before calling, recommend: (1) confirm both foods via get_food on each so you are sure which survives (target) and which is absorbed (id); (2) check usage of each via list_recipes({foods: [id]}) to understand the migration size; (3) if you actually want the other direction, swap id and target.',
    inputSchema: mergeFoodShape,
  }, handleMergeFood);

  registerStringTool(server, client, 'move_food', {
    title: 'Move food',
    annotations: UPDATE,
    description: 'Move food `id` under a new parent (tree reparent). Use parent=0 for root.',
    inputSchema: moveFoodShape,
  }, handleMoveFood);

  registerStringTool(server, client, 'food_fdc_lookup', {
    title: 'Look up food nutrition in USDA FDC',
    annotations: UPDATE,
    description: 'Enrich a food with USDA FDC nutrition data. Optional: fdc_id to set/override the USDA FDC id before lookup. Tandoor populates fdc-linked properties; manually-entered properties without fdc_id are preserved. Rate limit: Tandoor defaults to USDA DEMO_KEY (30 req/hour/IP), so bulk enrichment will 429. Operator should set FDC_API_KEY on the Tandoor container (free key at api.data.gov/signup) to raise the limit to 1000/hour. Fallback for FDC 404s: food_ai_properties.',
    inputSchema: foodFdcLookupShape,
  }, handleFoodFdcLookup);

  registerStringTool(server, client, 'food_shopping_update', {
    title: 'Update food on shopping lists',
    annotations: { ...CREATE, destructiveHint: true },
    description: 'Add a food to active shopping lists with optional amount/unit. Pass delete=true to remove this food from all active lists.',
    inputSchema: foodShoppingUpdateShape,
  }, handleFoodShoppingUpdate);

  registerStringTool(server, client, 'list_units', {
    title: 'List units',
    annotations: READ,
    description: 'List measurement units. Optional: query (name filter, or similarity ranking if fuzzy search is on), limit, random. Returns {count, next, previous, results}, 50 per page.',
    inputSchema: listUnitsShape,
  }, handleListUnits);

  registerStringTool(server, client, 'get_unit', {
    title: 'Get unit',
    annotations: READ,
    description: 'Get unit by ID.',
    inputSchema: getUnitShape,
  }, handleGetUnit);

  registerStringTool(server, client, 'create_unit', {
    title: 'Create unit',
    annotations: CREATE,
    description: 'Create unit. Required: name. Optional: plural_name, description, base_unit.',
    inputSchema: createUnitShape,
  }, handleCreateUnit);

  registerStringTool(server, client, 'update_unit', {
    title: 'Update unit',
    annotations: UPDATE,
    description: 'Update unit (PATCH). Required: id.',
    inputSchema: updateUnitShape,
  }, handleUpdateUnit);

  registerStringTool(server, client, 'delete_unit', {
    title: 'Delete unit',
    annotations: DELETE,
    description: 'Delete unit by ID. Destructive + irreversible. Before calling, recommend: (1) check ingredient + unit_conversion usage, since unit deletions cascade into "None" unit on ingredients; (2) if the intent is deduplication (e.g., "cup" vs "cups"), use merge_unit instead so references follow the merge.',
    inputSchema: deleteUnitShape,
  }, handleDeleteUnit);

  registerStringTool(server, client, 'merge_unit', {
    title: 'Merge unit',
    annotations: DELETE,
    description: 'Merge unit `id` into `target` unit (deduplication). Destructive + irreversible. Before calling, recommend: (1) confirm base_unit compatibility via get_unit on each; merging units with different base_unit (e.g., mass into volume) will break existing conversion math; (2) if the intent is a one-way rename, update_unit is safer.',
    inputSchema: mergeUnitShape,
  }, handleMergeUnit);

  registerStringTool(server, client, 'food_batch_update', {
    title: 'Batch update foods',
    annotations: DELETE,
    description: `Apply a narrow set of bulk mutations across many foods in one call via Tandoor's /api/food/batch_update/ endpoint. Required: foods[]. Optional (all apply to every food in foods[]): category (supermarket category ID to set; ignored if no such category exists, and null changes nothing), substitute_add/remove/set/remove_all, inherit_fields_add/remove/set/remove_all, child_inherit_fields_* (same pattern), substitute_children/siblings (boolean), ignore_shopping, on_hand, parent_set/parent_remove. Does NOT support bulk name/plural/description/fdc_id edits; those still need update_food per-item. Use for: pantry on-hand toggle across a set, retagging supermarket category, configuring substitute groups, moving foods between shopping lists. Empty arrays and *_remove_all: false count as no change and are not sent. A call with no field change and no list change is rejected ("Give a field to change, a list change, or both."). Shopping list changes: ${LIST_OPERATIONS} Existing shopping entries keep their lists.`,
    inputSchema: foodBatchUpdateShape,
  }, handleFoodBatchUpdate);
}
