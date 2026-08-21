import { TandoorClient } from '../clients/index.js';
import type {
  ExportRecipesArgs,
  ListExportLogsArgs,
  GetExportLogArgs,
  CreateExportLogArgs,
  UpdateExportLogArgs,
  DeleteExportLogArgs,
} from '../tools/export.js';
import type { HandlerContext } from '../lib/register.js';
import { emit, slimPaginated, assertNonEmptyBody } from '../lib/slim.js';

function slimExportLog(l: any) {
  if (!l) return l;
  return {
    id: l.id,
    type: l.type,
    running: l.running,
    created_at: l.created_at,
  };
}

export async function handleExportRecipes(
  client: TandoorClient,
  args: ExportRecipesArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const hasIds = Array.isArray(args.recipes) && args.recipes.length > 0;
  if (!hasIds && args.all !== true) {
    throw new Error('Provide either recipes[] with at least one id, or all=true');
  }
  const body: any = {
    recipes: Array.isArray(args.recipes) ? args.recipes.map((id: number) => ({ id })) : [],
    type: args.type,
    all: args.all ?? false,
  };
  if (args.custom_filter !== undefined) {
    body.custom_filter = args.custom_filter == null ? null : { id: args.custom_filter };
  }
  const r = await client.exports.exportRecipes(body, { signal: ctx?.signal });
  return `Export started.\n\n${emit(args.format === 'full' ? r : slimExportLog(r))}`;
}

export async function handleListExportLogs(
  client: TandoorClient,
  args: ListExportLogsArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.exports.listExportLogs(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimExportLog));
}

export async function handleGetExportLog(
  client: TandoorClient,
  args: GetExportLogArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.exports.getExportLog(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimExportLog(r));
}

export async function handleCreateExportLog(
  client: TandoorClient,
  args: CreateExportLogArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = { type: args.type };
  if (args.msg !== undefined) body.msg = args.msg;
  if (args.running !== undefined) body.running = args.running;
  if (args.total_recipes !== undefined) body.total_recipes = args.total_recipes;
  if (args.exported_recipes !== undefined) body.exported_recipes = args.exported_recipes;
  if (args.cache_duration !== undefined) body.cache_duration = args.cache_duration;
  const r = await client.exports.createExportLog(body, { signal: ctx?.signal });
  return `Export log created.\n\n${emit(args.format === 'full' ? r : slimExportLog(r))}`;
}

export async function handleUpdateExportLog(
  client: TandoorClient,
  args: UpdateExportLogArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.type !== undefined) body.type = args.type;
  if (args.msg !== undefined) body.msg = args.msg;
  if (args.running !== undefined) body.running = args.running;
  if (args.total_recipes !== undefined) body.total_recipes = args.total_recipes;
  if (args.exported_recipes !== undefined) body.exported_recipes = args.exported_recipes;
  if (args.cache_duration !== undefined) body.cache_duration = args.cache_duration;
  assertNonEmptyBody(body);
  const r = await client.exports.patchExportLog(args.id, body, { signal: ctx?.signal });
  return `Export log updated.\n\n${emit(args.format === 'full' ? r : slimExportLog(r))}`;
}

export async function handleDeleteExportLog(
  client: TandoorClient,
  args: DeleteExportLogArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.exports.deleteExportLog(args.id, { signal: ctx?.signal });
  return `Export log ${args.id} deleted.`;
}
