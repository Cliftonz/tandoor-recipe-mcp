import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListSyncs,
  handleGetSync,
  handleCreateSync,
  handleUpdateSync,
  handleDeleteSync,
  handleQuerySyncedFolder,
  handleListSyncLogs,
  handleGetSyncLog,
} from '../handlers/sync.js';

export const listSyncsShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getSyncShape = { id: z.number(), format: formatEnum } as const;

export const createSyncShape = {
  storage_id: z.number(),
  path: z.string(),
  active: z.boolean().optional(),
  last_checked: z.string().nullable().optional(),
  format: formatEnum,
} as const;

export const updateSyncShape = {
  id: z.number(),
  storage_id: z.number().optional(),
  path: z.string().optional(),
  active: z.boolean().optional(),
  last_checked: z.string().nullable().optional(),
  format: formatEnum,
} as const;

export const deleteSyncShape = { id: z.number() } as const;

export const querySyncedFolderShape = { id: z.number(), format: formatEnum } as const;

export const listSyncLogsShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getSyncLogShape = { id: z.number(), format: formatEnum } as const;

export type ListSyncsArgs = z.infer<z.ZodObject<typeof listSyncsShape>>;
export type GetSyncArgs = z.infer<z.ZodObject<typeof getSyncShape>>;
export type CreateSyncArgs = z.infer<z.ZodObject<typeof createSyncShape>>;
export type UpdateSyncArgs = z.infer<z.ZodObject<typeof updateSyncShape>>;
export type DeleteSyncArgs = z.infer<z.ZodObject<typeof deleteSyncShape>>;
export type QuerySyncedFolderArgs = z.infer<z.ZodObject<typeof querySyncedFolderShape>>;
export type ListSyncLogsArgs = z.infer<z.ZodObject<typeof listSyncLogsShape>>;
export type GetSyncLogArgs = z.infer<z.ZodObject<typeof getSyncLogShape>>;

export function registerSyncTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_syncs', {
    description: 'List folder-to-storage syncs. Optional: page, page_size.',
    inputSchema: listSyncsShape,
  }, handleListSyncs);

  registerStringTool(server, client, 'get_sync', {
    description: 'Get a sync by ID.',
    inputSchema: getSyncShape,
  }, handleGetSync);

  registerStringTool(server, client, 'create_sync', {
    description: 'Create a sync linking a storage backend to a folder path. Required: storage_id, path. Optional: active, last_checked.',
    inputSchema: createSyncShape,
  }, handleCreateSync);

  registerStringTool(server, client, 'update_sync', {
    description: 'Update a sync (PATCH). Required: id.',
    inputSchema: updateSyncShape,
  }, handleUpdateSync);

  registerStringTool(server, client, 'delete_sync', {
    description: 'Delete a sync by ID.',
    inputSchema: deleteSyncShape,
  }, handleDeleteSync);

  registerStringTool(server, client, 'query_synced_folder', {
    description: 'Trigger Tandoor to list files at the storage folder for the given sync. Required: id.',
    inputSchema: querySyncedFolderShape,
  }, handleQuerySyncedFolder);

  registerStringTool(server, client, 'list_sync_logs', {
    description: 'List sync-log entries (read-only). Optional: page, page_size.',
    inputSchema: listSyncLogsShape,
  }, handleListSyncLogs);

  registerStringTool(server, client, 'get_sync_log', {
    description: 'Get a sync-log entry by ID.',
    inputSchema: getSyncLogShape,
  }, handleGetSyncLog);
}
