// Meal plan related API client

import { BaseClient, TandoorRequestOptions } from './base.js';
import {
  MealPlan,
  PaginatedMealPlanList,
  AutoMealPlan,
  MealType
} from '../types/index.js';

export class MealPlanClient extends BaseClient {
  /**
   * List meal plans with optional filtering and pagination
   */
  async listMealPlans(params?: {
    page?: number;
    page_size?: number;
    from_date?: string;
    to_date?: string;
    meal_type?: number[];
  }): Promise<PaginatedMealPlanList> {
    const searchParams = new URLSearchParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach(v => searchParams.append(key, v.toString()));
          } else {
            searchParams.append(key, value.toString());
          }
        }
      });
    }

    const queryString = searchParams.toString();
    const endpoint = `/api/meal-plan/${queryString ? `?${queryString}` : ''}`;

    return this.request<PaginatedMealPlanList>(endpoint);
  }

  /**
   * Get a single meal plan by ID
   */
  async getMealPlan(id: number): Promise<MealPlan> {
    return this.request<MealPlan>(`/api/meal-plan/${id}/`);
  }

  /**
   * Create a new meal plan
   */
  async createMealPlan(mealPlan: MealPlan): Promise<MealPlan> {
    return this.request<MealPlan>('/api/meal-plan/', {
      method: 'POST',
      body: JSON.stringify(mealPlan),
    });
  }

  /**
   * Update an existing meal plan (full update)
   */
  async updateMealPlan(id: number, mealPlan: MealPlan): Promise<MealPlan> {
    return this.request<MealPlan>(`/api/meal-plan/${id}/`, {
      method: 'PUT',
      body: JSON.stringify(mealPlan),
    });
  }

  /**
   * Partially update an existing meal plan
   */
  async patchMealPlan(id: number, updates: Partial<MealPlan>): Promise<MealPlan> {
    return this.request<MealPlan>(`/api/meal-plan/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Delete a meal plan
   */
  async deleteMealPlan(id: number): Promise<void> {
    return this.request<void>(`/api/meal-plan/${id}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Create meal plans automatically using the auto-planner
   */
  async autoCreateMealPlans(params: AutoMealPlan): Promise<any> {
    return this.request<any>('/api/auto-plan/', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * List available meal types
   */
  async listMealTypes(): Promise<MealType[]> {
    const response = await this.request<{ results: MealType[] }>('/api/meal-type/');
    return response.results || [];
  }

  /**
   * Get a meal type by ID. Optional `opts` threads an AbortSignal and lets
   * callers cap retry amplification when this is a hydration step inside a
   * larger write.
   */
  async getMealType(id: number, opts?: Pick<TandoorRequestOptions, 'signal' | 'maxRetries'>): Promise<MealType> {
    return this.request<MealType>(`/api/meal-type/${id}/`, opts);
  }
}
