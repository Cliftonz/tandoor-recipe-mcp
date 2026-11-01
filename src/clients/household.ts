import { BaseClient, qs, TandoorRequestOptions, explainOwnerOnly403 } from './base.js';

type Opts = { signal?: AbortSignal };

export class HouseholdClient extends BaseClient {
  protected request<T>(endpoint: string, options?: TandoorRequestOptions): Promise<T> {
    return explainOwnerOnly403(super.request<T>(endpoint, options));
  }

  async listHouseholds(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/household/${qs(params)}`, { signal: opts?.signal });
  }

  async getHousehold(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/household/${id}/`, { signal: opts?.signal });
  }

  async createHousehold(body: { name: string }, opts?: Opts): Promise<any> {
    return this.request('/api/household/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchHousehold(id: number, body: { name: string }, opts?: Opts): Promise<any> {
    return this.request(`/api/household/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteHousehold(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/household/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }
}
