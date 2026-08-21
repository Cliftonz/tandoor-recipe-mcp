// Import-domain tool registrations: general import, import log,
// import-open-data, recipe-import queue, bookmarklet-import, fdc-search,
// food-inherit-field.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleImportRecipes,
  handleCreateImportLog,
  handleGetImportLog,
  handleUpdateImportLog,
  handleDeleteImportLog,
  handleListOpenDataImports,
  handleRunOpenDataImport,
  handleListRecipeImports,
  handleCreateRecipeImport,
  handleGetRecipeImport,
  handleUpdateRecipeImport,
  handleDeleteRecipeImport,
  handleImportAllPending,
  handleImportPendingRecipe,
  handleListBookmarkletImports,
  handleCreateBookmarkletImport,
  handleGetBookmarkletImport,
  handleUpdateBookmarkletImport,
  handleDeleteBookmarkletImport,
  handleFdcSearch,
  handleListFoodInheritFields,
  handleGetFoodInheritField,
} from '../handlers/import.js';


// ---------- General import ----------

export const importRecipesShape = {
  ai_provider_id: z.number(),
  text: z.string().optional(),
  file: z.string().optional(),
  recipe_id: z.string().optional(),
  format: formatEnum,
} as const;

// ---------- Import log ----------

export const createImportLogShape = {
  type: z.string(),
  msg: z.string().optional(),
  running: z.boolean().optional(),
  total_recipes: z.number().optional(),
  imported_recipes: z.number().optional(),
  format: formatEnum,
} as const;

export const getImportLogShape = { id: z.number(), format: formatEnum } as const;

export const updateImportLogShape = {
  id: z.number(),
  type: z.string().optional(),
  msg: z.string().optional(),
  running: z.boolean().optional(),
  total_recipes: z.number().optional(),
  imported_recipes: z.number().optional(),
  format: formatEnum,
} as const;

export const deleteImportLogShape = { id: z.number() } as const;

// ---------- Import open data ----------

export const listOpenDataImportsShape = { format: formatEnum } as const;

export const runOpenDataImportShape = {
  selected_version: z.string(),
  selected_datatypes: z.array(z.string()),
  update_existing: z.boolean().optional(),
  use_metric: z.boolean().optional(),
  format: formatEnum,
} as const;

// ---------- Recipe-import queue ----------

export const listRecipeImportsShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const createRecipeImportShape = {
  name: z.string(),
  file_uid: z.string().optional(),
  file_path: z.string().optional(),
  storage: z.number(),
  space: z.number(),
  format: formatEnum,
} as const;

export const getRecipeImportShape = { id: z.number(), format: formatEnum } as const;

export const updateRecipeImportShape = {
  id: z.number(),
  name: z.string().optional(),
  file_uid: z.string().optional(),
  file_path: z.string().optional(),
  storage: z.number().optional(),
  space: z.number().optional(),
  format: formatEnum,
} as const;

export const deleteRecipeImportShape = { id: z.number() } as const;

export const importAllPendingShape = { format: formatEnum } as const;

export const importPendingRecipeShape = { id: z.number(), format: formatEnum } as const;

// ---------- Bookmarklet import ----------

export const listBookmarkletImportsShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const createBookmarkletImportShape = {
  html: z.string(),
  url: z.string().optional(),
  format: formatEnum,
} as const;

export const getBookmarkletImportShape = { id: z.number(), format: formatEnum } as const;

export const updateBookmarkletImportShape = {
  id: z.number(),
  html: z.string().optional(),
  url: z.string().optional(),
  format: formatEnum,
} as const;

export const deleteBookmarkletImportShape = { id: z.number() } as const;

// ---------- FDC search ----------

export const fdcSearchShape = {
  query: z.string(),
  // Strict enum: unknown dataType values are rejected at MCP boundary rather than passed through to Tandoor.
  dataType: z.array(z.enum(['Branded', 'Foundation', 'Survey (FNDDS)', 'SR Legacy'])).optional(),
  format: formatEnum,
} as const;

// ---------- Food inherit field ----------

export const listFoodInheritFieldsShape = { format: formatEnum } as const;

export const getFoodInheritFieldShape = { id: z.number(), format: formatEnum } as const;

export type ImportRecipesArgs = z.infer<z.ZodObject<typeof importRecipesShape>>;
export type CreateImportLogArgs = z.infer<z.ZodObject<typeof createImportLogShape>>;
export type GetImportLogArgs = z.infer<z.ZodObject<typeof getImportLogShape>>;
export type UpdateImportLogArgs = z.infer<z.ZodObject<typeof updateImportLogShape>>;
export type DeleteImportLogArgs = z.infer<z.ZodObject<typeof deleteImportLogShape>>;
export type ListOpenDataImportsArgs = z.infer<z.ZodObject<typeof listOpenDataImportsShape>>;
export type RunOpenDataImportArgs = z.infer<z.ZodObject<typeof runOpenDataImportShape>>;
export type ListRecipeImportsArgs = z.infer<z.ZodObject<typeof listRecipeImportsShape>>;
export type CreateRecipeImportArgs = z.infer<z.ZodObject<typeof createRecipeImportShape>>;
export type GetRecipeImportArgs = z.infer<z.ZodObject<typeof getRecipeImportShape>>;
export type UpdateRecipeImportArgs = z.infer<z.ZodObject<typeof updateRecipeImportShape>>;
export type DeleteRecipeImportArgs = z.infer<z.ZodObject<typeof deleteRecipeImportShape>>;
export type ImportAllPendingArgs = z.infer<z.ZodObject<typeof importAllPendingShape>>;
export type ImportPendingRecipeArgs = z.infer<z.ZodObject<typeof importPendingRecipeShape>>;
export type ListBookmarkletImportsArgs = z.infer<z.ZodObject<typeof listBookmarkletImportsShape>>;
export type CreateBookmarkletImportArgs = z.infer<z.ZodObject<typeof createBookmarkletImportShape>>;
export type GetBookmarkletImportArgs = z.infer<z.ZodObject<typeof getBookmarkletImportShape>>;
export type UpdateBookmarkletImportArgs = z.infer<z.ZodObject<typeof updateBookmarkletImportShape>>;
export type DeleteBookmarkletImportArgs = z.infer<z.ZodObject<typeof deleteBookmarkletImportShape>>;
export type FdcSearchArgs = z.infer<z.ZodObject<typeof fdcSearchShape>>;
export type ListFoodInheritFieldsArgs = z.infer<z.ZodObject<typeof listFoodInheritFieldsShape>>;
export type GetFoodInheritFieldArgs = z.infer<z.ZodObject<typeof getFoodInheritFieldShape>>;

export function registerImportTools(server: McpServer, client: TandoorClient): void {
  // ---------- General import ----------

  registerStringTool(server, client, 'import_recipes', {
    description: 'Submit a raw recipe payload (text and/or uploaded file) to Tandoor for AI parsing into a Recipe. Requires ai_provider_id (see list_ai_providers). For URL scraping use import_recipe_from_url. For staged files already sitting in the recipe-import queue use import_pending_recipe. For the curated open-data seed set use run_open_data_import.',
    inputSchema: importRecipesShape,
  }, handleImportRecipes);

  // ---------- Import log ----------

  registerStringTool(server, client, 'create_import_log', {
    description: 'Create an import-log entry. Required: type. Optional: msg, running, total_recipes, imported_recipes. Tandoor also writes these automatically during URL/AI/bookmarklet imports.',
    inputSchema: createImportLogShape,
  }, handleCreateImportLog);

  registerStringTool(server, client, 'get_import_log', {
    description: 'Get an import-log entry by ID.',
    inputSchema: getImportLogShape,
  }, handleGetImportLog);

  registerStringTool(server, client, 'update_import_log', {
    description: 'Update an import-log entry (PATCH). Required: id.',
    inputSchema: updateImportLogShape,
  }, handleUpdateImportLog);

  registerStringTool(server, client, 'delete_import_log', {
    description: 'Delete an import-log entry by ID.',
    inputSchema: deleteImportLogShape,
  }, handleDeleteImportLog);

  // ---------- Import open data ----------

  registerStringTool(server, client, 'list_open_data_imports', {
    description: 'List available versions and datatypes for the Tandoor open-data seed set (curated foods, units, categories, properties). Call before run_open_data_import to pick a version.',
    inputSchema: listOpenDataImportsShape,
  }, handleListOpenDataImports);

  registerStringTool(server, client, 'run_open_data_import', {
    description: 'Import the Tandoor curated open-data seed set (foods, units, categories, properties, stores, conversions) for a chosen version. Required: selected_version, selected_datatypes[]. Optional: update_existing, use_metric. This is a bulk taxonomy seed; for a single recipe use import_recipes or import_recipe_from_url.',
    inputSchema: runOpenDataImportShape,
  }, handleRunOpenDataImport);

  // ---------- Recipe-import queue ----------

  registerStringTool(server, client, 'list_recipe_imports', {
    description: 'List entries in the recipe-import staging queue (files uploaded but not yet imported as recipes). Optional: page, page_size.',
    inputSchema: listRecipeImportsShape,
  }, handleListRecipeImports);

  registerStringTool(server, client, 'create_recipe_import', {
    description: 'Add an entry to the recipe-import staging queue. Required: name, storage, space. Optional: file_uid, file_path. Does not import; call import_pending_recipe or import_all_pending afterwards.',
    inputSchema: createRecipeImportShape,
  }, handleCreateRecipeImport);

  registerStringTool(server, client, 'get_recipe_import', {
    description: 'Get a pending recipe-import queue entry by ID.',
    inputSchema: getRecipeImportShape,
  }, handleGetRecipeImport);

  registerStringTool(server, client, 'update_recipe_import', {
    description: 'Update a pending recipe-import queue entry (PATCH). Required: id.',
    inputSchema: updateRecipeImportShape,
  }, handleUpdateRecipeImport);

  registerStringTool(server, client, 'delete_recipe_import', {
    description: 'Delete a pending recipe-import queue entry by ID.',
    inputSchema: deleteRecipeImportShape,
  }, handleDeleteRecipeImport);

  registerStringTool(server, client, 'import_all_pending', {
    description: 'Trigger import of every entry currently in the recipe-import staging queue. For a single queued entry use import_pending_recipe.',
    inputSchema: importAllPendingShape,
  }, handleImportAllPending);

  registerStringTool(server, client, 'import_pending_recipe', {
    description: 'Import one already-staged entry from the recipe-import queue into a real Recipe. Required: id (of the queue entry). For raw text/file that has NOT been staged yet use import_recipes. For a URL use import_recipe_from_url.',
    inputSchema: importPendingRecipeShape,
  }, handleImportPendingRecipe);

  // ---------- Bookmarklet import ----------

  registerStringTool(server, client, 'list_bookmarklet_imports', {
    description: 'List saved bookmarklet-import entries (raw HTML captured from the browser bookmarklet, awaiting parse). Optional: page, page_size.',
    inputSchema: listBookmarkletImportsShape,
  }, handleListBookmarkletImports);

  registerStringTool(server, client, 'create_bookmarklet_import', {
    description: 'Save a bookmarklet-import entry (raw HTML from a recipe page). Required: html. Optional: url.',
    inputSchema: createBookmarkletImportShape,
  }, handleCreateBookmarkletImport);

  registerStringTool(server, client, 'get_bookmarklet_import', {
    description: 'Get a bookmarklet-import entry by ID.',
    inputSchema: getBookmarkletImportShape,
  }, handleGetBookmarkletImport);

  registerStringTool(server, client, 'update_bookmarklet_import', {
    description: 'Update a bookmarklet-import entry (PATCH). Required: id.',
    inputSchema: updateBookmarkletImportShape,
  }, handleUpdateBookmarkletImport);

  registerStringTool(server, client, 'delete_bookmarklet_import', {
    description: 'Delete a bookmarklet-import entry by ID.',
    inputSchema: deleteBookmarkletImportShape,
  }, handleDeleteBookmarkletImport);

  // ---------- FDC search ----------

  registerStringTool(server, client, 'fdc_search', {
    description: 'Search the USDA FoodData Central catalog for candidate foods. Required: query. Optional: dataType[] (Branded, Foundation, Survey (FNDDS), SR Legacy). Returns fdcId + description + dataType; pair the chosen fdcId with food_fdc_lookup to fetch nutrients.',
    inputSchema: fdcSearchShape,
  }, handleFdcSearch);

  // ---------- Food inherit field ----------

  registerStringTool(server, client, 'list_food_inherit_fields', {
    description: 'List the set of Food fields that child foods can inherit from a parent food (diet, supermarket category, etc.). Reference data used when configuring inheritance on the Food tree.',
    inputSchema: listFoodInheritFieldsShape,
  }, handleListFoodInheritFields);

  registerStringTool(server, client, 'get_food_inherit_field', {
    description: 'Get a food-inherit-field definition by ID.',
    inputSchema: getFoodInheritFieldShape,
  }, handleGetFoodInheritField);
}
