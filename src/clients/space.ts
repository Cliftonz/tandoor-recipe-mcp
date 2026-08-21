// Space, user-space, and switch-active-space API client.

import { BaseClient, qs } from './base.js';

type Opts = { signal?: AbortSignal };

export class SpaceClient extends BaseClient {
  // ---------- Spaces ----------

  async listSpaces(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/space/${qs(params)}`, { signal: opts?.signal });
  }

  async getSpace(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/space/${id}/`, { signal: opts?.signal });
  }

  async getCurrentSpace(opts?: Opts): Promise<any> {
    return this.request('/api/space/current/', { signal: opts?.signal });
  }

  async createSpace(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/space/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchSpace(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/space/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  // ---------- User-spaces (memberships) ----------

  async listUserSpaces(params?: { page?: number; page_size?: number; internal_note?: string }, opts?: Opts): Promise<any> {
    return this.request(`/api/user-space/${qs(params)}`, { signal: opts?.signal });
  }

  async getUserSpace(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/user-space/${id}/`, { signal: opts?.signal });
  }

  async patchUserSpace(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/user-space/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteUserSpace(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/user-space/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  async listAllPersonalUserSpaces(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/user-space/all_personal/${qs(params)}`, { signal: opts?.signal });
  }

  // ---------- Switch active space ----------
  // Mutates the token's server-side active space; every subsequent request against
  // this token then operates in the new space.
  async switchActiveSpace(spaceId: number, opts?: Opts): Promise<any> {
    return this.request(`/api/switch-active-space/${spaceId}/`, { signal: opts?.signal });
  }
}
