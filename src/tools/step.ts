// Step tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListSteps,
  handleGetStep,
  handleCreateStep,
  handleUpdateStep,
  handleDeleteStep,
} from '../handlers/step.js';


const ingredientInput = z.object({
  food: z.string().optional().describe('Food name (find-or-create)'),
  food_id: z.number().optional().describe('Food ID, from list_foods. Takes precedence over food.'),
  unit: z.string().optional().describe('Unit name (find-or-create)'),
  unit_id: z.number().optional().describe('Unit ID, from list_units. Takes precedence over unit.'),
  amount: z.number().optional().describe('Quantity in the given unit. Default 0.'),
  note: z.string().optional().describe('Free text, e.g. "finely chopped".'),
  order: z.number().optional().describe('Sort position in the step. Default: array index.'),
  is_header: z.boolean().optional().describe('Show as a heading row, not an ingredient. Default false.'),
  no_amount: z.boolean().optional().describe('Hide the amount, e.g. "salt to taste". Default false.'),
});

export const listStepsShape = {
  recipe: z.array(z.number()).optional().describe('Recipe IDs; only steps of these recipes.'),
  query: z.string().optional().describe('Substring match on step name or recipe name.'),
  page: z.number().optional().describe('Page number, starting at 1.'),
  page_size: z.number().optional().describe('Results per page. Default 50, max 200.'),
  format: formatEnum,
} as const;

export const getStepShape = { id: z.number().describe('Step ID, from list_steps.'), format: formatEnum } as const;

export const createStepShape = {
  instruction: z.string().describe('Step text. Markdown supported.'),
  name: z.string().optional().describe('Step title, max 128 characters.'),
  time: z.number().optional().describe('Step duration in minutes. Default 0.'),
  order: z.number().optional().describe('Sort position within the recipe. Default 0.'),
  show_as_header: z.boolean().optional().describe('Show the step name as a heading. Default true.'),
  show_ingredients_table: z.boolean().optional().describe('Show the step ingredient table. Default true.'),
  step_recipe: z.number().nullable().optional().describe('Recipe ID to embed as a sub-recipe.'),
  ingredients: z.array(ingredientInput).optional().describe('Step ingredients; each needs food or food_id.'),
  format: formatEnum,
} as const;

export const updateStepShape = {
  id: z.number().describe('Step ID, from list_steps.'),
  instruction: z.string().optional().describe('Step text. Markdown supported.'),
  name: z.string().optional().describe('Step title, max 128 characters.'),
  time: z.number().optional().describe('Step duration in minutes.'),
  order: z.number().optional().describe('Sort position within the recipe.'),
  show_as_header: z.boolean().optional().describe('Show the step name as a heading.'),
  show_ingredients_table: z.boolean().optional().describe('Show the step ingredient table.'),
  step_recipe: z.number().nullable().optional().describe('Recipe ID to embed as a sub-recipe; null removes it.'),
  ingredients: z.array(ingredientInput).optional().describe('Replaces all step ingredients; each needs food or food_id.'),
  format: formatEnum,
} as const;

export const deleteStepShape = { id: z.number().describe('Step ID, from list_steps.') } as const;

export type ListStepsArgs = z.infer<z.ZodObject<typeof listStepsShape>>;
export type GetStepArgs = z.infer<z.ZodObject<typeof getStepShape>>;
export type CreateStepArgs = z.infer<z.ZodObject<typeof createStepShape>>;
export type UpdateStepArgs = z.infer<z.ZodObject<typeof updateStepShape>>;
export type DeleteStepArgs = z.infer<z.ZodObject<typeof deleteStepShape>>;

export function registerStepTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_steps', {
    title: 'List steps',
    annotations: READ,
    description: 'List recipe steps (standalone). Optional: recipe (array of recipe ids), query, page, page_size.',
    inputSchema: listStepsShape,
  }, handleListSteps);

  registerStringTool(server, client, 'get_step', {
    title: 'Get step',
    annotations: READ,
    description: 'Get a step by ID.',
    inputSchema: getStepShape,
  }, handleGetStep);

  registerStringTool(server, client, 'create_step', {
    title: 'Create step',
    annotations: CREATE,
    description: 'Create a step (standalone). Required: instruction. Optional: name, time, order, show_as_header, show_ingredients_table, step_recipe (nested recipe id), ingredients[]. Ingredients take food/food_id and unit/unit_id.',
    inputSchema: createStepShape,
  }, handleCreateStep);

  registerStringTool(server, client, 'update_step', {
    title: 'Update step',
    annotations: { ...UPDATE, destructiveHint: true },
    description: 'Update a step (PATCH). Required: id. Any field provided replaces. ingredients[] is a full replacement of the step\'s ingredients.',
    inputSchema: updateStepShape,
  }, handleUpdateStep);

  registerStringTool(server, client, 'delete_step', {
    title: 'Delete step',
    annotations: DELETE,
    description: 'Delete a step by ID.',
    inputSchema: deleteStepShape,
  }, handleDeleteStep);
}
