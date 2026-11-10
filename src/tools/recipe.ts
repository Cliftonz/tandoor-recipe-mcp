// Recipe tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum as sharedFormatEnum } from '../lib/slim.js';
import {
  handleListRecipes,
  handleGetRecipe,
  handleCreateRecipe,
  handleUpdateRecipe,
  handleDeleteRecipe,
  handleImportRecipeFromUrl,
  handleUploadRecipeImage,
  handleRelatedRecipes,
  handleAddRecipeToShoppingList,
  handleSearchRecipes,
  handleRecipeBatchUpdate,
  handleListRecipesFlat,
  handleDeleteRecipeExternal,
} from '../handlers/recipe.js';

const recipeFormatEnum = sharedFormatEnum.describe('Response detail level. Default "slim".');

const ingredientInput = z.object({
  food: z.string().describe('Food name; matched case-insensitively or created.'),
  amount: z.number().describe('Quantity in the given unit.'),
  unit: z.string().optional().describe('Unit name; matched case-insensitively or created.'),
  note: z.string().optional().describe('Free text, e.g. "finely chopped".'),
});

const stepInput = z.object({
  instruction: z.string().describe('Step text. Markdown supported.'),
  time: z.number().optional().describe('Step duration in minutes. Default 0.'),
  ingredients: z.array(ingredientInput).describe('Ingredients used in this step; may be empty.'),
});

const nutritionInput = z.object({
  calories: z.number().optional().describe('Energy value.'),
  carbohydrates: z.number().optional().describe('Carbohydrate amount.'),
  fats: z.number().optional().describe('Fat amount.'),
  proteins: z.number().optional().describe('Protein amount.'),
  source: z.string().optional().describe('Where the nutrition values came from.'),
});

const propertyInput = z.object({
  id: z.number().optional().describe('Existing recipe property ID to update in place.'),
  property_type_id: z.number().describe('Property type ID, from list_property_types.'),
  property_amount: z.number().describe('Value in the property type unit.'),
});

export const listRecipesShape = {
  page: z.number().optional().describe('Page number, starting at 1.'),
  page_size: z.number().optional().describe('Results per page. Default 25, max 100.'),
  sort_order: z.string().optional().describe('One option from the tool description; "-" prefix descends.'),
  random: z.boolean().optional().describe('Return results in random order.'),
  new: z.boolean().optional().describe('Put recently created recipes first.'),
  num_recent: z.number().optional().describe('Put this many recently viewed recipes first.'),
  query: z.string().optional().describe('Fuzzy match on recipe name.'),
  internal: z.boolean().optional().describe('Only internal recipes, not external file recipes.'),
  makenow: z.boolean().optional().describe('Only recipes makeable with on-hand foods'),
  filter: z.number().optional().describe('ID of a saved CustomFilter'),
  createdby: z.number().optional().describe('Creator user ID.'),
  rating: z.number().optional().describe('Exact rating.'),
  rating_gte: z.number().optional().describe('Minimum rating.'),
  rating_lte: z.number().optional().describe('Maximum rating.'),
  timescooked: z.number().optional().describe('Exact number of times cooked.'),
  timescooked_gte: z.number().optional().describe('Minimum number of times cooked.'),
  timescooked_lte: z.number().optional().describe('Maximum number of times cooked.'),
  cookedon_gte: z.string().optional().describe('Last cooked on or after, YYYY-MM-DD.'),
  cookedon_lte: z.string().optional().describe('Last cooked on or before, YYYY-MM-DD.'),
  createdon: z.string().optional().describe('Created on this date, YYYY-MM-DD.'),
  createdon_gte: z.string().optional().describe('Created on or after, YYYY-MM-DD.'),
  createdon_lte: z.string().optional().describe('Created on or before, YYYY-MM-DD.'),
  updatedon: z.string().optional().describe('Updated on this date, YYYY-MM-DD.'),
  updatedon_gte: z.string().optional().describe('Updated on or after, YYYY-MM-DD.'),
  updatedon_lte: z.string().optional().describe('Updated on or before, YYYY-MM-DD.'),
  viewedon_gte: z.string().optional().describe('Last viewed on or after, YYYY-MM-DD.'),
  viewedon_lte: z.string().optional().describe('Last viewed on or before, YYYY-MM-DD.'),
  units: z.number().optional().describe('Unit ID, from list_units; recipe uses this unit.'),
  keywords: z.array(z.number()).optional().describe('Keyword IDs, from list_keywords. Same as keywords_or.'),
  keywords_or: z.array(z.number()).optional().describe('Keyword IDs; recipe has any of them.'),
  keywords_and: z.array(z.number()).optional().describe('Keyword IDs; recipe has all of them.'),
  keywords_or_not: z.array(z.number()).optional().describe('Keyword IDs; exclude recipes with any of them.'),
  keywords_and_not: z.array(z.number()).optional().describe('Keyword IDs; exclude recipes with all of them.'),
  foods: z.array(z.number()).optional().describe('Food IDs, from list_foods. Same as foods_or.'),
  foods_or: z.array(z.number()).optional().describe('Food IDs; recipe has any of them.'),
  foods_and: z.array(z.number()).optional().describe('Food IDs; recipe has all of them.'),
  foods_or_not: z.array(z.number()).optional().describe('Food IDs; exclude recipes with any of them.'),
  foods_and_not: z.array(z.number()).optional().describe('Food IDs; exclude recipes with all of them.'),
  books: z.array(z.number()).optional().describe('Recipe book IDs, from list_recipe_books. Same as books_or.'),
  books_or: z.array(z.number()).optional().describe('Book IDs; recipe is in any of them.'),
  books_and: z.array(z.number()).optional().describe('Book IDs; recipe is in all of them.'),
  books_or_not: z.array(z.number()).optional().describe('Book IDs; exclude recipes in any of them.'),
  books_and_not: z.array(z.number()).optional().describe('Book IDs; exclude recipes in all of them.'),
  format: recipeFormatEnum,
} as const;

export const getRecipeShape = {
  id: z.number().describe('Recipe ID'),
  format: recipeFormatEnum,
} as const;

export const createRecipeShape = {
  name: z.string().describe('Recipe title, max 128 characters.'),
  description: z.string().optional().describe('Short summary, max 512 characters.'),
  servings: z.number().optional().describe('Servings the ingredient amounts make. Default 1.'),
  servings_text: z.string().optional().describe('Servings label, e.g. "cookies". Max 32 characters.'),
  working_time: z.number().optional().describe('Active prep time in minutes. Default 0.'),
  waiting_time: z.number().optional().describe('Passive time, e.g. baking, in minutes. Default 0.'),
  source_url: z.string().optional().describe('Web address the recipe came from.'),
  keywords: z.array(z.string()).optional().describe('Keyword names; matched case-insensitively or created.'),
  steps: z.array(stepInput).describe('Steps in display order.'),
  internal: z.boolean().optional().describe('Native Tandoor recipe, not an external file. Default true.'),
  show_ingredient_overview: z.boolean().optional().describe('Show all ingredients above the steps. Default true.'),
  private: z.boolean().optional().describe('Hide from other space members unless shared. Default false.'),
  nutrition: nutritionInput.optional().describe('Nutrition values for the recipe.'),
  properties: z.array(propertyInput).optional().describe('Property values, e.g. nutrients or price.'),
  format: recipeFormatEnum,
} as const;

export const updateRecipeShape = {
  id: z.number().describe('Recipe ID'),
  name: z.string().optional().describe('Recipe title, max 128 characters.'),
  description: z.string().optional().describe('Short summary, max 512 characters.'),
  servings: z.number().optional().describe('Servings the ingredient amounts make.'),
  servings_text: z.string().optional().describe('Servings label, e.g. "cookies". Max 32 characters.'),
  working_time: z.number().optional().describe('Active prep time in minutes.'),
  waiting_time: z.number().optional().describe('Passive time, e.g. baking, in minutes.'),
  source_url: z.string().optional().describe('Web address the recipe came from.'),
  keywords: z.array(z.string()).optional().describe('Keyword names; replaces the list. Missing names are created.'),
  show_ingredient_overview: z.boolean().optional().describe('Show all ingredients above the steps.'),
  internal: z.boolean().optional().describe('Native Tandoor recipe, not an external file.'),
  private: z.boolean().optional().describe('Hide from other space members unless shared.'),
  steps: z.array(stepInput).optional().describe('Replaces all steps; step names and sub-recipes are lost.'),
  nutrition: nutritionInput.optional().describe('Nutrition values for the recipe.'),
  properties: z.array(propertyInput).optional().describe('Replaces the property list; id updates an existing entry.'),
  format: recipeFormatEnum,
} as const;

export const deleteRecipeShape = { id: z.number().describe('Recipe ID') } as const;

export const listRecipesFlatShape = { format: recipeFormatEnum } as const;

export const deleteRecipeExternalShape = { id: z.number().describe('Recipe ID') } as const;

export const importRecipeFromUrlShape = {
  url: z.string().describe('Recipe URL to import'),
  name: z.string().optional().describe('Optional name for the stub recipe (only used if create_stub_on_failure=true and both scrapers fail)'),
  create_stub_on_failure: z.boolean().optional().describe('Default false. When true AND both scraper attempts fail, create a minimal empty recipe pointing at the URL instead of throwing.'),
  format: recipeFormatEnum,
} as const;

export const uploadRecipeImageShape = {
  id: z.number().describe('Recipe ID'),
  file_path: z.string().optional().describe('Local image path inside an allowed upload root.'),
  file_url: z.string().optional().describe('Public image URL; this server downloads it, 10 MB max.'),
  image_url: z.string().optional().describe('Public image URL; Tandoor downloads it itself.'),
} as const;

export const relatedRecipesShape = { id: z.number().describe('Recipe ID'), format: recipeFormatEnum } as const;

export const addRecipeToShoppingListShape = {
  id: z.number().describe('Recipe ID'),
  servings: z.number().optional().describe('Default 1. Use a negative value (e.g. -1) with list_recipe to delete.'),
  ingredients: z.array(z.number()).optional().describe('Ingredient IDs to include. Omit for all.'),
  list_recipe: z.number().nullable().optional().describe('Existing shopping-list-recipe id to update'),
  mealplan: z.number().optional().describe('Meal plan id to link the entries to'),
} as const;

export const searchRecipesShape = {
  query: z.string().optional().describe('Fuzzy match against recipe names'),
  foods: z.array(z.string()).optional().describe('Food names the recipe must contain ALL of'),
  exclude_foods: z.array(z.string()).optional().describe('Food names the recipe must NOT contain any of'),
  keywords: z.array(z.string()).optional().describe('Keyword names; recipe must have ANY of these'),
  exclude_keywords: z.array(z.string()).optional().describe('Keyword names to exclude'),
  books: z.array(z.string()).optional().describe('Recipe book names; recipe must be in ANY of these'),
  rating_gte: z.number().optional().describe('Minimum rating.'),
  rating_lte: z.number().optional().describe('Maximum rating.'),
  timescooked_gte: z.number().optional().describe('Minimum number of times cooked.'),
  timescooked_lte: z.number().optional().describe('Maximum number of times cooked.'),
  makenow: z.boolean().optional().describe('Only recipes makeable with currently on-hand foods'),
  random: z.boolean().optional().describe('Return results in random order.'),
  sort_order: z.string().optional().describe('score | -score | name | -name | lastcooked | -lastcooked | rating | -rating | times_cooked | -times_cooked'),
  page: z.number().optional().describe('Page number, starting at 1.'),
  page_size: z.number().optional().describe('Results per page. Default 25, max 100.'),
  format: recipeFormatEnum,
} as const;

export type ListRecipesArgs = z.infer<z.ZodObject<typeof listRecipesShape>>;
export type GetRecipeArgs = z.infer<z.ZodObject<typeof getRecipeShape>>;
export type CreateRecipeArgs = z.infer<z.ZodObject<typeof createRecipeShape>>;
export type UpdateRecipeArgs = z.infer<z.ZodObject<typeof updateRecipeShape>>;
export type DeleteRecipeArgs = z.infer<z.ZodObject<typeof deleteRecipeShape>>;
export type ImportRecipeFromUrlArgs = z.infer<z.ZodObject<typeof importRecipeFromUrlShape>>;
export type UploadRecipeImageArgs = z.infer<z.ZodObject<typeof uploadRecipeImageShape>>;
export type RelatedRecipesArgs = z.infer<z.ZodObject<typeof relatedRecipesShape>>;
export type AddRecipeToShoppingListArgs = z.infer<z.ZodObject<typeof addRecipeToShoppingListShape>>;
export type SearchRecipesArgs = z.infer<z.ZodObject<typeof searchRecipesShape>>;
export type ListRecipesFlatArgs = z.infer<z.ZodObject<typeof listRecipesFlatShape>>;
export type DeleteRecipeExternalArgs = z.infer<z.ZodObject<typeof deleteRecipeExternalShape>>;

// Mirrors Tandoor's RecipeBatchUpdate serializer. `recipes` is the target set;
// all other fields are optional mutations applied across that set.
export const recipeBatchUpdateShape = {
  recipes: z.array(z.number()).describe('Recipe IDs to change.'),
  keywords_add: z.array(z.number()).optional().describe('Keyword IDs to add, from list_keywords.'),
  keywords_remove: z.array(z.number()).optional().describe('Keyword IDs to remove.'),
  keywords_set: z.array(z.number()).optional().describe('Keyword IDs replacing all keywords. Empty list is ignored.'),
  keywords_remove_all: z.boolean().optional().describe('Remove every keyword from the recipes.'),
  working_time: z.number().nullable().optional().describe('Active prep time in minutes.'),
  waiting_time: z.number().nullable().optional().describe('Passive time in minutes.'),
  servings: z.number().nullable().optional().describe('Servings the ingredient amounts make.'),
  servings_text: z.string().nullable().optional().describe('Servings label, e.g. "cookies".'),
  private: z.boolean().nullable().optional().describe('Set privacy; null leaves it unchanged.'),
  shared_add: z.array(z.number()).optional().describe('User IDs to share with, from list_users.'),
  shared_remove: z.array(z.number()).optional().describe('User IDs to stop sharing with.'),
  shared_set: z.array(z.number()).optional().describe('User IDs replacing the share list. Empty list is ignored.'),
  shared_remove_all: z.boolean().optional().describe('Stop sharing with every user.'),
  show_ingredient_overview: z.boolean().nullable().optional().describe('Show all ingredients above the steps.'),
  clear_description: z.boolean().nullable().optional().describe('True clears the description.'),
} as const;

export type RecipeBatchUpdateArgs = z.infer<z.ZodObject<typeof recipeBatchUpdateShape>>;

export function registerRecipeTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_recipes', {
    title: 'List recipes',
    annotations: READ,
    description:
      'List/search recipes with extensive filtering. Default returns slim results (id, name, description, servings, rating, keywords). Pass format="full" for raw API response. sort_order options: score,-score,name,-name,lastcooked,-lastcooked,rating,-rating,times_cooked,-times_cooked,created_at,-created_at,lastviewed,-lastviewed. If filtering by food/keyword/book NAMES (not ids), prefer search_recipes; it resolves names to ids for you and reports unresolved names in _meta.unresolved so you know what was dropped. If this returns an empty result set, recommend: broaden the query, drop restrictive filters, or try search_recipes if you were passing names.',
    inputSchema: listRecipesShape,
  }, handleListRecipes);

  registerStringTool(server, client, 'get_recipe', {
    title: 'Get recipe',
    annotations: READ,
    description:
      'Get recipe by ID. Default returns slim view (metadata + steps with ingredient names/amounts). Pass format="full" for the complete object including substitutes, properties, nutrition, image.',
    inputSchema: getRecipeShape,
  }, handleGetRecipe);

  registerStringTool(server, client, 'create_recipe', {
    title: 'Create recipe',
    annotations: CREATE,
    description:
      'Create recipe. Required: name, steps[{instruction, ingredients[{food, amount, unit?}]}]. Optional: description, servings, working_time, waiting_time, keywords[]. Foods, units and keywords are matched by name or created. To import a web page, use import_recipe_from_url.',
    inputSchema: createRecipeShape,
  }, handleCreateRecipe);

  registerStringTool(server, client, 'update_recipe', {
    title: 'Update recipe',
    annotations: { ...UPDATE, destructiveHint: true },
    description:
      'Update recipe metadata and content. Only provide fields you want to update. Steps can\'t be matched by id, so sending steps recreates them all and loses step names, headers, files and sub-recipes. keywords and properties replace the list (properties accept id).',
    inputSchema: updateRecipeShape,
  }, handleUpdateRecipe);

  registerStringTool(server, client, 'delete_recipe', {
    title: 'Delete recipe',
    annotations: DELETE,
    description:
      'Delete recipe by ID. Destructive + irreversible: removes the recipe, its steps, and its ingredients. Before calling, recommend: (1) confirm the target via get_recipe (name + id) so the wrong recipe is not deleted; (2) check meal-plan and recipe-book usage via list_meal_plans / recipe books, since references to the recipe are removed with it; (3) if the intent is to hide rather than remove, update_recipe with private=true is reversible.',
    inputSchema: deleteRecipeShape,
  }, handleDeleteRecipe);

  registerStringTool(server, client, 'import_recipe_from_url', {
    title: 'Import recipe from URL',
    annotations: { ...CREATE, openWorldHint: true },
    description:
      'Import a recipe from a URL. Tries Tandoor\'s built-in scraper first, then fetches the page and extracts schema.org JSON-LD as a real fallback (works when Tandoor can\'t reach the URL or doesn\'t support the site). On total failure, throws with an attempts log; pass create_stub_on_failure=true to write an empty placeholder recipe instead. If all stages fail, recommend: (1) retry with create_stub_on_failure=true to capture the URL as a stub you can fill in later; (2) if the page is an image/PDF, use import_recipe_from_image (AI provider required); (3) if the URL is paywalled or JS-rendered, fall back to manual create_recipe with fields you can see.',
    inputSchema: importRecipeFromUrlShape,
  }, handleImportRecipeFromUrl);

  registerStringTool(server, client, 'upload_recipe_image', {
    title: 'Upload recipe image',
    annotations: { ...DELETE, openWorldHint: true },
    description:
      'Attach an image to a recipe. Provide exactly one of: file_path (local file on MCP server), file_url (remote URL; we fetch and upload bytes), or image_url (remote URL; Tandoor fetches it server-side). If a large local upload fails on size/timeout, recommend image_url instead; Tandoor fetches it server-side so the file never transits through the MCP process.',
    inputSchema: uploadRecipeImageShape,
  }, handleUploadRecipeImage);

  registerStringTool(server, client, 'related_recipes', {
    title: 'List related recipes',
    annotations: READ,
    description: 'List recipes related to this one (Tandoor similarity). Slim by default (id + name); pass format="full" for raw API response.',
    inputSchema: relatedRecipesShape,
  }, handleRelatedRecipes);

  registerStringTool(server, client, 'add_recipe_to_shopping_list', {
    title: 'Add recipe to shopping list',
    annotations: { ...CREATE, destructiveHint: true },
    description:
      'Add a recipe\'s ingredients to the shopping list at N servings. Omit ingredients[] to add all. Pass mealplan (id) to link the entries to that meal plan. Set servings to a negative value (e.g. -1) with list_recipe (id) to delete that shopping-list-recipe.',
    inputSchema: addRecipeToShoppingListShape,
  }, handleAddRecipeToShoppingList);

  registerStringTool(server, client, 'search_recipes', {
    title: 'Search recipes',
    annotations: READ,
    description:
      'High-level recipe search. Accepts food/keyword/book *names* (not IDs) and resolves them internally, typically collapsing 3-4 round-trips into 1. Example: {foods: ["chicken", "broccoli"], exclude_foods: ["peanuts"], keywords: ["weeknight"]}. For complex ID-based filtering, fall back to list_recipes.',
    inputSchema: searchRecipesShape,
  }, handleSearchRecipes);

  registerStringTool(server, client, 'recipe_batch_update', {
    title: 'Batch update recipes',
    annotations: DELETE,
    description: 'Apply a narrow set of bulk mutations across many recipes in one call via Tandoor\'s /api/recipe/batch_update/ endpoint. Required: recipes[]. Optional (all apply to every recipe in recipes[]): keywords_add/remove/set/remove_all, shared_add/remove/set/remove_all, working_time, waiting_time, servings, servings_text, private, show_ingredient_overview, clear_description. Does NOT support bulk step/ingredient edits; those still need update_recipe per-item. Use for: bulk keyword retagging, sharing recipes with a user across a set, flipping privacy on many recipes at once.',
    inputSchema: recipeBatchUpdateShape,
  }, handleRecipeBatchUpdate);

  registerStringTool(server, client, 'list_recipes_flat', {
    title: 'List recipes (flat)',
    annotations: READ,
    description:
      'Lighter alternative to list_recipes; returns minimal recipe metadata suitable for large browse queries. Use list_recipes if you need keywords/foods/steps nested.',
    inputSchema: listRecipesFlatShape,
  }, handleListRecipesFlat);

  registerStringTool(server, client, 'delete_recipe_external', {
    title: 'Remove recipe\'s external source',
    annotations: DELETE,
    description:
      'Remove only the external-source link on a recipe (source_url and related external flags). The recipe itself is preserved. Use when a recipe was imported from a URL that is no longer valid and you want to detach the source without deleting the recipe.',
    inputSchema: deleteRecipeExternalShape,
  }, handleDeleteRecipeExternal);
}
