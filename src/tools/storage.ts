// Storage tool registrations. External file-storage backends hold credentials
// (token, password); slim projector strips them, format='full' returns them.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
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
  page: z.number().optional().describe('1-based page number.'),
  page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'),
  format: formatEnum,
} as const;

export const getStorageShape = { id: z.number().describe('Storage ID from list_storages.'), format: formatEnum } as const;

export const createStorageShape = {
  name: z.string().describe('Display name.'),
  method: methodEnum.describe('Backend: DB is Dropbox, NEXTCLOUD, or LOCAL.'),
  path: z.string().describe('Nextcloud WebDAV root; empty uses the user files root.'),
  username: z.string().nullable().optional().describe('Nextcloud login username.'),
  password: z.string().nullable().optional().describe('Nextcloud password; write-only in Tandoor.'),
  token: z.string().nullable().optional().describe('Dropbox access token; write-only in Tandoor.'),
  url: z.string().nullable().optional().describe('Nextcloud server URL.'),
  format: formatEnum,
} as const;

export const updateStorageShape = {
  id: z.number().describe('Storage ID from list_storages.'),
  name: z.string().optional().describe('Display name.'),
  method: methodEnum.optional().describe('Backend: DB is Dropbox, NEXTCLOUD, or LOCAL.'),
  path: z.string().optional().describe('Nextcloud WebDAV root; empty uses the user files root.'),
  username: z.string().nullable().optional().describe('Nextcloud login username.'),
  password: z.string().nullable().optional().describe('Nextcloud password; write-only in Tandoor.'),
  token: z.string().nullable().optional().describe('Dropbox access token; write-only in Tandoor.'),
  url: z.string().nullable().optional().describe('Nextcloud server URL.'),
  format: formatEnum,
} as const;

export const deleteStorageShape = { id: z.number().describe('Storage ID from list_storages.') } as const;

export type ListStoragesArgs = z.infer<z.ZodObject<typeof listStoragesShape>>;
export type GetStorageArgs = z.infer<z.ZodObject<typeof getStorageShape>>;
export type CreateStorageArgs = z.infer<z.ZodObject<typeof createStorageShape>>;
export type UpdateStorageArgs = z.infer<z.ZodObject<typeof updateStorageShape>>;
export type DeleteStorageArgs = z.infer<z.ZodObject<typeof deleteStorageShape>>;

export function registerStorageTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_storages', {
    title: 'List storages',
    annotations: READ,
    description: `List external file-storage backends. ${credentialNote}`,
    inputSchema: listStoragesShape,
  }, handleListStorages);

  registerStringTool(server, client, 'get_storage', {
    title: 'Get storage',
    annotations: { ...READ, readOnlyHint: false },
    description: `Get a storage backend by ID. ${credentialNote}`,
    inputSchema: getStorageShape,
  }, handleGetStorage);

  registerStringTool(server, client, 'create_storage', {
    title: 'Create storage',
    annotations: CREATE,
    description: `Create a storage backend. Required: name, method (DB/NEXTCLOUD/LOCAL), path. Optional: username, password, token, url. ${credentialNote}`,
    inputSchema: createStorageShape,
  }, handleCreateStorage);

  registerStringTool(server, client, 'update_storage', {
    title: 'Update storage',
    annotations: UPDATE,
    description: `Update a storage backend (PATCH). Required: id. ${credentialNote}`,
    inputSchema: updateStorageShape,
  }, handleUpdateStorage);

  registerStringTool(server, client, 'delete_storage', {
    title: 'Delete storage',
    annotations: DELETE,
    description: 'Delete a storage backend by ID.',
    inputSchema: deleteStorageShape,
  }, handleDeleteStorage);
}
