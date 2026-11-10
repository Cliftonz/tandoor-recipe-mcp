// Cook log tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListCookLogs,
  handleGetCookLog,
  handleCreateCookLog,
  handleUpdateCookLog,
  handleDeleteCookLog,
} from '../handlers/cooklog.js';


const page = z.number().optional().describe('Page number, starting at 1.');
const pageSize = z.number().optional().describe('Results per page.');
const cookLogId = z.number().describe('Cook log ID, from list_cook_logs.');

export const listCookLogsShape = {
  recipe: z.number().optional().describe('Only entries for this recipe ID, from search_recipes.'),
  page,
  page_size: pageSize,
  format: formatEnum,
} as const;

export const getCookLogShape = { id: cookLogId, format: formatEnum } as const;

export const createCookLogShape = {
  recipe: z.number().describe('Recipe ID, from search_recipes.'),
  servings: z.number().nullable().optional().describe('Servings made.'),
  rating: z.number().nullable().optional().describe('Whole-number rating.'),
  comment: z.string().nullable().optional().describe('Free-text comment.'),
  created_at: z.string().optional().describe('When it was cooked, ISO 8601 datetime. Default now.'),
  format: formatEnum,
} as const;

export const updateCookLogShape = {
  id: cookLogId,
  recipe: z.number().optional().describe('Recipe ID, from search_recipes.'),
  servings: z.number().nullable().optional().describe('Servings made. null clears it.'),
  rating: z.number().nullable().optional().describe('Whole-number rating. null clears it.'),
  comment: z.string().nullable().optional().describe('Free-text comment. null clears it.'),
  created_at: z.string().optional().describe('When it was cooked, ISO 8601 datetime.'),
  format: formatEnum,
} as const;

export const deleteCookLogShape = { id: cookLogId } as const;

export type ListCookLogsArgs = z.infer<z.ZodObject<typeof listCookLogsShape>>;
export type GetCookLogArgs = z.infer<z.ZodObject<typeof getCookLogShape>>;
export type CreateCookLogArgs = z.infer<z.ZodObject<typeof createCookLogShape>>;
export type UpdateCookLogArgs = z.infer<z.ZodObject<typeof updateCookLogShape>>;
export type DeleteCookLogArgs = z.infer<z.ZodObject<typeof deleteCookLogShape>>;

export function registerCookLogTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_cook_logs', {
    title: 'List cook logs',
    annotations: READ,
    description: 'List cook log entries (recipe cooking history). Optional: recipe (id filter), page, page_size.',
    inputSchema: listCookLogsShape,
  }, handleListCookLogs);

  registerStringTool(server, client, 'get_cook_log', {
    title: 'Get cook log',
    annotations: READ,
    description: 'Get a cook log entry by ID.',
    inputSchema: getCookLogShape,
  }, handleGetCookLog);

  registerStringTool(server, client, 'create_cook_log', {
    title: 'Create cook log',
    annotations: CREATE,
    description: 'Log that a recipe was cooked. Required: recipe (id). Optional: servings, rating, comment, created_at.',
    inputSchema: createCookLogShape,
  }, handleCreateCookLog);

  registerStringTool(server, client, 'update_cook_log', {
    title: 'Update cook log',
    annotations: UPDATE,
    description: 'Update a cook log entry (PATCH). Required: id.',
    inputSchema: updateCookLogShape,
  }, handleUpdateCookLog);

  registerStringTool(server, client, 'delete_cook_log', {
    title: 'Delete cook log',
    annotations: DELETE,
    description: 'Delete a cook log entry by ID.',
    inputSchema: deleteCookLogShape,
  }, handleDeleteCookLog);
}
