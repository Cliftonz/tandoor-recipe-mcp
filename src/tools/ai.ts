// AI provider + AI-import tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListAiProviders,
  handleAiImportRecipe,
  handleGetAiProvider,
  handleCreateAiProvider,
  handleUpdateAiProvider,
  handleDeleteAiProvider,
  handleAiStepSort,
} from '../handlers/ai.js';


export const listAiProvidersShape = {
  page: z.number().optional().describe('Page number, starting at 1.'),
  page_size: z.number().optional().describe('Results per page. Default 50, max 200.'),
  format: formatEnum,
} as const;

export const aiImportRecipeShape = {
  file_path: z.string().optional().describe('Absolute path to an image or PDF on the MCP server filesystem'),
  file_url: z.string().optional().describe('Remote URL of an image/PDF; the server fetches it and uploads bytes'),
  text: z.string().optional().describe('Optional raw recipe text to feed the AI provider'),
  ai_provider_id: z.number().optional().describe('AI provider ID, from list_ai_providers. Default: first provider.'),
  save: z.boolean().optional().describe('Save parsed recipe to Tandoor (default true)'),
  name: z.string().optional().describe('Override name if AI did not extract one'),
  format: formatEnum,
} as const;

export const getAiProviderShape = { id: z.number().describe('AI provider ID, from list_ai_providers.'), format: formatEnum } as const;

export const createAiProviderShape = {
  name: z.string().describe('Display name, max 128 characters.'),
  model_name: z.string().describe('LiteLLM model string, e.g. "gpt-4o".'),
  api_key: z.string().optional().describe('Secret key for the model provider.'),
  description: z.string().optional().describe('Free-text notes.'),
  url: z.string().optional().describe('Custom API base URL; omit for the LiteLLM default.'),
  log_credit_cost: z.boolean().optional().describe('Count usage toward space AI credits. Superuser only. Default true.'),
  space: z.number().optional().describe('Superusers: omit for a global provider; any value means active space.'),
  format: formatEnum,
} as const;

export const updateAiProviderShape = {
  id: z.number().describe('AI provider ID, from list_ai_providers.'),
  name: z.string().optional().describe('Display name, max 128 characters.'),
  api_key: z.string().optional().describe('Replacement secret key for the model provider.'),
  model_name: z.string().optional().describe('LiteLLM model string, e.g. "gpt-4o".'),
  description: z.string().optional().describe('Free-text notes.'),
  url: z.string().optional().describe('Custom API base URL.'),
  log_credit_cost: z.boolean().optional().describe('Count usage toward space AI credits. Superuser only.'),
  space: z.number().optional().describe('Superusers: any value means active space. Omit to keep current.'),
  format: formatEnum,
} as const;

export const deleteAiProviderShape = { id: z.number().describe('AI provider ID, from list_ai_providers.') } as const;

export const aiStepSortShape = {
  recipe_id: z.number().describe('Recipe ID whose steps to sort.'),
  provider_id: z.number().describe('AI provider ID, from list_ai_providers.'),
} as const;

export type ListAiProvidersArgs = z.infer<z.ZodObject<typeof listAiProvidersShape>>;
export type AiImportRecipeArgs = z.infer<z.ZodObject<typeof aiImportRecipeShape>>;
export type GetAiProviderArgs = z.infer<z.ZodObject<typeof getAiProviderShape>>;
export type CreateAiProviderArgs = z.infer<z.ZodObject<typeof createAiProviderShape>>;
export type UpdateAiProviderArgs = z.infer<z.ZodObject<typeof updateAiProviderShape>>;
export type DeleteAiProviderArgs = z.infer<z.ZodObject<typeof deleteAiProviderShape>>;
export type AiStepSortArgs = z.infer<z.ZodObject<typeof aiStepSortShape>>;

export function registerAiTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_ai_providers', {
    title: 'List AI providers',
    annotations: READ,
    description: 'List configured AI providers (used by ai-import). Slim default.',
    inputSchema: listAiProvidersShape,
  }, handleListAiProviders);

  registerStringTool(server, client, 'import_recipe_from_image', {
    title: 'Import recipe from image',
    annotations: { ...CREATE, openWorldHint: true },
    description:
      'Import a recipe from an image, PDF, or text via Tandoor AI provider. Provide at least one of: file_path (local file readable by the MCP server), file_url (remote URL we fetch then upload), or text (raw recipe text; works without a file). By default the parsed recipe is saved to Tandoor; pass save=false to only return the parse result. ai_provider_id is auto-picked if omitted. If no AI provider is configured, this tool cannot work. Recommend: (1) ask the operator to add one in Tandoor Settings → AI; (2) for web recipes, fall back to import_recipe_from_url (uses Tandoor scraper + JSON-LD, no AI required); (3) for text input, build the recipe with create_recipe instead.',
    inputSchema: aiImportRecipeShape,
  }, handleAiImportRecipe);

  registerStringTool(server, client, 'get_ai_provider', {
    title: 'Get AI provider',
    annotations: { ...READ, readOnlyHint: false },
    description: "Get AI provider by ID. Contains provider API key. Slim mode redacts api_key; use format='full' only when necessary.",
    inputSchema: getAiProviderShape,
  }, handleGetAiProvider);

  registerStringTool(server, client, 'create_ai_provider', {
    title: 'Create AI provider',
    annotations: CREATE,
    description: 'Create an AI provider. Required: name, model_name. Optional: api_key, description, url, log_credit_cost, space. Response slim by default (api_key redacted).',
    inputSchema: createAiProviderShape,
  }, handleCreateAiProvider);

  registerStringTool(server, client, 'update_ai_provider', {
    title: 'Update AI provider',
    annotations: UPDATE,
    description: "Update an AI provider (PATCH). Required: id. Contains provider API key. Slim mode redacts api_key; use format='full' only when necessary.",
    inputSchema: updateAiProviderShape,
  }, handleUpdateAiProvider);

  registerStringTool(server, client, 'delete_ai_provider', {
    title: 'Delete AI provider',
    annotations: DELETE,
    description: 'Delete an AI provider by ID.',
    inputSchema: deleteAiProviderShape,
  }, handleDeleteAiProvider);

  registerStringTool(server, client, 'ai_step_sort', {
    title: 'Sort recipe steps with AI',
    annotations: { ...CREATE, openWorldHint: true },
    description: 'Preview an AI sort of a recipe\'s steps. Returns the recipe with sorted steps without saving it. The AI output is not validated, so check it before saving with update_recipe. Required: recipe_id, provider_id.',
    inputSchema: aiStepSortShape,
  }, handleAiStepSort);
}
