// AI provider + AI-import tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { handleListAiProviders, handleAiImportRecipe } from '../handlers/ai.js';

const formatEnum = z.enum(['slim', 'full']).optional();

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

export type ListAiProvidersArgs = z.infer<z.ZodObject<typeof listAiProvidersShape>>;
export type AiImportRecipeArgs = z.infer<z.ZodObject<typeof aiImportRecipeShape>>;

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
}
