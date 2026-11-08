import { SEED_COVERS } from './seed.js';

export interface ReviewedSkip {
  tool: string;
  reason: string;
  versions?: string[];
  arg?: string;
}

const AI_PROVIDER = 'needs a live AI provider';

export const SKIPS: ReviewedSkip[] = [
  { tool: 'fdc_search', reason: 'proxies the USDA FoodData Central API; needs outbound internet and a rate-limited USDA key' },
  { tool: 'food_fdc_lookup', reason: 'proxies the USDA FoodData Central API; needs outbound internet and a rate-limited USDA key' },
  { tool: 'food_ai_properties', reason: AI_PROVIDER },
  { tool: 'recipe_ai_properties', reason: AI_PROVIDER },
  { tool: 'import_recipe_from_image', reason: AI_PROVIDER },
  { tool: 'ai_step_sort', reason: AI_PROVIDER },
  { tool: 'import_recipes', reason: `${AI_PROVIDER}; Tandoor requires ai_provider_id` },
  { tool: 'import_recipe_from_url', reason: 'the strict public-URL check refuses local fixtures; needs a live public recipe page' },
  { tool: 'run_open_data_import', reason: 'downloads from raw.githubusercontent.com and bulk-seeds the space' },
  { tool: 'get_external_recipe_file_link', reason: 'works only for Nextcloud or Dropbox storage; LOCAL storage returns 500' },
  { tool: 'delete_recipe_external', reason: 'needs a writable LOCAL_STORAGE_PATHS dir; the bootstrap mounts it read-only' },
  {
    tool: 'food_shopping_update',
    arg: 'unit_id',
    versions: ['2.6.0'],
    reason: 'Tandoor 2.6.0 returns 500 when food_shopping_update gets unit_id; upstream bug fixed in Tandoor 2.6.15',
  },
];

// Write tools each real-Tandoor e2e file exercises, keyed by file name. Every
// readOnlyHint tool is covered by read-sweep.e2e.test.ts, which iterates the
// whole read set at runtime, so reads are not listed here. Each file asserts in
// afterAll that it called every tool listed under its own name.
export const COVERS: Record<string, readonly string[]> = {
  'read-sweep.e2e.test.ts': [...SEED_COVERS, 'create_access_token', 'delete_access_token'],
  'writes-recipes.e2e.test.ts': [
    'update_recipe',
    'recipe_batch_update',
    'upload_recipe_image',
    'add_recipe_to_shopping_list',
    'create_step',
    'update_step',
    'delete_step',
    'create_ingredient',
    'update_ingredient',
    'delete_ingredient',
    'parse_ingredient',
    'update_recipe_book',
  ],
  'writes-foods.e2e.test.ts': [
    'update_food',
    'move_food',
    'merge_food',
    'food_shopping_update',
    'food_batch_update',
    'update_unit',
    'merge_unit',
    'update_keyword',
    'merge_keyword',
    'move_keyword',
    'update_unit_conversion',
    'update_property_type',
    'update_property',
  ],
  'writes-planning.e2e.test.ts': [
    'update_meal_type',
    'update_meal_plan',
    'bulk_create_meal_plans',
    'auto_meal_plan',
    'update_supermarket',
    'update_cook_log',
    'update_shopping_list',
    'update_shopping_entry',
    'bulk_check_shopping_entries',
    'bulk_update_shopping_entries',
    'update_shopping_list_recipe',
    'bulk_create_shopping_list_recipe_entries',
    'add_recipe_to_shopping_list',
    'food_shopping_update',
    'update_inventory_location',
    'update_inventory_entry',
    'consume_inventory_item',
    'move_inventory_item',
  ],
  'writes-admin.e2e.test.ts': [
    'enable_tool_group',
    'disable_tool_group',
    'update_keyword',
    'merge_keyword',
    'move_keyword',
    'update_unit_conversion',
    'update_property_type',
    'update_property',
    'update_supermarket_category',
    'merge_supermarket_category',
    'update_custom_filter',
    'update_supermarket_category_relation',
    'update_user_preference',
    'update_automation',
    'download_file',
    'update_user_file',
    'update_invite_link',
    'list_access_tokens',
    'get_access_token',
    'update_access_token',
    'authenticate',
    'export_recipes',
    'update_export_log',
    'update_import_log',
    'update_recipe_import',
    'import_all_pending',
    'import_pending_recipe',
    'update_bookmarklet_import',
    'get_storage',
    'update_storage',
    'update_sync',
    'query_synced_folder',
    'create_space',
    'update_space',
    'update_user_space',
    'delete_user_space',
    'switch_active_space',
    'get_ai_provider',
    'create_ai_provider',
    'update_ai_provider',
    'delete_ai_provider',
    'get_connector',
    'create_connector',
    'update_connector',
    'delete_connector',
    'update_view_log',
    'update_search_preference',
    'update_user',
    'download_recipe_file',
    'update_household',
  ],
};

// Temporary: write tools with no real-Tandoor coverage yet.
export const PENDING_WRITES: string[] = [];

export function activeSkips(version: string): ReviewedSkip[] {
  return SKIPS.filter((s) => !s.versions || s.versions.includes(version));
}

export function skipFor(tool: string, version: string, arg?: string): ReviewedSkip | undefined {
  return activeSkips(version).find((s) => s.tool === tool && s.arg === arg);
}
