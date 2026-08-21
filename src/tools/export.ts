import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
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
  type: z.string(),
  recipes: z.array(z.number()).optional(),
  all: z.boolean().optional(),
  custom_filter: z.number().nullable().optional(),
  format: formatEnum,
} as const;

export const listExportLogsShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getExportLogShape = { id: z.number(), format: formatEnum } as const;

export const createExportLogShape = {
  type: z.string(),
  msg: z.string().optional(),
  running: z.boolean().optional(),
  total_recipes: z.number().optional(),
  exported_recipes: z.number().optional(),
  cache_duration: z.number().optional(),
  format: formatEnum,
} as const;

export const updateExportLogShape = {
  id: z.number(),
  type: z.string().optional(),
  msg: z.string().optional(),
  running: z.boolean().optional(),
  total_recipes: z.number().optional(),
  exported_recipes: z.number().optional(),
  cache_duration: z.number().optional(),
  format: formatEnum,
} as const;

export const deleteExportLogShape = { id: z.number() } as const;

export type ExportRecipesArgs = z.infer<z.ZodObject<typeof exportRecipesShape>>;
export type ListExportLogsArgs = z.infer<z.ZodObject<typeof listExportLogsShape>>;
export type GetExportLogArgs = z.infer<z.ZodObject<typeof getExportLogShape>>;
export type CreateExportLogArgs = z.infer<z.ZodObject<typeof createExportLogShape>>;
export type UpdateExportLogArgs = z.infer<z.ZodObject<typeof updateExportLogShape>>;
export type DeleteExportLogArgs = z.infer<z.ZodObject<typeof deleteExportLogShape>>;

export function registerExportTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'export_recipes', {
    description: 'Trigger a recipe export job. Required: type (e.g. json, zip, pdf; depends on Tandoor build). Provide recipes[] (ids) or all=true. Returns the ExportLog for the queued job.',
    inputSchema: exportRecipesShape,
  }, handleExportRecipes);

  registerStringTool(server, client, 'list_export_logs', {
    description: 'List export-log rows. Optional: page, page_size.',
    inputSchema: listExportLogsShape,
  }, handleListExportLogs);

  registerStringTool(server, client, 'get_export_log', {
    description: 'Get export log by ID.',
    inputSchema: getExportLogShape,
  }, handleGetExportLog);

  registerStringTool(server, client, 'create_export_log', {
    description: 'Create an export log row directly. Rare; the export job normally creates one. Required: type.',
    inputSchema: createExportLogShape,
  }, handleCreateExportLog);

  registerStringTool(server, client, 'update_export_log', {
    description: 'Update an export log (PATCH). Required: id.',
    inputSchema: updateExportLogShape,
  }, handleUpdateExportLog);

  registerStringTool(server, client, 'delete_export_log', {
    description: 'Delete an export log by ID.',
    inputSchema: deleteExportLogShape,
  }, handleDeleteExportLog);
}
