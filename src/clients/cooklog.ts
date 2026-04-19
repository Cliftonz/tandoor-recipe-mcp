// Cook log API client.

import { BaseClient } from './base.js';

export class CookLogClient extends BaseClient {
  async listCookLogs(params?: { page?: number; page_size?: number; recipe?: number }): Promise<any> {
    const sp = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) sp.append(k, String(v));
      });
    }
    const qs = sp.toString();
    return this.request(`/api/cook-log/${qs ? `?${qs}` : ''}`);
  }

  async getCookLog(id: number): Promise<any> {
    return this.request(`/api/cook-log/${id}/`);
  }

  async createCookLog(body: any): Promise<any> {
    return this.request('/api/cook-log/', { method: 'POST', body: JSON.stringify(body) });
  }

  async patchCookLog(id: number, body: any): Promise<any> {
    return this.request(`/api/cook-log/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async deleteCookLog(id: number): Promise<void> {
    return this.request(`/api/cook-log/${id}/`, { method: 'DELETE' });
  }
}
