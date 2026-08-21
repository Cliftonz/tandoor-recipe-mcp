import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleCreateMealType,
  handleGetMealType,
  handleUpdateMealType,
  handleDeleteMealType,
} from '../handlers/mealtype.js';


export const createMealTypeShape = {
  name: z.string(),
  order: z.number().optional(),
  color: z.string().nullable().optional(),
  default: z.boolean().optional(),
  format: formatEnum,
} as const;

export const getMealTypeShape = { id: z.number(), format: formatEnum } as const;

export const updateMealTypeShape = {
  id: z.number(),
  name: z.string().optional(),
  order: z.number().optional(),
  color: z.string().nullable().optional(),
  default: z.boolean().optional(),
  format: formatEnum,
} as const;

export const deleteMealTypeShape = { id: z.number() } as const;

export type CreateMealTypeArgs = z.infer<z.ZodObject<typeof createMealTypeShape>>;
export type GetMealTypeArgs = z.infer<z.ZodObject<typeof getMealTypeShape>>;
export type UpdateMealTypeArgs = z.infer<z.ZodObject<typeof updateMealTypeShape>>;
export type DeleteMealTypeArgs = z.infer<z.ZodObject<typeof deleteMealTypeShape>>;

export function registerMealTypeTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'create_meal_type', {
    description: 'Create a meal type. Required: name. Optional: order, color (hex, max 7 chars), default.',
    inputSchema: createMealTypeShape,
  }, handleCreateMealType);

  registerStringTool(server, client, 'get_meal_type', {
    description: 'Get a meal type by ID.',
    inputSchema: getMealTypeShape,
  }, handleGetMealType);

  registerStringTool(server, client, 'update_meal_type', {
    description: 'Update a meal type (PATCH). Required: id.',
    inputSchema: updateMealTypeShape,
  }, handleUpdateMealType);

  registerStringTool(server, client, 'delete_meal_type', {
    description: 'Delete a meal type by ID.',
    inputSchema: deleteMealTypeShape,
  }, handleDeleteMealType);
}
