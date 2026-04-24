// Keyword, supermarket category, unit conversion, property, property-type,
// custom filter, supermarket-category-relation tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import {
  handleListKeywords,
  handleGetKeyword,
  handleCreateKeyword,
  handleUpdateKeyword,
  handleDeleteKeyword,
  handleMergeKeyword,
  handleMoveKeyword,
  handleListSupermarketCategories,
  handleGetSupermarketCategory,
  handleCreateSupermarketCategory,
  handleUpdateSupermarketCategory,
  handleDeleteSupermarketCategory,
  handleMergeSupermarketCategory,
  handleListUnitConversions,
  handleGetUnitConversion,
  handleCreateUnitConversion,
  handleUpdateUnitConversion,
  handleDeleteUnitConversion,
  handleListPropertyTypes,
  handleGetPropertyType,
  handleCreatePropertyType,
  handleUpdatePropertyType,
  handleDeletePropertyType,
  handleListProperties,
  handleGetProperty,
  handleCreateProperty,
  handleUpdateProperty,
  handleDeleteProperty,
  handleListCustomFilters,
  handleGetCustomFilter,
  handleCreateCustomFilter,
  handleUpdateCustomFilter,
  handleDeleteCustomFilter,
  handleListSupermarketCategoryRelations,
  handleGetSupermarketCategoryRelation,
  handleCreateSupermarketCategoryRelation,
  handleUpdateSupermarketCategoryRelation,
  handleDeleteSupermarketCategoryRelation,
} from '../handlers/misc.js';

const formatEnum = z.enum(['slim', 'full']).optional();

// ---------- Shapes ----------
export const listKeywordsShape = {
  query: z.string().optional(),
  limit: z.string().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  random: z.string().optional(),
  root: z.number().optional(),
  root_tree: z.number().optional(),
  tree: z.number().optional(),
  updated_at: z.string().optional(),
  format: formatEnum,
} as const;
export const getKeywordShape = { id: z.number(), format: formatEnum } as const;
export const createKeywordShape = { name: z.string(), description: z.string().optional(), format: formatEnum } as const;
export const updateKeywordShape = { id: z.number(), name: z.string().optional(), description: z.string().optional(), format: formatEnum } as const;
export const deleteKeywordShape = { id: z.number() } as const;
export const mergeKeywordShape = { id: z.number(), target: z.number() } as const;
export const moveKeywordShape = { id: z.number(), parent: z.number() } as const;

export const listSupermarketCategoriesShape = { page: z.number().optional(), page_size: z.number().optional(), format: formatEnum } as const;
export const getSupermarketCategoryShape = { id: z.number(), format: formatEnum } as const;
export const createSupermarketCategoryShape = { name: z.string(), description: z.string().optional(), format: formatEnum } as const;
export const updateSupermarketCategoryShape = { id: z.number(), name: z.string().optional(), description: z.string().optional(), format: formatEnum } as const;
export const deleteSupermarketCategoryShape = { id: z.number() } as const;
export const mergeSupermarketCategoryShape = { id: z.number(), target: z.number() } as const;

export const listUnitConversionsShape = {
  food_id: z.number().optional(),
  query: z.string().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;
export const getUnitConversionShape = { id: z.number(), format: formatEnum } as const;
export const createUnitConversionShape = {
  base_amount: z.number(),
  base_unit_id: z.number(),
  converted_amount: z.number(),
  converted_unit_id: z.number(),
  food_id: z.number().nullable().optional(),
  format: formatEnum,
} as const;
export const updateUnitConversionShape = {
  id: z.number(),
  base_amount: z.number().optional(),
  base_unit_id: z.number().optional(),
  converted_amount: z.number().optional(),
  converted_unit_id: z.number().optional(),
  food_id: z.number().nullable().optional(),
  format: formatEnum,
} as const;
export const deleteUnitConversionShape = { id: z.number() } as const;

export const listPropertyTypesShape = {
  category: z.array(z.enum(['ALLERGEN', 'GOAL', 'NUTRITION', 'OTHER', 'PRICE'])).optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;
export const getPropertyTypeShape = { id: z.number(), format: formatEnum } as const;
export const createPropertyTypeShape = {
  name: z.string(),
  unit: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  order: z.number().optional(),
  open_data_slug: z.string().nullable().optional(),
  fdc_id: z.number().nullable().optional(),
  format: formatEnum,
} as const;
export const updatePropertyTypeShape = {
  id: z.number(),
  name: z.string().optional(),
  unit: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  order: z.number().optional(),
  open_data_slug: z.string().nullable().optional(),
  fdc_id: z.number().nullable().optional(),
  format: formatEnum,
} as const;
export const deletePropertyTypeShape = { id: z.number() } as const;

export const listPropertiesShape = { page: z.number().optional(), page_size: z.number().optional(), format: formatEnum } as const;
export const getPropertyShape = { id: z.number(), format: formatEnum } as const;
export const createPropertyShape = {
  property_type_id: z.number(),
  property_amount: z.number(),
  format: formatEnum,
} as const;
export const updatePropertyShape = {
  id: z.number(),
  property_type_id: z.number().optional(),
  property_amount: z.number().optional(),
  format: formatEnum,
} as const;
export const deletePropertyShape = { id: z.number() } as const;

export const listCustomFiltersShape = { page: z.number().optional(), page_size: z.number().optional(), format: formatEnum } as const;
export const getCustomFilterShape = { id: z.number(), format: formatEnum } as const;
export const createCustomFilterShape = {
  name: z.string(),
  search: z.string(),
  shared_user_ids: z.array(z.number()).optional(),
  format: formatEnum,
} as const;
export const updateCustomFilterShape = {
  id: z.number(),
  name: z.string().optional(),
  search: z.string().optional(),
  shared_user_ids: z.array(z.number()).optional(),
  format: formatEnum,
} as const;
export const deleteCustomFilterShape = { id: z.number() } as const;

export const listSupermarketCategoryRelationsShape = { page: z.number().optional(), page_size: z.number().optional(), format: formatEnum } as const;
export const getSupermarketCategoryRelationShape = { id: z.number(), format: formatEnum } as const;
export const createSupermarketCategoryRelationShape = {
  category_id: z.number(),
  supermarket: z.number(),
  order: z.number().optional(),
  format: formatEnum,
} as const;
export const updateSupermarketCategoryRelationShape = {
  id: z.number(),
  category_id: z.number().optional(),
  supermarket: z.number().optional(),
  order: z.number().optional(),
  format: formatEnum,
} as const;
export const deleteSupermarketCategoryRelationShape = { id: z.number() } as const;

// ---------- Inferred types ----------
export type ListKeywordsArgs = z.infer<z.ZodObject<typeof listKeywordsShape>>;
export type GetKeywordArgs = z.infer<z.ZodObject<typeof getKeywordShape>>;
export type CreateKeywordArgs = z.infer<z.ZodObject<typeof createKeywordShape>>;
export type UpdateKeywordArgs = z.infer<z.ZodObject<typeof updateKeywordShape>>;
export type DeleteKeywordArgs = z.infer<z.ZodObject<typeof deleteKeywordShape>>;
export type MergeKeywordArgs = z.infer<z.ZodObject<typeof mergeKeywordShape>>;
export type MoveKeywordArgs = z.infer<z.ZodObject<typeof moveKeywordShape>>;

export type ListSupermarketCategoriesArgs = z.infer<z.ZodObject<typeof listSupermarketCategoriesShape>>;
export type GetSupermarketCategoryArgs = z.infer<z.ZodObject<typeof getSupermarketCategoryShape>>;
export type CreateSupermarketCategoryArgs = z.infer<z.ZodObject<typeof createSupermarketCategoryShape>>;
export type UpdateSupermarketCategoryArgs = z.infer<z.ZodObject<typeof updateSupermarketCategoryShape>>;
export type DeleteSupermarketCategoryArgs = z.infer<z.ZodObject<typeof deleteSupermarketCategoryShape>>;
export type MergeSupermarketCategoryArgs = z.infer<z.ZodObject<typeof mergeSupermarketCategoryShape>>;

export type ListUnitConversionsArgs = z.infer<z.ZodObject<typeof listUnitConversionsShape>>;
export type GetUnitConversionArgs = z.infer<z.ZodObject<typeof getUnitConversionShape>>;
export type CreateUnitConversionArgs = z.infer<z.ZodObject<typeof createUnitConversionShape>>;
export type UpdateUnitConversionArgs = z.infer<z.ZodObject<typeof updateUnitConversionShape>>;
export type DeleteUnitConversionArgs = z.infer<z.ZodObject<typeof deleteUnitConversionShape>>;

export type ListPropertyTypesArgs = z.infer<z.ZodObject<typeof listPropertyTypesShape>>;
export type GetPropertyTypeArgs = z.infer<z.ZodObject<typeof getPropertyTypeShape>>;
export type CreatePropertyTypeArgs = z.infer<z.ZodObject<typeof createPropertyTypeShape>>;
export type UpdatePropertyTypeArgs = z.infer<z.ZodObject<typeof updatePropertyTypeShape>>;
export type DeletePropertyTypeArgs = z.infer<z.ZodObject<typeof deletePropertyTypeShape>>;

export type ListPropertiesArgs = z.infer<z.ZodObject<typeof listPropertiesShape>>;
export type GetPropertyArgs = z.infer<z.ZodObject<typeof getPropertyShape>>;
export type CreatePropertyArgs = z.infer<z.ZodObject<typeof createPropertyShape>>;
export type UpdatePropertyArgs = z.infer<z.ZodObject<typeof updatePropertyShape>>;
export type DeletePropertyArgs = z.infer<z.ZodObject<typeof deletePropertyShape>>;

export type ListCustomFiltersArgs = z.infer<z.ZodObject<typeof listCustomFiltersShape>>;
export type GetCustomFilterArgs = z.infer<z.ZodObject<typeof getCustomFilterShape>>;
export type CreateCustomFilterArgs = z.infer<z.ZodObject<typeof createCustomFilterShape>>;
export type UpdateCustomFilterArgs = z.infer<z.ZodObject<typeof updateCustomFilterShape>>;
export type DeleteCustomFilterArgs = z.infer<z.ZodObject<typeof deleteCustomFilterShape>>;

export type ListSupermarketCategoryRelationsArgs = z.infer<z.ZodObject<typeof listSupermarketCategoryRelationsShape>>;
export type GetSupermarketCategoryRelationArgs = z.infer<z.ZodObject<typeof getSupermarketCategoryRelationShape>>;
export type CreateSupermarketCategoryRelationArgs = z.infer<z.ZodObject<typeof createSupermarketCategoryRelationShape>>;
export type UpdateSupermarketCategoryRelationArgs = z.infer<z.ZodObject<typeof updateSupermarketCategoryRelationShape>>;
export type DeleteSupermarketCategoryRelationArgs = z.infer<z.ZodObject<typeof deleteSupermarketCategoryRelationShape>>;

export function registerMiscTools(server: McpServer, client: TandoorClient): void {
  // Keywords
  registerStringTool(server, client, 'list_keywords', {
    description: 'List keywords (recipe tags). Optional: query, root, tree, random, limit, page, page_size.',
    inputSchema: listKeywordsShape,
  }, handleListKeywords);
  registerStringTool(server, client, 'get_keyword', { description: 'Get keyword by ID.', inputSchema: getKeywordShape }, handleGetKeyword);
  registerStringTool(server, client, 'create_keyword', { description: 'Create keyword. Required: name. Optional: description.', inputSchema: createKeywordShape }, handleCreateKeyword);
  registerStringTool(server, client, 'update_keyword', { description: 'Update keyword (PATCH). Required: id.', inputSchema: updateKeywordShape }, handleUpdateKeyword);
  registerStringTool(server, client, 'delete_keyword', { description: 'Delete keyword by ID. Destructive + irreversible. Before calling, recommend: (1) check recipe usage via list_recipes({keywords: [id]}) so you know how many recipes lose the tag; (2) if the intent is merging duplicates (e.g., "weeknight" + "Weeknight"), use merge_keyword instead.', inputSchema: deleteKeywordShape }, handleDeleteKeyword);
  registerStringTool(server, client, 'merge_keyword', { description: 'Merge keyword `id` into `target` keyword. Destructive + irreversible. All recipes tagged with id will be retagged to target. Before calling, recommend: (1) confirm both via get_keyword so you are sure which survives (target) and which is absorbed (id); (2) check numrecipe on each via list_keywords to understand the migration size.', inputSchema: mergeKeywordShape }, handleMergeKeyword);
  registerStringTool(server, client, 'move_keyword', { description: 'Move keyword `id` under parent (parent=0 for root).', inputSchema: moveKeywordShape }, handleMoveKeyword);

  // Supermarket categories
  registerStringTool(server, client, 'list_supermarket_categories', { description: 'List supermarket categories (used to organize shopping list by aisle).', inputSchema: listSupermarketCategoriesShape }, handleListSupermarketCategories);
  registerStringTool(server, client, 'get_supermarket_category', { description: 'Get supermarket category by ID.', inputSchema: getSupermarketCategoryShape }, handleGetSupermarketCategory);
  registerStringTool(server, client, 'create_supermarket_category', { description: 'Create supermarket category. Required: name.', inputSchema: createSupermarketCategoryShape }, handleCreateSupermarketCategory);
  registerStringTool(server, client, 'update_supermarket_category', { description: 'Update supermarket category (PATCH). Required: id.', inputSchema: updateSupermarketCategoryShape }, handleUpdateSupermarketCategory);
  registerStringTool(server, client, 'delete_supermarket_category', { description: 'Delete supermarket category by ID.', inputSchema: deleteSupermarketCategoryShape }, handleDeleteSupermarketCategory);
  registerStringTool(server, client, 'merge_supermarket_category', { description: 'Merge supermarket category `id` into `target`.', inputSchema: mergeSupermarketCategoryShape }, handleMergeSupermarketCategory);

  // Unit conversions
  registerStringTool(server, client, 'list_unit_conversions', { description: 'List unit conversions. Optional: food_id (filter), query, page, page_size.', inputSchema: listUnitConversionsShape }, handleListUnitConversions);
  registerStringTool(server, client, 'get_unit_conversion', { description: 'Get unit conversion by ID.', inputSchema: getUnitConversionShape }, handleGetUnitConversion);
  registerStringTool(server, client, 'create_unit_conversion', { description: 'Create unit conversion. Required: base_amount, converted_amount, base_unit_id, converted_unit_id. Optional: food_id (for food-specific conversion).', inputSchema: createUnitConversionShape }, handleCreateUnitConversion);
  registerStringTool(server, client, 'update_unit_conversion', { description: 'Update unit conversion (PATCH). Required: id.', inputSchema: updateUnitConversionShape }, handleUpdateUnitConversion);
  registerStringTool(server, client, 'delete_unit_conversion', { description: 'Delete unit conversion by ID.', inputSchema: deleteUnitConversionShape }, handleDeleteUnitConversion);

  // Property types
  registerStringTool(server, client, 'list_property_types', { description: 'List property types. Optional: category[] (ALLERGEN/GOAL/NUTRITION/OTHER/PRICE).', inputSchema: listPropertyTypesShape }, handleListPropertyTypes);
  registerStringTool(server, client, 'get_property_type', { description: 'Get property type by ID.', inputSchema: getPropertyTypeShape }, handleGetPropertyType);
  registerStringTool(server, client, 'create_property_type', { description: 'Create property type. Required: name. Optional: unit, description, order, open_data_slug, fdc_id.', inputSchema: createPropertyTypeShape }, handleCreatePropertyType);
  registerStringTool(server, client, 'update_property_type', { description: 'Update property type (PATCH). Required: id.', inputSchema: updatePropertyTypeShape }, handleUpdatePropertyType);
  registerStringTool(server, client, 'delete_property_type', { description: 'Delete property type by ID.', inputSchema: deletePropertyTypeShape }, handleDeletePropertyType);

  // Properties
  registerStringTool(server, client, 'list_properties', { description: 'List properties.', inputSchema: listPropertiesShape }, handleListProperties);
  registerStringTool(server, client, 'get_property', { description: 'Get property by ID.', inputSchema: getPropertyShape }, handleGetProperty);
  registerStringTool(server, client, 'create_property', { description: 'Create property value. Required: property_type_id, property_amount.', inputSchema: createPropertyShape }, handleCreateProperty);
  registerStringTool(server, client, 'update_property', { description: 'Update property (PATCH). Required: id.', inputSchema: updatePropertyShape }, handleUpdateProperty);
  registerStringTool(server, client, 'delete_property', { description: 'Delete property by ID.', inputSchema: deletePropertyShape }, handleDeleteProperty);

  // Custom filters
  registerStringTool(server, client, 'list_custom_filters', { description: 'List saved custom filters. search field uses Tandoor filter DSL.', inputSchema: listCustomFiltersShape }, handleListCustomFilters);
  registerStringTool(server, client, 'get_custom_filter', { description: 'Get custom filter by ID.', inputSchema: getCustomFilterShape }, handleGetCustomFilter);
  registerStringTool(server, client, 'create_custom_filter', { description: 'Create a custom filter. Required: name, search (filter DSL string). Optional: shared_user_ids[].', inputSchema: createCustomFilterShape }, handleCreateCustomFilter);
  registerStringTool(server, client, 'update_custom_filter', { description: 'Update custom filter (PATCH). Required: id.', inputSchema: updateCustomFilterShape }, handleUpdateCustomFilter);
  registerStringTool(server, client, 'delete_custom_filter', { description: 'Delete custom filter by ID.', inputSchema: deleteCustomFilterShape }, handleDeleteCustomFilter);

  // Supermarket ↔ Category relations
  registerStringTool(server, client, 'list_supermarket_category_relations', { description: 'List supermarket↔category orderings.', inputSchema: listSupermarketCategoryRelationsShape }, handleListSupermarketCategoryRelations);
  registerStringTool(server, client, 'get_supermarket_category_relation', { description: 'Get relation by ID.', inputSchema: getSupermarketCategoryRelationShape }, handleGetSupermarketCategoryRelation);
  registerStringTool(server, client, 'create_supermarket_category_relation', { description: 'Create relation. Required: category_id, supermarket (id). Optional: order.', inputSchema: createSupermarketCategoryRelationShape }, handleCreateSupermarketCategoryRelation);
  registerStringTool(server, client, 'update_supermarket_category_relation', { description: 'Update relation (PATCH). Required: id.', inputSchema: updateSupermarketCategoryRelationShape }, handleUpdateSupermarketCategoryRelation);
  registerStringTool(server, client, 'delete_supermarket_category_relation', { description: 'Delete relation by ID.', inputSchema: deleteSupermarketCategoryRelationShape }, handleDeleteSupermarketCategoryRelation);
}
