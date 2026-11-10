// Import-domain tool registrations: general import, import log,
// import-open-data, recipe-import queue, bookmarklet-import, fdc-search,
// food-inherit-field.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
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
  ai_provider_id: z.number().describe('AI provider ID, from list_ai_providers.'),
  text: z.string().optional().describe('Raw recipe text.'),
  file: z.string().optional().describe('Sent to Tandoor as the file field.'),
  recipe_id: z.string().optional().describe('Recipe ID, as a string.'),
  format: formatEnum,
} as const;

// ---------- Import log ----------

export const createImportLogShape = {
  type: z.string().describe('Import source label, max 32 characters.'),
  msg: z.string().optional().describe('Log text. Default empty.'),
  running: z.boolean().optional().describe('Import still in progress. Default true.'),
  total_recipes: z.number().optional().describe('Recipes found in the source. Default 0.'),
  imported_recipes: z.number().optional().describe('Recipes imported so far. Default 0.'),
  format: formatEnum,
} as const;

export const getImportLogShape = { id: z.number().describe('Import log ID, from list_import_logs.'), format: formatEnum } as const;

export const updateImportLogShape = {
  id: z.number().describe('Import log ID, from list_import_logs.'),
  type: z.string().optional().describe('Import source label, max 32 characters.'),
  msg: z.string().optional().describe('Log text; replaces the existing text.'),
  running: z.boolean().optional().describe('Import still in progress.'),
  total_recipes: z.number().optional().describe('Recipes found in the source.'),
  imported_recipes: z.number().optional().describe('Recipes imported so far.'),
  format: formatEnum,
} as const;

export const deleteImportLogShape = { id: z.number().describe('Import log ID, from list_import_logs.') } as const;

// ---------- Import open data ----------

export const listOpenDataImportsShape = { format: formatEnum } as const;

export const runOpenDataImportShape = {
  selected_version: z.string().describe('Version key, from list_open_data_imports.'),
  selected_datatypes: z.array(z.string()).describe('Any of: unit, category, property, store, food, conversion.'),
  update_existing: z.boolean().optional().describe('Also update rows that already exist. Default true.'),
  use_metric: z.boolean().optional().describe('Default true. Current Tandoor ignores it.'),
  format: formatEnum,
} as const;

// ---------- Recipe-import queue ----------

export const listRecipeImportsShape = {
  page: z.number().optional().describe('Page number, starting at 1.'),
  page_size: z.number().optional().describe('Results per page. Default 50, max 200.'),
  format: formatEnum,
} as const;

export const createRecipeImportShape = {
  name: z.string().describe('Name of the staged file.'),
  storage: z.number().describe('Storage ID, from list_storages.'),
  format: formatEnum,
} as const;

export const getRecipeImportShape = { id: z.number().describe('Queue entry ID, from list_recipe_imports.'), format: formatEnum } as const;

export const updateRecipeImportShape = {
  id: z.number().describe('Queue entry ID, from list_recipe_imports.'),
  name: z.string().optional().describe('Name of the staged file.'),
  storage: z.number().optional().describe('Storage ID, from list_storages.'),
  format: formatEnum,
} as const;

export const deleteRecipeImportShape = { id: z.number().describe('Queue entry ID, from list_recipe_imports.') } as const;

export const importAllPendingShape = {} as const;

export const importPendingRecipeShape = { id: z.number().describe('Queue entry ID, from list_recipe_imports.'), format: formatEnum } as const;

// ---------- Bookmarklet import ----------

export const listBookmarkletImportsShape = {
  page: z.number().optional().describe('Page number, starting at 1.'),
  page_size: z.number().optional().describe('Results per page. Default 50, max 200.'),
  format: formatEnum,
} as const;

export const createBookmarkletImportShape = {
  html: z.string().describe('Full HTML of the recipe page.'),
  url: z.string().optional().describe('Address of the page the HTML came from.'),
  format: formatEnum,
} as const;

export const getBookmarkletImportShape = { id: z.number().describe('Bookmarklet import ID, from list_bookmarklet_imports.'), format: formatEnum } as const;

export const updateBookmarkletImportShape = {
  id: z.number().describe('Bookmarklet import ID, from list_bookmarklet_imports.'),
  html: z.string().optional().describe('Full HTML of the recipe page.'),
  url: z.string().optional().describe('Address of the page the HTML came from.'),
  format: formatEnum,
} as const;

export const deleteBookmarkletImportShape = { id: z.number().describe('Bookmarklet import ID, from list_bookmarklet_imports.') } as const;

// ---------- FDC search ----------

export const fdcSearchShape = {
  query: z.string().describe('Search text, e.g. "cheddar cheese".'),
  // Strict enum: unknown dataType values are rejected at MCP boundary rather than passed through to Tandoor.
  dataType: z.array(z.enum(['Branded', 'Foundation', 'Survey (FNDDS)', 'SR Legacy'])).optional().describe('FDC data sets to search. Default Foundation.'),
  format: formatEnum,
} as const;

// ---------- Food inherit field ----------

export const listFoodInheritFieldsShape = { format: formatEnum } as const;

export const getFoodInheritFieldShape = { id: z.number().describe('Inherit field ID, from list_food_inherit_fields.'), format: formatEnum } as const;

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
    title: 'Import recipes',
    annotations: CREATE,
    description: 'Submit a raw recipe payload (text and/or uploaded file) to Tandoor for AI parsing into a Recipe. Requires ai_provider_id (see list_ai_providers). For URL scraping use import_recipe_from_url. For staged files already sitting in the recipe-import queue use import_pending_recipe. For the curated open-data seed set use run_open_data_import.',
    inputSchema: importRecipesShape,
  }, handleImportRecipes);

  // ---------- Import log ----------

  registerStringTool(server, client, 'create_import_log', {
    title: 'Create import log',
    annotations: CREATE,
    description: 'Create an import-log entry. Required: type. Optional: msg, running, total_recipes, imported_recipes. Tandoor also writes these automatically during URL/AI/bookmarklet imports.',
    inputSchema: createImportLogShape,
  }, handleCreateImportLog);

  registerStringTool(server, client, 'get_import_log', {
    title: 'Get import log',
    annotations: READ,
    description: 'Get an import-log entry by ID.',
    inputSchema: getImportLogShape,
  }, handleGetImportLog);

  registerStringTool(server, client, 'update_import_log', {
    title: 'Update import log',
    annotations: UPDATE,
    description: 'Update an import-log entry (PATCH). Required: id.',
    inputSchema: updateImportLogShape,
  }, handleUpdateImportLog);

  registerStringTool(server, client, 'delete_import_log', {
    title: 'Delete import log',
    annotations: DELETE,
    description: 'Delete an import-log entry by ID.',
    inputSchema: deleteImportLogShape,
  }, handleDeleteImportLog);

  // ---------- Import open data ----------

  registerStringTool(server, client, 'list_open_data_imports', {
    title: 'List open data imports',
    annotations: READ,
    description: 'List available versions and datatypes for the Tandoor open-data seed set (curated foods, units, categories, properties). Call before run_open_data_import to pick a version.',
    inputSchema: listOpenDataImportsShape,
  }, handleListOpenDataImports);

  registerStringTool(server, client, 'run_open_data_import', {
    title: 'Run open data import',
    annotations: { ...CREATE, destructiveHint: true },
    description: 'Import the Tandoor curated open-data seed set (foods, units, categories, properties, stores, conversions) for a chosen version. Required: selected_version, selected_datatypes[]. Optional: update_existing, use_metric. This is a bulk taxonomy seed; for a single recipe use import_recipes or import_recipe_from_url.',
    inputSchema: runOpenDataImportShape,
  }, handleRunOpenDataImport);

  // ---------- Recipe-import queue ----------

  registerStringTool(server, client, 'list_recipe_imports', {
    title: 'List recipe imports',
    annotations: READ,
    description: 'List entries in the recipe-import staging queue (files uploaded but not yet imported as recipes). Optional: page, page_size.',
    inputSchema: listRecipeImportsShape,
  }, handleListRecipeImports);

  registerStringTool(server, client, 'create_recipe_import', {
    title: 'Create recipe import',
    annotations: CREATE,
    description: 'Add an entry to the recipe-import staging queue. Required: name, storage. Does not import; call import_pending_recipe or import_all_pending afterwards.',
    inputSchema: createRecipeImportShape,
  }, handleCreateRecipeImport);

  registerStringTool(server, client, 'get_recipe_import', {
    title: 'Get recipe import',
    annotations: READ,
    description: 'Get a pending recipe-import queue entry by ID.',
    inputSchema: getRecipeImportShape,
  }, handleGetRecipeImport);

  registerStringTool(server, client, 'update_recipe_import', {
    title: 'Update recipe import',
    annotations: UPDATE,
    description: 'Update a pending recipe-import queue entry (PATCH). Required: id.',
    inputSchema: updateRecipeImportShape,
  }, handleUpdateRecipeImport);

  registerStringTool(server, client, 'delete_recipe_import', {
    title: 'Delete recipe import',
    annotations: DELETE,
    description: 'Delete a pending recipe-import queue entry by ID.',
    inputSchema: deleteRecipeImportShape,
  }, handleDeleteRecipeImport);

  registerStringTool(server, client, 'import_all_pending', {
    title: 'Import all pending',
    annotations: CREATE,
    description: 'Trigger import of every entry currently in the recipe-import staging queue. For a single queued entry use import_pending_recipe.',
    inputSchema: importAllPendingShape,
  }, handleImportAllPending);

  registerStringTool(server, client, 'import_pending_recipe', {
    title: 'Import pending recipe',
    annotations: CREATE,
    description: 'Import one already-staged entry from the recipe-import queue into a real Recipe. Required: id (of the queue entry). For raw text/file that has NOT been staged yet use import_recipes. For a URL use import_recipe_from_url.',
    inputSchema: importPendingRecipeShape,
  }, handleImportPendingRecipe);

  // ---------- Bookmarklet import ----------

  registerStringTool(server, client, 'list_bookmarklet_imports', {
    title: 'List bookmarklet imports',
    annotations: READ,
    description: 'List saved bookmarklet-import entries (raw HTML captured from the browser bookmarklet, awaiting parse). Optional: page, page_size.',
    inputSchema: listBookmarkletImportsShape,
  }, handleListBookmarkletImports);

  registerStringTool(server, client, 'create_bookmarklet_import', {
    title: 'Create bookmarklet import',
    annotations: CREATE,
    description: 'Save a bookmarklet-import entry (raw HTML from a recipe page). Required: html. Optional: url.',
    inputSchema: createBookmarkletImportShape,
  }, handleCreateBookmarkletImport);

  registerStringTool(server, client, 'get_bookmarklet_import', {
    title: 'Get bookmarklet import',
    annotations: READ,
    description: 'Get a bookmarklet-import entry by ID.',
    inputSchema: getBookmarkletImportShape,
  }, handleGetBookmarkletImport);

  registerStringTool(server, client, 'update_bookmarklet_import', {
    title: 'Update bookmarklet import',
    annotations: UPDATE,
    description: 'Update a bookmarklet-import entry (PATCH). Required: id.',
    inputSchema: updateBookmarkletImportShape,
  }, handleUpdateBookmarkletImport);

  registerStringTool(server, client, 'delete_bookmarklet_import', {
    title: 'Delete bookmarklet import',
    annotations: DELETE,
    description: 'Delete a bookmarklet-import entry by ID.',
    inputSchema: deleteBookmarkletImportShape,
  }, handleDeleteBookmarkletImport);

  // ---------- FDC search ----------

  registerStringTool(server, client, 'fdc_search', {
    title: 'Search USDA FDC foods',
    annotations: READ,
    description: 'Search the USDA FoodData Central catalog for candidate foods. Required: query. Optional: dataType[] (Branded, Foundation, Survey (FNDDS), SR Legacy). Returns fdcId + description + dataType; pair the chosen fdcId with food_fdc_lookup to fetch nutrients.',
    inputSchema: fdcSearchShape,
  }, handleFdcSearch);

  // ---------- Food inherit field ----------

  registerStringTool(server, client, 'list_food_inherit_fields', {
    title: 'List food inherit fields',
    annotations: READ,
    description: 'List the set of Food fields that child foods can inherit from a parent food (diet, supermarket category, etc.). Reference data used when configuring inheritance on the Food tree.',
    inputSchema: listFoodInheritFieldsShape,
  }, handleListFoodInheritFields);

  registerStringTool(server, client, 'get_food_inherit_field', {
    title: 'Get food inherit field',
    annotations: READ,
    description: 'Get a food-inherit-field definition by ID.',
    inputSchema: getFoodInheritFieldShape,
  }, handleGetFoodInheritField);
}
