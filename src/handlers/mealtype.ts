import { TandoorClient } from '../clients/index.js';
import type {
  CreateMealTypeArgs,
  GetMealTypeArgs,
  UpdateMealTypeArgs,
  DeleteMealTypeArgs,
} from '../tools/mealtype.js';
import type { HandlerContext } from '../lib/register.js';
import { emit, assertNonEmptyBody } from '../lib/slim.js';

function slimMealType(m: any) {
  if (!m) return m;
  return {
    id: m.id,
    name: m.name,
    order: m.order,
    color: m.color,
    default: m.default,
  };
}

export async function handleCreateMealType(
  client: TandoorClient,
  args: CreateMealTypeArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = { name: args.name };
  if (args.order !== undefined) body.order = args.order;
  if (args.color !== undefined) body.color = args.color;
  if (args.default !== undefined) body.default = args.default;
  const r = await client.mealTypes.createMealType(body, { signal: ctx?.signal });
  return `Meal type created.\n\n${emit(args.format === 'full' ? r : slimMealType(r))}`;
}

export async function handleGetMealType(
  client: TandoorClient,
  args: GetMealTypeArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.mealTypes.getMealType(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimMealType(r));
}

export async function handleUpdateMealType(
  client: TandoorClient,
  args: UpdateMealTypeArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.order !== undefined) body.order = args.order;
  if (args.color !== undefined) body.color = args.color;
  if (args.default !== undefined) body.default = args.default;
  assertNonEmptyBody(body);
  const r = await client.mealTypes.patchMealType(args.id, body, { signal: ctx?.signal });
  return `Meal type updated.\n\n${emit(args.format === 'full' ? r : slimMealType(r))}`;
}

export async function handleDeleteMealType(
  client: TandoorClient,
  args: DeleteMealTypeArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.mealTypes.deleteMealType(args.id, { signal: ctx?.signal });
  return `Meal type ${args.id} deleted.`;
}
