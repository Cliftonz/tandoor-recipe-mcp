// Ingredient-related API client

import { BaseClient } from './base.js';
import {
  Food,
  Ingredient,
  PaginatedIngredientList,
  ParsedIngredient,
  Unit,
} from '../types/index.js';

type ParserIngredient = Omit<ParsedIngredient, 'unit' | 'food'> & { unit: Unit | null; food: Food | null };

export class IngredientClient extends BaseClient {
  /**
   * List ingredients. Optional filters: food (id), unit (id), pagination.
   */
  async listIngredients(params?: {
    page?: number;
    page_size?: number;
    food?: number;
    unit?: number;
  }): Promise<PaginatedIngredientList> {
    const searchParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }

    const queryString = searchParams.toString();
    const endpoint = `/api/ingredient/${queryString ? `?${queryString}` : ''}`;

    return this.request<PaginatedIngredientList>(endpoint);
  }

  /**
   * Get a single ingredient by ID
   */
  async getIngredient(id: number): Promise<Ingredient> {
    return this.request<Ingredient>(`/api/ingredient/${id}/`);
  }

  /**
   * Create a new ingredient
   */
  async createIngredient(ingredient: Partial<Ingredient>): Promise<Ingredient> {
    return this.request<Ingredient>('/api/ingredient/', {
      method: 'POST',
      body: JSON.stringify(ingredient),
    });
  }

  /**
   * Full update of an ingredient (PUT)
   */
  async updateIngredient(id: number, ingredient: Partial<Ingredient>): Promise<Ingredient> {
    return this.request<Ingredient>(`/api/ingredient/${id}/`, {
      method: 'PUT',
      body: JSON.stringify(ingredient),
    });
  }

  /**
   * Partial update of an ingredient (PATCH)
   */
  async patchIngredient(id: number, updates: Partial<Ingredient>): Promise<Ingredient> {
    return this.request<Ingredient>(`/api/ingredient/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Delete an ingredient
   */
  async deleteIngredient(id: number): Promise<void> {
    return this.request<void>(`/api/ingredient/${id}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Parse a free-form ingredient string into amount/unit/food/note.
   */
  async parseIngredientString(text: string): Promise<ParsedIngredient> {
    const { ingredient } = await this.request<{ ingredient: ParserIngredient }>('/api/ingredient-parser/post/', {
      method: 'POST',
      body: JSON.stringify({ ingredient: text }),
    });
    return {
      amount: ingredient.amount,
      unit: ingredient.unit?.name ?? '',
      food: ingredient.food?.name ?? '',
      note: ingredient.note,
      original_text: ingredient.original_text,
    };
  }
}
