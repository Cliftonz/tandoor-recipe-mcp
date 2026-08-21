// Step API client (standalone step CRUD for granular recipe edits).

import { BaseClient, qs } from './base.js';

export class StepClient extends BaseClient {
  async listSteps(params?: {
    page?: number;
    page_size?: number;
    query?: string;
    recipe?: number[];
  }): Promise<any> {
    return this.request(`/api/step/${qs(params)}`);
  }

  async getStep(id: number): Promise<any> {
    return this.request(`/api/step/${id}/`);
  }

  async createStep(body: any): Promise<any> {
    return this.request('/api/step/', { method: 'POST', body: JSON.stringify(body) });
  }

  async patchStep(id: number, body: any): Promise<any> {
    return this.request(`/api/step/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async deleteStep(id: number): Promise<void> {
    return this.request(`/api/step/${id}/`, { method: 'DELETE' });
  }
}
