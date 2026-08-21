// AI provider + AI-import tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
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
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const aiImportRecipeShape = {
  file_path: z.string().optional().describe('Absolute path to an image or PDF on the MCP server filesystem'),
  file_url: z.string().optional().describe('Remote URL of an image/PDF; the server fetches it and uploads bytes'),
  text: z.string().optional().describe('Optional raw recipe text to feed the AI provider'),
  ai_provider_id: z.number().optional(),
  save: z.boolean().optional().describe('Save parsed recipe to Tandoor (default true)'),
  name: z.string().optional().describe('Override name if AI did not extract one'),
  format: formatEnum,
} as const;

export const getAiProviderShape = { id: z.number(), format: formatEnum } as const;

export const createAiProviderShape = {
  name: z.string(),
  model_name: z.string(),
  api_key: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  log_credit_cost: z.boolean().optional(),
  space: z.number().optional(),
  format: formatEnum,
} as const;

export const updateAiProviderShape = {
  id: z.number(),
  name: z.string().optional(),
  api_key: z.string().optional(),
  model_name: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  log_credit_cost: z.boolean().optional(),
  space: z.number().optional(),
  format: formatEnum,
} as const;

export const deleteAiProviderShape = { id: z.number() } as const;

export const aiStepSortShape = { recipe_id: z.number() } as const;

export type ListAiProvidersArgs = z.infer<z.ZodObject<typeof listAiProvidersShape>>;
export type AiImportRecipeArgs = z.infer<z.ZodObject<typeof aiImportRecipeShape>>;
export type GetAiProviderArgs = z.infer<z.ZodObject<typeof getAiProviderShape>>;
export type CreateAiProviderArgs = z.infer<z.ZodObject<typeof createAiProviderShape>>;
export type UpdateAiProviderArgs = z.infer<z.ZodObject<typeof updateAiProviderShape>>;
export type DeleteAiProviderArgs = z.infer<z.ZodObject<typeof deleteAiProviderShape>>;
export type AiStepSortArgs = z.infer<z.ZodObject<typeof aiStepSortShape>>;

export function registerAiTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_ai_providers', {
    description: 'List configured AI providers (used by ai-import). Slim default.',
    inputSchema: listAiProvidersShape,
  }, handleListAiProviders);

  registerStringTool(server, client, 'import_recipe_from_image', {
    description:
      'Import a recipe from an image, PDF, or text via Tandoor AI provider. Provide one of: file_path (local file readable by the MCP server), file_url (remote URL we fetch then upload), or text. By default the parsed recipe is saved to Tandoor; pass save=false to only return the parse result. ai_provider_id is auto-picked if omitted. If no AI provider is configured, this tool cannot work — recommend: (1) ask the operator to add one in Tandoor Settings → AI; (2) for web recipes, fall back to import_recipe_from_url (uses Tandoor scraper + JSON-LD, no AI required); (3) for text-only input, type up the structure manually via create_recipe.',
    inputSchema: aiImportRecipeShape,
  }, handleAiImportRecipe);

  registerStringTool(server, client, 'get_ai_provider', {
    description: "Get AI provider by ID. Contains provider API key. Slim mode redacts api_key; use format='full' only when necessary.",
    inputSchema: getAiProviderShape,
  }, handleGetAiProvider);

  registerStringTool(server, client, 'create_ai_provider', {
    description: 'Create an AI provider. Required: name, model_name. Optional: api_key, description, url, log_credit_cost, space. Response slim by default (api_key redacted).',
    inputSchema: createAiProviderShape,
  }, handleCreateAiProvider);

  registerStringTool(server, client, 'update_ai_provider', {
    description: "Update an AI provider (PATCH). Required: id. Contains provider API key. Slim mode redacts api_key; use format='full' only when necessary.",
    inputSchema: updateAiProviderShape,
  }, handleUpdateAiProvider);

  registerStringTool(server, client, 'delete_ai_provider', {
    description: 'Delete an AI provider by ID.',
    inputSchema: deleteAiProviderShape,
  }, handleDeleteAiProvider);

  registerStringTool(server, client, 'ai_step_sort', {
    description: 'Bulk-sort a recipe steps via AI. Required: recipe_id.',
    inputSchema: aiStepSortShape,
  }, handleAiStepSort);
}
