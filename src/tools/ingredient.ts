// Ingredient tool registrations. Zod shapes are exported so handler files can
// infer matching TypeScript types via z.infer<z.ZodObject<typeof shape>>.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import {
  handleListIngredients,
  handleGetIngredient,
  handleCreateIngredient,
  handleUpdateIngredient,
  handleDeleteIngredient,
  handleParseIngredient,
} from '../handlers/ingredient.js';

export const listIngredientsShape = {
  food: z.number().optional().describe('Filter by food ID'),
  unit: z.number().optional().describe('Filter by unit ID'),
  page: z.number().optional(),
  page_size: z.number().optional(),
} as const;

export const getIngredientShape = {
  id: z.number(),
} as const;

export const createIngredientShape = {
  food_id: z.number(),
  unit_id: z.number().optional(),
  amount: z.number().optional(),
  note: z.string().optional(),
  order: z.number().optional(),
  is_header: z.boolean().optional(),
  no_amount: z.boolean().optional(),
  original_text: z.string().optional(),
} as const;

export const updateIngredientShape = {
  id: z.number(),
  food_id: z.number().optional(),
  unit_id: z.number().nullable().optional(),
  amount: z.number().optional(),
  note: z.string().optional(),
  order: z.number().optional(),
  is_header: z.boolean().optional(),
  no_amount: z.boolean().optional(),
  original_text: z.string().optional(),
} as const;

export const deleteIngredientShape = {
  id: z.number(),
} as const;

export const parseIngredientShape = {
  text: z.string(),
} as const;

export type ListIngredientsArgs = z.infer<z.ZodObject<typeof listIngredientsShape>>;
export type GetIngredientArgs = z.infer<z.ZodObject<typeof getIngredientShape>>;
export type CreateIngredientArgs = z.infer<z.ZodObject<typeof createIngredientShape>>;
export type UpdateIngredientArgs = z.infer<z.ZodObject<typeof updateIngredientShape>>;
export type DeleteIngredientArgs = z.infer<z.ZodObject<typeof deleteIngredientShape>>;
export type ParseIngredientArgs = z.infer<z.ZodObject<typeof parseIngredientShape>>;

export function registerIngredientTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_ingredients', {
    description: 'List ingredients. Optional filters: food (food id), unit (unit id), page, page_size',
    inputSchema: listIngredientsShape,
  }, handleListIngredients);

  registerStringTool(server, client, 'get_ingredient', {
    description: 'Get ingredient by ID',
    inputSchema: getIngredientShape,
  }, handleGetIngredient);

  registerStringTool(server, client, 'create_ingredient', {
    description: 'Create ingredient. Required: food_id. Optional: unit_id, amount, note, order, is_header, no_amount, original_text',
    inputSchema: createIngredientShape,
  }, handleCreateIngredient);

  registerStringTool(server, client, 'update_ingredient', {
    description: 'Partially update ingredient (PATCH). Required: id. All other fields optional. Pass unit_id: null to clear unit',
    inputSchema: updateIngredientShape,
  }, handleUpdateIngredient);

  registerStringTool(server, client, 'delete_ingredient', {
    description: 'Delete ingredient by ID',
    inputSchema: deleteIngredientShape,
  }, handleDeleteIngredient);

  registerStringTool(server, client, 'parse_ingredient', {
    description: 'Parse a free-form ingredient string (e.g. "2 cups flour") into amount, unit, unit_id, food, food_id, note. Writes to the database: Tandoor creates any Food or Unit row it does not already have. unit and food are the matched row names, so "cups" can come back as "cup". With no unit, unit is "" and unit_id is omitted. food_id and unit_id pass straight to create_ingredient. Blank text returns Tandoor\'s 400. Tandoor\'s parser is heuristic and can misfire on compound descriptions, brand names, or non-English units.',
    inputSchema: parseIngredientShape,
  }, handleParseIngredient);
}
