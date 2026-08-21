// Storage handlers.

import { TandoorClient } from '../clients/index.js';
import type {
  ListStoragesArgs,
  GetStorageArgs,
  CreateStorageArgs,
  UpdateStorageArgs,
  DeleteStorageArgs,
} from '../tools/storage.js';
import type { HandlerContext } from '../lib/register.js';
import { emit, slimPaginated, assertNonEmptyBody } from '../lib/slim.js';
import { assertPublicUrl } from '../lib/safe-fetch.js';

// Redact token + password from slim projections; these fields hold credentials
// for external file backends and must never leak into a slim response.
function slimStorage(s: any) {
  if (!s) return s;
  return {
    id: s.id,
    name: s.name,
    method: s.method,
    url: s.url,
    path: s.path,
  };
}

export async function handleListStorages(
  client: TandoorClient,
  args: ListStoragesArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.storages.listStorages(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimStorage));
}

export async function handleGetStorage(
  client: TandoorClient,
  args: GetStorageArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.storages.getStorage(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimStorage(r));
}

export async function handleCreateStorage(
  client: TandoorClient,
  args: CreateStorageArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = { name: args.name, method: args.method, path: args.path };
  if (args.username !== undefined) body.username = args.username;
  if (args.password !== undefined) body.password = args.password;
  if (args.token !== undefined) body.token = args.token;
  if (args.url !== undefined && args.url !== null) {
    await assertPublicUrl(args.url);
  }
  if (args.url !== undefined) body.url = args.url;
  const r = await client.storages.createStorage(body, { signal: ctx?.signal });
  return `Storage created.\n\n${emit(args.format === 'full' ? r : slimStorage(r))}`;
}

export async function handleUpdateStorage(
  client: TandoorClient,
  args: UpdateStorageArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.method !== undefined) body.method = args.method;
  if (args.path !== undefined) body.path = args.path;
  if (args.username !== undefined) body.username = args.username;
  if (args.password !== undefined) body.password = args.password;
  if (args.token !== undefined) body.token = args.token;
  if (args.url !== undefined && args.url !== null) {
    await assertPublicUrl(args.url);
  }
  if (args.url !== undefined) body.url = args.url;
  assertNonEmptyBody(body);
  const r = await client.storages.patchStorage(args.id, body, { signal: ctx?.signal });
  return `Storage updated.\n\n${emit(args.format === 'full' ? r : slimStorage(r))}`;
}

export async function handleDeleteStorage(
  client: TandoorClient,
  args: DeleteStorageArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.storages.deleteStorage(args.id, { signal: ctx?.signal });
  return `Storage ${args.id} deleted.`;
}
