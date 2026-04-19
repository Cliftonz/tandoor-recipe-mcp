// Main Tandoor client that combines all sub-clients

import { TandoorConfig } from '../types/index.js';
import { RecipeClient } from './recipe.js';
import { MealPlanClient } from './mealplan.js';
import { IngredientClient } from './ingredient.js';
import { ShoppingClient } from './shopping.js';
import { AiClient } from './ai.js';
import { FoodUnitClient } from './foodunit.js';
import { CookLogClient } from './cooklog.js';
import { RecipeBookClient } from './recipebook.js';
import {
  KeywordClient,
  SupermarketCategoryClient,
  UnitConversionClient,
  PropertyClient,
  PropertyTypeClient,
  CustomFilterClient,
  SupermarketCategoryRelationClient,
} from './misc.js';
import { StepClient } from './step.js';
import {
  ShareLinkClient,
  UserPreferenceClient,
  AutomationClient,
  UserFileClient,
  LogClient,
  ServerSettingsClient,
} from './admin.js';

export class TandoorClient {
  public recipes: RecipeClient;
  public mealPlans: MealPlanClient;
  public ingredients: IngredientClient;
  public shopping: ShoppingClient;
  public ai: AiClient;
  public foodUnits: FoodUnitClient;
  public cookLogs: CookLogClient;
  public recipeBooks: RecipeBookClient;
  public keywords: KeywordClient;
  public supermarketCategories: SupermarketCategoryClient;
  public unitConversions: UnitConversionClient;
  public properties: PropertyClient;
  public propertyTypes: PropertyTypeClient;
  public customFilters: CustomFilterClient;
  public supermarketCategoryRelations: SupermarketCategoryRelationClient;
  public steps: StepClient;
  public shareLinks: ShareLinkClient;
  public userPreferences: UserPreferenceClient;
  public automations: AutomationClient;
  public userFiles: UserFileClient;
  public logs: LogClient;
  public serverSettings: ServerSettingsClient;

  constructor(config: TandoorConfig) {
    this.recipes = new RecipeClient(config);
    this.mealPlans = new MealPlanClient(config);
    this.ingredients = new IngredientClient(config);
    this.shopping = new ShoppingClient(config);
    this.ai = new AiClient(config);
    this.foodUnits = new FoodUnitClient(config);
    this.cookLogs = new CookLogClient(config);
    this.recipeBooks = new RecipeBookClient(config);
    this.keywords = new KeywordClient(config);
    this.supermarketCategories = new SupermarketCategoryClient(config);
    this.unitConversions = new UnitConversionClient(config);
    this.properties = new PropertyClient(config);
    this.propertyTypes = new PropertyTypeClient(config);
    this.customFilters = new CustomFilterClient(config);
    this.supermarketCategoryRelations = new SupermarketCategoryRelationClient(config);
    this.steps = new StepClient(config);
    this.shareLinks = new ShareLinkClient(config);
    this.userPreferences = new UserPreferenceClient(config);
    this.automations = new AutomationClient(config);
    this.userFiles = new UserFileClient(config);
    this.logs = new LogClient(config);
    this.serverSettings = new ServerSettingsClient(config);
  }

  // Legacy methods for backward compatibility
  async listRecipes(...args: Parameters<RecipeClient['listRecipes']>) {
    return this.recipes.listRecipes(...args);
  }

  async getRecipe(...args: Parameters<RecipeClient['getRecipe']>) {
    return this.recipes.getRecipe(...args);
  }

  async createRecipe(...args: Parameters<RecipeClient['createRecipe']>) {
    return this.recipes.createRecipe(...args);
  }

  async updateRecipe(...args: Parameters<RecipeClient['updateRecipe']>) {
    return this.recipes.updateRecipe(...args);
  }

  async patchRecipe(...args: Parameters<RecipeClient['patchRecipe']>) {
    return this.recipes.patchRecipe(...args);
  }

  async findOrCreateKeyword(...args: Parameters<RecipeClient['findOrCreateKeyword']>) {
    return this.recipes.findOrCreateKeyword(...args);
  }

  async findOrCreateFood(...args: Parameters<RecipeClient['findOrCreateFood']>) {
    return this.recipes.findOrCreateFood(...args);
  }

  async findOrCreateUnit(...args: Parameters<RecipeClient['findOrCreateUnit']>) {
    return this.recipes.findOrCreateUnit(...args);
  }
}

// Re-export for convenience
export * from './base.js';
export * from './recipe.js';
export * from './mealplan.js';
export * from './ingredient.js';
export * from './shopping.js';
export * from './ai.js';
export * from './foodunit.js';
export * from './cooklog.js';
export * from './recipebook.js';
export * from './misc.js';
export * from './step.js';
export * from './admin.js';
