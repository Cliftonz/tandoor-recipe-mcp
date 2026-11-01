import { BaseClient, qs, TandoorRequestOptions } from './base.js';

type Opts = { signal?: AbortSignal };

export function requireOwner<T>(call: Promise<T>): Promise<T> {
  return call.catch((e: Error) => {
    if (!e.message.startsWith('Tandoor API error: 403')) throw e;
    throw new Error(`This call requires the space owner; space admins and members get 403.\n\n${e.message}`);
  });
}

export class HouseholdClient extends BaseClient {
  protected request<T>(endpoint: string, options?: TandoorRequestOptions): Promise<T> {
    return requireOwner(super.request<T>(endpoint, options));
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
}
