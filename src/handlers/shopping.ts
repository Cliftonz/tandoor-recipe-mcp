// Shopping list handlers.

import { TandoorClient } from '../clients/index.js';
import type {
  ListShoppingEntriesArgs,
  GetShoppingEntryArgs,
  CreateShoppingEntryArgs,
  UpdateShoppingEntryArgs,
  DeleteShoppingEntryArgs,
  BulkCheckShoppingEntriesArgs,
  ListShoppingListRecipesArgs,
  GetShoppingListRecipeArgs,
  CreateShoppingListRecipeArgs,
  UpdateShoppingListRecipeArgs,
  DeleteShoppingListRecipeArgs,
  BulkCreateShoppingListRecipeEntriesArgs,
} from '../tools/shopping.js';

import { emit } from '../lib/slim.js';

function slimEntry(e: any) {
  if (!e) return e;
  return {
    id: e.id,
    food: e.food?.name ?? null,
    food_id: e.food?.id ?? null,
    unit: e.unit?.name ?? null,
    unit_id: e.unit?.id ?? null,
    amount: e.amount,
    checked: e.checked,
    completed_at: e.completed_at,
    list_recipe: e.list_recipe,
    ingredient: e.ingredient,
    delay_until: e.delay_until,
  };
}

function slimEntryPage(p: any) {
  if (!p?.results) return p;
  return {
    count: p.count,
    next: p.next,
    previous: p.previous,
    results: p.results.map(slimEntry),
  };
}

function slimShoppingListRecipe(r: any) {
  if (!r) return r;
  return {
    id: r.id,
    name: r.name,
    recipe: r.recipe,
    recipe_name: r.recipe_data?.name,
    mealplan: r.mealplan,
    servings: r.servings,
  };
}

export async function handleListShoppingEntries(
  client: TandoorClient,
  args: ListShoppingEntriesArgs
): Promise<string> {
  const { format, ...params } = args;
  const result = await client.shopping.listEntries(params);
  return format === 'full' ? emit(result) : emit(slimEntryPage(result));
}

export async function handleGetShoppingEntry(
  client: TandoorClient,
  args: GetShoppingEntryArgs
): Promise<string> {
  const e = await client.shopping.getEntry(args.id);
  return args.format === 'full' ? emit(e) : emit(slimEntry(e));
}

export async function handleCreateShoppingEntry(
  client: TandoorClient,
  args: CreateShoppingEntryArgs
): Promise<string> {
  // ShoppingListEntrySerializer expects nested food/unit objects with id.
  const body: any = {
    amount: args.amount,
    food: { id: args.food_id },
    unit: args.unit_id != null ? { id: args.unit_id } : null,
    checked: args.checked ?? false,
  };
  if (args.list_recipe !== undefined) body.list_recipe = args.list_recipe;
  if (args.ingredient !== undefined) body.ingredient = args.ingredient;
  if (args.order !== undefined) body.order = args.order;
  if (args.delay_until !== undefined) body.delay_until = args.delay_until;
  if (args.mealplan_id !== undefined) body.mealplan_id = args.mealplan_id;

  const created = await client.shopping.createEntry(body);
  return `Shopping entry created.\n\n${emit(args.format === 'full' ? created : slimEntry(created))}`;
}

export async function handleUpdateShoppingEntry(
  client: TandoorClient,
  args: UpdateShoppingEntryArgs
): Promise<string> {
  const body: any = {};
  if (args.amount !== undefined) body.amount = args.amount;
  if (args.food_id !== undefined) body.food = args.food_id == null ? null : { id: args.food_id };
  if (args.unit_id !== undefined) body.unit = args.unit_id == null ? null : { id: args.unit_id };
  if (args.checked !== undefined) body.checked = args.checked;
  if (args.order !== undefined) body.order = args.order;
  if (args.delay_until !== undefined) body.delay_until = args.delay_until;
  if (Object.keys(body).length === 0) throw new Error('At least one field required');

  const updated = await client.shopping.patchEntry(args.id, body);
  return `Shopping entry updated.\n\n${emit(args.format === 'full' ? updated : slimEntry(updated))}`;
}

export async function handleDeleteShoppingEntry(
  client: TandoorClient,
  args: DeleteShoppingEntryArgs
): Promise<string> {
  await client.shopping.deleteEntry(args.id);
  return `Shopping entry ${args.id} deleted.`;
}

export async function handleBulkCheckShoppingEntries(
  client: TandoorClient,
  args: BulkCheckShoppingEntriesArgs
): Promise<string> {
  if (args.ids.length === 0) throw new Error('ids must be a non-empty array');
  const r = await client.shopping.bulkCheckEntries(args.ids, args.checked);
  return emit(r);
}

export async function handleListShoppingListRecipes(
  client: TandoorClient,
  args: ListShoppingListRecipesArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.shopping.listShoppingListRecipes(params);
  if (format === 'full') return emit(r);
  return emit({
    count: r.count,
    next: r.next,
    previous: r.previous,
    results: (r.results || []).map(slimShoppingListRecipe),
  });
}

export async function handleGetShoppingListRecipe(
  client: TandoorClient,
  args: GetShoppingListRecipeArgs
): Promise<string> {
  const r = await client.shopping.getShoppingListRecipe(args.id);
  return args.format === 'full' ? emit(r) : emit(slimShoppingListRecipe(r));
}

export async function handleCreateShoppingListRecipe(
  client: TandoorClient,
  args: CreateShoppingListRecipeArgs
): Promise<string> {
  const body: any = { servings: args.servings };
  if (args.name !== undefined) body.name = args.name;
  if (args.recipe !== undefined) body.recipe = args.recipe;
  if (args.mealplan !== undefined) body.mealplan = args.mealplan;
  const created = await client.shopping.createShoppingListRecipe(body);
  return `Shopping list recipe created.\n\n${emit(args.format === 'full' ? created : slimShoppingListRecipe(created))}`;
}

export async function handleUpdateShoppingListRecipe(
  client: TandoorClient,
  args: UpdateShoppingListRecipeArgs
): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.servings !== undefined) body.servings = args.servings;
  if (args.recipe !== undefined) body.recipe = args.recipe;
  if (args.mealplan !== undefined) body.mealplan = args.mealplan;
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
  const updated = await client.shopping.patchShoppingListRecipe(args.id, body);
  return `Shopping list recipe updated.\n\n${emit(args.format === 'full' ? updated : slimShoppingListRecipe(updated))}`;
}

export async function handleDeleteShoppingListRecipe(
  client: TandoorClient,
  args: DeleteShoppingListRecipeArgs
): Promise<string> {
  await client.shopping.deleteShoppingListRecipe(args.id);
  return `Shopping list recipe ${args.id} deleted.`;
}

export async function handleBulkCreateShoppingListRecipeEntries(
  client: TandoorClient,
  args: BulkCreateShoppingListRecipeEntriesArgs
): Promise<string> {
  if (args.entries.length === 0) throw new Error('entries must be a non-empty array');
  const r = await client.shopping.bulkCreateRecipeEntries(args.id, args.entries);
  return emit(r);
}
