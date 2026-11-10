// Ingredient tool registrations. Zod shapes are exported so handler files can
// infer matching TypeScript types via z.infer<z.ZodObject<typeof shape>>.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
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
  page: z.number().optional().describe('Page number, starting at 1.'),
  page_size: z.number().optional().describe('Results per page. Default 50, max 200.'),
} as const;

export const getIngredientShape = {
  id: z.number().describe('Ingredient ID, from get_recipe or list_ingredients.'),
} as const;

export const createIngredientShape = {
  food_id: z.number().describe('Food ID, from list_foods or parse_ingredient.'),
  unit_id: z.number().optional().describe('Unit ID, from list_units or parse_ingredient. Default none.'),
  amount: z.number().optional().describe('Quantity in the given unit. Default 0.'),
  note: z.string().optional().describe('Free text, e.g. "finely chopped". Max 256 characters.'),
  order: z.number().optional().describe('Sort position in its step. Default 0.'),
  is_header: z.boolean().optional().describe('Show as a heading row, not an ingredient. Default false.'),
  no_amount: z.boolean().optional().describe('Hide the amount, e.g. "salt to taste". Default false.'),
  original_text: z.string().optional().describe('Source line it was parsed from. Max 512 characters.'),
} as const;

export const updateIngredientShape = {
  id: z.number().describe('Ingredient ID, from get_recipe or list_ingredients.'),
  food_id: z.number().optional().describe('Food ID, from list_foods or parse_ingredient.'),
  unit_id: z.number().nullable().optional().describe('Unit ID, from list_units; null clears the unit.'),
  amount: z.number().optional().describe('Quantity in the given unit.'),
  note: z.string().optional().describe('Free text, e.g. "finely chopped". Max 256 characters.'),
  order: z.number().optional().describe('Sort position in its step.'),
  is_header: z.boolean().optional().describe('Show as a heading row, not an ingredient.'),
  no_amount: z.boolean().optional().describe('Hide the amount, e.g. "salt to taste".'),
  original_text: z.string().optional().describe('Source line it was parsed from. Max 512 characters.'),
} as const;

export const deleteIngredientShape = {
  id: z.number().describe('Ingredient ID, from get_recipe or list_ingredients.'),
} as const;

export const parseIngredientShape = {
  text: z.string().describe('One ingredient line, e.g. "2 cups flour".'),
} as const;

export type ListIngredientsArgs = z.infer<z.ZodObject<typeof listIngredientsShape>>;
export type GetIngredientArgs = z.infer<z.ZodObject<typeof getIngredientShape>>;
export type CreateIngredientArgs = z.infer<z.ZodObject<typeof createIngredientShape>>;
export type UpdateIngredientArgs = z.infer<z.ZodObject<typeof updateIngredientShape>>;
export type DeleteIngredientArgs = z.infer<z.ZodObject<typeof deleteIngredientShape>>;
export type ParseIngredientArgs = z.infer<z.ZodObject<typeof parseIngredientShape>>;

export function registerIngredientTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_ingredients', {
    title: 'List ingredients',
    annotations: READ,
    description: 'List ingredients. Optional filters: food (food id), unit (unit id), page, page_size',
    inputSchema: listIngredientsShape,
  }, handleListIngredients);

  registerStringTool(server, client, 'get_ingredient', {
    title: 'Get ingredient',
    annotations: READ,
    description: 'Get ingredient by ID',
    inputSchema: getIngredientShape,
  }, handleGetIngredient);

  registerStringTool(server, client, 'create_ingredient', {
    title: 'Create ingredient',
    annotations: CREATE,
    description: 'Create ingredient. Required: food_id. Optional: unit_id, amount, note, order, is_header, no_amount, original_text',
    inputSchema: createIngredientShape,
  }, handleCreateIngredient);

  registerStringTool(server, client, 'update_ingredient', {
    title: 'Update ingredient',
    annotations: UPDATE,
    description: 'Partially update ingredient (PATCH). Required: id. All other fields optional. Pass unit_id: null to clear unit',
    inputSchema: updateIngredientShape,
  }, handleUpdateIngredient);

  registerStringTool(server, client, 'delete_ingredient', {
    title: 'Delete ingredient',
    annotations: DELETE,
    description: 'Delete ingredient by ID',
    inputSchema: deleteIngredientShape,
  }, handleDeleteIngredient);

  registerStringTool(server, client, 'parse_ingredient', {
    title: 'Parse ingredient',
    annotations: UPDATE,
    description: 'Parse a free-form ingredient string (e.g. "2 cups flour") into amount, unit, unit_id, food, food_id, note. Writes to the database: Tandoor creates any Food or Unit row it does not already have. unit and food are the matched row names, so "cups" can come back as "cup". With no unit, unit is "" and unit_id is omitted. food_id and unit_id pass straight to create_ingredient. Blank text returns Tandoor\'s 400. Tandoor\'s parser is heuristic and can misfire on compound descriptions, brand names, or non-English units.',
    inputSchema: parseIngredientShape,
  }, handleParseIngredient);
}
