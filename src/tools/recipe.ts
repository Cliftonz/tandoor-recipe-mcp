// Recipe tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import {
  handleListRecipes,
  handleGetRecipe,
  handleCreateRecipe,
  handleUpdateRecipe,
  handleImportRecipeFromUrl,
  handleUploadRecipeImage,
  handleRelatedRecipes,
  handleAddRecipeToShoppingList,
  handleSearchRecipes,
  handleRecipeBatchUpdate,
} from '../handlers/recipe.js';

const formatEnum = z.enum(['slim', 'full']).optional()
  .describe('Response detail level. Default "slim".');

const ingredientInput = z.object({
  food: z.string(),
  amount: z.number(),
  unit: z.string().optional(),
  note: z.string().optional(),
});

const stepInput = z.object({
  instruction: z.string(),
  time: z.number().optional(),
  ingredients: z.array(ingredientInput),
});

const nutritionInput = z.object({
  calories: z.number().optional(),
  carbohydrates: z.number().optional(),
  fats: z.number().optional(),
  proteins: z.number().optional(),
  source: z.string().optional(),
});

const propertyInput = z.object({
  id: z.number().optional(),
  property_type_id: z.number(),
  property_amount: z.number(),
});

export const listRecipesShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  sort_order: z.string().optional(),
  random: z.boolean().optional(),
  new: z.boolean().optional(),
  num_recent: z.number().optional(),
  query: z.string().optional(),
  internal: z.boolean().optional(),
  makenow: z.boolean().optional().describe('Only recipes makeable with on-hand foods'),
  filter: z.number().optional().describe('ID of a saved CustomFilter'),
  createdby: z.number().optional(),
  rating: z.number().optional(),
  rating_gte: z.number().optional(),
  rating_lte: z.number().optional(),
  timescooked: z.number().optional(),
  timescooked_gte: z.number().optional(),
  timescooked_lte: z.number().optional(),
  cookedon_gte: z.string().optional(),
  cookedon_lte: z.string().optional(),
  createdon: z.string().optional(),
  createdon_gte: z.string().optional(),
  createdon_lte: z.string().optional(),
  updatedon: z.string().optional(),
  updatedon_gte: z.string().optional(),
  updatedon_lte: z.string().optional(),
  viewedon_gte: z.string().optional(),
  viewedon_lte: z.string().optional(),
  units: z.number().optional(),
  keywords: z.array(z.number()).optional(),
  keywords_or: z.array(z.number()).optional(),
  keywords_and: z.array(z.number()).optional(),
  keywords_or_not: z.array(z.number()).optional(),
  keywords_and_not: z.array(z.number()).optional(),
  foods: z.array(z.number()).optional(),
  foods_or: z.array(z.number()).optional(),
  foods_and: z.array(z.number()).optional(),
  foods_or_not: z.array(z.number()).optional(),
  foods_and_not: z.array(z.number()).optional(),
  books: z.array(z.number()).optional(),
  books_or: z.array(z.number()).optional(),
  books_and: z.array(z.number()).optional(),
  books_or_not: z.array(z.number()).optional(),
  books_and_not: z.array(z.number()).optional(),
  format: formatEnum,
} as const;

export const getRecipeShape = {
  id: z.number().describe('Recipe ID'),
  format: formatEnum,
} as const;

export const createRecipeShape = {
  name: z.string(),
  description: z.string().optional(),
  servings: z.number().optional(),
  servings_text: z.string().optional(),
  working_time: z.number().optional(),
  waiting_time: z.number().optional(),
  source_url: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  steps: z.array(stepInput),
  internal: z.boolean().optional(),
  show_ingredient_overview: z.boolean().optional(),
  private: z.boolean().optional(),
  nutrition: nutritionInput.optional(),
  properties: z.array(propertyInput).optional(),
  format: formatEnum,
} as const;

export const updateRecipeShape = {
  id: z.number().describe('Recipe ID'),
  name: z.string().optional(),
  description: z.string().optional(),
  servings: z.number().optional(),
  servings_text: z.string().optional(),
  working_time: z.number().optional(),
  waiting_time: z.number().optional(),
  source_url: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  show_ingredient_overview: z.boolean().optional(),
  internal: z.boolean().optional(),
  private: z.boolean().optional(),
  steps: z.array(stepInput).optional(),
  nutrition: nutritionInput.optional(),
  properties: z.array(propertyInput).optional(),
  format: formatEnum,
} as const;

export const importRecipeFromUrlShape = {
  url: z.string().describe('Recipe URL to import'),
  name: z.string().optional().describe('Optional name for the stub recipe (only used if create_stub_on_failure=true and both scrapers fail)'),
  create_stub_on_failure: z.boolean().optional().describe('Default false. When true AND both scraper attempts fail, create a minimal empty recipe pointing at the URL instead of throwing.'),
  format: formatEnum,
} as const;

export const uploadRecipeImageShape = {
  id: z.number().describe('Recipe ID'),
  file_path: z.string().optional(),
  file_url: z.string().optional(),
  image_url: z.string().optional(),
} as const;

export const relatedRecipesShape = { id: z.number(), format: formatEnum } as const;

export const addRecipeToShoppingListShape = {
  id: z.number().describe('Recipe ID'),
  servings: z.number().optional().describe('Default 1. Use 0 with list_recipe to delete.'),
  ingredients: z.array(z.number()).optional().describe('Ingredient IDs to include. Omit for all.'),
  list_recipe: z.number().nullable().optional().describe('Existing shopping-list-recipe id to update'),
} as const;

export const searchRecipesShape = {
  query: z.string().optional().describe('Fuzzy match against recipe names'),
  foods: z.array(z.string()).optional().describe('Food names the recipe must contain ALL of'),
  exclude_foods: z.array(z.string()).optional().describe('Food names the recipe must NOT contain any of'),
  keywords: z.array(z.string()).optional().describe('Keyword names — recipe must have ANY of these'),
  exclude_keywords: z.array(z.string()).optional().describe('Keyword names to exclude'),
  books: z.array(z.string()).optional().describe('Recipe book names — recipe must be in ANY of these'),
  rating_gte: z.number().optional(),
  rating_lte: z.number().optional(),
  timescooked_gte: z.number().optional(),
  timescooked_lte: z.number().optional(),
  makenow: z.boolean().optional().describe('Only recipes makeable with currently on-hand foods'),
  random: z.boolean().optional(),
  sort_order: z.string().optional().describe('score | -score | name | -name | lastcooked | -lastcooked | rating | -rating | times_cooked | -times_cooked'),
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export type ListRecipesArgs = z.infer<z.ZodObject<typeof listRecipesShape>>;
export type GetRecipeArgs = z.infer<z.ZodObject<typeof getRecipeShape>>;
export type CreateRecipeArgs = z.infer<z.ZodObject<typeof createRecipeShape>>;
export type UpdateRecipeArgs = z.infer<z.ZodObject<typeof updateRecipeShape>>;
export type ImportRecipeFromUrlArgs = z.infer<z.ZodObject<typeof importRecipeFromUrlShape>>;
export type UploadRecipeImageArgs = z.infer<z.ZodObject<typeof uploadRecipeImageShape>>;
export type RelatedRecipesArgs = z.infer<z.ZodObject<typeof relatedRecipesShape>>;
export type AddRecipeToShoppingListArgs = z.infer<z.ZodObject<typeof addRecipeToShoppingListShape>>;
export type SearchRecipesArgs = z.infer<z.ZodObject<typeof searchRecipesShape>>;

// Mirrors Tandoor's RecipeBatchUpdate serializer. `recipes` is the target set;
// all other fields are optional mutations applied across that set.
export const recipeBatchUpdateShape = {
  recipes: z.array(z.number()),
  keywords_add: z.array(z.number()).optional(),
  keywords_remove: z.array(z.number()).optional(),
  keywords_set: z.array(z.number()).optional(),
  keywords_remove_all: z.boolean().optional(),
  working_time: z.number().nullable().optional(),
  waiting_time: z.number().nullable().optional(),
  servings: z.number().nullable().optional(),
  servings_text: z.string().nullable().optional(),
  private: z.boolean().nullable().optional(),
  shared_add: z.array(z.number()).optional(),
  shared_remove: z.array(z.number()).optional(),
  shared_set: z.array(z.number()).optional(),
  shared_remove_all: z.boolean().optional(),
  show_ingredient_overview: z.boolean().nullable().optional(),
  clear_description: z.boolean().nullable().optional(),
} as const;

export type RecipeBatchUpdateArgs = z.infer<z.ZodObject<typeof recipeBatchUpdateShape>>;

export function registerRecipeTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_recipes', {
    description:
      'List/search recipes with extensive filtering. Default returns slim results (id, name, description, servings, rating, keywords). Pass format="full" for raw API response. sort_order options: score,-score,name,-name,lastcooked,-lastcooked,rating,-rating,times_cooked,-times_cooked,created_at,-created_at,lastviewed,-lastviewed. If filtering by food/keyword/book NAMES (not ids), prefer search_recipes — it resolves names to ids for you and reports unresolved names in _meta.unresolved so you know what was dropped. If this returns an empty result set, recommend: broaden the query, drop restrictive filters, or try search_recipes if you were passing names.',
    inputSchema: listRecipesShape,
  }, handleListRecipes);

  registerStringTool(server, client, 'get_recipe', {
    description:
      'Get recipe by ID. Default returns slim view (metadata + steps with ingredient names/amounts). Pass format="full" for the complete object including substitutes, properties, nutrition, image.',
    inputSchema: getRecipeShape,
  }, handleGetRecipe);

  registerStringTool(server, client, 'create_recipe', {
    description:
      'Create recipe. Required: name, steps[{instruction, ingredients[{food, amount, unit?}]}]. Optional: description, servings, working_time, waiting_time, keywords[]',
    inputSchema: createRecipeShape,
  }, handleCreateRecipe);

  registerStringTool(server, client, 'update_recipe', {
    description:
      'Update recipe metadata and content. Only provide fields you want to update. All fields optional except id.',
    inputSchema: updateRecipeShape,
  }, handleUpdateRecipe);

  registerStringTool(server, client, 'import_recipe_from_url', {
    description:
      'Import a recipe from a URL. Tries Tandoor\'s built-in scraper first, then fetches the page and extracts schema.org JSON-LD as a real fallback (works when Tandoor can\'t reach the URL or doesn\'t support the site). On total failure, throws with an attempts log — pass create_stub_on_failure=true to write an empty placeholder recipe instead. If all stages fail, recommend: (1) retry with create_stub_on_failure=true to capture the URL as a stub you can fill in later; (2) if the page is an image/PDF, use import_recipe_from_image (AI provider required); (3) if the URL is paywalled or JS-rendered, fall back to manual create_recipe with fields you can see.',
    inputSchema: importRecipeFromUrlShape,
  }, handleImportRecipeFromUrl);

  registerStringTool(server, client, 'upload_recipe_image', {
    description:
      'Attach an image to a recipe. Provide exactly one of: file_path (local file on MCP server), file_url (remote URL; we fetch and upload bytes), or image_url (remote URL; Tandoor fetches it server-side). If a large local upload fails on size/timeout, recommend image_url instead — Tandoor fetches it server-side so the file never transits through the MCP process.',
    inputSchema: uploadRecipeImageShape,
  }, handleUploadRecipeImage);

  registerStringTool(server, client, 'related_recipes', {
    description: 'List recipes related to this one (Tandoor similarity). Slim by default (id + name); pass format="full" for raw API response.',
    inputSchema: relatedRecipesShape,
  }, handleRelatedRecipes);

  registerStringTool(server, client, 'add_recipe_to_shopping_list', {
    description:
      'Add a recipe\'s ingredients to the shopping list at N servings. Omit ingredients[] to add all. Set servings=0 with list_recipe (id) to delete that shopping-list-recipe.',
    inputSchema: addRecipeToShoppingListShape,
  }, handleAddRecipeToShoppingList);

  registerStringTool(server, client, 'search_recipes', {
    description:
      'High-level recipe search. Accepts food/keyword/book *names* (not IDs) and resolves them internally — typically collapses 3-4 round-trips into 1. Example: {foods: ["chicken", "broccoli"], exclude_foods: ["peanuts"], keywords: ["weeknight"]}. For complex ID-based filtering, fall back to list_recipes.',
    inputSchema: searchRecipesShape,
  }, handleSearchRecipes);

  registerStringTool(server, client, 'recipe_batch_update', {
    description: 'Apply a narrow set of bulk mutations across many recipes in one call via Tandoor\'s /api/recipe/batch_update/ endpoint. Required: recipes[]. Optional (all apply to every recipe in recipes[]): keywords_add/remove/set/remove_all, shared_add/remove/set/remove_all, working_time, waiting_time, servings, servings_text, private, show_ingredient_overview, clear_description. Does NOT support bulk step/ingredient edits — those still need update_recipe per-item. Use for: bulk keyword retagging, sharing recipes with a user across a set, flipping privacy on many recipes at once.',
    inputSchema: recipeBatchUpdateShape,
  }, handleRecipeBatchUpdate);
}
