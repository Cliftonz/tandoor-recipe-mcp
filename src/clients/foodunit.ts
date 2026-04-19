// Food + Unit API client (full CRUD with merge, on-hand, batch update).

import { BaseClient } from './base.js';

function qs(params?: Record<string, any>): string {
  const sp = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) sp.append(k, String(v));
    });
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export class FoodUnitClient extends BaseClient {
  // ---------- Food ----------

  async listFoods(params?: {
    query?: string;
    limit?: number;
    page?: number;
    page_size?: number;
    random?: string;
    root?: number;
    root_tree?: number;
    tree?: number;
    updated_at?: string;
  }): Promise<any> {
    return this.request(`/api/food/${qs(params)}`);
  }

  async getFood(id: number): Promise<any> {
    return this.request(`/api/food/${id}/`);
  }

  async createFood(body: any): Promise<any> {
    return this.request('/api/food/', { method: 'POST', body: JSON.stringify(body) });
  }

  async patchFood(id: number, body: any): Promise<any> {
    return this.request(`/api/food/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async deleteFood(id: number): Promise<void> {
    return this.request(`/api/food/${id}/`, { method: 'DELETE' });
  }

  /** Merge food `id` into `target`. */
  async mergeFood(id: number, target: number, body: any = {}): Promise<any> {
    return this.request(`/api/food/${id}/merge/${target}/`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /** Move food `id` under parent `parent` (tree reparent). */
  async moveFood(id: number, parent: number, body: any = {}): Promise<any> {
    return this.request(`/api/food/${id}/move/${parent}/`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /** Add a food to active shopping lists, or wipe with delete=true. */
  async foodShoppingUpdate(
    id: number,
    body: { amount?: number | null; unit?: number | null; delete?: 'true' | null }
  ): Promise<any> {
    return this.request(`/api/food/${id}/shopping/`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async foodBatchUpdate(body: any): Promise<any> {
    return this.request('/api/food/batch_update/', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * Populate a food's properties from USDA FDC. Tandoor fills fdc-linked
   * properties and preserves any manual ones without fdc_id.
   */
  async foodFdcLookup(id: number, body: any = {}): Promise<any> {
    return this.request(`/api/food/${id}/fdc/`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** AI-generated properties fallback (when FDC is unavailable or incomplete). */
  async foodAiProperties(id: number, body: any = {}, provider?: number): Promise<any> {
    const q = provider !== undefined ? `?provider=${provider}` : '';
    return this.request(`/api/food/${id}/aiproperties/${q}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ---------- Unit ----------

  async listUnits(params?: {
    query?: string;
    limit?: number;
    page?: number;
    page_size?: number;
    random?: string;
    updated_at?: string;
  }): Promise<any> {
    return this.request(`/api/unit/${qs(params)}`);
  }

  async getUnit(id: number): Promise<any> {
    return this.request(`/api/unit/${id}/`);
  }

  async createUnit(body: any): Promise<any> {
    return this.request('/api/unit/', { method: 'POST', body: JSON.stringify(body) });
  }

  async patchUnit(id: number, body: any): Promise<any> {
    return this.request(`/api/unit/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async deleteUnit(id: number): Promise<void> {
    return this.request(`/api/unit/${id}/`, { method: 'DELETE' });
  }

  async mergeUnit(id: number, target: number, body: any = {}): Promise<any> {
    return this.request(`/api/unit/${id}/merge/${target}/`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }
}
