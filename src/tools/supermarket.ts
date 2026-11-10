import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListSupermarkets,
  handleGetSupermarket,
  handleCreateSupermarket,
  handleUpdateSupermarket,
  handleDeleteSupermarket,
} from '../handlers/supermarket.js';


export const listSupermarketsShape = {
  page: z.number().optional().describe('Page number, from 1.'),
  page_size: z.number().optional().describe('Results per page. Default 50, max 200.'),
  limit: z.string().optional().describe('Maximum number of supermarkets, as a string, e.g. "10".'),
  query: z.string().optional().describe('Case-insensitive name substring.'),
  format: formatEnum,
} as const;

export const getSupermarketShape = { id: z.number().describe('Supermarket ID, from list_supermarkets.'), format: formatEnum } as const;

export const createSupermarketShape = {
  name: z.string().describe('Store name. Unique per space.'),
  description: z.string().nullable().optional().describe('Free-text description.'),
  open_data_slug: z.string().nullable().optional().describe('Tandoor Open Data identifier. Unique per space.'),
  format: formatEnum,
} as const;

export const updateSupermarketShape = {
  id: z.number().describe('Supermarket ID, from list_supermarkets.'),
  name: z.string().optional().describe('New store name. Unique per space.'),
  description: z.string().nullable().optional().describe('Free-text description.'),
  open_data_slug: z.string().nullable().optional().describe('Tandoor Open Data identifier. Unique per space.'),
  format: formatEnum,
} as const;

export const deleteSupermarketShape = { id: z.number().describe('Supermarket ID, from list_supermarkets.') } as const;

export type ListSupermarketsArgs = z.infer<z.ZodObject<typeof listSupermarketsShape>>;
export type GetSupermarketArgs = z.infer<z.ZodObject<typeof getSupermarketShape>>;
export type CreateSupermarketArgs = z.infer<z.ZodObject<typeof createSupermarketShape>>;
export type UpdateSupermarketArgs = z.infer<z.ZodObject<typeof updateSupermarketShape>>;
export type DeleteSupermarketArgs = z.infer<z.ZodObject<typeof deleteSupermarketShape>>;

export function registerSupermarketTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_supermarkets', {
    title: 'List supermarkets',
    annotations: READ,
    description: 'List supermarkets (physical stores). Optional: query (name substring), limit, page, page_size.',
    inputSchema: listSupermarketsShape,
  }, handleListSupermarkets);

  registerStringTool(server, client, 'get_supermarket', {
    title: 'Get supermarket',
    annotations: READ,
    description: 'Get supermarket by ID.',
    inputSchema: getSupermarketShape,
  }, handleGetSupermarket);

  registerStringTool(server, client, 'create_supermarket', {
    title: 'Create supermarket',
    annotations: CREATE,
    description: 'Create a supermarket. Required: name. Optional: description, open_data_slug.',
    inputSchema: createSupermarketShape,
  }, handleCreateSupermarket);

  registerStringTool(server, client, 'update_supermarket', {
    title: 'Update supermarket',
    annotations: UPDATE,
    description: 'Update a supermarket (PATCH). Required: id.',
    inputSchema: updateSupermarketShape,
  }, handleUpdateSupermarket);

  registerStringTool(server, client, 'delete_supermarket', {
    title: 'Delete supermarket',
    annotations: DELETE,
    description: 'Delete a supermarket by ID.',
    inputSchema: deleteSupermarketShape,
  }, handleDeleteSupermarket);
}
