// Share links, user prefs, automations, user-files, activity logs, ai-properties.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
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
  handleDownloadFile,
  handleListViewLogs,
  handleListImportLogs,
  handleListAiLogs,
  handleFoodAiProperties,
  handleRecipeAiProperties,
  handleGetServerSettings,
} from '../handlers/admin.js';


const automationTypeEnum = z.enum([
  'FOOD_ALIAS', 'UNIT_ALIAS', 'KEYWORD_ALIAS',
  'DESCRIPTION_REPLACE', 'INSTRUCTION_REPLACE',
  'NEVER_UNIT', 'TRANSPOSE_WORDS',
  'FOOD_REPLACE', 'UNIT_REPLACE', 'NAME_REPLACE',
]);

// ---------- Shapes ----------

export const getShareLinkShape = { id: z.number().describe('Share link ID.') } as const;

export const listUserPreferencesShape = { format: formatEnum } as const;
export const getUserPreferenceShape = { user_id: z.number().describe('Your own user ID; Tandoor only exposes the caller\'s preferences.'), format: formatEnum } as const;
export const updateUserPreferenceShape = {
  user_id: z.number().describe('Your own user ID; Tandoor only exposes the caller\'s preferences.'),
  theme: z.string().optional().describe('TANDOOR, BOOTSTRAP, DARKLY, FLATLY, SUPERHERO or TANDOOR_DARK.'),
  default_page: z.enum(['SEARCH', 'PLAN', 'BOOKS', 'SHOPPING']).optional().describe('Web UI start page.'),
  default_unit: z.string().optional().describe('Unit name for new ingredients, e.g. g.'),
  use_fractions: z.boolean().optional().describe('Show recipe decimals as fractions.'),
  use_kj: z.boolean().optional().describe('Show energy in kJ instead of kcal.'),
  comments: z.boolean().optional().describe('Show recipe comments.'),
  ingredient_decimals: z.number().optional().describe('Decimal places for ingredient amounts. Default 2.'),
  shopping_auto_sync: z.number().optional().describe('Shopping list refresh interval in seconds; 0 disables.'),
  shopping_recent_days: z.number().optional().describe('Days of checked entries to keep loading.'),
  shopping_add_onhand: z.boolean().optional().describe('Mark food on hand when checked off.'),
  mealplan_autoadd_shopping: z.boolean().optional().describe('Add meal plan ingredients to shopping automatically.'),
  mealplan_autoinclude_related: z.boolean().optional().describe('Include related recipes when shopping a meal plan.'),
  mealplan_autoexclude_onhand: z.boolean().optional().describe('Skip on-hand foods when shopping a meal plan.'),
  filter_to_supermarket: z.boolean().optional().describe('Show only the selected supermarket\'s categories.'),
  left_handed: z.boolean().optional().describe('Lay out the UI for left-hand use.'),
  default_meal_type_id: z.number().nullable().optional().describe('Meal type ID from list_meal_types; null clears.'),
  shopping_update_food_lists: z.boolean().optional().describe('New entries without lists get the food\'s lists.'),
  format: formatEnum,
} as const;

export const listAutomationsShape = { page: z.number().optional().describe('1-based page number.'), page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'), format: formatEnum } as const;
export const getAutomationShape = { id: z.number().describe('Automation ID from list_automations.'), format: formatEnum } as const;
export const createAutomationShape = {
  type: automationTypeEnum.describe('Rule type; decides how param_1 to param_3 are read.'),
  name: z.string().optional().describe('Display name.'),
  description: z.string().optional().describe('Free-text description.'),
  param_1: z.string().optional().describe('Alias rules: text to match. Replace rules: source URL regex.'),
  param_2: z.string().optional().describe('Alias rules: replacement name. Replace rules: regex to find.'),
  param_3: z.string().optional().describe('Replace rules: replacement text. Unused by other types.'),
  order: z.number().optional().describe('Lower values run first.'),
  disabled: z.boolean().optional().describe('Skip this rule when true.'),
  format: formatEnum,
} as const;
export const updateAutomationShape = {
  id: z.number().describe('Automation ID from list_automations.'),
  type: automationTypeEnum.optional().describe('Rule type; decides how param_1 to param_3 are read.'),
  name: z.string().optional().describe('Display name.'),
  description: z.string().optional().describe('Free-text description.'),
  param_1: z.string().optional().describe('Alias rules: text to match. Replace rules: source URL regex.'),
  param_2: z.string().optional().describe('Alias rules: replacement name. Replace rules: regex to find.'),
  param_3: z.string().optional().describe('Replace rules: replacement text. Unused by other types.'),
  order: z.number().optional().describe('Lower values run first.'),
  disabled: z.boolean().optional().describe('Skip this rule when true.'),
  format: formatEnum,
} as const;
export const deleteAutomationShape = { id: z.number().describe('Automation ID from list_automations.') } as const;

export const listUserFilesShape = {
  query: z.string().optional().describe('Case-insensitive substring match on file name.'),
  page: z.number().optional().describe('1-based page number.'),
  page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'),
  format: formatEnum,
} as const;
export const getUserFileShape = { id: z.number().describe('User file ID from list_user_files.'), format: formatEnum } as const;
export const uploadUserFileShape = {
  name: z.string().describe('Display name for the file in Tandoor.'),
  file_path: z.string().optional().describe('Local path in an allowed upload root; stdio only. Wins over file_url.'),
  file_url: z.string().optional().describe('Public http(s) URL to fetch, up to 50 MiB.'),
  format: formatEnum,
} as const;
export const updateUserFileShape = { id: z.number().describe('User file ID from list_user_files.'), name: z.string().describe('New display name.'), format: formatEnum } as const;
export const deleteUserFileShape = { id: z.number().describe('User file ID from list_user_files.') } as const;
export const downloadFileShape = {
  file_id: z.number().describe('User file ID'),
  save: z.boolean().optional().describe('Save to TANDOOR_MCP_DOWNLOAD_ROOT instead of returning the file inline (needed above 5 MiB; stdio only).'),
} as const;

export const listViewLogsShape = { page: z.number().optional().describe('1-based page number.'), page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'), format: formatEnum } as const;
export const listImportLogsShape = { page: z.number().optional().describe('1-based page number.'), page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'), format: formatEnum } as const;
export const listAiLogsShape = { page: z.number().optional().describe('1-based page number.'), page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'), format: formatEnum } as const;

export const foodAiPropertiesShape = {
  id: z.number().describe('Food ID.'),
  provider: z.number().optional().describe('AI provider ID from list_ai_providers; Tandoor rejects the call without one.'),
  format: formatEnum,
} as const;
export const recipeAiPropertiesShape = {
  id: z.number().describe('Recipe ID.'),
  provider: z.number().optional().describe('AI provider ID from list_ai_providers; Tandoor rejects the call without one.'),
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
export type DownloadFileArgs = z.infer<z.ZodObject<typeof downloadFileShape>>;
export type ListViewLogsArgs = z.infer<z.ZodObject<typeof listViewLogsShape>>;
export type ListImportLogsArgs = z.infer<z.ZodObject<typeof listImportLogsShape>>;
export type ListAiLogsArgs = z.infer<z.ZodObject<typeof listAiLogsShape>>;
export type FoodAiPropertiesArgs = z.infer<z.ZodObject<typeof foodAiPropertiesShape>>;
export type RecipeAiPropertiesArgs = z.infer<z.ZodObject<typeof recipeAiPropertiesShape>>;
export type GetServerSettingsArgs = z.infer<z.ZodObject<typeof getServerSettingsShape>>;

export function registerAdminTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'get_share_link', {
    title: 'Get share link',
    annotations: READ,
    description: 'Retrieve an existing share link by ID. Note: Tandoor\'s REST API does not expose create/list/delete for share links; create them via the web UI.',
    inputSchema: getShareLinkShape,
  }, handleGetShareLink);

  registerStringTool(server, client, 'list_user_preferences', {
    title: 'List user preferences',
    annotations: READ,
    description: 'List user preferences (typically just the current user).',
    inputSchema: listUserPreferencesShape,
  }, handleListUserPreferences);

  registerStringTool(server, client, 'get_user_preference', {
    title: 'Get user preference',
    annotations: READ,
    description: 'Get preferences for a user by their user ID.',
    inputSchema: getUserPreferenceShape,
  }, handleGetUserPreference);

  registerStringTool(server, client, 'update_user_preference', {
    title: 'Update user preference',
    annotations: UPDATE,
    description: 'Update user preferences (PATCH). Required: user_id. Common fields: theme, default_page (SEARCH/PLAN/BOOKS/SHOPPING), default_unit, use_fractions, use_kj, comments, ingredient_decimals, shopping_auto_sync, shopping_recent_days, mealplan_autoadd_shopping, mealplan_autoinclude_related, mealplan_autoexclude_onhand, filter_to_supermarket, left_handed, default_meal_type_id (the user\'s default meal type; null clears it), shopping_update_food_lists (a new shopping entry created without shopping lists gets its food\'s shopping lists).',
    inputSchema: updateUserPreferenceShape,
  }, handleUpdateUserPreference);

  registerStringTool(server, client, 'list_automations', {
    title: 'List automations',
    annotations: READ,
    description: 'List automation rules (auto-apply keyword aliases, food aliases, replace rules, etc.).',
    inputSchema: listAutomationsShape,
  }, handleListAutomations);

  registerStringTool(server, client, 'get_automation', {
    title: 'Get automation',
    annotations: READ,
    description: 'Get automation rule by ID.',
    inputSchema: getAutomationShape,
  }, handleGetAutomation);

  registerStringTool(server, client, 'create_automation', {
    title: 'Create automation',
    annotations: CREATE,
    description: 'Create an automation rule. Required: type (FOOD_ALIAS/UNIT_ALIAS/KEYWORD_ALIAS/DESCRIPTION_REPLACE/INSTRUCTION_REPLACE/NEVER_UNIT/TRANSPOSE_WORDS/FOOD_REPLACE/UNIT_REPLACE/NAME_REPLACE). params: param_1/2/3 carry rule-specific args (e.g. alias → canonical).',
    inputSchema: createAutomationShape,
  }, handleCreateAutomation);

  registerStringTool(server, client, 'update_automation', {
    title: 'Update automation',
    annotations: UPDATE,
    description: 'Update automation (PATCH). Required: id.',
    inputSchema: updateAutomationShape,
  }, handleUpdateAutomation);

  registerStringTool(server, client, 'delete_automation', {
    title: 'Delete automation',
    annotations: DELETE,
    description: 'Delete automation by ID.',
    inputSchema: deleteAutomationShape,
  }, handleDeleteAutomation);

  registerStringTool(server, client, 'list_user_files', {
    title: 'List user files',
    annotations: READ,
    description: 'List user-uploaded files (step attachments, etc.).',
    inputSchema: listUserFilesShape,
  }, handleListUserFiles);

  registerStringTool(server, client, 'get_user_file', {
    title: 'Get user file',
    annotations: READ,
    description: 'Get user file metadata by ID.',
    inputSchema: getUserFileShape,
  }, handleGetUserFile);

  registerStringTool(server, client, 'upload_user_file', {
    title: 'Upload user file',
    annotations: { ...CREATE, openWorldHint: true },
    description: 'Upload a user file. Required: name. Provide exactly one of file_path (local) or file_url (we fetch and upload bytes).',
    inputSchema: uploadUserFileShape,
  }, handleUploadUserFile);

  registerStringTool(server, client, 'update_user_file', {
    title: 'Update user file',
    annotations: UPDATE,
    description: 'Rename a user file (PATCH). Required: id, name.',
    inputSchema: updateUserFileShape,
  }, handleUpdateUserFile);

  registerStringTool(server, client, 'delete_user_file', {
    title: 'Delete user file',
    annotations: DELETE,
    description: 'Delete a user file by ID.',
    inputSchema: deleteUserFileShape,
  }, handleDeleteUserFile);

  registerStringTool(server, client, 'download_file', {
    title: 'Download user file',
    annotations: { ...READ, readOnlyHint: false, idempotentHint: false },
    description: 'Download a user file uploaded to Tandoor. Images come back as an image and other files as an embedded resource, up to 5 MiB; larger files need save: true.',
    inputSchema: downloadFileShape,
  }, handleDownloadFile);

  registerStringTool(server, client, 'list_view_logs', {
    title: 'List view logs',
    annotations: READ,
    description: 'List recipe view-log entries (which recipes have been viewed and when).',
    inputSchema: listViewLogsShape,
  }, handleListViewLogs);

  registerStringTool(server, client, 'list_import_logs', {
    title: 'List import logs',
    annotations: READ,
    description: 'List import-log entries (URL/AI/bookmarklet import history).',
    inputSchema: listImportLogsShape,
  }, handleListImportLogs);

  registerStringTool(server, client, 'list_ai_logs', {
    title: 'List AI logs',
    annotations: READ,
    description: 'List AI-log entries (AI usage history + credit cost).',
    inputSchema: listAiLogsShape,
  }, handleListAiLogs);

  registerStringTool(server, client, 'food_ai_properties', {
    title: 'Generate food properties with AI',
    annotations: { ...CREATE, openWorldHint: true },
    description: 'Enrich a food with AI-generated properties (fallback path when USDA FDC is incomplete). Requires a configured AI provider on the Tandoor server (check via list_ai_providers). If none is configured, recommend: (1) prefer food_fdc_lookup when the food has an fdc_id, since it is deterministic, free, and does not need AI setup; (2) otherwise ask the operator to add an AI provider in Tandoor Settings → AI (OpenAI/Anthropic/Ollama/etc.).',
    inputSchema: foodAiPropertiesShape,
  }, handleFoodAiProperties);

  registerStringTool(server, client, 'recipe_ai_properties', {
    title: 'Generate recipe properties with AI',
    annotations: { ...CREATE, openWorldHint: true },
    description: 'Have AI compute nutrition/properties for a full recipe. Requires a configured AI provider on the Tandoor server (check via list_ai_providers). If none is configured, recommend the operator add one in Tandoor Settings → AI. For single-ingredient nutrition use food_fdc_lookup instead (deterministic, no AI setup required).',
    inputSchema: recipeAiPropertiesShape,
  }, handleRecipeAiProperties);

  registerStringTool(server, client, 'get_server_settings', {
    title: 'Get server settings',
    annotations: READ,
    description: 'Fetch current Tandoor server settings (feature flags, limits). Useful to check whether AI, sharing, or open-data import are enabled before calling those tools.',
    inputSchema: getServerSettingsShape,
  }, handleGetServerSettings);
}
