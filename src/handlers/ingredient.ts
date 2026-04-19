// Handlers for ingredient tools

import { TandoorClient } from '../clients/index.js';
import { Ingredient } from '../types/index.js';
import type {
  ListIngredientsArgs,
  GetIngredientArgs,
  CreateIngredientArgs,
  UpdateIngredientArgs,
  DeleteIngredientArgs,
  ParseIngredientArgs,
} from '../tools/ingredient.js';

// Shape of the mutable fields common to create + update. Both handlers pass
// their full args bag; we only read these keys.
type IngredientMutable = {
  food_id?: number;
  unit_id?: number | null;
  amount?: number;
  note?: string;
  order?: number;
  is_header?: boolean;
  no_amount?: boolean;
  original_text?: string;
  always_use_plural_unit?: boolean;
  always_use_plural_food?: boolean;
};

function buildIngredientPayload(args: IngredientMutable, opts: { partial: boolean }): Partial<Ingredient> {
  const payload: any = {};

  if (args.food_id !== undefined) {
    // IngredientSerializer expects nested food/unit objects with `id`.
    payload.food = { id: args.food_id };
  }

  if (args.unit_id !== undefined) {
    payload.unit = args.unit_id === null ? null : { id: args.unit_id };
  }

  if (args.amount !== undefined) {
    payload.amount = args.amount;
  }

  if (args.note !== undefined) {
    payload.note = args.note;
  }

  if (args.order !== undefined) {
    payload.order = args.order;
  }

  if (args.is_header !== undefined) {
    payload.is_header = args.is_header;
  }

  if (args.no_amount !== undefined) {
    payload.no_amount = args.no_amount;
  }

  if (args.original_text !== undefined) {
    payload.original_text = args.original_text;
  }

  if (args.always_use_plural_unit !== undefined) {
    payload.always_use_plural_unit = args.always_use_plural_unit;
  }

  if (args.always_use_plural_food !== undefined) {
    payload.always_use_plural_food = args.always_use_plural_food;
  }

  if (!opts.partial) {
    // Create requires food and amount.
    if (payload.food === undefined) {
      throw new Error('food_id is required');
    }
    if (payload.amount === undefined) {
      payload.amount = 0;
    }
    if (payload.unit === undefined) {
      payload.unit = null;
    }
  }

  return payload;
}

export async function handleListIngredients(
  client: TandoorClient,
  args: ListIngredientsArgs
): Promise<string> {
  const result = await client.ingredients.listIngredients(args);
  return JSON.stringify(result, null, 2);
}

export async function handleGetIngredient(
  client: TandoorClient,
  args: GetIngredientArgs
): Promise<string> {
  const ingredient = await client.ingredients.getIngredient(args.id);
  return JSON.stringify(ingredient, null, 2);
}

export async function handleCreateIngredient(
  client: TandoorClient,
  args: CreateIngredientArgs
): Promise<string> {
  const payload = buildIngredientPayload(args, { partial: false });
  const created = await client.ingredients.createIngredient(payload);
  return `Ingredient created successfully!\n\n${JSON.stringify(created, null, 2)}`;
}

export async function handleUpdateIngredient(
  client: TandoorClient,
  args: UpdateIngredientArgs
): Promise<string> {
  const payload = buildIngredientPayload(args, { partial: true });
  if (Object.keys(payload).length === 0) {
    throw new Error('At least one field must be provided to update');
  }

  const updated = await client.ingredients.patchIngredient(args.id, payload);
  return `Ingredient updated successfully!\n\n${JSON.stringify(updated, null, 2)}`;
}

export async function handleDeleteIngredient(
  client: TandoorClient,
  args: DeleteIngredientArgs
): Promise<string> {
  await client.ingredients.deleteIngredient(args.id);
  return `Ingredient ${args.id} deleted successfully!`;
}

export async function handleParseIngredient(
  client: TandoorClient,
  args: ParseIngredientArgs
): Promise<string> {
  const parsed = await client.ingredients.parseIngredientString(args.text);
  return JSON.stringify(parsed, null, 2);
}
