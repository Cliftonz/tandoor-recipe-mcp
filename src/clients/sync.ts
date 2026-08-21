import { BaseClient, qs } from './base.js';

type Opts = { signal?: AbortSignal };

export class SyncClient extends BaseClient {
  async listSyncs(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/sync/${qs(params)}`, { signal: opts?.signal });
  }

  async getSync(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/sync/${id}/`, { signal: opts?.signal });
  }

  async createSync(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/sync/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchSync(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/sync/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteSync(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/sync/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }

  async querySyncedFolder(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/sync/${id}/query_synced_folder/`, { method: 'POST', body: '{}', signal: opts?.signal });
  }

  async listSyncLogs(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/sync-log/${qs(params)}`, { signal: opts?.signal });
  }

  async getSyncLog(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/sync-log/${id}/`, { signal: opts?.signal });
  }
}
