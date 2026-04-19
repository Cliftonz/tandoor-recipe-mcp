// Cook log handlers.

import { TandoorClient } from '../clients/index.js';
import type {
  ListCookLogsArgs,
  GetCookLogArgs,
  CreateCookLogArgs,
  UpdateCookLogArgs,
  DeleteCookLogArgs,
} from '../tools/cooklog.js';

const emit = (o: unknown) => JSON.stringify(o);

function slimCookLog(c: any) {
  if (!c) return c;
  return {
    id: c.id,
    recipe: c.recipe,
    servings: c.servings,
    rating: c.rating,
    comment: c.comment,
    created_at: c.created_at,
  };
}

export async function handleListCookLogs(
  client: TandoorClient,
  args: ListCookLogsArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.cookLogs.listCookLogs(params);
  if (format === 'full') return emit(r);
  return emit({
    count: r.count,
    next: r.next,
    previous: r.previous,
    results: (r.results || []).map(slimCookLog),
  });
}

export async function handleGetCookLog(
  client: TandoorClient,
  args: GetCookLogArgs
): Promise<string> {
  const r = await client.cookLogs.getCookLog(args.id);
  return args.format === 'full' ? emit(r) : emit(slimCookLog(r));
}

export async function handleCreateCookLog(
  client: TandoorClient,
  args: CreateCookLogArgs
): Promise<string> {
  const body: any = { recipe: args.recipe };
  if (args.servings !== undefined) body.servings = args.servings;
  if (args.rating !== undefined) body.rating = args.rating;
  if (args.comment !== undefined) body.comment = args.comment;
  if (args.created_at !== undefined) body.created_at = args.created_at;
  const r = await client.cookLogs.createCookLog(body);
  return `Cook log created.\n\n${emit(args.format === 'full' ? r : slimCookLog(r))}`;
}

export async function handleUpdateCookLog(
  client: TandoorClient,
  args: UpdateCookLogArgs
): Promise<string> {
  const body: any = {};
  if (args.recipe !== undefined) body.recipe = args.recipe;
  if (args.servings !== undefined) body.servings = args.servings;
  if (args.rating !== undefined) body.rating = args.rating;
  if (args.comment !== undefined) body.comment = args.comment;
  if (args.created_at !== undefined) body.created_at = args.created_at;
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
  const r = await client.cookLogs.patchCookLog(args.id, body);
  return `Cook log updated.\n\n${emit(args.format === 'full' ? r : slimCookLog(r))}`;
}

export async function handleDeleteCookLog(
  client: TandoorClient,
  args: DeleteCookLogArgs
): Promise<string> {
  await client.cookLogs.deleteCookLog(args.id);
  return `Cook log ${args.id} deleted.`;
}
