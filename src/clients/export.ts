import { BaseClient, qs } from './base.js';

type Opts = { signal?: AbortSignal };

export class ExportClient extends BaseClient {
  async exportRecipes(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/export/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async listExportLogs(params?: { page?: number; page_size?: number }, opts?: Opts): Promise<any> {
    return this.request(`/api/export-log/${qs(params)}`, { signal: opts?.signal });
  }

  async getExportLog(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/export-log/${id}/`, { signal: opts?.signal });
  }

  async createExportLog(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/export-log/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async patchExportLog(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/export-log/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteExportLog(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/export-log/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }
}
