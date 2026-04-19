// Recipe-related API client

import { BaseClient } from './base.js';
import { Recipe, PaginatedRecipeList, Keyword, Food, Unit } from '../types/index.js';

export class RecipeClient extends BaseClient {
  /**
   * List recipes with optional filtering and pagination
   */
  async listRecipes(params?: {
    page?: number;
    page_size?: number;
    query?: string;
    sort_order?: string;
    random?: boolean;
    new?: boolean;
    num_recent?: number;
    internal?: boolean;
    makenow?: boolean;
    filter?: number;
    createdby?: number;
    rating?: number;
    rating_gte?: number;
    rating_lte?: number;
    timescooked?: number;
    timescooked_gte?: number;
    timescooked_lte?: number;
    units?: number;
    cookedon_gte?: string;
    cookedon_lte?: string;
    createdon?: string;
    createdon_gte?: string;
    createdon_lte?: string;
    updatedon?: string;
    updatedon_gte?: string;
    updatedon_lte?: string;
    viewedon_gte?: string;
    viewedon_lte?: string;
    keywords?: number[];
    keywords_or?: number[];
    keywords_and?: number[];
    keywords_or_not?: number[];
    keywords_and_not?: number[];
    foods?: number[];
    foods_or?: number[];
    foods_and?: number[];
    foods_or_not?: number[];
    foods_and_not?: number[];
    books?: number[];
    books_or?: number[];
    books_and?: number[];
    books_or_not?: number[];
    books_and_not?: number[];
  }): Promise<PaginatedRecipeList> {
    const searchParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach(v => searchParams.append(key, v.toString()));
          } else {
            searchParams.append(key, value.toString());
          }
        }
      });
    }

    const queryString = searchParams.toString();
    const endpoint = `/api/recipe/${queryString ? `?${queryString}` : ''}`;

    return this.request<PaginatedRecipeList>(endpoint);
  }

  /**
   * Get a single recipe by ID
   */
  async getRecipe(id: number): Promise<Recipe> {
    return this.request<Recipe>(`/api/recipe/${id}/`);
  }

  /**
   * Create a new recipe
   */
  async createRecipe(recipe: Recipe): Promise<Recipe> {
    return this.request<Recipe>('/api/recipe/', {
      method: 'POST',
      body: JSON.stringify(recipe),
    });
  }

  /**
   * Update an existing recipe (full update)
   */
  async updateRecipe(id: number, recipe: Recipe): Promise<Recipe> {
    return this.request<Recipe>(`/api/recipe/${id}/`, {
      method: 'PUT',
      body: JSON.stringify(recipe),
    });
  }

  /**
   * Partially update an existing recipe
   */
  async patchRecipe(id: number, updates: Partial<Recipe>): Promise<Recipe> {
    return this.request<Recipe>(`/api/recipe/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  /** Get recipes related to this one (Tandoor's similarity logic). */
  async relatedRecipes(id: number): Promise<any> {
    return this.request(`/api/recipe/${id}/related/`);
  }

  /**
   * Add a recipe's ingredients to the shopping list at N servings. Omit
   * `ingredients` to add them all. Set `servings=0` with a `list_recipe` id
   * to delete the shopping-list-recipe.
   */
  async recipeShoppingUpdate(
    id: number,
    body: { list_recipe?: number | null; ingredients?: number[]; servings?: number }
  ): Promise<any> {
    return this.request(`/api/recipe/${id}/shopping/`, {
      method: 'PUT',
      body: JSON.stringify({
        ingredients: body.ingredients ?? [],
        list_recipe: body.list_recipe ?? null,
        servings: body.servings ?? 1,
      }),
    });
  }

  /** AI-generate recipe properties (nutrition etc.) via configured AI provider. */
  async recipeAiProperties(id: number, body: any = {}, provider?: number): Promise<any> {
    const q = provider !== undefined ? `?provider=${provider}` : '';
    return this.request(`/api/recipe/${id}/aiproperties/${q}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Upload an image to a recipe. Provide either raw bytes + filename/mime
   * (will be sent as a multipart `image` part) or an `image_url` string which
   * Tandoor's server will fetch itself.
   */
  async uploadRecipeImage(
    id: number,
    args: { file?: { data: Uint8Array | Buffer; filename: string; mimeType?: string }; image_url?: string }
  ): Promise<any> {
    const fd = new FormData();
    if (args.file) {
      const blob = new Blob([new Uint8Array(args.file.data)], {
        type: args.file.mimeType || 'application/octet-stream',
      });
      fd.append('image', blob, args.file.filename);
    }
    if (args.image_url) {
      fd.append('image_url', args.image_url);
    }
    return this.request(`/api/recipe/${id}/image/`, { method: 'PUT', body: fd });
  }

  /**
   * Scrape a recipe from a URL (or raw source data) using Tandoor's extractor.
   * Returns the parsed recipe structure — NOT persisted. Caller must POST to
   * /api/recipe/ to save.
   */
  async recipeFromSource(params: { url?: string; data?: string }): Promise<any> {
    return this.request<any>('/api/recipe-from-source/', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Generic find-or-create. Handles the common race where two concurrent
   * callers both miss the lookup, both POST create, and one hits a uniqueness
   * violation. On 400/409 we re-list and return whichever one won — no
   * duplicates, no user-facing error.
   *
   * Tandoor returns 400 (not 409) for uniqueness violations on keyword/food,
   * so we catch both status codes to be safe.
   */
  private async findOrCreateByName<T extends { id: number; name: string }>(
    endpoint: string,
    name: string
  ): Promise<T> {
    const doLookup = async (): Promise<T | undefined> => {
      const searchParams = new URLSearchParams({ query: name });
      const response = await this.request<{ count: number; results: T[] }>(
        `${endpoint}?${searchParams.toString()}`
      );
      return response.results.find((r) => r.name.toLowerCase() === name.toLowerCase());
    };

    const existing = await doLookup();
    if (existing) return existing;

    try {
      return await this.request<T>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    } catch (err) {
      // Another caller beat us to the insert — re-lookup and return their row.
      const msg = err instanceof Error ? err.message : String(err);
      if (/400|409|already exists|unique/i.test(msg)) {
        const raced = await doLookup();
        if (raced) return raced;
      }
      throw err;
    }
  }

  /** Find a keyword by name, or create it if none exists. Race-safe. */
  async findOrCreateKeyword(name: string): Promise<{ id: number; name: string }> {
    return this.findOrCreateByName('/api/keyword/', name);
  }

  /** Find a food by name, or create it if none exists. Race-safe. */
  async findOrCreateFood(name: string): Promise<{ id: number; name: string }> {
    return this.findOrCreateByName('/api/food/', name);
  }

  /** Find a unit by name, or create it if none exists. Race-safe. Returns null for empty name. */
  async findOrCreateUnit(name: string): Promise<{ id: number; name: string } | null> {
    if (!name) return null;
    return this.findOrCreateByName('/api/unit/', name);
  }
}
