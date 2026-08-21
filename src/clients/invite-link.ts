import { BaseClient, qs } from './base.js';

type Opts = { signal?: AbortSignal };

export class InviteLinkClient extends BaseClient {
  async listInviteLinks(params?: {
    page?: number;
    page_size?: number;
    limit?: string;
    query?: string;
    unused?: boolean;
    internal_note?: string;
    updated_at?: string;
  }, opts?: Opts): Promise<any> {
    return this.request(`/api/invite-link/${qs(params)}`, { signal: opts?.signal });
  }

  async getInviteLink(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/invite-link/${id}/`, { signal: opts?.signal });
  }

  async createInviteLink(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/invite-link/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchInviteLink(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/invite-link/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteInviteLink(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/invite-link/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }
}
