import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
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
  page: z.number().optional().describe('1-based page number.'),
  page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'),
  format: formatEnum,
} as const;

export const getSyncShape = { id: z.number().describe('Sync ID from list_syncs.'), format: formatEnum } as const;

export const createSyncShape = {
  storage_id: z.number().describe('Storage ID from list_storages.'),
  path: z.string().describe('Folder path on the storage backend to import from.'),
  active: z.boolean().optional().describe('Included in Tandoor\'s sync-all run. Default true.'),
  last_checked: z.string().nullable().optional().describe('ISO 8601 datetime of the last scan; null if never.'),
  format: formatEnum,
} as const;

export const updateSyncShape = {
  id: z.number().describe('Sync ID from list_syncs.'),
  storage_id: z.number().optional().describe('Storage ID from list_storages.'),
  path: z.string().optional().describe('Folder path on the storage backend to import from.'),
  active: z.boolean().optional().describe('Included in Tandoor\'s sync-all run.'),
  last_checked: z.string().nullable().optional().describe('ISO 8601 datetime of the last scan; null if never.'),
  format: formatEnum,
} as const;

export const deleteSyncShape = { id: z.number().describe('Sync ID from list_syncs.') } as const;

export const querySyncedFolderShape = { id: z.number().describe('Sync ID from list_syncs.'), format: formatEnum } as const;

export const listSyncLogsShape = {
  page: z.number().optional().describe('1-based page number.'),
  page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'),
  format: formatEnum,
} as const;

export const getSyncLogShape = { id: z.number().describe('Sync log ID from list_sync_logs.'), format: formatEnum } as const;

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
    title: 'List syncs',
    annotations: READ,
    description: 'List folder-to-storage syncs. Optional: page, page_size.',
    inputSchema: listSyncsShape,
  }, handleListSyncs);

  registerStringTool(server, client, 'get_sync', {
    title: 'Get sync',
    annotations: READ,
    description: 'Get a sync by ID.',
    inputSchema: getSyncShape,
  }, handleGetSync);

  registerStringTool(server, client, 'create_sync', {
    title: 'Create sync',
    annotations: CREATE,
    description: 'Create a sync linking a storage backend to a folder path. Required: storage_id, path. Optional: active, last_checked.',
    inputSchema: createSyncShape,
  }, handleCreateSync);

  registerStringTool(server, client, 'update_sync', {
    title: 'Update sync',
    annotations: UPDATE,
    description: 'Update a sync (PATCH). Required: id.',
    inputSchema: updateSyncShape,
  }, handleUpdateSync);

  registerStringTool(server, client, 'delete_sync', {
    title: 'Delete sync',
    annotations: DELETE,
    description: 'Delete a sync by ID.',
    inputSchema: deleteSyncShape,
  }, handleDeleteSync);

  registerStringTool(server, client, 'query_synced_folder', {
    title: 'Scan synced folder',
    annotations: CREATE,
    description: 'Trigger Tandoor to list files at the storage folder for the given sync. Required: id.',
    inputSchema: querySyncedFolderShape,
  }, handleQuerySyncedFolder);

  registerStringTool(server, client, 'list_sync_logs', {
    title: 'List sync logs',
    annotations: READ,
    description: 'List sync-log entries (read-only). Optional: page, page_size.',
    inputSchema: listSyncLogsShape,
  }, handleListSyncLogs);

  registerStringTool(server, client, 'get_sync_log', {
    title: 'Get sync log',
    annotations: READ,
    description: 'Get a sync-log entry by ID.',
    inputSchema: getSyncLogShape,
  }, handleGetSyncLog);
}
