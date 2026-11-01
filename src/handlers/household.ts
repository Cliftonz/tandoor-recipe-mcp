import { TandoorClient } from '../clients/index.js';
import type {
  ListHouseholdsArgs,
  GetHouseholdArgs,
  CreateHouseholdArgs,
  UpdateHouseholdArgs,
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
  const found = await members(client, args.id, ctx?.signal);
  return emit({ ...(args.format === 'full' ? r : slimHousehold(r)), members: found });
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
