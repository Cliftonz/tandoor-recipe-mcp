import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleExportRecipes,
  handleListExportLogs,
  handleGetExportLog,
  handleCreateExportLog,
  handleUpdateExportLog,
  handleDeleteExportLog,
} from '../handlers/export.js';


export const exportRecipesShape = {
  type: z.string().describe('Integration name, e.g. DEFAULT, SAFFRON, RECIPESAGE. PDF is rejected.'),
  recipes: z.array(z.number()).optional().describe('Recipe IDs to export.'),
  all: z.boolean().optional().describe('Export every recipe you can see. Default false.'),
  custom_filter: z.number().int().positive().optional().describe('Saved custom filter ID from list_custom_filters.'),
  format: formatEnum,
} as const;

export const listExportLogsShape = {
  page: z.number().optional().describe('1-based page number.'),
  page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'),
  format: formatEnum,
} as const;

export const getExportLogShape = { id: z.number().describe('Export log ID from list_export_logs.'), format: formatEnum } as const;

export const createExportLogShape = {
  type: z.string().describe('Integration name, e.g. DEFAULT.'),
  msg: z.string().optional().describe('Log text written by the export job.'),
  running: z.boolean().optional().describe('True while the export job is in progress.'),
  total_recipes: z.number().optional().describe('Number of recipes in the export.'),
  exported_recipes: z.number().optional().describe('Number of recipes exported so far.'),
  cache_duration: z.number().optional().describe('Seconds the export file stays downloadable.'),
  format: formatEnum,
} as const;

export const updateExportLogShape = {
  id: z.number().describe('Export log ID from list_export_logs.'),
  type: z.string().optional().describe('Integration name, e.g. DEFAULT.'),
  msg: z.string().optional().describe('Log text written by the export job.'),
  running: z.boolean().optional().describe('True while the export job is in progress.'),
  total_recipes: z.number().optional().describe('Number of recipes in the export.'),
  exported_recipes: z.number().optional().describe('Number of recipes exported so far.'),
  cache_duration: z.number().optional().describe('Seconds the export file stays downloadable.'),
  format: formatEnum,
} as const;

export const deleteExportLogShape = { id: z.number().describe('Export log ID from list_export_logs.') } as const;

export type ExportRecipesArgs = z.infer<z.ZodObject<typeof exportRecipesShape>>;
export type ListExportLogsArgs = z.infer<z.ZodObject<typeof listExportLogsShape>>;
export type GetExportLogArgs = z.infer<z.ZodObject<typeof getExportLogShape>>;
export type CreateExportLogArgs = z.infer<z.ZodObject<typeof createExportLogShape>>;
export type UpdateExportLogArgs = z.infer<z.ZodObject<typeof updateExportLogShape>>;
export type DeleteExportLogArgs = z.infer<z.ZodObject<typeof deleteExportLogShape>>;

export function registerExportTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'export_recipes', {
    title: 'Export recipes',
    annotations: { ...READ, readOnlyHint: false, idempotentHint: false },
    description: 'Trigger a recipe export job. Required: type (e.g. json, zip, pdf; depends on Tandoor build). Provide recipes[] (ids), all=true, or custom_filter (saved filter id); recipes[] cannot be combined with custom_filter, even when all=true. all=true overrides custom_filter. Filters reachable only via a shared recipe book return 404. A deleted or empty filter exports every recipe. Returns the ExportLog for the queued job.',
    inputSchema: exportRecipesShape,
  }, handleExportRecipes);

  registerStringTool(server, client, 'list_export_logs', {
    title: 'List export logs',
    annotations: READ,
    description: 'List export-log rows. Optional: page, page_size.',
    inputSchema: listExportLogsShape,
  }, handleListExportLogs);

  registerStringTool(server, client, 'get_export_log', {
    title: 'Get export log',
    annotations: READ,
    description: 'Get export log by ID.',
    inputSchema: getExportLogShape,
  }, handleGetExportLog);

  registerStringTool(server, client, 'create_export_log', {
    title: 'Create export log',
    annotations: CREATE,
    description: 'Create an export log row directly. Rare; the export job normally creates one. Required: type.',
    inputSchema: createExportLogShape,
  }, handleCreateExportLog);

  registerStringTool(server, client, 'update_export_log', {
    title: 'Update export log',
    annotations: UPDATE,
    description: 'Update an export log (PATCH). Required: id.',
    inputSchema: updateExportLogShape,
  }, handleUpdateExportLog);

  registerStringTool(server, client, 'delete_export_log', {
    title: 'Delete export log',
    annotations: DELETE,
    description: 'Delete an export log by ID.',
    inputSchema: deleteExportLogShape,
  }, handleDeleteExportLog);
}
