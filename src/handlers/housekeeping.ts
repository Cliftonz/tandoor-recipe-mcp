import { TandoorClient } from '../clients/index.js';
import type { HousekeepingClient } from '../clients/housekeeping.js';
import { emit, slimPaginated, assertNonEmptyBody } from '../lib/slim.js';
import type { HandlerContext } from '../lib/register.js';
import type {
  ListConnectorsArgs,
  GetConnectorArgs,
  CreateConnectorArgs,
  UpdateConnectorArgs,
  DeleteConnectorArgs,
  GetViewLogArgs,
  UpdateViewLogArgs,
  DeleteViewLogArgs,
  ListSearchFieldsArgs,
  ListSearchPreferencesArgs,
  UpdateSearchPreferenceArgs,
  GetLocalizationArgs,
  ListGroupsArgs,
  GetGroupArgs,
  ListUsersArgs,
  GetUserArgs,
  UpdateUserArgs,
  ExportMealPlanIcalArgs,
  GetExternalRecipeFileLinkArgs,
  GetRecipeFileMetadataArgs,
} from '../tools/housekeeping.js';

const hk = (client: TandoorClient): HousekeepingClient => client.housekeeping;

// ---------- Connector-config ----------

const slimConnector = (c: any) => c && {
  id: c.id, name: c.name, type: c.type, enabled: c.enabled,
  url: c.url, todo_entity: c.todo_entity,
  on_shopping_list_entry_created_enabled: c.on_shopping_list_entry_created_enabled,
  on_shopping_list_entry_updated_enabled: c.on_shopping_list_entry_updated_enabled,
  on_shopping_list_entry_deleted_enabled: c.on_shopping_list_entry_deleted_enabled,
  supports_description_field: c.supports_description_field,
};

export async function handleListConnectors(client: TandoorClient, args: ListConnectorsArgs, ctx?: HandlerContext): Promise<string> {
  const { format, ...params } = args;
  const r = await hk(client).listConnectors(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimConnector));
}

export async function handleGetConnector(client: TandoorClient, args: GetConnectorArgs, ctx?: HandlerContext): Promise<string> {
  const r = await hk(client).getConnector(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimConnector(r));
}

export async function handleCreateConnector(client: TandoorClient, args: CreateConnectorArgs, ctx?: HandlerContext): Promise<string> {
  const { format, ...body } = args;
  const r = await hk(client).createConnector(body, { signal: ctx?.signal });
  return `Connector created.\n\n${emit(format === 'full' ? r : slimConnector(r))}`;
}

export async function handleUpdateConnector(client: TandoorClient, args: UpdateConnectorArgs, ctx?: HandlerContext): Promise<string> {
  const { id, format, ...rest } = args;
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
  assertNonEmptyBody(body);
  const r = await hk(client).patchConnector(id, body, { signal: ctx?.signal });
  return `Connector updated.\n\n${emit(format === 'full' ? r : slimConnector(r))}`;
}

export async function handleDeleteConnector(client: TandoorClient, args: DeleteConnectorArgs, ctx?: HandlerContext): Promise<string> {
  await hk(client).deleteConnector(args.id, { signal: ctx?.signal });
  return `Connector ${args.id} deleted.`;
}

// ---------- View-log ----------

const slimViewLog = (v: any) => v && {
  id: v.id, recipe: v.recipe, created_at: v.created_at, created_by: v.created_by,
};

export async function handleGetViewLog(client: TandoorClient, args: GetViewLogArgs, ctx?: HandlerContext): Promise<string> {
  const r = await hk(client).getViewLog(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimViewLog(r));
}

export async function handleUpdateViewLog(client: TandoorClient, args: UpdateViewLogArgs, ctx?: HandlerContext): Promise<string> {
  const { id, format, ...rest } = args;
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
  assertNonEmptyBody(body);
  const r = await hk(client).patchViewLog(id, body, { signal: ctx?.signal });
  return `View log updated.\n\n${emit(format === 'full' ? r : slimViewLog(r))}`;
}

export async function handleDeleteViewLog(client: TandoorClient, args: DeleteViewLogArgs, ctx?: HandlerContext): Promise<string> {
  await hk(client).deleteViewLog(args.id, { signal: ctx?.signal });
  return `View log ${args.id} deleted.`;
}

// ---------- Search preferences ----------

const slimSearchField = (f: any) => f && { id: f.id, name: f.name, field: f.field };
const idsFrom = (arr: any): number[] => Array.isArray(arr) ? arr.map((x) => x?.id).filter((n) => typeof n === 'number') : [];
const slimSearchPreference = (p: any) => p && {
  user_id: p.user?.id,
  username: p.user?.username,
  search: p.search,
  lookup: p.lookup,
  unaccent: idsFrom(p.unaccent),
  icontains: idsFrom(p.icontains),
  istartswith: idsFrom(p.istartswith),
  trigram: idsFrom(p.trigram),
  fulltext: idsFrom(p.fulltext),
  trigram_threshold: p.trigram_threshold,
};

export async function handleListSearchFields(client: TandoorClient, args: ListSearchFieldsArgs, ctx?: HandlerContext): Promise<string> {
  const r = await hk(client).listSearchFields({ signal: ctx?.signal });
  if (args.format === 'full') return emit(r);
  return emit(Array.isArray(r) ? r.map(slimSearchField) : r);
}

export async function handleListSearchPreferences(client: TandoorClient, args: ListSearchPreferencesArgs, ctx?: HandlerContext): Promise<string> {
  const r = await hk(client).listSearchPreferences({ signal: ctx?.signal });
  if (args.format === 'full') return emit(r);
  return emit(Array.isArray(r) ? r.map(slimSearchPreference) : r);
}

export async function handleUpdateSearchPreference(client: TandoorClient, args: UpdateSearchPreferenceArgs, ctx?: HandlerContext): Promise<string> {
  const { user, format, ...rest } = args;
  const arrayFields = new Set(['unaccent', 'icontains', 'istartswith', 'trigram', 'fulltext']);
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    if (arrayFields.has(k) && Array.isArray(v)) body[k] = (v as number[]).map((id) => ({ id }));
    else body[k] = v;
  }
  assertNonEmptyBody(body);
  const r = await hk(client).patchSearchPreference(user, body, { signal: ctx?.signal });
  return `Search preference updated.\n\n${emit(format === 'full' ? r : slimSearchPreference(r))}`;
}

// ---------- Localization ----------

export async function handleGetLocalization(client: TandoorClient, _args: GetLocalizationArgs, ctx?: HandlerContext): Promise<string> {
  const r = await hk(client).getLocalization({ signal: ctx?.signal });
  return emit(r);
}

// ---------- Groups ----------

const slimGroup = (g: any) => g && { id: g.id, name: g.name };

export async function handleListGroups(client: TandoorClient, args: ListGroupsArgs, ctx?: HandlerContext): Promise<string> {
  const r = await hk(client).listGroups({ signal: ctx?.signal });
  if (args.format === 'full') return emit(r);
  return emit(Array.isArray(r) ? r.map(slimGroup) : r);
}

export async function handleGetGroup(client: TandoorClient, args: GetGroupArgs, ctx?: HandlerContext): Promise<string> {
  const r = await hk(client).getGroup(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimGroup(r));
}

// ---------- Users ----------

const slimUser = (u: any) => u && {
  id: u.id, username: u.username, display_name: u.display_name,
  first_name: u.first_name, last_name: u.last_name,
  is_staff: u.is_staff, is_superuser: u.is_superuser, is_active: u.is_active,
};

export async function handleListUsers(client: TandoorClient, args: ListUsersArgs, ctx?: HandlerContext): Promise<string> {
  const params: Record<string, unknown> = {};
  if (Array.isArray(args.filter_list)) params.filter_list = args.filter_list.map(String);
  const r = await hk(client).listUsers(params as any, { signal: ctx?.signal });
  if (args.format === 'full') return emit(r);
  return emit(Array.isArray(r) ? r.map(slimUser) : r);
}

export async function handleGetUser(client: TandoorClient, args: GetUserArgs, ctx?: HandlerContext): Promise<string> {
  const r = await hk(client).getUser(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimUser(r));
}

export async function handleUpdateUser(client: TandoorClient, args: UpdateUserArgs, ctx?: HandlerContext): Promise<string> {
  const { id, format, ...rest } = args;
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) body[k] = v;
  assertNonEmptyBody(body);
  const r = await hk(client).patchUser(id, body, { signal: ctx?.signal });
  return `User updated.\n\n${emit(format === 'full' ? r : slimUser(r))}`;
}

// ---------- Meal-plan iCal ----------

export async function handleExportMealPlanIcal(client: TandoorClient, args: ExportMealPlanIcalArgs, ctx?: HandlerContext): Promise<string> {
  const params: Record<string, unknown> = {};
  if (args.from_date !== undefined) params.from_date = args.from_date;
  if (args.to_date !== undefined) params.to_date = args.to_date;
  if (Array.isArray(args.meal_type)) params.meal_type = args.meal_type;
  return hk(client).exportMealPlanIcal(params as any, { signal: ctx?.signal });
}

// ---------- Recipe file / external link ----------

export async function handleGetExternalRecipeFileLink(client: TandoorClient, args: GetExternalRecipeFileLinkArgs, ctx?: HandlerContext): Promise<string> {
  const r = await hk(client).getExternalFileLink(args.id, { signal: ctx?.signal });
  return emit(r);
}

export async function handleGetRecipeFileMetadata(client: TandoorClient, args: GetRecipeFileMetadataArgs, ctx?: HandlerContext): Promise<string> {
  const r = await hk(client).getRecipeFileMetadata(args.id, { signal: ctx?.signal });
  return emit(r);
}
