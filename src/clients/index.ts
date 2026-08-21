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
import { TreeSafetyClient } from './tree-safety.js';
import { MealTypeClient } from './mealtype.js';
import { SupermarketClient } from './supermarket.js';
import { InviteLinkClient } from './invite-link.js';
import { AccessTokenClient } from './access-token.js';
import { ExportClient } from './export.js';
import { ImportClient } from './import.js';
import { StorageClient } from './storage.js';
import { SyncClient } from './sync.js';
import { SpaceClient } from './space.js';
import { HousekeepingClient } from './housekeeping.js';

export class TandoorClient {
  private _config: TandoorConfig;
  private _recipes?: RecipeClient;
  private _mealPlans?: MealPlanClient;
  private _ingredients?: IngredientClient;
  private _shopping?: ShoppingClient;
  private _ai?: AiClient;
  private _foodUnits?: FoodUnitClient;
  private _cookLogs?: CookLogClient;
  private _recipeBooks?: RecipeBookClient;
  private _keywords?: KeywordClient;
  private _supermarketCategories?: SupermarketCategoryClient;
  private _unitConversions?: UnitConversionClient;
  private _properties?: PropertyClient;
  private _propertyTypes?: PropertyTypeClient;
  private _customFilters?: CustomFilterClient;
  private _supermarketCategoryRelations?: SupermarketCategoryRelationClient;
  private _steps?: StepClient;
  private _shareLinks?: ShareLinkClient;
  private _userPreferences?: UserPreferenceClient;
  private _automations?: AutomationClient;
  private _userFiles?: UserFileClient;
  private _logs?: LogClient;
  private _serverSettings?: ServerSettingsClient;
  private _treeSafety?: TreeSafetyClient;
  private _mealTypes?: MealTypeClient;
  private _supermarkets?: SupermarketClient;
  private _inviteLinks?: InviteLinkClient;
  private _accessTokens?: AccessTokenClient;
  private _exports?: ExportClient;
  private _imports?: ImportClient;
  private _storages?: StorageClient;
  private _syncs?: SyncClient;
  private _spaces?: SpaceClient;
  private _housekeeping?: HousekeepingClient;

  constructor(config: TandoorConfig) {
    this._config = config;
  }

  get recipes(): RecipeClient {
    return (this._recipes ??= new RecipeClient(this._config));
  }
  get mealPlans(): MealPlanClient {
    return (this._mealPlans ??= new MealPlanClient(this._config));
  }
  get ingredients(): IngredientClient {
    return (this._ingredients ??= new IngredientClient(this._config));
  }
  get shopping(): ShoppingClient {
    return (this._shopping ??= new ShoppingClient(this._config));
  }
  get ai(): AiClient {
    return (this._ai ??= new AiClient(this._config));
  }
  get foodUnits(): FoodUnitClient {
    return (this._foodUnits ??= new FoodUnitClient(this._config));
  }
  get cookLogs(): CookLogClient {
    return (this._cookLogs ??= new CookLogClient(this._config));
  }
  get recipeBooks(): RecipeBookClient {
    return (this._recipeBooks ??= new RecipeBookClient(this._config));
  }
  get keywords(): KeywordClient {
    return (this._keywords ??= new KeywordClient(this._config));
  }
  get supermarketCategories(): SupermarketCategoryClient {
    return (this._supermarketCategories ??= new SupermarketCategoryClient(this._config));
  }
  get unitConversions(): UnitConversionClient {
    return (this._unitConversions ??= new UnitConversionClient(this._config));
  }
  get properties(): PropertyClient {
    return (this._properties ??= new PropertyClient(this._config));
  }
  get propertyTypes(): PropertyTypeClient {
    return (this._propertyTypes ??= new PropertyTypeClient(this._config));
  }
  get customFilters(): CustomFilterClient {
    return (this._customFilters ??= new CustomFilterClient(this._config));
  }
  get supermarketCategoryRelations(): SupermarketCategoryRelationClient {
    return (this._supermarketCategoryRelations ??= new SupermarketCategoryRelationClient(this._config));
  }
  get steps(): StepClient {
    return (this._steps ??= new StepClient(this._config));
  }
  get shareLinks(): ShareLinkClient {
    return (this._shareLinks ??= new ShareLinkClient(this._config));
  }
  get userPreferences(): UserPreferenceClient {
    return (this._userPreferences ??= new UserPreferenceClient(this._config));
  }
  get automations(): AutomationClient {
    return (this._automations ??= new AutomationClient(this._config));
  }
  get userFiles(): UserFileClient {
    return (this._userFiles ??= new UserFileClient(this._config));
  }
  get logs(): LogClient {
    return (this._logs ??= new LogClient(this._config));
  }
  get serverSettings(): ServerSettingsClient {
    return (this._serverSettings ??= new ServerSettingsClient(this._config));
  }
  get treeSafety(): TreeSafetyClient {
    return (this._treeSafety ??= new TreeSafetyClient(this._config));
  }
  set treeSafety(v: TreeSafetyClient) {
    this._treeSafety = v;
  }
  get mealTypes(): MealTypeClient {
    return (this._mealTypes ??= new MealTypeClient(this._config));
  }
  get supermarkets(): SupermarketClient {
    return (this._supermarkets ??= new SupermarketClient(this._config));
  }
  get inviteLinks(): InviteLinkClient {
    return (this._inviteLinks ??= new InviteLinkClient(this._config));
  }
  get accessTokens(): AccessTokenClient {
    return (this._accessTokens ??= new AccessTokenClient(this._config));
  }
  get exports(): ExportClient {
    return (this._exports ??= new ExportClient(this._config));
  }
  get imports(): ImportClient {
    return (this._imports ??= new ImportClient(this._config));
  }
  get storages(): StorageClient {
    return (this._storages ??= new StorageClient(this._config));
  }
  get syncs(): SyncClient {
    return (this._syncs ??= new SyncClient(this._config));
  }
  get spaces(): SpaceClient {
    return (this._spaces ??= new SpaceClient(this._config));
  }
  get housekeeping(): HousekeepingClient {
    return (this._housekeeping ??= new HousekeepingClient(this._config));
  }

  /** Resolved Tandoor API origin (no path/query/fragment). For startup logs. */
  public getBaseUrl(): string {
    return this.recipes.getBaseUrl();
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
export * from './tree-safety.js';
export * from './mealtype.js';
export * from './supermarket.js';
export * from './invite-link.js';
export * from './access-token.js';
export * from './export.js';
export * from './import.js';
export * from './storage.js';
export * from './sync.js';
export * from './space.js';
export * from './housekeeping.js';
