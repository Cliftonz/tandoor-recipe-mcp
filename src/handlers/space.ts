// Space + user-space + switch-active-space handlers.

import { TandoorClient } from '../clients/index.js';
import type {
  ListSpacesArgs,
  GetSpaceArgs,
  GetCurrentSpaceArgs,
  CreateSpaceArgs,
  UpdateSpaceArgs,
  ListUserSpacesArgs,
  GetUserSpaceArgs,
  UpdateUserSpaceArgs,
  DeleteUserSpaceArgs,
  ListAllPersonalUserSpacesArgs,
  SwitchActiveSpaceArgs,
} from '../tools/space.js';
import type { HandlerContext } from '../lib/register.js';

import { emit, slimPaginated, assertNonEmptyBody } from '../lib/slim.js';

function slimSpace(s: any) {
  if (!s) return s;
  return {
    id: s.id,
    name: s.name,
    user_count: s.user_count,
    max_recipes: s.max_recipes,
    food_inherit: s.food_inherit,
  };
}

function slimUserSpace(u: any) {
  if (!u) return u;
  return {
    id: u.id,
    user: typeof u.user === 'object' && u.user !== null ? u.user.id : u.user,
    space: typeof u.space === 'object' && u.space !== null ? u.space.id : u.space,
    active: u.active,
    groups: Array.isArray(u.groups) ? u.groups.map((g: any) => (typeof g === 'object' && g !== null ? g.id : g)) : [],
  };
}

// ---------- Spaces ----------

export async function handleListSpaces(client: TandoorClient, args: ListSpacesArgs, ctx?: HandlerContext): Promise<string> {
  const { format, ...params } = args;
  const r = await client.spaces.listSpaces(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimSpace));
}

export async function handleGetSpace(client: TandoorClient, args: GetSpaceArgs, ctx?: HandlerContext): Promise<string> {
  const r = await client.spaces.getSpace(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimSpace(r));
}

export async function handleGetCurrentSpace(client: TandoorClient, args: GetCurrentSpaceArgs, ctx?: HandlerContext): Promise<string> {
  const r = await client.spaces.getCurrentSpace({ signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimSpace(r));
}

export async function handleCreateSpace(client: TandoorClient, args: CreateSpaceArgs, ctx?: HandlerContext): Promise<string> {
  const { format, ...body } = args;
  const r = await client.spaces.createSpace(body, { signal: ctx?.signal });
  return `Space created.\n\n${emit(format === 'full' ? r : slimSpace(r))}`;
}

export async function handleUpdateSpace(client: TandoorClient, args: UpdateSpaceArgs, ctx?: HandlerContext): Promise<string> {
  const { id, format, ...body } = args;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) cleaned[k] = v;
  }
  assertNonEmptyBody(cleaned);
  const r = await client.spaces.patchSpace(id, cleaned, { signal: ctx?.signal });
  return `Space updated.\n\n${emit(format === 'full' ? r : slimSpace(r))}`;
}

// ---------- User-spaces ----------

export async function handleListUserSpaces(client: TandoorClient, args: ListUserSpacesArgs, ctx?: HandlerContext): Promise<string> {
  const { format, ...params } = args;
  const r = await client.spaces.listUserSpaces(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimUserSpace));
}

export async function handleGetUserSpace(client: TandoorClient, args: GetUserSpaceArgs, ctx?: HandlerContext): Promise<string> {
  const r = await client.spaces.getUserSpace(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimUserSpace(r));
}

export async function handleUpdateUserSpace(client: TandoorClient, args: UpdateUserSpaceArgs, ctx?: HandlerContext): Promise<string> {
  const { id, format, ...body } = args;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) cleaned[k] = v;
  }
  assertNonEmptyBody(cleaned);
  const r = await client.spaces.patchUserSpace(id, cleaned, { signal: ctx?.signal });
  return `User-space membership updated.\n\n${emit(format === 'full' ? r : slimUserSpace(r))}`;
}

export async function handleDeleteUserSpace(client: TandoorClient, args: DeleteUserSpaceArgs, ctx?: HandlerContext): Promise<string> {
  await client.spaces.deleteUserSpace(args.id, { signal: ctx?.signal });
  return `User-space membership ${args.id} deleted.`;
}

export async function handleListAllPersonalUserSpaces(client: TandoorClient, args: ListAllPersonalUserSpacesArgs, ctx?: HandlerContext): Promise<string> {
  const { format, ...params } = args;
  const r = await client.spaces.listAllPersonalUserSpaces(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimUserSpace));
}

// ---------- Switch active space ----------

export async function handleSwitchActiveSpace(client: TandoorClient, args: SwitchActiveSpaceArgs, ctx?: HandlerContext): Promise<string> {
  await client.spaces.switchActiveSpace(args.spaceId, { signal: ctx?.signal });
  return `Active space switched to ${args.spaceId}. All subsequent tool calls in this session will operate against space ${args.spaceId}.`;
}
