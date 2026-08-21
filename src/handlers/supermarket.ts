import { TandoorClient } from '../clients/index.js';
import type {
  ListSupermarketsArgs,
  GetSupermarketArgs,
  CreateSupermarketArgs,
  UpdateSupermarketArgs,
  DeleteSupermarketArgs,
} from '../tools/supermarket.js';
import type { HandlerContext } from '../lib/register.js';
import { emit, slimPaginated, assertNonEmptyBody } from '../lib/slim.js';

function slimSupermarket(s: any) {
  if (!s) return s;
  return {
    id: s.id,
    name: s.name,
    description: s.description,
  };
}

export async function handleListSupermarkets(
  client: TandoorClient,
  args: ListSupermarketsArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.supermarkets.listSupermarkets(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimSupermarket));
}

export async function handleGetSupermarket(
  client: TandoorClient,
  args: GetSupermarketArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.supermarkets.getSupermarket(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimSupermarket(r));
}

export async function handleCreateSupermarket(
  client: TandoorClient,
  args: CreateSupermarketArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = { name: args.name, category_to_supermarket: [] };
  if (args.description !== undefined) body.description = args.description;
  if (args.open_data_slug !== undefined) body.open_data_slug = args.open_data_slug;
  const r = await client.supermarkets.createSupermarket(body, { signal: ctx?.signal });
  return `Supermarket created.\n\n${emit(args.format === 'full' ? r : slimSupermarket(r))}`;
}

export async function handleUpdateSupermarket(
  client: TandoorClient,
  args: UpdateSupermarketArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.description !== undefined) body.description = args.description;
  if (args.open_data_slug !== undefined) body.open_data_slug = args.open_data_slug;
  assertNonEmptyBody(body);
  const r = await client.supermarkets.patchSupermarket(args.id, body, { signal: ctx?.signal });
  return `Supermarket updated.\n\n${emit(args.format === 'full' ? r : slimSupermarket(r))}`;
}

export async function handleDeleteSupermarket(
  client: TandoorClient,
  args: DeleteSupermarketArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.supermarkets.deleteSupermarket(args.id, { signal: ctx?.signal });
  return `Supermarket ${args.id} deleted.`;
}
