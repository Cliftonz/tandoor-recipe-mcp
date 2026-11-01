import { BaseClient, qs } from './base.js';

type Opts = { signal?: AbortSignal };
type Paging = { page?: number; page_size?: number };

export class InventoryClient extends BaseClient {
  async listLocations(params?: Paging, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-location/${qs(params)}`, { signal: opts?.signal });
  }

  async getLocation(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-location/${id}/`, { signal: opts?.signal });
  }

  async createLocation(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/inventory-location/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchLocation(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-location/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteLocation(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/inventory-location/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  async listEntries(params?: Paging & { inventory_location_id?: number; food_id?: number; empty?: true }, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-entry/${qs(params)}`, { signal: opts?.signal });
  }

  async getEntry(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-entry/${id}/`, { signal: opts?.signal });
  }

  async createEntry(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/inventory-entry/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchEntry(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-entry/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteEntry(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/inventory-entry/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  async listLogs(params?: Paging & { entry_id?: number; food_id?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-log/${qs(params)}`, { signal: opts?.signal });
  }

  async getLog(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/inventory-log/${id}/`, { signal: opts?.signal });
  }
}
