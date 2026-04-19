// Food + Unit tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
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
} from '../handlers/foodunit.js';

const formatEnum = z.enum(['slim', 'full']).optional();

export const listFoodsShape = {
  query: z.string().optional(),
  limit: z.number().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  random: z.string().optional(),
  root: z.number().optional(),
  root_tree: z.number().optional(),
  tree: z.number().optional(),
  updated_at: z.string().optional(),
  format: formatEnum,
} as const;

export const getFoodShape = { id: z.number(), format: formatEnum } as const;

export const createFoodShape = {
  name: z.string(),
  plural_name: z.string().optional(),
  description: z.string().optional(),
  food_onhand: z.boolean().optional(),
  fdc_id: z.number().optional(),
  supermarket_category_id: z.number().nullable().optional(),
  format: formatEnum,
} as const;

export const updateFoodShape = {
  id: z.number(),
  name: z.string().optional(),
  plural_name: z.string().optional(),
  description: z.string().optional(),
  food_onhand: z.boolean().optional(),
  fdc_id: z.number().optional(),
  supermarket_category_id: z.number().nullable().optional(),
  format: formatEnum,
} as const;

export const deleteFoodShape = { id: z.number() } as const;
export const mergeFoodShape = { id: z.number(), target: z.number() } as const;
export const moveFoodShape = { id: z.number(), parent: z.number() } as const;

export const foodFdcLookupShape = {
  id: z.number(),
  fdc_id: z.number().optional(),
  format: formatEnum,
} as const;

export const foodShoppingUpdateShape = {
  id: z.number(),
  amount: z.number().nullable().optional(),
  unit_id: z.number().nullable().optional(),
  delete: z.boolean().optional(),
} as const;

export const listUnitsShape = {
  query: z.string().optional(),
  limit: z.number().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  random: z.string().optional(),
  updated_at: z.string().optional(),
  format: formatEnum,
} as const;

export const getUnitShape = { id: z.number(), format: formatEnum } as const;

export const createUnitShape = {
  name: z.string(),
  plural_name: z.string().optional(),
  description: z.string().optional(),
  base_unit: z.string().optional(),
  format: formatEnum,
} as const;

export const updateUnitShape = {
  id: z.number(),
  name: z.string().optional(),
  plural_name: z.string().optional(),
  description: z.string().optional(),
  base_unit: z.string().optional(),
  format: formatEnum,
} as const;

export const deleteUnitShape = { id: z.number() } as const;
export const mergeUnitShape = { id: z.number(), target: z.number() } as const;

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

export function registerFoodUnitTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_foods', {
    description: 'List foods. Optional: query (case-insensitive name match), root (parent id, 0 for top-level), tree (id), random, limit, page, page_size.',
    inputSchema: listFoodsShape,
  }, handleListFoods);

  registerStringTool(server, client, 'get_food', {
    description: 'Get food by ID.',
    inputSchema: getFoodShape,
  }, handleGetFood);

  registerStringTool(server, client, 'create_food', {
    description: 'Create food. Required: name. Optional: plural_name, description, food_onhand, fdc_id, supermarket_category_id.',
    inputSchema: createFoodShape,
  }, handleCreateFood);

  registerStringTool(server, client, 'update_food', {
    description: 'Update food (PATCH). Required: id.',
    inputSchema: updateFoodShape,
  }, handleUpdateFood);

  registerStringTool(server, client, 'delete_food', {
    description: 'Delete food by ID.',
    inputSchema: deleteFoodShape,
  }, handleDeleteFood);

  registerStringTool(server, client, 'merge_food', {
    description: 'Merge food `id` into `target` food (deduplication). All references to id will point to target.',
    inputSchema: mergeFoodShape,
  }, handleMergeFood);

  registerStringTool(server, client, 'move_food', {
    description: 'Move food `id` under a new parent (tree reparent). Use parent=0 for root.',
    inputSchema: moveFoodShape,
  }, handleMoveFood);

  registerStringTool(server, client, 'food_fdc_lookup', {
    description: 'Enrich a food with USDA FDC nutrition data. Optional: fdc_id to set/override the USDA FDC id before lookup. Tandoor populates fdc-linked properties; manually-entered properties without fdc_id are preserved.',
    inputSchema: foodFdcLookupShape,
  }, handleFoodFdcLookup);

  registerStringTool(server, client, 'food_shopping_update', {
    description: 'Add a food to active shopping lists with optional amount/unit. Pass delete=true to remove this food from all active lists.',
    inputSchema: foodShoppingUpdateShape,
  }, handleFoodShoppingUpdate);

  registerStringTool(server, client, 'list_units', {
    description: 'List units. Optional: query, limit, page, page_size, random.',
    inputSchema: listUnitsShape,
  }, handleListUnits);

  registerStringTool(server, client, 'get_unit', {
    description: 'Get unit by ID.',
    inputSchema: getUnitShape,
  }, handleGetUnit);

  registerStringTool(server, client, 'create_unit', {
    description: 'Create unit. Required: name. Optional: plural_name, description, base_unit.',
    inputSchema: createUnitShape,
  }, handleCreateUnit);

  registerStringTool(server, client, 'update_unit', {
    description: 'Update unit (PATCH). Required: id.',
    inputSchema: updateUnitShape,
  }, handleUpdateUnit);

  registerStringTool(server, client, 'delete_unit', {
    description: 'Delete unit by ID.',
    inputSchema: deleteUnitShape,
  }, handleDeleteUnit);

  registerStringTool(server, client, 'merge_unit', {
    description: 'Merge unit `id` into `target` unit (deduplication).',
    inputSchema: mergeUnitShape,
  }, handleMergeUnit);
}
