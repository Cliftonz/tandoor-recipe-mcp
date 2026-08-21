import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListSupermarkets,
  handleGetSupermarket,
  handleCreateSupermarket,
  handleUpdateSupermarket,
  handleDeleteSupermarket,
} from '../handlers/supermarket.js';


export const listSupermarketsShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  limit: z.string().optional(),
  query: z.string().optional(),
  format: formatEnum,
} as const;

export const getSupermarketShape = { id: z.number(), format: formatEnum } as const;

export const createSupermarketShape = {
  name: z.string(),
  description: z.string().nullable().optional(),
  open_data_slug: z.string().nullable().optional(),
  format: formatEnum,
} as const;

export const updateSupermarketShape = {
  id: z.number(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  open_data_slug: z.string().nullable().optional(),
  format: formatEnum,
} as const;

export const deleteSupermarketShape = { id: z.number() } as const;

export type ListSupermarketsArgs = z.infer<z.ZodObject<typeof listSupermarketsShape>>;
export type GetSupermarketArgs = z.infer<z.ZodObject<typeof getSupermarketShape>>;
export type CreateSupermarketArgs = z.infer<z.ZodObject<typeof createSupermarketShape>>;
export type UpdateSupermarketArgs = z.infer<z.ZodObject<typeof updateSupermarketShape>>;
export type DeleteSupermarketArgs = z.infer<z.ZodObject<typeof deleteSupermarketShape>>;

export function registerSupermarketTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_supermarkets', {
    description: 'List supermarkets (physical stores). Optional: query (name substring), limit, page, page_size.',
    inputSchema: listSupermarketsShape,
  }, handleListSupermarkets);

  registerStringTool(server, client, 'get_supermarket', {
    description: 'Get supermarket by ID.',
    inputSchema: getSupermarketShape,
  }, handleGetSupermarket);

  registerStringTool(server, client, 'create_supermarket', {
    description: 'Create a supermarket. Required: name. Optional: description, open_data_slug.',
    inputSchema: createSupermarketShape,
  }, handleCreateSupermarket);

  registerStringTool(server, client, 'update_supermarket', {
    description: 'Update a supermarket (PATCH). Required: id.',
    inputSchema: updateSupermarketShape,
  }, handleUpdateSupermarket);

  registerStringTool(server, client, 'delete_supermarket', {
    description: 'Delete a supermarket by ID.',
    inputSchema: deleteSupermarketShape,
  }, handleDeleteSupermarket);
}
