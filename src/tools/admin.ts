// Share links, user prefs, automations, user-files, activity logs, ai-properties.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import {
  handleGetShareLink,
  handleListUserPreferences,
  handleGetUserPreference,
  handleUpdateUserPreference,
  handleListAutomations,
  handleGetAutomation,
  handleCreateAutomation,
  handleUpdateAutomation,
  handleDeleteAutomation,
  handleListUserFiles,
  handleGetUserFile,
  handleUploadUserFile,
  handleUpdateUserFile,
  handleDeleteUserFile,
  handleListViewLogs,
  handleListImportLogs,
  handleListAiLogs,
  handleFoodAiProperties,
  handleRecipeAiProperties,
  handleGetServerSettings,
} from '../handlers/admin.js';

const formatEnum = z.enum(['slim', 'full']).optional();

const automationTypeEnum = z.enum([
  'FOOD_ALIAS', 'UNIT_ALIAS', 'KEYWORD_ALIAS',
  'DESCRIPTION_REPLACE', 'INSTRUCTION_REPLACE',
  'NEVER_UNIT', 'TRANSPOSE_WORDS',
  'FOOD_REPLACE', 'UNIT_REPLACE', 'NAME_REPLACE',
]);

// ---------- Shapes ----------

export const getShareLinkShape = { id: z.number() } as const;

export const listUserPreferencesShape = { format: formatEnum } as const;
export const getUserPreferenceShape = { user_id: z.number(), format: formatEnum } as const;
export const updateUserPreferenceShape = {
  user_id: z.number(),
  theme: z.string().optional(),
  default_page: z.enum(['SEARCH', 'PLAN', 'BOOKS', 'SHOPPING']).optional(),
  default_unit: z.string().optional(),
  use_fractions: z.boolean().optional(),
  use_kj: z.boolean().optional(),
  comments: z.boolean().optional(),
  ingredient_decimals: z.number().optional(),
  shopping_auto_sync: z.number().optional(),
  shopping_recent_days: z.number().optional(),
  shopping_add_onhand: z.boolean().optional(),
  mealplan_autoadd_shopping: z.boolean().optional(),
  mealplan_autoinclude_related: z.boolean().optional(),
  mealplan_autoexclude_onhand: z.boolean().optional(),
  filter_to_supermarket: z.boolean().optional(),
  left_handed: z.boolean().optional(),
  plan_share_user_ids: z.array(z.number()).optional(),
  shopping_share_user_ids: z.array(z.number()).optional(),
  format: formatEnum,
} as const;

export const listAutomationsShape = { page: z.number().optional(), page_size: z.number().optional(), format: formatEnum } as const;
export const getAutomationShape = { id: z.number(), format: formatEnum } as const;
export const createAutomationShape = {
  type: automationTypeEnum,
  name: z.string().optional(),
  description: z.string().optional(),
  param_1: z.string().optional(),
  param_2: z.string().optional(),
  param_3: z.string().optional(),
  order: z.number().optional(),
  disabled: z.boolean().optional(),
  format: formatEnum,
} as const;
export const updateAutomationShape = {
  id: z.number(),
  type: automationTypeEnum.optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  param_1: z.string().optional(),
  param_2: z.string().optional(),
  param_3: z.string().optional(),
  order: z.number().optional(),
  disabled: z.boolean().optional(),
  format: formatEnum,
} as const;
export const deleteAutomationShape = { id: z.number() } as const;

export const listUserFilesShape = {
  query: z.string().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;
export const getUserFileShape = { id: z.number(), format: formatEnum } as const;
export const uploadUserFileShape = {
  name: z.string(),
  file_path: z.string().optional(),
  file_url: z.string().optional(),
  format: formatEnum,
} as const;
export const updateUserFileShape = { id: z.number(), name: z.string(), format: formatEnum } as const;
export const deleteUserFileShape = { id: z.number() } as const;

export const listViewLogsShape = { page: z.number().optional(), page_size: z.number().optional(), format: formatEnum } as const;
export const listImportLogsShape = { page: z.number().optional(), page_size: z.number().optional(), format: formatEnum } as const;
export const listAiLogsShape = { page: z.number().optional(), page_size: z.number().optional(), format: formatEnum } as const;

export const foodAiPropertiesShape = {
  id: z.number(),
  provider: z.number().optional().describe('AI provider ID (defaults to workspace default)'),
  format: formatEnum,
} as const;
export const recipeAiPropertiesShape = {
  id: z.number(),
  provider: z.number().optional(),
  format: formatEnum,
} as const;

export const getServerSettingsShape = {} as const;

// ---------- Inferred types ----------
export type GetShareLinkArgs = z.infer<z.ZodObject<typeof getShareLinkShape>>;
export type ListUserPreferencesArgs = z.infer<z.ZodObject<typeof listUserPreferencesShape>>;
export type GetUserPreferenceArgs = z.infer<z.ZodObject<typeof getUserPreferenceShape>>;
export type UpdateUserPreferenceArgs = z.infer<z.ZodObject<typeof updateUserPreferenceShape>>;
export type ListAutomationsArgs = z.infer<z.ZodObject<typeof listAutomationsShape>>;
export type GetAutomationArgs = z.infer<z.ZodObject<typeof getAutomationShape>>;
export type CreateAutomationArgs = z.infer<z.ZodObject<typeof createAutomationShape>>;
export type UpdateAutomationArgs = z.infer<z.ZodObject<typeof updateAutomationShape>>;
export type DeleteAutomationArgs = z.infer<z.ZodObject<typeof deleteAutomationShape>>;
export type ListUserFilesArgs = z.infer<z.ZodObject<typeof listUserFilesShape>>;
export type GetUserFileArgs = z.infer<z.ZodObject<typeof getUserFileShape>>;
export type UploadUserFileArgs = z.infer<z.ZodObject<typeof uploadUserFileShape>>;
export type UpdateUserFileArgs = z.infer<z.ZodObject<typeof updateUserFileShape>>;
export type DeleteUserFileArgs = z.infer<z.ZodObject<typeof deleteUserFileShape>>;
export type ListViewLogsArgs = z.infer<z.ZodObject<typeof listViewLogsShape>>;
export type ListImportLogsArgs = z.infer<z.ZodObject<typeof listImportLogsShape>>;
export type ListAiLogsArgs = z.infer<z.ZodObject<typeof listAiLogsShape>>;
export type FoodAiPropertiesArgs = z.infer<z.ZodObject<typeof foodAiPropertiesShape>>;
export type RecipeAiPropertiesArgs = z.infer<z.ZodObject<typeof recipeAiPropertiesShape>>;
export type GetServerSettingsArgs = z.infer<z.ZodObject<typeof getServerSettingsShape>>;

export function registerAdminTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'get_share_link', {
    description: 'Retrieve an existing share link by ID. Note: Tandoor\'s REST API does not expose create/list/delete for share links — create them via the web UI.',
    inputSchema: getShareLinkShape,
  }, handleGetShareLink);

  registerStringTool(server, client, 'list_user_preferences', {
    description: 'List user preferences (typically just the current user).',
    inputSchema: listUserPreferencesShape,
  }, handleListUserPreferences);

  registerStringTool(server, client, 'get_user_preference', {
    description: 'Get preferences for a user by their user ID.',
    inputSchema: getUserPreferenceShape,
  }, handleGetUserPreference);

  registerStringTool(server, client, 'update_user_preference', {
    description: 'Update user preferences (PATCH). Required: user_id. Common fields: theme, default_page (SEARCH/PLAN/BOOKS/SHOPPING), default_unit, use_fractions, use_kj, comments, ingredient_decimals, shopping_auto_sync, shopping_recent_days, mealplan_autoadd_shopping, mealplan_autoinclude_related, mealplan_autoexclude_onhand, filter_to_supermarket, left_handed, plan_share_user_ids[], shopping_share_user_ids[].',
    inputSchema: updateUserPreferenceShape,
  }, handleUpdateUserPreference);

  registerStringTool(server, client, 'list_automations', {
    description: 'List automation rules (auto-apply keyword aliases, food aliases, replace rules, etc.).',
    inputSchema: listAutomationsShape,
  }, handleListAutomations);

  registerStringTool(server, client, 'get_automation', {
    description: 'Get automation rule by ID.',
    inputSchema: getAutomationShape,
  }, handleGetAutomation);

  registerStringTool(server, client, 'create_automation', {
    description: 'Create an automation rule. Required: type (FOOD_ALIAS/UNIT_ALIAS/KEYWORD_ALIAS/DESCRIPTION_REPLACE/INSTRUCTION_REPLACE/NEVER_UNIT/TRANSPOSE_WORDS/FOOD_REPLACE/UNIT_REPLACE/NAME_REPLACE). params: param_1/2/3 carry rule-specific args (e.g. alias → canonical).',
    inputSchema: createAutomationShape,
  }, handleCreateAutomation);

  registerStringTool(server, client, 'update_automation', {
    description: 'Update automation (PATCH). Required: id.',
    inputSchema: updateAutomationShape,
  }, handleUpdateAutomation);

  registerStringTool(server, client, 'delete_automation', {
    description: 'Delete automation by ID.',
    inputSchema: deleteAutomationShape,
  }, handleDeleteAutomation);

  registerStringTool(server, client, 'list_user_files', {
    description: 'List user-uploaded files (step attachments, etc.).',
    inputSchema: listUserFilesShape,
  }, handleListUserFiles);

  registerStringTool(server, client, 'get_user_file', {
    description: 'Get user file metadata by ID.',
    inputSchema: getUserFileShape,
  }, handleGetUserFile);

  registerStringTool(server, client, 'upload_user_file', {
    description: 'Upload a user file. Required: name. Provide exactly one of file_path (local) or file_url (we fetch and upload bytes).',
    inputSchema: uploadUserFileShape,
  }, handleUploadUserFile);

  registerStringTool(server, client, 'update_user_file', {
    description: 'Rename a user file (PATCH). Required: id, name.',
    inputSchema: updateUserFileShape,
  }, handleUpdateUserFile);

  registerStringTool(server, client, 'delete_user_file', {
    description: 'Delete a user file by ID.',
    inputSchema: deleteUserFileShape,
  }, handleDeleteUserFile);

  registerStringTool(server, client, 'list_view_logs', {
    description: 'List recipe view-log entries (which recipes have been viewed and when).',
    inputSchema: listViewLogsShape,
  }, handleListViewLogs);

  registerStringTool(server, client, 'list_import_logs', {
    description: 'List import-log entries (URL/AI/bookmarklet import history).',
    inputSchema: listImportLogsShape,
  }, handleListImportLogs);

  registerStringTool(server, client, 'list_ai_logs', {
    description: 'List AI-log entries (AI usage history + credit cost).',
    inputSchema: listAiLogsShape,
  }, handleListAiLogs);

  registerStringTool(server, client, 'food_ai_properties', {
    description: 'Enrich a food with AI-generated properties (fallback path when USDA FDC is incomplete).',
    inputSchema: foodAiPropertiesShape,
  }, handleFoodAiProperties);

  registerStringTool(server, client, 'recipe_ai_properties', {
    description: 'Have AI compute nutrition/properties for a recipe.',
    inputSchema: recipeAiPropertiesShape,
  }, handleRecipeAiProperties);

  registerStringTool(server, client, 'get_server_settings', {
    description: 'Fetch current Tandoor server settings (feature flags, limits). Useful to check whether AI, sharing, or open-data import are enabled before calling those tools.',
    inputSchema: getServerSettingsShape,
  }, handleGetServerSettings);
}
