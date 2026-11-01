import { TandoorClient } from '../clients/index.js';
import type {
  ListInventoryLocationsArgs,
  GetInventoryLocationArgs,
  CreateInventoryLocationArgs,
  UpdateInventoryLocationArgs,
  DeleteInventoryLocationArgs,
  ListInventoryEntriesArgs,
  GetInventoryEntryArgs,
  AddInventoryItemArgs,
  UpdateInventoryEntryArgs,
  DeleteInventoryEntryArgs,
  ConsumeInventoryItemArgs,
  MoveInventoryItemArgs,
  ListInventoryLogsArgs,
  GetInventoryLogArgs,
} from '../tools/inventory.js';
import type { HandlerContext } from '../lib/register.js';
import { emit, assertNonEmptyBody, slimPaginated } from '../lib/slim.js';

const AMOUNT_DECIMAL_PLACES = 16;

function slimLocation(l: any) {
  return { id: l.id, name: l.name, is_freezer: l.is_freezer, household: l.household.name };
}

function slimEntry(e: any) {
  return {
    id: e.id,
    food: e.food.name,
    food_id: e.food.id,
    amount: e.amount,
    unit: e.unit?.name ?? null,
    unit_id: e.unit?.id ?? null,
    location: e.inventory_location.name,
    location_id: e.inventory_location.id,
    is_freezer: e.inventory_location.is_freezer,
    sub_location: e.sub_location,
    expires: e.expires,
    note: e.note,
    code: e.code,
  };
}

function slimLog(l: any) {
  return {
    id: l.id,
    entry_id: l.entry.id,
    food: l.entry.food.name,
    booking_type: l.booking_type,
    old_amount: l.old_amount,
    new_amount: l.new_amount,
    old_location: l.old_inventory_location.name,
    new_location: l.new_inventory_location.name,
    note: l.note,
    created_at: l.created_at,
  };
}

function entryBody(args: Omit<UpdateInventoryEntryArgs, 'id'>) {
  const body: any = {};
  if (args.food_id !== undefined) body.food = args.food_id;
  if (args.unit_id !== undefined) body.unit = args.unit_id;
  if (args.amount !== undefined) body.amount = args.amount;
  if (args.location_id !== undefined) body.inventory_location = args.location_id;
  if (args.expires !== undefined) body.expires = args.expires;
  if (args.sub_location !== undefined) body.sub_location = args.sub_location;
  if (args.note !== undefined) body.note = args.note;
  if (args.code !== undefined) body.code = args.code;
  return body;
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
    throw new Error('You are not in a household in this space. Create one with create_household and assign yourself with assign_household (household-space section, space owner only), or ask the space owner.');
  }
  const body = { name: args.name, household: household.id, is_freezer: args.is_freezer };
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

export async function handleListInventoryEntries(
  client: TandoorClient,
  args: ListInventoryEntriesArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, location_id, include_empty, ...rest } = args;
  const params = {
    inventory_location_id: location_id,
    ...rest,
    empty: include_empty || undefined,
  };
  const r = await client.inventory.listEntries(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimEntry));
}

export async function handleGetInventoryEntry(
  client: TandoorClient,
  args: GetInventoryEntryArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.inventory.getEntry(args.id, { signal: ctx?.signal });
  return emit(args.format === 'full' ? r : slimEntry(r));
}

export async function handleAddInventoryItem(
  client: TandoorClient,
  args: AddInventoryItemArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.inventory.createEntry(entryBody(args), { signal: ctx?.signal });
  return `Inventory item added.\n\n${emit(args.format === 'full' ? r : slimEntry(r))}`;
}

export async function handleUpdateInventoryEntry(
  client: TandoorClient,
  args: UpdateInventoryEntryArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { id, format, ...fields } = args;
  const body = entryBody(fields);
  assertNonEmptyBody(body);
  const r = await client.inventory.patchEntry(id, body, { signal: ctx?.signal });
  return `Inventory entry updated.\n\n${emit(format === 'full' ? r : slimEntry(r))}`;
}

export async function handleDeleteInventoryEntry(
  client: TandoorClient,
  args: DeleteInventoryEntryArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.inventory.deleteEntry(args.id, { signal: ctx?.signal });
  return `Inventory entry ${args.id} deleted.`;
}

async function findEntryForFood(client: TandoorClient, foodId: number, locationId: number | undefined, signal?: AbortSignal) {
  const page = await client.inventory.listEntries({ food_id: foodId, inventory_location_id: locationId }, { signal });
  const where = locationId === undefined ? '' : ` at location ${locationId}`;
  if (page.count === 0) throw new Error(`Food ${foodId} has nothing on hand${where}.`);
  if (page.count > 1) {
    const shown = page.results.length < page.count ? ` (showing ${page.results.length} of ${page.count})` : '';
    throw new Error(`Food ${foodId} has ${page.count} inventory entries${where}; pass entry_id. Candidates${shown}: ${emit(page.results.map(slimEntry))}`);
  }
  return page.results[0];
}

export async function handleConsumeInventoryItem(
  client: TandoorClient,
  args: ConsumeInventoryItemArgs,
  ctx?: HandlerContext,
): Promise<string> {
  if ((args.entry_id === undefined) === (args.food_id === undefined)) throw new Error('Give exactly one of entry_id or food_id.');
  if ((args.amount === undefined) === (args.all === undefined)) throw new Error('Give exactly one of amount or all: true.');
  if (args.entry_id !== undefined && args.location_id !== undefined) throw new Error('location_id narrows food_id; omit it with entry_id.');
  const e = args.entry_id !== undefined
    ? await client.inventory.getEntry(args.entry_id, { signal: ctx?.signal })
    : await findEntryForFood(client, args.food_id!, args.location_id, ctx?.signal);
  if (!e.unit) throw new Error(`Entry ${e.id} has no unit; set one with update_inventory_entry.`);
  if (args.unit_id !== undefined && args.unit_id !== e.unit.id) {
    throw new Error(`Entry ${e.id} is stored in ${e.unit.name} (unit_id ${e.unit.id}); consume in that unit. Unit conversion is not supported.`);
  }
  if (e.amount <= 0) return `Inventory item ${e.id} has nothing on hand (amount ${e.amount}); nothing consumed.`;
  const requested = args.amount ?? e.amount;
  const amount = Math.max(0, Number((e.amount - requested).toFixed(AMOUNT_DECIMAL_PLACES)));
  const r = await client.inventory.patchEntry(e.id, { amount }, { signal: ctx?.signal });
  const out = args.format === 'full' ? r : slimEntry(r);
  if (requested <= e.amount) return `Inventory item consumed.\n\n${emit(out)}`;
  const warning = `Warning: requested ${requested} ${e.unit.name} of ${e.food.name} but only ${e.amount} were on hand; consumed ${e.amount}, amount is now 0.`;
  return `${warning}\n\n${emit({ ...out, warning, requested, consumed: e.amount })}`;
}

export async function handleMoveInventoryItem(
  client: TandoorClient,
  args: MoveInventoryItemArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const e = await client.inventory.getEntry(args.entry_id, { signal: ctx?.signal });
  const from = e.inventory_location;
  const body: any = {};
  if (args.to_location_id !== from.id) body.inventory_location = args.to_location_id;
  if (args.sub_location !== undefined && args.sub_location !== e.sub_location) body.sub_location = args.sub_location;
  if (Object.keys(body).length === 0) return `Inventory item ${e.id} is already in ${from.name}.`;
  const r = await client.inventory.patchEntry(e.id, body, { signal: ctx?.signal });
  return `Inventory item moved.\n\n${emit({ ...(args.format === 'full' ? r : slimEntry(r)), from_location: from.name })}`;
}

export async function handleListInventoryLogs(
  client: TandoorClient,
  args: ListInventoryLogsArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.inventory.listLogs(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimLog));
}

export async function handleGetInventoryLog(
  client: TandoorClient,
  args: GetInventoryLogArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.inventory.getLog(args.id, { signal: ctx?.signal });
  return emit(args.format === 'full' ? r : slimLog(r));
}
