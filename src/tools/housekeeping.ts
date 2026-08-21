// Housekeeping tool registrations: connectors, view-log CRUD, search
// preferences, localization, groups, users, meal-plan iCal, recipe file
// metadata.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
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
  handleGetRecipeFileMetadata,
} from '../handlers/housekeeping.js';

const connectorTypeEnum = z.enum(['HomeAssistant']);
const searchEnum = z.enum(['PLAIN', 'PHRASE', 'RAW', 'WEB', 'FUZZY']);

// ---------- Connector-config ----------

export const listConnectorsShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getConnectorShape = { id: z.number(), format: formatEnum } as const;

export const createConnectorShape = {
  name: z.string(),
  type: connectorTypeEnum,
  url: z.string().nullable().optional(),
  token: z.string().nullable().optional(),
  todo_entity: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  on_shopping_list_entry_created_enabled: z.boolean().optional(),
  on_shopping_list_entry_updated_enabled: z.boolean().optional(),
  on_shopping_list_entry_deleted_enabled: z.boolean().optional(),
  supports_description_field: z.boolean().optional(),
  format: formatEnum,
} as const;

export const updateConnectorShape = {
  id: z.number(),
  name: z.string().optional(),
  type: connectorTypeEnum.optional(),
  url: z.string().nullable().optional(),
  token: z.string().nullable().optional(),
  todo_entity: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  on_shopping_list_entry_created_enabled: z.boolean().optional(),
  on_shopping_list_entry_updated_enabled: z.boolean().optional(),
  on_shopping_list_entry_deleted_enabled: z.boolean().optional(),
  supports_description_field: z.boolean().optional(),
  format: formatEnum,
} as const;

export const deleteConnectorShape = { id: z.number() } as const;

// ---------- View-log ----------

export const getViewLogShape = { id: z.number(), format: formatEnum } as const;
export const updateViewLogShape = {
  id: z.number(),
  recipe: z.number().optional(),
  format: formatEnum,
} as const;
export const deleteViewLogShape = { id: z.number() } as const;

// ---------- Search preferences ----------

export const listSearchFieldsShape = { format: formatEnum } as const;
export const listSearchPreferencesShape = { format: formatEnum } as const;
export const updateSearchPreferenceShape = {
  user: z.number(),
  search: searchEnum.optional(),
  lookup: z.boolean().optional(),
  unaccent: z.array(z.number()).optional(),
  icontains: z.array(z.number()).optional(),
  istartswith: z.array(z.number()).optional(),
  trigram: z.array(z.number()).optional(),
  fulltext: z.array(z.number()).optional(),
  trigram_threshold: z.number().optional(),
  format: formatEnum,
} as const;

// ---------- Localization ----------

export const getLocalizationShape = {} as const;

// ---------- Groups ----------

export const listGroupsShape = { format: formatEnum } as const;
export const getGroupShape = { id: z.number(), format: formatEnum } as const;

// ---------- Users ----------

export const listUsersShape = {
  filter_list: z.array(z.number()).optional().describe('User IDs to filter to'),
  format: formatEnum,
} as const;
export const getUserShape = { id: z.number(), format: formatEnum } as const;
export const updateUserShape = {
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  format: formatEnum,
} as const;

// ---------- Meal-plan iCal ----------

export const exportMealPlanIcalShape = {
  from_date: z.string().optional().describe('YYYY-MM-DD inclusive'),
  to_date: z.string().optional().describe('YYYY-MM-DD inclusive'),
  meal_type: z.array(z.number()).optional(),
} as const;

// ---------- Recipe file / external link ----------

export const getExternalRecipeFileLinkShape = { id: z.number() } as const;
export const getRecipeFileMetadataShape = { id: z.number() } as const;

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
export type GetRecipeFileMetadataArgs = z.infer<z.ZodObject<typeof getRecipeFileMetadataShape>>;

export function registerHousekeepingTools(server: McpServer, client: TandoorClient): void {
  // ---------- Connector-config ----------

  registerStringTool(server, client, 'list_connectors', {
    description: "List external connector configurations (Home Assistant / MQTT / etc). Paginated. Connector token redacted in slim; use format='full' to reveal.",
    inputSchema: listConnectorsShape,
  }, handleListConnectors);

  registerStringTool(server, client, 'get_connector', {
    description: "Get a connector configuration by ID. Connector token redacted in slim; use format='full' to reveal.",
    inputSchema: getConnectorShape,
  }, handleGetConnector);

  registerStringTool(server, client, 'create_connector', {
    description: 'Create a connector configuration. Required: name, type (currently only HomeAssistant). Optional: url, token, todo_entity, enabled, per-event toggles.',
    inputSchema: createConnectorShape,
  }, handleCreateConnector);

  registerStringTool(server, client, 'update_connector', {
    description: "Update a connector configuration (PATCH). Required: id. Connector token redacted in slim; use format='full' to reveal.",
    inputSchema: updateConnectorShape,
  }, handleUpdateConnector);

  registerStringTool(server, client, 'delete_connector', {
    description: 'Delete a connector configuration by ID.',
    inputSchema: deleteConnectorShape,
  }, handleDeleteConnector);

  // ---------- View-log ----------

  registerStringTool(server, client, 'get_view_log', {
    description: 'Get a recipe view-log entry by ID.',
    inputSchema: getViewLogShape,
  }, handleGetViewLog);

  registerStringTool(server, client, 'update_view_log', {
    description: 'Update a view-log entry (PATCH). Required: id. Typically used to correct the linked recipe.',
    inputSchema: updateViewLogShape,
  }, handleUpdateViewLog);

  registerStringTool(server, client, 'delete_view_log', {
    description: 'Delete a view-log entry by ID.',
    inputSchema: deleteViewLogShape,
  }, handleDeleteViewLog);

  // ---------- Search preferences ----------

  registerStringTool(server, client, 'list_search_fields', {
    description: 'List available searchable fields (used when configuring search preferences).',
    inputSchema: listSearchFieldsShape,
  }, handleListSearchFields);

  registerStringTool(server, client, 'list_search_preferences', {
    description: 'List search preferences (typically just the current user).',
    inputSchema: listSearchPreferencesShape,
  }, handleListSearchPreferences);

  registerStringTool(server, client, 'update_search_preference', {
    description: 'Update a user\'s search preference (PATCH). Required: user (id). Field arrays (unaccent, icontains, istartswith, trigram, fulltext) accept SearchFields IDs.',
    inputSchema: updateSearchPreferenceShape,
  }, handleUpdateSearchPreference);

  // ---------- Localization ----------

  registerStringTool(server, client, 'get_localization', {
    description: 'Fetch the list of available Tandoor UI languages (code + display name).',
    inputSchema: getLocalizationShape,
  }, handleGetLocalization);

  // ---------- Groups ----------

  registerStringTool(server, client, 'list_groups', {
    description: 'List permission groups defined on the Tandoor server.',
    inputSchema: listGroupsShape,
  }, handleListGroups);

  registerStringTool(server, client, 'get_group', {
    description: 'Get a permission group by ID.',
    inputSchema: getGroupShape,
  }, handleGetGroup);

  // ---------- Users ----------

  registerStringTool(server, client, 'list_users', {
    description: 'List users visible to the current user. Optional filter_list of user IDs.',
    inputSchema: listUsersShape,
  }, handleListUsers);

  registerStringTool(server, client, 'get_user', {
    description: 'Get a user by ID.',
    inputSchema: getUserShape,
  }, handleGetUser);

  registerStringTool(server, client, 'update_user', {
    description: 'Update a user (PATCH). Required: id. Writable fields: first_name, last_name (username / staff flags are read-only).',
    inputSchema: updateUserShape,
  }, handleUpdateUser);

  // ---------- Meal-plan iCal ----------

  registerStringTool(server, client, 'export_meal_plan_ical', {
    description: 'Export meal plans as an iCalendar (.ics) feed. Returns raw text/calendar body. Optional: from_date, to_date (YYYY-MM-DD, inclusive), meal_type (IDs).',
    inputSchema: exportMealPlanIcalShape,
  }, handleExportMealPlanIcal);

  // ---------- Recipe file / external link ----------

  registerStringTool(server, client, 'get_external_recipe_file_link', {
    description: 'Fetch a shareable external link for a recipe file (Storage-backed uploads such as Nextcloud). Returns link metadata only, not the binary.',
    inputSchema: getExternalRecipeFileLinkShape,
  }, handleGetExternalRecipeFileLink);

  registerStringTool(server, client, 'get_recipe_file_metadata', {
    description: 'Fetch metadata for a recipe file attachment by ID. Does not return the binary; use the UI download link for that.',
    inputSchema: getRecipeFileMetadataShape,
  }, handleGetRecipeFileMetadata);
}
