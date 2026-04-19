// Meal plan related types

import { User } from './common.js';
import { RecipeOverview } from './recipe.js';

export interface MealType {
  id?: number;
  name: string;
  order?: number;
  time?: string | null;
  color?: string | null;
  default?: boolean;
  created_by?: number;
}

export interface MealPlan {
  id?: number;
  title?: string;
  recipe?: RecipeOverview | null;
  servings: number;
  note?: string;
  note_markdown?: string;
  from_date: string;
  to_date?: string;
  meal_type: MealType;
  created_by?: number;
  shared?: User[] | null;
  recipe_name?: string;
  meal_type_name?: string;
  shopping?: boolean;
  addshopping?: boolean;
}

export interface PaginatedMealPlanList {
  count: number;
  next: string | null;
  previous: string | null;
  results: MealPlan[];
}

export interface AutoMealPlan {
  start_date: string;
  end_date: string;
  meal_type_id: number;
  keyword_ids: number[];
  servings: number;
  shared?: User[] | null;
  addshopping: boolean;
}

export interface AutoMealPlanResponse {
  created_meal_plans?: MealPlan[];
  message?: string;
}
