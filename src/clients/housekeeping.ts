import { BaseClient, qs } from './base.js';

type Opts = { signal?: AbortSignal };

export class HousekeepingClient extends BaseClient {
  // ---------- Connector-config ----------

  async listConnectors(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/connector-config/${qs(params)}`, { signal: opts?.signal });
  }

  async getConnector(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/connector-config/${id}/`, { signal: opts?.signal });
  }

  async createConnector(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/connector-config/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchConnector(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/connector-config/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteConnector(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/connector-config/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  // ---------- View-log ----------

  async getViewLog(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/view-log/${id}/`, { signal: opts?.signal });
  }

  async patchViewLog(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/view-log/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteViewLog(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/view-log/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  // ---------- Search preferences ----------

  async listSearchFields(opts?: Opts): Promise<any> {
    return this.request('/api/search-fields/', { signal: opts?.signal });
  }

  async listSearchPreferences(opts?: Opts): Promise<any> {
    return this.request('/api/search-preference/', { signal: opts?.signal });
  }

  async patchSearchPreference(user: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/search-preference/${user}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  // ---------- Localization ----------

  async getLocalization(opts?: Opts): Promise<any> {
    return this.request('/api/localization/', { signal: opts?.signal });
  }

  // ---------- Groups ----------

  async listGroups(opts?: Opts): Promise<any> {
    return this.request('/api/group/', { signal: opts?.signal });
  }

  async getGroup(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/group/${id}/`, { signal: opts?.signal });
  }

  // ---------- Users ----------

  async listUsers(params?: { filter_list?: string[] }, opts?: Opts): Promise<any> {
    return this.request(`/api/user/${qs(params)}`, { signal: opts?.signal });
  }

  async getUser(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/user/${id}/`, { signal: opts?.signal });
  }

  async patchUser(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/user/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  // ---------- Meal-plan iCal ----------
  // Response is text/calendar, not JSON, so use requestText (still gets retry,
  // redaction, logging, signal via the base pipeline).

  async exportMealPlanIcal(params?: { from_date?: string; to_date?: string; meal_type?: number[] }, opts?: Opts): Promise<string> {
    return this.requestText(`/api/meal-plan/ical/${qs(params)}`, { accept: 'text/calendar', signal: opts?.signal });
  }

  // ---------- Recipe file / external link (metadata only) ----------

  async getExternalFileLink(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/get_external_file_link/${id}/`, { signal: opts?.signal });
  }

  async getRecipeFileMetadata(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/get_recipe_file/${id}/`, { signal: opts?.signal });
  }
}
