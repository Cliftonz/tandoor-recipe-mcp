// Storage API client. Manages external file-storage backends (Dropbox,
// Nextcloud, local) that Tandoor can sync to.

import { BaseClient, qs } from './base.js';

type Opts = { signal?: AbortSignal };

export class StorageClient extends BaseClient {
  async listStorages(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/storage/${qs(params)}`, { signal: opts?.signal });
  }

  async getStorage(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/storage/${id}/`, { signal: opts?.signal });
  }

  async createStorage(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/storage/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchStorage(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/storage/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteStorage(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/storage/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }
}
