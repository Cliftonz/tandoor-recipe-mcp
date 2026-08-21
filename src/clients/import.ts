import { BaseClient, qs } from './base.js';

type Opts = { signal?: AbortSignal };

export class ImportClient extends BaseClient {
  // ---------- General import ----------

  async importRecipes(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/import/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  // ---------- Import log ----------

  async createImportLog(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/import-log/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async getImportLog(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/import-log/${id}/`, { signal: opts?.signal });
  }

  async patchImportLog(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/import-log/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteImportLog(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/import-log/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  // ---------- Import open data ----------

  async listOpenDataImports(opts?: Opts): Promise<any> {
    return this.request('/api/import-open-data/', { signal: opts?.signal });
  }

  async runOpenDataImport(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/import-open-data/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  // ---------- Recipe-import queue ----------

  async listRecipeImports(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/recipe-import/${qs(params)}`, { signal: opts?.signal });
  }

  async createRecipeImport(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/recipe-import/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async getRecipeImport(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/recipe-import/${id}/`, { signal: opts?.signal });
  }

  async patchRecipeImport(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/recipe-import/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteRecipeImport(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/recipe-import/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  async importAllPending(opts?: Opts): Promise<any> {
    return this.request('/api/recipe-import/import_all/', { method: 'POST', body: JSON.stringify({}), signal: opts?.signal });
  }

  async importPendingRecipe(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/recipe-import/${id}/import_recipe/`, { method: 'POST', body: JSON.stringify({}), signal: opts?.signal });
  }

  // ---------- Bookmarklet import ----------

  async listBookmarkletImports(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/bookmarklet-import/${qs(params)}`, { signal: opts?.signal });
  }

  async createBookmarkletImport(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/bookmarklet-import/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async getBookmarkletImport(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/bookmarklet-import/${id}/`, { signal: opts?.signal });
  }

  async patchBookmarkletImport(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/bookmarklet-import/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteBookmarkletImport(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/bookmarklet-import/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  // ---------- FDC search ----------

  async fdcSearch(params: { query: string; dataType?: string[] }, opts?: Opts): Promise<any> {
    return this.request(`/api/fdc-search/${qs(params)}`, { signal: opts?.signal });
  }

  // ---------- Food inherit field ----------

  async listFoodInheritFields(opts?: Opts): Promise<any> {
    return this.request('/api/food-inherit-field/', { signal: opts?.signal });
  }

  async getFoodInheritField(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/food-inherit-field/${id}/`, { signal: opts?.signal });
  }
}
