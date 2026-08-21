// Storage tool registrations. External file-storage backends hold credentials
// (token, password); slim projector strips them, format='full' returns them.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListStorages,
  handleGetStorage,
  handleCreateStorage,
  handleUpdateStorage,
  handleDeleteStorage,
} from '../handlers/storage.js';

const methodEnum = z.enum(['DB', 'NEXTCLOUD', 'LOCAL']);

const credentialNote =
  "Storage records contain credentials for external file backends. Slim mode redacts token/password; use format='full' only if needed.";

export const listStoragesShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getStorageShape = { id: z.number(), format: formatEnum } as const;

export const createStorageShape = {
  name: z.string(),
  method: methodEnum,
  path: z.string(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  token: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  format: formatEnum,
} as const;

export const updateStorageShape = {
  id: z.number(),
  name: z.string().optional(),
  method: methodEnum.optional(),
  path: z.string().optional(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  token: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  format: formatEnum,
} as const;

export const deleteStorageShape = { id: z.number() } as const;

export type ListStoragesArgs = z.infer<z.ZodObject<typeof listStoragesShape>>;
export type GetStorageArgs = z.infer<z.ZodObject<typeof getStorageShape>>;
export type CreateStorageArgs = z.infer<z.ZodObject<typeof createStorageShape>>;
export type UpdateStorageArgs = z.infer<z.ZodObject<typeof updateStorageShape>>;
export type DeleteStorageArgs = z.infer<z.ZodObject<typeof deleteStorageShape>>;

export function registerStorageTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_storages', {
    description: `List external file-storage backends. ${credentialNote}`,
    inputSchema: listStoragesShape,
  }, handleListStorages);

  registerStringTool(server, client, 'get_storage', {
    description: `Get a storage backend by ID. ${credentialNote}`,
    inputSchema: getStorageShape,
  }, handleGetStorage);

  registerStringTool(server, client, 'create_storage', {
    description: `Create a storage backend. Required: name, method (DB/NEXTCLOUD/LOCAL), path. Optional: username, password, token, url. ${credentialNote}`,
    inputSchema: createStorageShape,
  }, handleCreateStorage);

  registerStringTool(server, client, 'update_storage', {
    description: `Update a storage backend (PATCH). Required: id. ${credentialNote}`,
    inputSchema: updateStorageShape,
  }, handleUpdateStorage);

  registerStringTool(server, client, 'delete_storage', {
    description: 'Delete a storage backend by ID.',
    inputSchema: deleteStorageShape,
  }, handleDeleteStorage);
}
