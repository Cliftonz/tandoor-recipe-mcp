// Share links, user prefs, automations, user-files, activity logs.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TandoorClient } from '../clients/index.js';
import type {
  GetShareLinkArgs,
  ListUserPreferencesArgs,
  GetUserPreferenceArgs,
  UpdateUserPreferenceArgs,
  ListAutomationsArgs,
  GetAutomationArgs,
  CreateAutomationArgs,
  UpdateAutomationArgs,
  DeleteAutomationArgs,
  ListUserFilesArgs,
  GetUserFileArgs,
  UploadUserFileArgs,
  UpdateUserFileArgs,
  DeleteUserFileArgs,
  ListViewLogsArgs,
  ListImportLogsArgs,
  ListAiLogsArgs,
  FoodAiPropertiesArgs,
  RecipeAiPropertiesArgs,
  GetServerSettingsArgs,
} from '../tools/admin.js';

const emit = (o: unknown) => JSON.stringify(o);

// ---------- Share links ----------

export async function handleGetShareLink(
  client: TandoorClient,
  args: GetShareLinkArgs
): Promise<string> {
  const r = await client.shareLinks.getShareLink(args.id);
  return emit(r);
}

// ---------- User preferences ----------

function slimUserPrefs(p: any) {
  if (!p) return p;
  return {
    user_id: p.user?.id,
    username: p.user?.username,
    theme: p.theme,
    default_page: p.default_page,
    default_unit: p.default_unit,
    use_fractions: p.use_fractions,
    use_kj: p.use_kj,
    comments: p.comments,
    ingredient_decimals: p.ingredient_decimals,
    shopping_auto_sync: p.shopping_auto_sync,
    shopping_recent_days: p.shopping_recent_days,
    shopping_add_onhand: p.shopping_add_onhand,
    mealplan_autoadd_shopping: p.mealplan_autoadd_shopping,
    mealplan_autoinclude_related: p.mealplan_autoinclude_related,
    mealplan_autoexclude_onhand: p.mealplan_autoexclude_onhand,
    filter_to_supermarket: p.filter_to_supermarket,
    left_handed: p.left_handed,
    plan_share_user_ids: Array.isArray(p.plan_share) ? p.plan_share.map((u: any) => u.id) : [],
    shopping_share_user_ids: Array.isArray(p.shopping_share) ? p.shopping_share.map((u: any) => u.id) : [],
  };
}

export async function handleListUserPreferences(
  client: TandoorClient,
  args: ListUserPreferencesArgs
): Promise<string> {
  const format = args.format;
  const r = await client.userPreferences.listPreferences();
  if (format === 'full') return emit(r);
  return emit(Array.isArray(r) ? r.map(slimUserPrefs) : r);
}

export async function handleGetUserPreference(
  client: TandoorClient,
  args: GetUserPreferenceArgs
): Promise<string> {
  const r = await client.userPreferences.getPreference(args.user_id);
  return args.format === 'full' ? emit(r) : emit(slimUserPrefs(r));
}

export async function handleUpdateUserPreference(
  client: TandoorClient,
  args: UpdateUserPreferenceArgs
): Promise<string> {
  const { user_id, format, plan_share_user_ids, shopping_share_user_ids, ...rest } = args;
  const body: any = { ...rest };
  if (Array.isArray(plan_share_user_ids)) body.plan_share = plan_share_user_ids.map((id) => ({ id }));
  if (Array.isArray(shopping_share_user_ids)) body.shopping_share = shopping_share_user_ids.map((id) => ({ id }));
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
  const r = await client.userPreferences.patchPreference(user_id, body);
  return `User preferences updated.\n\n${emit(format === 'full' ? r : slimUserPrefs(r))}`;
}

// ---------- Automations ----------

const slimAutomation = (a: any) => a && {
  id: a.id, type: a.type, name: a.name, description: a.description,
  param_1: a.param_1, param_2: a.param_2, param_3: a.param_3,
  order: a.order, disabled: a.disabled,
};

const slimPage = (p: any, slim: (x: any) => any) => p?.results
  ? { count: p.count, next: p.next, previous: p.previous, results: p.results.map(slim) }
  : p;

export async function handleListAutomations(
  client: TandoorClient,
  args: ListAutomationsArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.automations.listAutomations(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimAutomation));
}

export async function handleGetAutomation(
  client: TandoorClient,
  args: GetAutomationArgs
): Promise<string> {
  const r = await client.automations.getAutomation(args.id);
  return args.format === 'full' ? emit(r) : emit(slimAutomation(r));
}

export async function handleCreateAutomation(
  client: TandoorClient,
  args: CreateAutomationArgs
): Promise<string> {
  const body: any = { type: args.type };
  for (const k of ['name', 'description', 'param_1', 'param_2', 'param_3', 'order', 'disabled'] as const) {
    if ((args as any)[k] !== undefined) body[k] = (args as any)[k];
  }
  if (!body.name) body.name = args.type;
  const r = await client.automations.createAutomation(body);
  return `Automation created.\n\n${emit(args.format === 'full' ? r : slimAutomation(r))}`;
}

export async function handleUpdateAutomation(
  client: TandoorClient,
  args: UpdateAutomationArgs
): Promise<string> {
  const body: any = {};
  for (const k of ['type', 'name', 'description', 'param_1', 'param_2', 'param_3', 'order', 'disabled'] as const) {
    if ((args as any)[k] !== undefined) body[k] = (args as any)[k];
  }
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
  const r = await client.automations.patchAutomation(args.id, body);
  return `Automation updated.\n\n${emit(args.format === 'full' ? r : slimAutomation(r))}`;
}

export async function handleDeleteAutomation(
  client: TandoorClient,
  args: DeleteAutomationArgs
): Promise<string> {
  await client.automations.deleteAutomation(args.id);
  return `Automation ${args.id} deleted.`;
}

// ---------- User files ----------

const slimUserFile = (f: any) => f && {
  id: f.id, name: f.name, file_size_kb: f.file_size_kb,
  file_download: f.file_download, preview: f.preview,
  created_at: f.created_at,
};

function guessMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.pdf': return 'application/pdf';
    case '.mp4': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    default: return 'application/octet-stream';
  }
}

export async function handleListUserFiles(
  client: TandoorClient,
  args: ListUserFilesArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.userFiles.listUserFiles(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimUserFile));
}

export async function handleGetUserFile(
  client: TandoorClient,
  args: GetUserFileArgs
): Promise<string> {
  const r = await client.userFiles.getUserFile(args.id);
  return args.format === 'full' ? emit(r) : emit(slimUserFile(r));
}

export async function handleUploadUserFile(
  client: TandoorClient,
  args: UploadUserFileArgs
): Promise<string> {
  if (!args.file_path && !args.file_url) throw new Error('Provide file_path or file_url');

  let data: Buffer;
  let filename: string;
  let mimeType: string;
  if (args.file_path) {
    data = await readFile(args.file_path);
    filename = path.basename(args.file_path);
    mimeType = guessMime(filename);
  } else {
    const res = await fetch(args.file_url!);
    if (!res.ok) throw new Error(`Failed to fetch file_url: ${res.status}`);
    data = Buffer.from(await res.arrayBuffer());
    filename = (() => {
      try { return path.basename(new URL(args.file_url!).pathname) || 'upload'; } catch { return 'upload'; }
    })();
    mimeType = res.headers.get('content-type') || guessMime(filename);
  }

  const r = await client.userFiles.createUserFile({
    name: args.name,
    file: { data, filename, mimeType },
  });
  return `User file uploaded.\n\n${emit(args.format === 'full' ? r : slimUserFile(r))}`;
}

export async function handleUpdateUserFile(
  client: TandoorClient,
  args: UpdateUserFileArgs
): Promise<string> {
  const r = await client.userFiles.patchUserFile(args.id, { name: args.name });
  return `User file updated.\n\n${emit(args.format === 'full' ? r : slimUserFile(r))}`;
}

export async function handleDeleteUserFile(
  client: TandoorClient,
  args: DeleteUserFileArgs
): Promise<string> {
  await client.userFiles.deleteUserFile(args.id);
  return `User file ${args.id} deleted.`;
}

// ---------- Logs ----------

const slimViewLog = (v: any) => v && { id: v.id, recipe: v.recipe, created_at: v.created_at, created_by: v.created_by };
const slimImportLog = (v: any) => v && {
  id: v.id, type: v.type, msg: v.msg, running: v.running,
  keyword: v.keyword?.name, total_recipes: v.total_recipes, imported_recipes: v.imported_recipes,
  created_at: v.created_at,
};
const slimAiLog = (v: any) => v && {
  id: v.id, function: v.function, provider: v.ai_provider?.name,
  credit_cost: v.credit_cost, tokens: v.tokens, created_at: v.created_at,
};

export async function handleListViewLogs(
  client: TandoorClient,
  args: ListViewLogsArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.logs.listViewLogs(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimViewLog));
}

export async function handleListImportLogs(
  client: TandoorClient,
  args: ListImportLogsArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.logs.listImportLogs(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimImportLog));
}

export async function handleListAiLogs(
  client: TandoorClient,
  args: ListAiLogsArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.logs.listAiLogs(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimAiLog));
}

// ---------- Food/recipe aiproperties (nutrition via AI) ----------

export async function handleGetServerSettings(
  client: TandoorClient,
  _args: GetServerSettingsArgs
): Promise<string> {
  const r = await client.serverSettings.getCurrent();
  return emit(r);
}

export async function handleFoodAiProperties(
  client: TandoorClient,
  args: FoodAiPropertiesArgs
): Promise<string> {
  // Body expects a Food; send current as starting point.
  const current = await client.foodUnits.getFood(args.id);
  const r = await client.foodUnits.foodAiProperties(args.id, current, args.provider);
  return `Food ${args.id} enriched via AI.\n\n${emit(r)}`;
}

export async function handleRecipeAiProperties(
  client: TandoorClient,
  args: RecipeAiPropertiesArgs
): Promise<string> {
  const current = await client.recipes.getRecipe(args.id);
  const r = await client.recipes.recipeAiProperties(args.id, current, args.provider);
  return `Recipe ${args.id} enriched via AI.\n\n${emit(r)}`;
}
