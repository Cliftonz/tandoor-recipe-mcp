// Recipe-related types

import { User } from './common.js';

export interface Food {
  id?: number;
  name: string;
  plural_name?: string;
  description?: string;
  recipe?: number | null;
  url?: string;
  supermarket_category?: number | null;
  inherit_fields?: number[];
  full_name?: string;
  ignore_shopping?: boolean;
  substitute?: Food[];
  substitute_siblings?: Food[];
  substitute_children?: Food[];
  child_inherit_fields?: number[];
  numchild?: number;
  numrecipe?: number;
  shopping_category?: number | null;
  properties_food_amount?: number;
  properties_food_unit?: number | null;
  depth?: number;
  path?: string;
  parent?: number | null;
  onhand_users?: number[];
}

export interface Unit {
  id?: number;
  name: string;
  plural_name?: string;
  description?: string;
  base_unit?: string | null;
}

export interface Ingredient {
  id?: number;
  food: Food;
  unit: Unit | null;
  amount: number;
  note?: string;
  order?: number;
  is_header?: boolean;
  no_amount?: boolean;
  original_text?: string;
  always_use_plural_unit?: boolean;
  always_use_plural_food?: boolean;
}

export interface Step {
  id?: number;
  name?: string;
  instruction: string;
  ingredients: Ingredient[];
  time?: number;
  order?: number;
  show_as_header?: boolean;
  file?: any;
  step_recipe?: number | null;
  show_ingredients_table?: boolean;
}

export interface Keyword {
  id?: number;
  name: string;
  icon?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  numrecipe?: number;
  parent?: number | null;
  full_name?: string;
  path?: string;
  depth?: number;
}

export interface NutritionInformation {
  id?: number;
  carbohydrates?: number;
  fats?: number;
  proteins?: number;
  calories?: number;
  source?: string;
}

export interface Property {
  id?: number;
  name: string;
  property_amount: number;
  property_type: {
    id: number;
    name: string;
    unit: string;
    order: number;
    fdc_id?: string;
  };
}

export interface Recipe {
  id?: number;
  name: string;
  description?: string;
  image?: string;
  keywords?: Keyword[];
  steps: Step[];
  working_time?: number;
  waiting_time?: number;
  created_by?: User;
  created_at?: string;
  updated_at?: string;
  source_url?: string;
  internal?: boolean;
  show_ingredient_overview?: boolean;
  nutrition?: NutritionInformation | null;
  properties?: Property[];
  servings?: number;
  file_path?: string;
  servings_text?: string;
  rating?: number;
  last_cooked?: string;
  private?: boolean;
  shared?: User[];
}

export interface RecipeOverview {
  id: number;
  name: string;
  description?: string;
  image?: string;
  keywords?: { id: number; label: string; }[];
  working_time?: number;
  waiting_time?: number;
  created_by?: User;
  created_at?: string;
  updated_at?: string;
  internal?: boolean;
  servings?: number;
  servings_text?: string;
  rating?: number;
  last_cooked?: string;
  new?: boolean;
}

export interface PaginatedRecipeList {
  count: number;
  next: string | null;
  previous: string | null;
  results: RecipeOverview[];
}

export interface PaginatedIngredientList {
  count: number;
  next: string | null;
  previous: string | null;
  results: Ingredient[];
}

export interface ParsedIngredient {
  amount: number;
  unit: string;
  food: string;
  note: string;
  original_text: string;
}
