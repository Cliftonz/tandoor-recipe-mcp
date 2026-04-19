// Cook log tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import {
  handleListCookLogs,
  handleGetCookLog,
  handleCreateCookLog,
  handleUpdateCookLog,
  handleDeleteCookLog,
} from '../handlers/cooklog.js';

const formatEnum = z.enum(['slim', 'full']).optional();

export const listCookLogsShape = {
  recipe: z.number().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getCookLogShape = { id: z.number(), format: formatEnum } as const;

export const createCookLogShape = {
  recipe: z.number(),
  servings: z.number().nullable().optional(),
  rating: z.number().nullable().optional(),
  comment: z.string().nullable().optional(),
  created_at: z.string().optional(),
  format: formatEnum,
} as const;

export const updateCookLogShape = {
  id: z.number(),
  recipe: z.number().optional(),
  servings: z.number().nullable().optional(),
  rating: z.number().nullable().optional(),
  comment: z.string().nullable().optional(),
  created_at: z.string().optional(),
  format: formatEnum,
} as const;

export const deleteCookLogShape = { id: z.number() } as const;

export type ListCookLogsArgs = z.infer<z.ZodObject<typeof listCookLogsShape>>;
export type GetCookLogArgs = z.infer<z.ZodObject<typeof getCookLogShape>>;
export type CreateCookLogArgs = z.infer<z.ZodObject<typeof createCookLogShape>>;
export type UpdateCookLogArgs = z.infer<z.ZodObject<typeof updateCookLogShape>>;
export type DeleteCookLogArgs = z.infer<z.ZodObject<typeof deleteCookLogShape>>;

export function registerCookLogTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_cook_logs', {
    description: 'List cook log entries (recipe cooking history). Optional: recipe (id filter), page, page_size.',
    inputSchema: listCookLogsShape,
  }, handleListCookLogs);

  registerStringTool(server, client, 'get_cook_log', {
    description: 'Get a cook log entry by ID.',
    inputSchema: getCookLogShape,
  }, handleGetCookLog);

  registerStringTool(server, client, 'create_cook_log', {
    description: 'Log that a recipe was cooked. Required: recipe (id). Optional: servings, rating, comment, created_at.',
    inputSchema: createCookLogShape,
  }, handleCreateCookLog);

  registerStringTool(server, client, 'update_cook_log', {
    description: 'Update a cook log entry (PATCH). Required: id.',
    inputSchema: updateCookLogShape,
  }, handleUpdateCookLog);

  registerStringTool(server, client, 'delete_cook_log', {
    description: 'Delete a cook log entry by ID.',
    inputSchema: deleteCookLogShape,
  }, handleDeleteCookLog);
}
