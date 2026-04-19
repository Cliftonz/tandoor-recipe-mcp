// Shopping list API client.

import { BaseClient } from './base.js';

export class ShoppingClient extends BaseClient {
  // ---------- Shopping list entries ----------

  async listEntries(params?: {
    page?: number;
    page_size?: number;
    mealplan?: number;
    updated_after?: string;
  }): Promise<any> {
    const sp = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) sp.append(k, String(v));
      });
    }
    const qs = sp.toString();
    return this.request(`/api/shopping-list-entry/${qs ? `?${qs}` : ''}`);
  }

  async getEntry(id: number): Promise<any> {
    return this.request(`/api/shopping-list-entry/${id}/`);
  }

  async createEntry(body: any): Promise<any> {
    return this.request('/api/shopping-list-entry/', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async patchEntry(id: number, body: any): Promise<any> {
    return this.request(`/api/shopping-list-entry/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async deleteEntry(id: number): Promise<void> {
    return this.request(`/api/shopping-list-entry/${id}/`, { method: 'DELETE' });
  }

  /** Bulk check/uncheck many entries by id. */
  async bulkCheckEntries(ids: number[], checked: boolean): Promise<any> {
    return this.request('/api/shopping-list-entry/bulk/', {
      method: 'POST',
      body: JSON.stringify({ ids, checked }),
    });
  }

  // ---------- Shopping list recipes ----------

  async listShoppingListRecipes(params?: {
    page?: number;
    page_size?: number;
    mealplan?: number;
  }): Promise<any> {
    const sp = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) sp.append(k, String(v));
      });
    }
    const qs = sp.toString();
    return this.request(`/api/shopping-list-recipe/${qs ? `?${qs}` : ''}`);
  }

  async getShoppingListRecipe(id: number): Promise<any> {
    return this.request(`/api/shopping-list-recipe/${id}/`);
  }

  async createShoppingListRecipe(body: any): Promise<any> {
    return this.request('/api/shopping-list-recipe/', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async patchShoppingListRecipe(id: number, body: any): Promise<any> {
    return this.request(`/api/shopping-list-recipe/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async deleteShoppingListRecipe(id: number): Promise<void> {
    return this.request(`/api/shopping-list-recipe/${id}/`, { method: 'DELETE' });
  }

  /** Append entries to an existing shopping-list-recipe in one call. */
  async bulkCreateRecipeEntries(
    id: number,
    entries: Array<{ amount: number; food_id: number | null; unit_id: number | null; ingredient_id: number | null }>
  ): Promise<any> {
    return this.request(`/api/shopping-list-recipe/${id}/bulk_create_entries/`, {
      method: 'POST',
      body: JSON.stringify({ entries }),
    });
  }
}
