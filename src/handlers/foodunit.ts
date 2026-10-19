// Food + Unit handlers.

import { TandoorClient } from '../clients/index.js';
import type {
  ListFoodsArgs,
  GetFoodArgs,
  CreateFoodArgs,
  UpdateFoodArgs,
  DeleteFoodArgs,
  MergeFoodArgs,
  MoveFoodArgs,
  FoodFdcLookupArgs,
  FoodShoppingUpdateArgs,
  ListUnitsArgs,
  GetUnitArgs,
  CreateUnitArgs,
  UpdateUnitArgs,
  DeleteUnitArgs,
  MergeUnitArgs,
  FoodBatchUpdateArgs,
} from '../tools/foodunit.js';

import { emit, slimPaginated, assertNonEmptyBody } from '../lib/slim.js';

function slimFood(f: any) {
  if (!f) return f;
  return {
    id: f.id,
    name: f.name,
    plural_name: f.plural_name,
    full_name: f.full_name,
    description: f.description,
    food_onhand: f.food_onhand,
    supermarket_category: f.supermarket_category?.name ?? null,
    supermarket_category_id: f.supermarket_category?.id ?? null,
    parent: f.parent,
    numchild: f.numchild,
    fdc_id: f.fdc_id,
  };
}

function slimUnit(u: any) {
  if (!u) return u;
  return {
    id: u.id,
    name: u.name,
    plural_name: u.plural_name,
    description: u.description,
    base_unit: u.base_unit,
  };
}

// ---------- Food handlers ----------

export async function handleListFoods(
  client: TandoorClient,
  args: ListFoodsArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.foodUnits.listFoods(params);
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimFood));
}

export async function handleGetFood(
  client: TandoorClient,
  args: GetFoodArgs
): Promise<string> {
  const r = await client.foodUnits.getFood(args.id);
  return args.format === 'full' ? emit(r) : emit(slimFood(r));
}

export async function handleCreateFood(
  client: TandoorClient,
  args: CreateFoodArgs
): Promise<string> {
  const body: any = { name: args.name };
  if (args.plural_name !== undefined) body.plural_name = args.plural_name;
  if (args.description !== undefined) body.description = args.description;
  if (args.food_onhand !== undefined) body.food_onhand = args.food_onhand;
  if (args.fdc_id !== undefined) body.fdc_id = args.fdc_id;
  if (args.supermarket_category_id !== undefined) {
    body.supermarket_category = args.supermarket_category_id;
  }
  const created = await client.foodUnits.createFood(body);
  return `Food created.\n\n${emit(args.format === 'full' ? created : slimFood(created))}`;
}

export async function handleUpdateFood(
  client: TandoorClient,
  args: UpdateFoodArgs
): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.plural_name !== undefined) body.plural_name = args.plural_name;
  if (args.description !== undefined) body.description = args.description;
  if (args.food_onhand !== undefined) body.food_onhand = args.food_onhand;
  if (args.fdc_id !== undefined) body.fdc_id = args.fdc_id;
  if (args.supermarket_category_id !== undefined) {
    body.supermarket_category = args.supermarket_category_id;
  }
  if (args.properties_food_amount !== undefined) body.properties_food_amount = args.properties_food_amount;
  if (args.properties_food_unit_id !== undefined) body.properties_food_unit = args.properties_food_unit_id;
  const set = args.properties ?? [];
  const remove = args.remove_property_type_ids ?? [];
  const doomedRowIds: number[] = [];
  if (set.length > 0 || remove.length > 0) {
    const setIds = set.map((p) => p.property_type_id);
    for (const [list, ids] of [['properties', setIds], ['remove_property_type_ids', remove]] as const) {
      const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
      if (repeated !== undefined) throw new Error(`property_type_id ${repeated} appears more than once in ${list}`);
    }
    const overlap = setIds.find((id) => remove.includes(id));
    if (overlap !== undefined) throw new Error(`property_type_id ${overlap} is in both properties and remove_property_type_ids`);
    const current = await client.foodUnits.getFood(args.id);
    const amountByType = new Map(set.map((p) => [p.property_type_id, p.property_amount]));
    const inPlace = new Set<number>();
    const rows: any[] = [];
    for (const p of current.properties) {
      const typeId = p.property_type.id;
      if (remove.includes(typeId) || inPlace.has(typeId)) {
        doomedRowIds.push(p.id);
        continue;
      }
      const amount = amountByType.has(typeId) ? amountByType.get(typeId) : p.property_amount;
      if (amountByType.has(typeId)) inPlace.add(typeId);
      rows.push({ id: p.id, property_amount: amount, property_type: typeId });
    }
    body.properties = [
      ...rows,
      ...set
        .filter((p) => !inPlace.has(p.property_type_id))
        .map((p) => ({ property_amount: p.property_amount, property_type: p.property_type_id })),
    ];
  }
  assertNonEmptyBody(body);
  const updated = await client.foodUnits.patchFood(args.id, body);
  for (const id of doomedRowIds) await client.properties.deleteProperty(id);
  return `Food updated.\n\n${emit(args.format === 'full' ? updated : slimFood(updated))}`;
}

export async function handleDeleteFood(
  client: TandoorClient,
  args: DeleteFoodArgs
): Promise<string> {
  await client.foodUnits.deleteFood(args.id);
  return `Food ${args.id} deleted.`;
}

export async function handleMergeFood(
  client: TandoorClient,
  args: MergeFoodArgs
): Promise<string> {
  const r = await client.foodUnits.mergeFood(args.id, args.target);
  return `Food ${args.id} merged into ${args.target}.\n\n${emit(slimFood(r))}`;
}

export async function handleMoveFood(
  client: TandoorClient,
  args: MoveFoodArgs
): Promise<string> {
  const r = await client.foodUnits.moveFood(args.id, args.parent);
  return `Food ${args.id} moved under parent ${args.parent}.\n\n${emit(slimFood(r))}`;
}

export async function handleFoodFdcLookup(
  client: TandoorClient,
  args: FoodFdcLookupArgs
): Promise<string> {
  // Fetch current food first so the required body satisfies the Food serializer
  // — set fdc_id if the caller supplied one.
  const current = await client.foodUnits.getFood(args.id);
  const body = { ...current };
  if (args.fdc_id !== undefined) body.fdc_id = args.fdc_id;
  const r = await client.foodUnits.foodFdcLookup(args.id, body);
  return `Food ${args.id} enriched from USDA FDC.\n\n${emit(args.format === 'full' ? r : slimFood(r))}`;
}

export async function handleFoodShoppingUpdate(
  client: TandoorClient,
  args: FoodShoppingUpdateArgs
): Promise<string> {
  const body: any = { delete: args.delete ? 'true' : null };
  if (args.amount !== undefined) body.amount = args.amount;
  if (args.unit_id !== undefined) body.unit = args.unit_id;
  const r = await client.foodUnits.foodShoppingUpdate(args.id, body);
  return emit(r);
}

// ---------- Unit handlers ----------

export async function handleListUnits(
  client: TandoorClient,
  args: ListUnitsArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.foodUnits.listUnits(params);
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimUnit));
}

export async function handleGetUnit(
  client: TandoorClient,
  args: GetUnitArgs
): Promise<string> {
  const r = await client.foodUnits.getUnit(args.id);
  return args.format === 'full' ? emit(r) : emit(slimUnit(r));
}

export async function handleCreateUnit(
  client: TandoorClient,
  args: CreateUnitArgs
): Promise<string> {
  const body: any = { name: args.name };
  if (args.plural_name !== undefined) body.plural_name = args.plural_name;
  if (args.description !== undefined) body.description = args.description;
  if (args.base_unit !== undefined) body.base_unit = args.base_unit;
  const created = await client.foodUnits.createUnit(body);
  return `Unit created.\n\n${emit(args.format === 'full' ? created : slimUnit(created))}`;
}

export async function handleUpdateUnit(
  client: TandoorClient,
  args: UpdateUnitArgs
): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.plural_name !== undefined) body.plural_name = args.plural_name;
  if (args.description !== undefined) body.description = args.description;
  if (args.base_unit !== undefined) body.base_unit = args.base_unit;
  assertNonEmptyBody(body);
  const updated = await client.foodUnits.patchUnit(args.id, body);
  return `Unit updated.\n\n${emit(args.format === 'full' ? updated : slimUnit(updated))}`;
}

export async function handleDeleteUnit(
  client: TandoorClient,
  args: DeleteUnitArgs
): Promise<string> {
  await client.foodUnits.deleteUnit(args.id);
  return `Unit ${args.id} deleted.`;
}

export async function handleMergeUnit(
  client: TandoorClient,
  args: MergeUnitArgs
): Promise<string> {
  const r = await client.foodUnits.mergeUnit(args.id, args.target);
  return `Unit ${args.id} merged into ${args.target}.\n\n${emit(slimUnit(r))}`;
}

export async function handleFoodBatchUpdate(
  client: TandoorClient,
  args: FoodBatchUpdateArgs
): Promise<string> {
  if (!args.foods || args.foods.length === 0) {
    throw new Error('foods must be a non-empty array of food IDs');
  }
  const r = await client.foodUnits.foodBatchUpdate(args);
  return `Batch-updated ${args.foods.length} food(s).\n\n${emit(r)}`;
}
