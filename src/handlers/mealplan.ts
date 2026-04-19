// Handlers for meal plan tools.

import { TandoorClient } from '../clients/index.js';
import type {
  ListMealPlansArgs,
  GetMealPlanArgs,
  CreateMealPlanArgs,
  UpdateMealPlanArgs,
  DeleteMealPlanArgs,
  AutoMealPlanArgs,
} from '../tools/mealplan.js';

export async function handleListMealPlans(
  client: TandoorClient,
  args: ListMealPlansArgs
): Promise<string> {
  const result = await client.mealPlans.listMealPlans(args);
  return JSON.stringify(result, null, 2);
}

export async function handleGetMealPlan(
  client: TandoorClient,
  args: GetMealPlanArgs
): Promise<string> {
  const mealPlan = await client.mealPlans.getMealPlan(args.id);
  return JSON.stringify(mealPlan, null, 2);
}

export async function handleCreateMealPlan(
  client: TandoorClient,
  args: CreateMealPlanArgs
): Promise<string> {
  // Zod handles required fields; enforce the one semantic rule it can't express:
  // meal plans need either a recipe reference or a title.
  if (!args.recipe_id && !args.title) {
    throw new Error('Either recipe_id or title must be provided');
  }

  const mealPlan: any = {
    servings: args.servings,
    from_date: args.from_date,
    meal_type: { id: args.meal_type_id },
  };

  if (args.recipe_id) mealPlan.recipe = { id: args.recipe_id };
  if (args.title) mealPlan.title = args.title;
  if (args.to_date) mealPlan.to_date = args.to_date;
  if (args.note) mealPlan.note = args.note;
  if (args.addshopping !== undefined) mealPlan.addshopping = args.addshopping;

  const created = await client.mealPlans.createMealPlan(mealPlan);
  return `Meal plan created successfully!\n\n${JSON.stringify(created, null, 2)}`;
}

export async function handleUpdateMealPlan(
  client: TandoorClient,
  args: UpdateMealPlanArgs
): Promise<string> {
  const { id, ...updateData } = args;

  const updates: any = {};
  if (updateData.recipe_id !== undefined) {
    updates.recipe = updateData.recipe_id === null ? null : { id: updateData.recipe_id };
  }
  if (updateData.title !== undefined) updates.title = updateData.title;
  if (updateData.servings !== undefined) updates.servings = updateData.servings;
  if (updateData.from_date !== undefined) updates.from_date = updateData.from_date;
  if (updateData.to_date !== undefined) updates.to_date = updateData.to_date;
  if (updateData.meal_type_id !== undefined) updates.meal_type = { id: updateData.meal_type_id };
  if (updateData.note !== undefined) updates.note = updateData.note;

  if (Object.keys(updates).length === 0) {
    throw new Error('At least one field must be provided to update');
  }

  const updated = await client.mealPlans.patchMealPlan(id, updates);
  return `Meal plan updated successfully!\n\n${JSON.stringify(updated, null, 2)}`;
}

export async function handleDeleteMealPlan(
  client: TandoorClient,
  args: DeleteMealPlanArgs
): Promise<string> {
  await client.mealPlans.deleteMealPlan(args.id);
  return `Meal plan ${args.id} deleted successfully!`;
}

export async function handleAutoMealPlan(
  client: TandoorClient,
  args: AutoMealPlanArgs
): Promise<string> {
  if (args.keyword_ids.length === 0) {
    throw new Error('keyword_ids must be a non-empty array of keyword IDs');
  }
  const startDate = new Date(args.start_date);
  const endDate = new Date(args.end_date);
  if (startDate > endDate) {
    throw new Error('start_date must be before or equal to end_date');
  }

  const result = await client.mealPlans.autoCreateMealPlans({
    start_date: args.start_date,
    end_date: args.end_date,
    meal_type_id: args.meal_type_id,
    keyword_ids: args.keyword_ids,
    servings: args.servings,
    addshopping: args.addshopping,
  });

  return `Auto meal plan created successfully!\n\n${JSON.stringify(result, null, 2)}`;
}

export async function handleListMealTypes(
  client: TandoorClient,
  _args: unknown
): Promise<string> {
  const mealTypes = await client.mealPlans.listMealTypes();
  return JSON.stringify(mealTypes, null, 2);
}
