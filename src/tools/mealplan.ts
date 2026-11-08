// Meal plan tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import {
  handleListMealPlans,
  handleGetMealPlan,
  handleCreateMealPlan,
  handleUpdateMealPlan,
  handleDeleteMealPlan,
  handleAutoMealPlan,
  handleListMealTypes,
  handleBulkCreateMealPlans,
} from '../handlers/mealplan.js';

export const listMealPlansShape = {
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
} as const;

export const getMealPlanShape = { id: z.number() } as const;

export const listMealTypesShape = {} as const;

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

// Per-entry shape for bulk_create_meal_plans. Mirrors createMealPlanShape
// but as a z.object so we can nest it in an array.
const bulkMealPlanEntry = z.object({
  recipe_id: z.number().optional(),
  title: z.string().optional(),
  servings: z.number(),
  from_date: z.string(),
  to_date: z.string().optional(),
  meal_type_id: z.number(),
  note: z.string().optional(),
  addshopping: z.boolean().optional(),
});

export const bulkCreateMealPlansShape = {
  entries: z.array(bulkMealPlanEntry),
} as const;

export const autoMealPlanShape = {
  start_date: z.iso.date(),
  end_date: z.iso.date(),
  meal_type_id: z.number(),
  keyword_ids: z.array(z.number()).optional(),
  keyword_mode: z.enum(['or', 'and']).optional(),
  servings: z.number(),
  addshopping: z.boolean(),
} as const;

export type ListMealPlansArgs = z.infer<z.ZodObject<typeof listMealPlansShape>>;
export type GetMealPlanArgs = z.infer<z.ZodObject<typeof getMealPlanShape>>;
export type CreateMealPlanArgs = z.infer<z.ZodObject<typeof createMealPlanShape>>;
export type UpdateMealPlanArgs = z.infer<z.ZodObject<typeof updateMealPlanShape>>;
export type DeleteMealPlanArgs = z.infer<z.ZodObject<typeof deleteMealPlanShape>>;
export type AutoMealPlanArgs = z.infer<z.ZodObject<typeof autoMealPlanShape>>;
export type BulkCreateMealPlansArgs = z.infer<z.ZodObject<typeof bulkCreateMealPlansShape>>;

export function registerMealPlanTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_meal_plans', {
    title: 'List meal plans',
    annotations: READ,
    description: 'List meal plans made by you or your household. Optional: from_date, to_date (YYYY-MM-DD, matched on the end date of each entry; default 90 days ago to 360 days ahead), page, page_size.',
    inputSchema: listMealPlansShape,
  }, handleListMealPlans);

  registerStringTool(server, client, 'get_meal_plan', {
    title: 'Get meal plan',
    annotations: READ,
    description: 'Get meal plan by ID, with its dates, meal type, recipe and servings. Find IDs with list_meal_plans.',
    inputSchema: getMealPlanShape,
  }, handleGetMealPlan);

  registerStringTool(server, client, 'create_meal_plan', {
    title: 'Create meal plan',
    annotations: CREATE,
    description: 'Create meal plan. Required: from_date (ISO), meal_type_id (from list_meal_types), servings, and recipe_id or title. Optional: to_date (default from_date), note, addshopping (adds the recipe ingredients to the shopping list).',
    inputSchema: createMealPlanShape,
  }, handleCreateMealPlan);

  registerStringTool(server, client, 'update_meal_plan', {
    title: 'Update meal plan',
    annotations: UPDATE,
    description: 'Update meal plan. Required: id. All other fields optional',
    inputSchema: updateMealPlanShape,
  }, handleUpdateMealPlan);

  registerStringTool(server, client, 'delete_meal_plan', {
    title: 'Delete meal plan',
    annotations: DELETE,
    description: 'Delete meal plan by ID. Also deletes the shopping entries linked to it. To reschedule, use update_meal_plan.',
    inputSchema: deleteMealPlanShape,
  }, handleDeleteMealPlan);

  registerStringTool(server, client, 'auto_meal_plan', {
    title: 'Auto-generate meal plans',
    annotations: CREATE,
    description: 'Auto-generate meal plans from internal recipes the user can see. Required: start_date, end_date (YYYY-MM-DD), meal_type_id, servings, addshopping. Optional: keyword_ids[] (if omitted or empty, plans from all recipes), keyword_mode ("and" default: recipes must carry every keyword; "or": any keyword). Tandoor plans at most 14 days and ignores shared. When no recipe matches, Tandoor returns 400 "No recipes found."',
    inputSchema: autoMealPlanShape,
  }, handleAutoMealPlan);

  registerStringTool(server, client, 'list_meal_types', {
    title: 'List meal types',
    annotations: READ,
    description: 'List available meal types (breakfast, lunch, dinner, etc.)',
    inputSchema: listMealTypesShape,
  }, handleListMealTypes);

  registerStringTool(server, client, 'bulk_create_meal_plans', {
    title: 'Bulk create meal plans',
    annotations: CREATE,
    description: 'Client-side batched create_meal_plan. Tandoor has no server-side bulk endpoint — this handler dedupes meal_type_ids and recipe_ids across entries, hydrates each unique id once, then creates all entries in parallel. Use for "plan the week" (7+ entries) to avoid N×3 round-trips. Each entry takes the same args as create_meal_plan: {recipe_id?, title?, servings, from_date, to_date?, meal_type_id, note?, addshopping?}. Returns {count, created: [{index, id, recipe_id, meal_type_id, ...}], failed: [{index, error}]} — individual failures do NOT abort the batch so you can see partial success and retry the failures.',
    inputSchema: bulkCreateMealPlansShape,
  }, handleBulkCreateMealPlans);
}
