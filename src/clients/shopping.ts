// Shopping list API client.

import { BaseClient, qs } from './base.js';
import { allPages } from '../lib/paging.js';

type Opts = { signal?: AbortSignal };

type ShoppingListBody = { name?: string; description?: string; color?: string | null };

export class ShoppingClient extends BaseClient {
  // ---------- Shopping lists ----------

  async listShoppingLists(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/shopping-list/${qs(params)}`, { signal: opts?.signal });
  }

  async getShoppingList(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/shopping-list/${id}/`, { signal: opts?.signal });
  }

  async createShoppingList(body: ShoppingListBody, opts?: Opts): Promise<any> {
    return this.request('/api/shopping-list/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchShoppingList(id: number, body: ShoppingListBody, opts?: Opts): Promise<any> {
    return this.request(`/api/shopping-list/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteShoppingList(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/shopping-list/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  async listAllShoppingLists(opts?: Opts): Promise<any[]> {
    return allPages((page) => this.listShoppingLists({ page, page_size: 100 }, opts));
  }

  async assertShoppingListsExist(ids: number[], opts?: Opts): Promise<void> {
    if (ids.length === 0) return;
    const known = new Set((await this.listAllShoppingLists(opts)).map((l) => l.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new Error(`These shopping list ids do not exist in this space: ${unknown.join(', ')}. Nothing was changed. Use list_shopping_lists to see the lists.`);
    }
  }

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

  async bulkUpdateEntries(body: { ids: number[] }, opts?: Opts): Promise<any> {
    return this.request('/api/shopping-list-entry/bulk/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
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
    entries: Array<{ amount: number; food_id: number | null; unit_id: number | null; ingredient_id: number | null }>,
    shoppingListsIds: number[],
  ): Promise<any> {
    return this.request(`/api/shopping-list-recipe/${id}/bulk_create_entries/`, {
      method: 'POST',
      body: JSON.stringify({ entries, shopping_lists_ids: shoppingListsIds }),
    });
  }
}
