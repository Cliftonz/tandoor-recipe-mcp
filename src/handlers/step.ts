// Step handlers.

import { TandoorClient } from '../clients/index.js';
import type {
  ListStepsArgs,
  GetStepArgs,
  CreateStepArgs,
  UpdateStepArgs,
  DeleteStepArgs,
} from '../tools/step.js';

type IngredientInput = NonNullable<CreateStepArgs['ingredients']>[number];

const emit = (o: unknown) => JSON.stringify(o);

function slimStep(s: any) {
  if (!s) return s;
  return {
    id: s.id,
    name: s.name || undefined,
    instruction: s.instruction,
    time: s.time || undefined,
    order: s.order,
    show_as_header: s.show_as_header || undefined,
    show_ingredients_table: s.show_ingredients_table,
    step_recipe: s.step_recipe || undefined,
    step_recipe_name: s.step_recipe_data?.name,
    ingredients: Array.isArray(s.ingredients)
      ? s.ingredients.map((i: any) => ({
          id: i?.id,
          food: i?.food?.name,
          unit: i?.unit?.name,
          amount: i?.amount,
          note: i?.note || undefined,
          is_header: i?.is_header || undefined,
        }))
      : [],
  };
}

function slimPage(p: any) {
  if (!p?.results) return p;
  return { count: p.count, next: p.next, previous: p.previous, results: p.results.map(slimStep) };
}

export async function handleListSteps(
  client: TandoorClient,
  args: ListStepsArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.steps.listSteps(params);
  return format === 'full' ? emit(r) : emit(slimPage(r));
}

export async function handleGetStep(
  client: TandoorClient,
  args: GetStepArgs
): Promise<string> {
  const r = await client.steps.getStep(args.id);
  return args.format === 'full' ? emit(r) : emit(slimStep(r));
}

/**
 * Convert a flat ingredient spec `{food_id, unit_id, amount, note, ...}` or
 * `{food: <name>, unit: <name>, amount, ...}` into the nested envelope the
 * Step serializer expects. Names get find-or-created.
 */
async function buildIngredients(
  client: TandoorClient,
  ings: IngredientInput[] | undefined
): Promise<any[]> {
  if (!Array.isArray(ings)) return [];
  const result: any[] = [];
  for (let i = 0; i < ings.length; i++) {
    const ing = ings[i];
    let food: any;
    if (typeof ing.food_id === 'number') {
      food = { id: ing.food_id };
    } else if (typeof ing.food === 'string' && ing.food) {
      food = await client.recipes.findOrCreateFood(ing.food);
    } else {
      throw new Error(`Ingredient ${i}: food_id or food (name) is required`);
    }

    let unit: any = null;
    if (typeof ing.unit_id === 'number') {
      unit = { id: ing.unit_id };
    } else if (typeof ing.unit === 'string' && ing.unit) {
      unit = await client.recipes.findOrCreateUnit(ing.unit);
    }

    result.push({
      food,
      unit,
      amount: typeof ing.amount === 'number' ? ing.amount : 0,
      note: ing.note,
      order: ing.order ?? i,
      is_header: ing.is_header || false,
      no_amount: ing.no_amount || false,
    });
  }
  return result;
}

export async function handleCreateStep(
  client: TandoorClient,
  args: CreateStepArgs
): Promise<string> {
  const body: any = {
    instruction: args.instruction,
    ingredients: await buildIngredients(client, args.ingredients),
  };
  if (args.name !== undefined) body.name = args.name;
  if (args.time !== undefined) body.time = args.time;
  if (args.order !== undefined) body.order = args.order;
  if (args.show_as_header !== undefined) body.show_as_header = args.show_as_header;
  if (args.show_ingredients_table !== undefined) body.show_ingredients_table = args.show_ingredients_table;
  if (args.step_recipe !== undefined) body.step_recipe = args.step_recipe;

  const r = await client.steps.createStep(body);
  return `Step created.\n\n${emit(args.format === 'full' ? r : slimStep(r))}`;
}

export async function handleUpdateStep(
  client: TandoorClient,
  args: UpdateStepArgs
): Promise<string> {
  const body: any = {};
  if (args.instruction !== undefined) body.instruction = args.instruction;
  if (args.name !== undefined) body.name = args.name;
  if (args.time !== undefined) body.time = args.time;
  if (args.order !== undefined) body.order = args.order;
  if (args.show_as_header !== undefined) body.show_as_header = args.show_as_header;
  if (args.show_ingredients_table !== undefined) body.show_ingredients_table = args.show_ingredients_table;
  if (args.step_recipe !== undefined) body.step_recipe = args.step_recipe;
  if (args.ingredients !== undefined) {
    body.ingredients = await buildIngredients(client, args.ingredients);
  }
  if (Object.keys(body).length === 0) throw new Error('At least one field required');

  const r = await client.steps.patchStep(args.id, body);
  return `Step updated.\n\n${emit(args.format === 'full' ? r : slimStep(r))}`;
}

export async function handleDeleteStep(
  client: TandoorClient,
  args: DeleteStepArgs
): Promise<string> {
  await client.steps.deleteStep(args.id);
  return `Step ${args.id} deleted.`;
}
