import { TandoorClient } from '../clients/index.js';
import type {
  ListSyncsArgs,
  GetSyncArgs,
  CreateSyncArgs,
  UpdateSyncArgs,
  DeleteSyncArgs,
  QuerySyncedFolderArgs,
  ListSyncLogsArgs,
  GetSyncLogArgs,
} from '../tools/sync.js';
import type { HandlerContext } from '../lib/register.js';
import { emit, slimPaginated, assertNonEmptyBody } from '../lib/slim.js';

function slimSync(s: any) {
  if (!s) return s;
  return {
    id: s.id,
    storage: s.storage?.id ?? s.storage ?? null,
    path: s.path,
    active: s.active,
    last_checked: s.last_checked,
  };
}

function slimSyncLog(l: any) {
  if (!l) return l;
  return {
    id: l.id,
    sync: l.sync?.id ?? l.sync ?? null,
    status: l.status,
    created_at: l.created_at,
  };
}

export async function handleListSyncs(
  client: TandoorClient,
  args: ListSyncsArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.syncs.listSyncs(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimSync));
}

export async function handleGetSync(
  client: TandoorClient,
  args: GetSyncArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.syncs.getSync(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimSync(r));
}

export async function handleCreateSync(
  client: TandoorClient,
  args: CreateSyncArgs,
  ctx?: HandlerContext,
): Promise<string> {
  // Body shape follows this endpoint's spec verbatim; sibling endpoints use different envelopes.
  const body: any = { storage: { id: args.storage_id }, path: args.path };
  if (args.active !== undefined) body.active = args.active;
  if (args.last_checked !== undefined) body.last_checked = args.last_checked;
  const r = await client.syncs.createSync(body, { signal: ctx?.signal });
  return `Sync created.\n\n${emit(args.format === 'full' ? r : slimSync(r))}`;
}

export async function handleUpdateSync(
  client: TandoorClient,
  args: UpdateSyncArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.storage_id !== undefined) body.storage = { id: args.storage_id };
  if (args.path !== undefined) body.path = args.path;
  if (args.active !== undefined) body.active = args.active;
  if (args.last_checked !== undefined) body.last_checked = args.last_checked;
  assertNonEmptyBody(body);
  const r = await client.syncs.patchSync(args.id, body, { signal: ctx?.signal });
  return `Sync updated.\n\n${emit(args.format === 'full' ? r : slimSync(r))}`;
}

export async function handleDeleteSync(
  client: TandoorClient,
  args: DeleteSyncArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.syncs.deleteSync(args.id, { signal: ctx?.signal });
  return `Sync ${args.id} deleted.`;
}

export async function handleQuerySyncedFolder(
  client: TandoorClient,
  args: QuerySyncedFolderArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.syncs.querySyncedFolder(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimSyncLog(r));
}

export async function handleListSyncLogs(
  client: TandoorClient,
  args: ListSyncLogsArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.syncs.listSyncLogs(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimSyncLog));
}

export async function handleGetSyncLog(
  client: TandoorClient,
  args: GetSyncLogArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.syncs.getSyncLog(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimSyncLog(r));
}
