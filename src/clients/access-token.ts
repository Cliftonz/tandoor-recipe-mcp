import { BaseClient, qs } from './base.js';

type Opts = { signal?: AbortSignal };

export class AccessTokenClient extends BaseClient {
  async listTokens(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/access-token/${qs(params)}`, { signal: opts?.signal });
  }

  async getToken(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/access-token/${id}/`, { signal: opts?.signal });
  }

  async createToken(body: { scope: string; expires: string }, opts?: Opts): Promise<any> {
    return this.request('/api/access-token/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchToken(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/access-token/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteToken(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/access-token/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  async authenticate(body: { username: string; password: string }, opts?: Opts): Promise<any> {
    return this.request('/api-token-auth/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }
}
