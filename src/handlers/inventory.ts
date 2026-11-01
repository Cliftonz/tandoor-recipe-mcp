import { TandoorClient } from '../clients/index.js';
import type {
  ListInventoryLocationsArgs,
  GetInventoryLocationArgs,
  CreateInventoryLocationArgs,
  UpdateInventoryLocationArgs,
  DeleteInventoryLocationArgs,
} from '../tools/inventory.js';
import type { HandlerContext } from '../lib/register.js';
import { emit, assertNonEmptyBody, slimPaginated } from '../lib/slim.js';

function slimLocation(l: any) {
  return { id: l.id, name: l.name, is_freezer: l.is_freezer, household: l.household.name };
}

export async function handleListInventoryLocations(
  client: TandoorClient,
  args: ListInventoryLocationsArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.inventory.listLocations(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimLocation));
}

export async function handleGetInventoryLocation(
  client: TandoorClient,
  args: GetInventoryLocationArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.inventory.getLocation(args.id, { signal: ctx?.signal });
  return emit(args.format === 'full' ? r : slimLocation(r));
}

export async function handleCreateInventoryLocation(
  client: TandoorClient,
  args: CreateInventoryLocationArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const userSpaces: any[] = await client.spaces.listAllPersonalUserSpaces(undefined, { signal: ctx?.signal });
  const household = userSpaces.find((us) => us.active).household;
  if (!household) {
    throw new Error('You are not in a household in this space. Assign yourself to a household in Tandoor, then retry.');
  }
  const body: any = { name: args.name, household: household.id };
  if (args.is_freezer !== undefined) body.is_freezer = args.is_freezer;
  const r = await client.inventory.createLocation(body, { signal: ctx?.signal });
  return `Inventory location created.\n\n${emit(args.format === 'full' ? r : slimLocation(r))}`;
}

export async function handleUpdateInventoryLocation(
  client: TandoorClient,
  args: UpdateInventoryLocationArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.is_freezer !== undefined) body.is_freezer = args.is_freezer;
  assertNonEmptyBody(body);
  const r = await client.inventory.patchLocation(args.id, body, { signal: ctx?.signal });
  return `Inventory location updated.\n\n${emit(args.format === 'full' ? r : slimLocation(r))}`;
}

export async function handleDeleteInventoryLocation(
  client: TandoorClient,
  args: DeleteInventoryLocationArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.inventory.deleteLocation(args.id, { signal: ctx?.signal });
  return `Inventory location ${args.id} deleted.`;
}
