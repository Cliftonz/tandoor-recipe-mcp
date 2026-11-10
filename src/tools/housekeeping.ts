// Housekeeping tool registrations: connectors, view-log CRUD, search
// preferences, localization, groups, users, meal-plan iCal, recipe file
// metadata.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import { INLINE_CAP_BYTES } from '../lib/download.js';
import {
  handleListConnectors,
  handleGetConnector,
  handleCreateConnector,
  handleUpdateConnector,
  handleDeleteConnector,
  handleGetViewLog,
  handleUpdateViewLog,
  handleDeleteViewLog,
  handleListSearchFields,
  handleListSearchPreferences,
  handleUpdateSearchPreference,
  handleGetLocalization,
  handleListGroups,
  handleGetGroup,
  handleListUsers,
  handleGetUser,
  handleUpdateUser,
  handleExportMealPlanIcal,
  handleGetExternalRecipeFileLink,
  handleDownloadRecipeFile,
} from '../handlers/housekeeping.js';

const INLINE_CAP_MIB = INLINE_CAP_BYTES / 1024 / 1024;

const connectorTypeEnum = z.enum(['HomeAssistant']);
const searchEnum = z.enum(['PLAIN', 'PHRASE', 'RAW', 'WEB', 'FUZZY']);

// ---------- Connector-config ----------

export const listConnectorsShape = {
  page: z.number().optional().describe('1-based page number.'),
  page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'),
  format: formatEnum,
} as const;

export const getConnectorShape = { id: z.number().describe('Connector ID from list_connectors.'), format: formatEnum } as const;

export const createConnectorShape = {
  name: z.string().describe('Display name.'),
  type: connectorTypeEnum.describe('Connector type; only HomeAssistant exists.'),
  url: z.string().nullable().optional().describe('Home Assistant base URL.'),
  token: z.string().nullable().optional().describe('Home Assistant access token; write-only in Tandoor.'),
  todo_entity: z.string().nullable().optional().describe('Home Assistant to-do entity ID, e.g. todo.shopping_list.'),
  enabled: z.boolean().optional().describe('Turn the connector on or off. Default true.'),
  on_shopping_list_entry_created_enabled: z.boolean().optional().describe('Push new shopping entries. Default false.'),
  on_shopping_list_entry_updated_enabled: z.boolean().optional().describe('Push shopping entry updates. Default false.'),
  on_shopping_list_entry_deleted_enabled: z.boolean().optional().describe('Push shopping entry deletions. Default false.'),
  supports_description_field: z.boolean().optional().describe('Whether the to-do entity accepts a description. Default true.'),
  format: formatEnum,
} as const;

export const updateConnectorShape = {
  id: z.number().describe('Connector ID from list_connectors.'),
  name: z.string().optional().describe('Display name.'),
  type: connectorTypeEnum.optional().describe('Connector type; only HomeAssistant exists.'),
  url: z.string().nullable().optional().describe('Home Assistant base URL.'),
  token: z.string().nullable().optional().describe('Home Assistant access token; write-only in Tandoor.'),
  todo_entity: z.string().nullable().optional().describe('Home Assistant to-do entity ID, e.g. todo.shopping_list.'),
  enabled: z.boolean().optional().describe('Turn the connector on or off. Default true.'),
  on_shopping_list_entry_created_enabled: z.boolean().optional().describe('Push new shopping entries. Default false.'),
  on_shopping_list_entry_updated_enabled: z.boolean().optional().describe('Push shopping entry updates. Default false.'),
  on_shopping_list_entry_deleted_enabled: z.boolean().optional().describe('Push shopping entry deletions. Default false.'),
  supports_description_field: z.boolean().optional().describe('Whether the to-do entity accepts a description. Default true.'),
  format: formatEnum,
} as const;

export const deleteConnectorShape = { id: z.number().describe('Connector ID from list_connectors.') } as const;

// ---------- View-log ----------

export const getViewLogShape = { id: z.number().describe('View log ID from list_view_logs.'), format: formatEnum } as const;
export const updateViewLogShape = {
  id: z.number().describe('View log ID from list_view_logs.'),
  recipe: z.number().optional().describe('Recipe ID to link the entry to.'),
  format: formatEnum,
} as const;
export const deleteViewLogShape = { id: z.number().describe('View log ID from list_view_logs.') } as const;

// ---------- Search preferences ----------

export const listSearchFieldsShape = { format: formatEnum } as const;
export const listSearchPreferencesShape = { format: formatEnum } as const;
export const updateSearchPreferenceShape = {
  user: z.number().describe('Your own user ID; Tandoor only exposes the caller\'s preference.'),
  search: searchEnum.optional().describe('Full-text search method.'),
  lookup: z.boolean().optional().describe('Fuzzy search toggle.'),
  unaccent: z.array(z.number()).optional().describe('Accent-insensitive field IDs from list_search_fields.'),
  icontains: z.array(z.number()).optional().describe('Partial-match field IDs from list_search_fields.'),
  istartswith: z.array(z.number()).optional().describe('Starts-with field IDs from list_search_fields.'),
  trigram: z.array(z.number()).optional().describe('Fuzzy-match field IDs from list_search_fields.'),
  fulltext: z.array(z.number()).optional().describe('Full-text field IDs from list_search_fields.'),
  trigram_threshold: z.number().optional().describe('Fuzzy match threshold; lower matches more. Default 0.2.'),
  format: formatEnum,
} as const;

// ---------- Localization ----------

export const getLocalizationShape = {} as const;

// ---------- Groups ----------

export const listGroupsShape = { format: formatEnum } as const;
export const getGroupShape = { id: z.number().describe('Group ID from list_groups.'), format: formatEnum } as const;

// ---------- Users ----------

export const listUsersShape = {
  filter_list: z.array(z.number()).optional().describe('User IDs to filter to'),
  format: formatEnum,
} as const;
export const getUserShape = { id: z.number().describe('User ID from list_users.'), format: formatEnum } as const;
export const updateUserShape = {
  id: z.number().describe('User ID from list_users.'),
  first_name: z.string().optional().describe('Given name.'),
  last_name: z.string().optional().describe('Family name.'),
  format: formatEnum,
} as const;

// ---------- Meal-plan iCal ----------

export const exportMealPlanIcalShape = {
  from_date: z.string().optional().describe('YYYY-MM-DD inclusive'),
  to_date: z.string().optional().describe('YYYY-MM-DD inclusive'),
  meal_type: z.array(z.number()).optional().describe('Meal type IDs to include; omit for all.'),
} as const;

// ---------- Recipe file / external link ----------

export const getExternalRecipeFileLinkShape = { id: z.number().describe('Recipe ID') } as const;
export const downloadRecipeFileShape = {
  recipe_id: z.number().describe('Recipe ID'),
  save: z.boolean().optional().describe(`Save to TANDOOR_MCP_DOWNLOAD_ROOT instead of returning the file inline (needed above ${INLINE_CAP_MIB} MiB; stdio only).`),
} as const;

// ---------- Inferred types ----------

export type ListConnectorsArgs = z.infer<z.ZodObject<typeof listConnectorsShape>>;
export type GetConnectorArgs = z.infer<z.ZodObject<typeof getConnectorShape>>;
export type CreateConnectorArgs = z.infer<z.ZodObject<typeof createConnectorShape>>;
export type UpdateConnectorArgs = z.infer<z.ZodObject<typeof updateConnectorShape>>;
export type DeleteConnectorArgs = z.infer<z.ZodObject<typeof deleteConnectorShape>>;
export type GetViewLogArgs = z.infer<z.ZodObject<typeof getViewLogShape>>;
export type UpdateViewLogArgs = z.infer<z.ZodObject<typeof updateViewLogShape>>;
export type DeleteViewLogArgs = z.infer<z.ZodObject<typeof deleteViewLogShape>>;
export type ListSearchFieldsArgs = z.infer<z.ZodObject<typeof listSearchFieldsShape>>;
export type ListSearchPreferencesArgs = z.infer<z.ZodObject<typeof listSearchPreferencesShape>>;
export type UpdateSearchPreferenceArgs = z.infer<z.ZodObject<typeof updateSearchPreferenceShape>>;
export type GetLocalizationArgs = z.infer<z.ZodObject<typeof getLocalizationShape>>;
export type ListGroupsArgs = z.infer<z.ZodObject<typeof listGroupsShape>>;
export type GetGroupArgs = z.infer<z.ZodObject<typeof getGroupShape>>;
export type ListUsersArgs = z.infer<z.ZodObject<typeof listUsersShape>>;
export type GetUserArgs = z.infer<z.ZodObject<typeof getUserShape>>;
export type UpdateUserArgs = z.infer<z.ZodObject<typeof updateUserShape>>;
export type ExportMealPlanIcalArgs = z.infer<z.ZodObject<typeof exportMealPlanIcalShape>>;
export type GetExternalRecipeFileLinkArgs = z.infer<z.ZodObject<typeof getExternalRecipeFileLinkShape>>;
export type DownloadRecipeFileArgs = z.infer<z.ZodObject<typeof downloadRecipeFileShape>>;

export function registerHousekeepingTools(server: McpServer, client: TandoorClient): void {
  // ---------- Connector-config ----------

  registerStringTool(server, client, 'list_connectors', {
    title: 'List connectors',
    annotations: READ,
    description: "List external connector configurations (Home Assistant / MQTT / etc). Paginated. Connector token redacted in slim; use format='full' to reveal.",
    inputSchema: listConnectorsShape,
  }, handleListConnectors);

  registerStringTool(server, client, 'get_connector', {
    title: 'Get connector',
    annotations: { ...READ, readOnlyHint: false },
    description: "Get a connector configuration by ID. Connector token redacted in slim; use format='full' to reveal.",
    inputSchema: getConnectorShape,
  }, handleGetConnector);

  registerStringTool(server, client, 'create_connector', {
    title: 'Create connector',
    annotations: CREATE,
    description: 'Create a connector configuration. Required: name, type (currently only HomeAssistant). Optional: url, token, todo_entity, enabled, per-event toggles.',
    inputSchema: createConnectorShape,
  }, handleCreateConnector);

  registerStringTool(server, client, 'update_connector', {
    title: 'Update connector',
    annotations: UPDATE,
    description: "Update a connector configuration (PATCH). Required: id. Connector token redacted in slim; use format='full' to reveal.",
    inputSchema: updateConnectorShape,
  }, handleUpdateConnector);

  registerStringTool(server, client, 'delete_connector', {
    title: 'Delete connector',
    annotations: DELETE,
    description: 'Delete a connector configuration by ID.',
    inputSchema: deleteConnectorShape,
  }, handleDeleteConnector);

  // ---------- View-log ----------

  registerStringTool(server, client, 'get_view_log', {
    title: 'Get view log',
    annotations: READ,
    description: 'Get a recipe view-log entry by ID.',
    inputSchema: getViewLogShape,
  }, handleGetViewLog);

  registerStringTool(server, client, 'update_view_log', {
    title: 'Update view log',
    annotations: UPDATE,
    description: 'Update a view-log entry (PATCH). Required: id. Typically used to correct the linked recipe.',
    inputSchema: updateViewLogShape,
  }, handleUpdateViewLog);

  registerStringTool(server, client, 'delete_view_log', {
    title: 'Delete view log',
    annotations: DELETE,
    description: 'Delete a view-log entry by ID.',
    inputSchema: deleteViewLogShape,
  }, handleDeleteViewLog);

  // ---------- Search preferences ----------

  registerStringTool(server, client, 'list_search_fields', {
    title: 'List search fields',
    annotations: READ,
    description: 'List available searchable fields (used when configuring search preferences).',
    inputSchema: listSearchFieldsShape,
  }, handleListSearchFields);

  registerStringTool(server, client, 'list_search_preferences', {
    title: 'List search preferences',
    annotations: READ,
    description: 'List search preferences (typically just the current user).',
    inputSchema: listSearchPreferencesShape,
  }, handleListSearchPreferences);

  registerStringTool(server, client, 'update_search_preference', {
    title: 'Update search preference',
    annotations: UPDATE,
    description: 'Update a user\'s search preference (PATCH). Required: user (id). Field arrays (unaccent, icontains, istartswith, trigram, fulltext) accept SearchFields IDs.',
    inputSchema: updateSearchPreferenceShape,
  }, handleUpdateSearchPreference);

  // ---------- Localization ----------

  registerStringTool(server, client, 'get_localization', {
    title: 'Get localization',
    annotations: READ,
    description: 'Fetch the list of available Tandoor UI languages (code + display name).',
    inputSchema: getLocalizationShape,
  }, handleGetLocalization);

  // ---------- Groups ----------

  registerStringTool(server, client, 'list_groups', {
    title: 'List groups',
    annotations: READ,
    description: 'List permission groups defined on the Tandoor server.',
    inputSchema: listGroupsShape,
  }, handleListGroups);

  registerStringTool(server, client, 'get_group', {
    title: 'Get group',
    annotations: READ,
    description: 'Get a permission group by ID.',
    inputSchema: getGroupShape,
  }, handleGetGroup);

  // ---------- Users ----------

  registerStringTool(server, client, 'list_users', {
    title: 'List users',
    annotations: READ,
    description: 'List users visible to the current user. Optional filter_list of user IDs.',
    inputSchema: listUsersShape,
  }, handleListUsers);

  registerStringTool(server, client, 'get_user', {
    title: 'Get user',
    annotations: READ,
    description: 'Get a user by ID.',
    inputSchema: getUserShape,
  }, handleGetUser);

  registerStringTool(server, client, 'update_user', {
    title: 'Update user',
    annotations: UPDATE,
    description: 'Update a user (PATCH). Required: id. Writable fields: first_name, last_name (username / staff flags are read-only).',
    inputSchema: updateUserShape,
  }, handleUpdateUser);

  // ---------- Meal-plan iCal ----------

  registerStringTool(server, client, 'export_meal_plan_ical', {
    title: 'Export meal plans as iCal',
    annotations: READ,
    description: 'Export meal plans as an iCalendar (.ics) feed. Returns raw text/calendar body. Optional: from_date, to_date (YYYY-MM-DD, inclusive), meal_type (IDs).',
    inputSchema: exportMealPlanIcalShape,
  }, handleExportMealPlanIcal);

  // ---------- Recipe file / external link ----------

  registerStringTool(server, client, 'get_external_recipe_file_link', {
    title: 'Get external recipe file link',
    annotations: { ...READ, readOnlyHint: false },
    description: 'Get the public share link for a recipe whose file lives on an external storage backend (Nextcloud or Dropbox). Takes a recipe id and returns the link as plain text. The first call for a recipe may create a public share link on the storage backend and save it to the recipe.',
    inputSchema: getExternalRecipeFileLinkShape,
  }, handleGetExternalRecipeFileLink);

  registerStringTool(server, client, 'download_recipe_file', {
    title: 'Download recipe file',
    annotations: { ...READ, readOnlyHint: false, idempotentHint: false },
    description: `Download the file Tandoor stored for a recipe synced from a Storage backend (Dropbox, Nextcloud or Local). Images come back as an image, other files as an embedded resource, up to ${INLINE_CAP_MIB} MiB. Larger files need save: true.`,
    inputSchema: downloadRecipeFileShape,
  }, handleDownloadRecipeFile);
}
