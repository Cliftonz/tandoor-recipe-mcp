// Step tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import {
  handleListSteps,
  handleGetStep,
  handleCreateStep,
  handleUpdateStep,
  handleDeleteStep,
} from '../handlers/step.js';

const formatEnum = z.enum(['slim', 'full']).optional();

const ingredientInput = z.object({
  food: z.string().optional().describe('Food name (find-or-create)'),
  food_id: z.number().optional(),
  unit: z.string().optional().describe('Unit name (find-or-create)'),
  unit_id: z.number().optional(),
  amount: z.number().optional(),
  note: z.string().optional(),
  order: z.number().optional(),
  is_header: z.boolean().optional(),
  no_amount: z.boolean().optional(),
});

export const listStepsShape = {
  recipe: z.array(z.number()).optional(),
  query: z.string().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getStepShape = { id: z.number(), format: formatEnum } as const;

export const createStepShape = {
  instruction: z.string(),
  name: z.string().optional(),
  time: z.number().optional(),
  order: z.number().optional(),
  show_as_header: z.boolean().optional(),
  show_ingredients_table: z.boolean().optional(),
  step_recipe: z.number().nullable().optional(),
  ingredients: z.array(ingredientInput).optional(),
  format: formatEnum,
} as const;

export const updateStepShape = {
  id: z.number(),
  instruction: z.string().optional(),
  name: z.string().optional(),
  time: z.number().optional(),
  order: z.number().optional(),
  show_as_header: z.boolean().optional(),
  show_ingredients_table: z.boolean().optional(),
  step_recipe: z.number().nullable().optional(),
  ingredients: z.array(ingredientInput).optional(),
  format: formatEnum,
} as const;

export const deleteStepShape = { id: z.number() } as const;

export type ListStepsArgs = z.infer<z.ZodObject<typeof listStepsShape>>;
export type GetStepArgs = z.infer<z.ZodObject<typeof getStepShape>>;
export type CreateStepArgs = z.infer<z.ZodObject<typeof createStepShape>>;
export type UpdateStepArgs = z.infer<z.ZodObject<typeof updateStepShape>>;
export type DeleteStepArgs = z.infer<z.ZodObject<typeof deleteStepShape>>;

export function registerStepTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_steps', {
    description: 'List recipe steps (standalone). Optional: recipe (array of recipe ids), query, page, page_size.',
    inputSchema: listStepsShape,
  }, handleListSteps);

  registerStringTool(server, client, 'get_step', {
    description: 'Get a step by ID.',
    inputSchema: getStepShape,
  }, handleGetStep);

  registerStringTool(server, client, 'create_step', {
    description: 'Create a step (standalone). Required: instruction. Optional: name, time, order, show_as_header, show_ingredients_table, step_recipe (nested recipe id), ingredients[]. Ingredients take food/food_id and unit/unit_id.',
    inputSchema: createStepShape,
  }, handleCreateStep);

  registerStringTool(server, client, 'update_step', {
    description: 'Update a step (PATCH). Required: id. Any field provided replaces. ingredients[] is a full replacement of the step\'s ingredients.',
    inputSchema: updateStepShape,
  }, handleUpdateStep);

  registerStringTool(server, client, 'delete_step', {
    description: 'Delete a step by ID.',
    inputSchema: deleteStepShape,
  }, handleDeleteStep);
}
