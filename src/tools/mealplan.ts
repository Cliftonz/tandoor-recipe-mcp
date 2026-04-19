// Meal plan tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import {
  handleListMealPlans,
  handleGetMealPlan,
  handleCreateMealPlan,
  handleUpdateMealPlan,
  handleDeleteMealPlan,
  handleAutoMealPlan,
  handleListMealTypes,
} from '../handlers/mealplan.js';

export const listMealPlansShape = {
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
} as const;

export const getMealPlanShape = { id: z.number() } as const;

export const createMealPlanShape = {
  recipe_id: z.number().optional(),
  title: z.string().optional(),
  servings: z.number(),
  from_date: z.string(),
  to_date: z.string().optional(),
  meal_type_id: z.number(),
  note: z.string().optional(),
  addshopping: z.boolean().optional(),
} as const;

export const updateMealPlanShape = {
  id: z.number(),
  recipe_id: z.number().nullable().optional(),
  title: z.string().optional(),
  servings: z.number().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  meal_type_id: z.number().optional(),
  note: z.string().optional(),
} as const;

export const deleteMealPlanShape = { id: z.number() } as const;

export const autoMealPlanShape = {
  start_date: z.string(),
  end_date: z.string(),
  meal_type_id: z.number(),
  keyword_ids: z.array(z.number()),
  servings: z.number(),
  addshopping: z.boolean(),
} as const;

export type ListMealPlansArgs = z.infer<z.ZodObject<typeof listMealPlansShape>>;
export type GetMealPlanArgs = z.infer<z.ZodObject<typeof getMealPlanShape>>;
export type CreateMealPlanArgs = z.infer<z.ZodObject<typeof createMealPlanShape>>;
export type UpdateMealPlanArgs = z.infer<z.ZodObject<typeof updateMealPlanShape>>;
export type DeleteMealPlanArgs = z.infer<z.ZodObject<typeof deleteMealPlanShape>>;
export type AutoMealPlanArgs = z.infer<z.ZodObject<typeof autoMealPlanShape>>;

export function registerMealPlanTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_meal_plans', {
    description: 'List meal plans. Optional: from_date, to_date (YYYY-MM-DD), page, page_size',
    inputSchema: listMealPlansShape,
  }, handleListMealPlans);

  registerStringTool(server, client, 'get_meal_plan', {
    description: 'Get meal plan by ID',
    inputSchema: getMealPlanShape,
  }, handleGetMealPlan);

  registerStringTool(server, client, 'create_meal_plan', {
    description: 'Create meal plan. Required: from_date (ISO), meal_type_id, servings. Optional: recipe_id, title, note, addshopping',
    inputSchema: createMealPlanShape,
  }, handleCreateMealPlan);

  registerStringTool(server, client, 'update_meal_plan', {
    description: 'Update meal plan. Required: id. All other fields optional',
    inputSchema: updateMealPlanShape,
  }, handleUpdateMealPlan);

  registerStringTool(server, client, 'delete_meal_plan', {
    description: 'Delete meal plan by ID',
    inputSchema: deleteMealPlanShape,
  }, handleDeleteMealPlan);

  registerStringTool(server, client, 'auto_meal_plan', {
    description: 'Auto-generate meal plans. Required: start_date, end_date (YYYY-MM-DD), meal_type_id, keyword_ids[], servings, addshopping',
    inputSchema: autoMealPlanShape,
  }, handleAutoMealPlan);

  registerStringTool(server, client, 'list_meal_types', {
    description: 'List available meal types (breakfast, lunch, dinner, etc.)',
  }, handleListMealTypes);
}
