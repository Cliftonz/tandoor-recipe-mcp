// Recipe book API client.

import { BaseClient } from './base.js';

function qs(params?: Record<string, any>): string {
  const sp = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) sp.append(k, String(v));
    });
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export class RecipeBookClient extends BaseClient {
  // ---------- Recipe books ----------

  async listBooks(params?: {
    page?: number;
    page_size?: number;
    limit?: string;
    order_field?: 'id' | 'name' | 'order';
    order_direction?: 'asc' | 'desc';
  }): Promise<any> {
    return this.request(`/api/recipe-book/${qs(params)}`);
  }

  async getBook(id: number): Promise<any> {
    return this.request(`/api/recipe-book/${id}/`);
  }

  async createBook(body: any): Promise<any> {
    return this.request('/api/recipe-book/', { method: 'POST', body: JSON.stringify(body) });
  }

  async patchBook(id: number, body: any): Promise<any> {
    return this.request(`/api/recipe-book/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async deleteBook(id: number): Promise<void> {
    return this.request(`/api/recipe-book/${id}/`, { method: 'DELETE' });
  }

  // ---------- Recipe book entries (recipe ↔ book links) ----------

  async listBookEntries(params?: { page?: number; page_size?: number; book?: number }): Promise<any> {
    return this.request(`/api/recipe-book-entry/${qs(params)}`);
  }

  async getBookEntry(id: number): Promise<any> {
    return this.request(`/api/recipe-book-entry/${id}/`);
  }

  async createBookEntry(body: { book: number; recipe: number }): Promise<any> {
    return this.request('/api/recipe-book-entry/', { method: 'POST', body: JSON.stringify(body) });
  }

  async deleteBookEntry(id: number): Promise<void> {
    return this.request(`/api/recipe-book-entry/${id}/`, { method: 'DELETE' });
  }
}
