import { TandoorClient } from '../clients/index.js';
import type {
  ListHouseholdsArgs,
  GetHouseholdArgs,
  CreateHouseholdArgs,
  UpdateHouseholdArgs,
  DeleteHouseholdArgs,
  AssignHouseholdArgs,
} from '../tools/household.js';
import type { HandlerContext } from '../lib/register.js';
import { emit, slimPaginated } from '../lib/slim.js';

type Page = { results: any[]; next: string | null };

function slimHousehold(h: any) {
  return { id: h.id, name: h.name };
}

async function allPages(fetchPage: (page: number) => Promise<Page>): Promise<any[]> {
  const items: any[] = [];
  for (let page = 1; ; page++) {
    const r = await fetchPage(page);
    items.push(...r.results);
    if (!r.next) return items;
  }
}

async function members(client: TandoorClient, householdId: number, signal?: AbortSignal) {
  const userSpaces = await allPages((page) => client.spaces.listUserSpaces({ page }, { signal }));
  return userSpaces
    .filter((us) => us.household?.id === householdId)
    .map((us) => ({ user_space_id: us.id, user: us.user.display_name }));
}

export async function handleListHouseholds(
  client: TandoorClient,
  args: ListHouseholdsArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.households.listHouseholds(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimHousehold));
}

export async function handleGetHousehold(
  client: TandoorClient,
  args: GetHouseholdArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.households.getHousehold(args.id, { signal: ctx?.signal });
  return emit({ ...(args.format === 'full' ? r : slimHousehold(r)), members: await members(client, args.id, ctx?.signal) });
}

export async function handleCreateHousehold(
  client: TandoorClient,
  args: CreateHouseholdArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.households.createHousehold({ name: args.name }, { signal: ctx?.signal });
  return `Household created.\n\n${emit(args.format === 'full' ? r : slimHousehold(r))}`;
}

export async function handleUpdateHousehold(
  client: TandoorClient,
  args: UpdateHouseholdArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.households.patchHousehold(args.id, { name: args.name }, { signal: ctx?.signal });
  return `Household updated.\n\n${emit(args.format === 'full' ? r : slimHousehold(r))}`;
}

export async function handleDeleteHousehold(
  client: TandoorClient,
  args: DeleteHouseholdArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const signal = ctx?.signal;
  const userSpaces = await members(client, args.id, signal);
  const locations = (await allPages((page) => client.inventory.listLocations({ page }, { signal })))
    .filter((l) => l.household.id === args.id)
    .map((l) => ({ id: l.id, name: l.name }));
  if (userSpaces.length > 0 || locations.length > 0) {
    throw new Error(
      `Household ${args.id} is still in use, so it was not deleted. Unassign its user-spaces with assign_household (household_id null) `
      + `and delete its inventory locations, then retry. ${emit({ user_spaces: userSpaces, inventory_locations: locations })}`,
    );
  }
  await client.households.deleteHousehold(args.id, { signal });
  return `Household ${args.id} deleted.`;
}

type Assignment =
  | { user_space_id: number; status: 'updated' | 'unchanged' }
  | { user_space_id: number; status: 'failed'; error: string };

async function assignOne(client: TandoorClient, id: number, householdId: number | null, signal?: AbortSignal): Promise<Assignment> {
  try {
    const us = await client.spaces.getUserSpace(id, { signal });
    if ((us.household?.id ?? null) === householdId) return { user_space_id: id, status: 'unchanged' };
    const groups = us.groups.map((g: any) => g.id);
    await client.spaces.patchUserSpace(id, { groups, household: householdId }, { signal });
    return { user_space_id: id, status: 'updated' };
  } catch (e) {
    const message = (e as Error).message;
    if (!message.startsWith('Tandoor API error')) throw e;
    return { user_space_id: id, status: 'failed', error: message };
  }
}

export async function handleAssignHousehold(
  client: TandoorClient,
  args: AssignHouseholdArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const signal = ctx?.signal;
  if (args.household_id !== null) {
    await client.households.getHousehold(args.household_id, { signal }).catch((e: Error) => {
      throw e.message.startsWith('Tandoor API error: 404') ? new Error(`Household ${args.household_id} not found.`) : e;
    });
  }
  const results: Assignment[] = [];
  for (const id of args.user_space_ids) results.push(await assignOne(client, id, args.household_id, signal));
  if (results.every((r) => r.status === 'failed')) throw new Error(`No user-space was updated. ${emit({ results })}`);
  return `Household assignment finished.\n\n${emit({ results })}`;
}
