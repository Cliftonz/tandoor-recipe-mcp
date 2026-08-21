import { BaseClient } from './base.js';

type Opts = { signal?: AbortSignal };

export class MealTypeClient extends BaseClient {
  async createMealType(body: any, opts?: Opts): Promise<any> {
    return this.request('/api/meal-type/', { method: 'POST', body: JSON.stringify(body), signal: opts?.signal });
  }

  async getMealType(id: number, opts?: Opts): Promise<any> {
    return this.request(`/api/meal-type/${id}/`, { signal: opts?.signal });
  }

  async patchMealType(id: number, body: any, opts?: Opts): Promise<any> {
    return this.request(`/api/meal-type/${id}/`, { method: 'PATCH', body: JSON.stringify(body), signal: opts?.signal });
  }

  async deleteMealType(id: number, opts?: Opts): Promise<void> {
    return this.request(`/api/meal-type/${id}/`, { method: 'DELETE', signal: opts?.signal });
  }
}
