import { TandoorClient } from '../clients/index.js';
import type {
  ImportRecipesArgs,
  CreateImportLogArgs,
  GetImportLogArgs,
  UpdateImportLogArgs,
  DeleteImportLogArgs,
  ListOpenDataImportsArgs,
  RunOpenDataImportArgs,
  ListRecipeImportsArgs,
  CreateRecipeImportArgs,
  GetRecipeImportArgs,
  UpdateRecipeImportArgs,
  DeleteRecipeImportArgs,
  ImportAllPendingArgs,
  ImportPendingRecipeArgs,
  ListBookmarkletImportsArgs,
  CreateBookmarkletImportArgs,
  GetBookmarkletImportArgs,
  UpdateBookmarkletImportArgs,
  DeleteBookmarkletImportArgs,
  FdcSearchArgs,
  ListFoodInheritFieldsArgs,
  GetFoodInheritFieldArgs,
} from '../tools/import.js';
import type { HandlerContext } from '../lib/register.js';

import { emit, slimPaginated, assertNonEmptyBody } from '../lib/slim.js';
import { assertPublicUrl } from '../lib/safe-fetch.js';

// ---------- Slim projectors ----------

function slimImportLog(l: any) {
  if (!l) return l;
  return {
    id: l.id,
    type: l.type,
    msg: l.msg,
    running: l.running,
    total_recipes: l.total_recipes,
    imported_recipes: l.imported_recipes,
    created_at: l.created_at,
    keyword_id: l.keyword?.id,
  };
}

function slimOpenDataMeta(m: any) {
  if (!m) return m;
  return { versions: m.versions, datatypes: m.datatypes };
}

function slimRecipeImport(r: any) {
  if (!r) return r;
  return {
    id: r.id,
    name: r.name,
    file_uid: r.file_uid,
    file_path: r.file_path,
    created_at: r.created_at,
    storage: r.storage,
    space: r.space,
  };
}

function slimBookmarklet(b: any) {
  if (!b) return b;
  return {
    id: b.id,
    url: b.url,
    created_by: b.created_by,
    created_at: b.created_at,
  };
}

function slimFdcQuery(q: any) {
  if (!q) return q;
  return {
    totalHits: q.totalHits,
    currentPage: q.currentPage,
    totalPages: q.totalPages,
    foods: Array.isArray(q.foods)
      ? q.foods.map((f: any) => ({ fdcId: f.fdcId, description: f.description, dataType: f.dataType }))
      : q.foods,
  };
}

function slimInheritField(f: any) {
  if (!f) return f;
  return { id: f.id, name: f.name, field: f.field };
}

// ---------- General import ----------

export async function handleImportRecipes(
  client: TandoorClient,
  args: ImportRecipesArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = { ai_provider_id: args.ai_provider_id };
  if (args.text !== undefined) body.text = args.text;
  if (args.file !== undefined) body.file = args.file;
  if (args.recipe_id !== undefined) body.recipe_id = args.recipe_id;
  const r = await client.imports.importRecipes(body, { signal: ctx?.signal });
  return `Import submitted.\n\n${emit(r)}`;
}

// ---------- Import log ----------

export async function handleCreateImportLog(
  client: TandoorClient,
  args: CreateImportLogArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = { type: args.type };
  if (args.msg !== undefined) body.msg = args.msg;
  if (args.running !== undefined) body.running = args.running;
  if (args.total_recipes !== undefined) body.total_recipes = args.total_recipes;
  if (args.imported_recipes !== undefined) body.imported_recipes = args.imported_recipes;
  const r = await client.imports.createImportLog(body, { signal: ctx?.signal });
  return `Import log created.\n\n${emit(args.format === 'full' ? r : slimImportLog(r))}`;
}

export async function handleGetImportLog(
  client: TandoorClient,
  args: GetImportLogArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.imports.getImportLog(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimImportLog(r));
}

export async function handleUpdateImportLog(
  client: TandoorClient,
  args: UpdateImportLogArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.type !== undefined) body.type = args.type;
  if (args.msg !== undefined) body.msg = args.msg;
  if (args.running !== undefined) body.running = args.running;
  if (args.total_recipes !== undefined) body.total_recipes = args.total_recipes;
  if (args.imported_recipes !== undefined) body.imported_recipes = args.imported_recipes;
  assertNonEmptyBody(body);
  const r = await client.imports.patchImportLog(args.id, body, { signal: ctx?.signal });
  return `Import log updated.\n\n${emit(args.format === 'full' ? r : slimImportLog(r))}`;
}

export async function handleDeleteImportLog(
  client: TandoorClient,
  args: DeleteImportLogArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.imports.deleteImportLog(args.id, { signal: ctx?.signal });
  return `Import log ${args.id} deleted.`;
}

// ---------- Import open data ----------

export async function handleListOpenDataImports(
  client: TandoorClient,
  args: ListOpenDataImportsArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.imports.listOpenDataImports({ signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimOpenDataMeta(r));
}

export async function handleRunOpenDataImport(
  client: TandoorClient,
  args: RunOpenDataImportArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {
    selected_version: args.selected_version,
    selected_datatypes: args.selected_datatypes,
  };
  if (args.update_existing !== undefined) body.update_existing = args.update_existing;
  if (args.use_metric !== undefined) body.use_metric = args.use_metric;
  const r = await client.imports.runOpenDataImport(body, { signal: ctx?.signal });
  return `Open data import complete.\n\n${emit(r)}`;
}

// ---------- Recipe-import queue ----------

export async function handleListRecipeImports(
  client: TandoorClient,
  args: ListRecipeImportsArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.imports.listRecipeImports(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimRecipeImport));
}

export async function handleCreateRecipeImport(
  client: TandoorClient,
  args: CreateRecipeImportArgs,
  ctx?: HandlerContext,
): Promise<string> {
  // Body shape follows this endpoint's spec verbatim; sibling endpoints use different envelopes.
  const body: any = { name: args.name, storage: args.storage, space: args.space };
  if (args.file_uid !== undefined) body.file_uid = args.file_uid;
  if (args.file_path !== undefined) body.file_path = args.file_path;
  const r = await client.imports.createRecipeImport(body, { signal: ctx?.signal });
  return `Recipe import queued.\n\n${emit(args.format === 'full' ? r : slimRecipeImport(r))}`;
}

export async function handleGetRecipeImport(
  client: TandoorClient,
  args: GetRecipeImportArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.imports.getRecipeImport(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimRecipeImport(r));
}

export async function handleUpdateRecipeImport(
  client: TandoorClient,
  args: UpdateRecipeImportArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.file_uid !== undefined) body.file_uid = args.file_uid;
  if (args.file_path !== undefined) body.file_path = args.file_path;
  if (args.storage !== undefined) body.storage = args.storage;
  if (args.space !== undefined) body.space = args.space;
  assertNonEmptyBody(body);
  const r = await client.imports.patchRecipeImport(args.id, body, { signal: ctx?.signal });
  return `Recipe import updated.\n\n${emit(args.format === 'full' ? r : slimRecipeImport(r))}`;
}

export async function handleDeleteRecipeImport(
  client: TandoorClient,
  args: DeleteRecipeImportArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.imports.deleteRecipeImport(args.id, { signal: ctx?.signal });
  return `Recipe import ${args.id} deleted.`;
}

export async function handleImportAllPending(
  client: TandoorClient,
  args: ImportAllPendingArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.imports.importAllPending({ signal: ctx?.signal });
  return `Bulk import of pending recipes triggered.\n\n${emit(args.format === 'full' ? r : slimRecipeImport(r))}`;
}

export async function handleImportPendingRecipe(
  client: TandoorClient,
  args: ImportPendingRecipeArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.imports.importPendingRecipe(args.id, { signal: ctx?.signal });
  return `Pending recipe ${args.id} imported.\n\n${emit(r)}`;
}

// ---------- Bookmarklet import ----------

export async function handleListBookmarkletImports(
  client: TandoorClient,
  args: ListBookmarkletImportsArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.imports.listBookmarkletImports(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimBookmarklet));
}

export async function handleCreateBookmarkletImport(
  client: TandoorClient,
  args: CreateBookmarkletImportArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = { html: args.html };
  if (args.url !== undefined) {
    await assertPublicUrl(args.url);
    body.url = args.url;
  }
  const r = await client.imports.createBookmarkletImport(body, { signal: ctx?.signal });
  return `Bookmarklet import created.\n\n${emit(args.format === 'full' ? r : slimBookmarklet(r))}`;
}

export async function handleGetBookmarkletImport(
  client: TandoorClient,
  args: GetBookmarkletImportArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.imports.getBookmarkletImport(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimBookmarklet(r));
}

export async function handleUpdateBookmarkletImport(
  client: TandoorClient,
  args: UpdateBookmarkletImportArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.html !== undefined) body.html = args.html;
  if (args.url !== undefined) {
    await assertPublicUrl(args.url);
    body.url = args.url;
  }
  assertNonEmptyBody(body);
  const r = await client.imports.patchBookmarkletImport(args.id, body, { signal: ctx?.signal });
  return `Bookmarklet import updated.\n\n${emit(args.format === 'full' ? r : slimBookmarklet(r))}`;
}

export async function handleDeleteBookmarkletImport(
  client: TandoorClient,
  args: DeleteBookmarkletImportArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.imports.deleteBookmarkletImport(args.id, { signal: ctx?.signal });
  return `Bookmarklet import ${args.id} deleted.`;
}

// ---------- FDC search ----------

export async function handleFdcSearch(
  client: TandoorClient,
  args: FdcSearchArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const params: any = { query: args.query };
  if (args.dataType !== undefined) params.dataType = args.dataType;
  const r = await client.imports.fdcSearch(params, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimFdcQuery(r));
}

// ---------- Food inherit field ----------

export async function handleListFoodInheritFields(
  client: TandoorClient,
  args: ListFoodInheritFieldsArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.imports.listFoodInheritFields({ signal: ctx?.signal });
  if (args.format === 'full') return emit(r);
  return emit(Array.isArray(r) ? r.map(slimInheritField) : r);
}

export async function handleGetFoodInheritField(
  client: TandoorClient,
  args: GetFoodInheritFieldArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.imports.getFoodInheritField(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimInheritField(r));
}
