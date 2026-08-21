import { BaseClient, qs } from './base.js';

type Opts = { signal?: AbortSignal };

export class SupermarketClient extends BaseClient {
  async listSupermarkets(params?: {
    page?: number;
    page_size?: number;
    limit?: string;
    query?: string;
  }, opts?: Opts): Promise<any> {
    return this.request(`/api/supermarket/${qs(params)}`, { signal: opts?.signal });
  }

  async getSupermarket(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/supermarket/${id}/`, { signal: opts?.signal });
  }

  async createSupermarket(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/supermarket/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchSupermarket(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/supermarket/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteSupermarket(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/supermarket/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }
}
