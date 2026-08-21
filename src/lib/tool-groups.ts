// Tool gating — keep the LLM's tool-list context small by default.
//
// At boot, every tool is registered with the SDK. Tools NOT in CORE_TOOLS
// are then immediately `.disable()`d via the SDK's RegisteredTool API.
// Disabled tools are excluded from `tools/list` responses, so the LLM only
// sees the small core surface (~25 tools instead of ~135).
//
// When the LLM needs something out of core, it calls `enable_tool_group`
// which walks the named group's tool list and calls `.enable()` on each.
// The SDK emits `tools/list_changed` automatically — Claude refreshes its
// tool list mid-conversation. `disable_tool_group` is the reverse.
//
// CORE_TOOLS is itself exposed to the LLM via `list_tool_groups` (as the
// "core" group, marked permanent: true) so it can see what it already has.

/** Tools always enabled. The LLM should never need to enable these. */
export const CORE_TOOLS: ReadonlySet<string> = new Set([
  // Meta — discovery + gating.
  'list_tool_groups',
  'enable_tool_group',
  'disable_tool_group',

  // Diagnostic / context-management.
  'get_version',
  'get_guard_stats',
  'jq_query',
  'jq_stash_stats',

  // Recipe browse (reads).
  'list_recipes',
  'list_recipes_flat',
  'get_recipe',
  'search_recipes',
  'related_recipes',

  // Meal plan reads.
  'list_meal_plans',
  'get_meal_plan',
  'list_meal_types',

  // Shopping reads.
  'list_shopping_entries',

  // Food + ingredient reads.
  'list_foods',
  'get_food',
  'list_ingredients',
  'parse_ingredient',

  // Keyword reads.
  'list_keywords',
  'get_keyword',

  // Space read.
  'get_current_space',
]);

export interface ToolGroup {
  name: string;
  description: string;
  tools: readonly string[];
}

/**
 * Non-core tool groups. The LLM enables one of these when it needs the
 * tools inside. Naming convention: `<domain>-<verb>` (`recipe-write`,
 * `shopping-write`) reads better in the LLM's reasoning than the original
 * Tandoor module names.
 */
export const TOOL_GROUPS: ReadonlyArray<ToolGroup> = [
  {
    name: 'recipe-write',
    description: 'Create / update / delete recipes, import from URL, upload images, batch updates.',
    tools: [
      'create_recipe', 'update_recipe', 'delete_recipe', 'delete_recipe_external',
      'import_recipe_from_url', 'upload_recipe_image',
      'add_recipe_to_shopping_list', 'recipe_batch_update',
    ],
  },
  {
    name: 'mealplan-write',
    description: 'Create / update / delete meal plans, meal types, auto-plan, bulk-create week plans.',
    tools: [
      'create_meal_plan', 'update_meal_plan', 'delete_meal_plan',
      'auto_meal_plan', 'bulk_create_meal_plans',
      'create_meal_type', 'get_meal_type', 'update_meal_type', 'delete_meal_type',
    ],
  },
  {
    name: 'shopping-write',
    description: 'Create / update / delete shopping list entries; bulk-check; shopping-list-recipe CRUD.',
    tools: [
      'get_shopping_entry', 'create_shopping_entry', 'update_shopping_entry', 'delete_shopping_entry',
      'bulk_check_shopping_entries',
      'list_shopping_list_recipes', 'get_shopping_list_recipe', 'create_shopping_list_recipe',
      'update_shopping_list_recipe', 'delete_shopping_list_recipe',
      'bulk_create_shopping_list_recipe_entries',
    ],
  },
  {
    name: 'foods-write',
    description: 'Create / update / delete foods; merge/move; FDC nutrition lookup; batch update.',
    tools: [
      'create_food', 'update_food', 'delete_food', 'merge_food', 'move_food',
      'food_shopping_update', 'food_fdc_lookup', 'food_batch_update',
    ],
  },
  {
    name: 'ingredients-write',
    description: 'Ingredient CRUD (usually managed implicitly via recipes).',
    tools: ['get_ingredient', 'create_ingredient', 'update_ingredient', 'delete_ingredient'],
  },
  {
    name: 'keywords',
    description: 'Keyword CRUD + merge / move (rare; usually managed via recipe edits).',
    tools: ['create_keyword', 'update_keyword', 'delete_keyword', 'merge_keyword', 'move_keyword'],
  },
  {
    name: 'cooklog',
    description: 'Cook-log entries — when / how often you made a recipe.',
    tools: ['list_cook_logs', 'get_cook_log', 'create_cook_log', 'update_cook_log', 'delete_cook_log'],
  },
  {
    name: 'recipebook',
    description: 'Recipe books (collections / cookbooks).',
    tools: [
      'list_recipe_books', 'get_recipe_book', 'create_recipe_book', 'update_recipe_book', 'delete_recipe_book',
      'list_recipe_book_entries', 'get_recipe_book_entry', 'add_recipe_to_book', 'remove_recipe_from_book',
    ],
  },
  {
    name: 'ai',
    description: 'AI-powered recipe import from images / PDFs / text; AI provider CRUD; AI step sort (requires a Tandoor AI provider configured).',
    tools: [
      'list_ai_providers', 'import_recipe_from_image',
      'get_ai_provider', 'create_ai_provider', 'update_ai_provider', 'delete_ai_provider',
      'ai_step_sort',
    ],
  },
  {
    name: 'steps',
    description: 'Step-level CRUD inside a recipe (usually managed via create_recipe / update_recipe).',
    tools: ['list_steps', 'get_step', 'create_step', 'update_step', 'delete_step'],
  },
  {
    name: 'units',
    description: 'Unit CRUD (cup, gram, …) + supermarket entities.',
    tools: [
      'list_units', 'get_unit', 'create_unit', 'update_unit', 'delete_unit', 'merge_unit',
      'list_supermarket_categories', 'get_supermarket_category', 'create_supermarket_category',
      'update_supermarket_category', 'delete_supermarket_category', 'merge_supermarket_category',
      'list_supermarket_category_relations', 'get_supermarket_category_relation',
      'create_supermarket_category_relation', 'update_supermarket_category_relation',
      'delete_supermarket_category_relation',
    ],
  },
  {
    name: 'unit-conversions',
    description: 'Unit conversion rules (cup → ml, etc).',
    tools: [
      'list_unit_conversions', 'get_unit_conversion', 'create_unit_conversion',
      'update_unit_conversion', 'delete_unit_conversion',
    ],
  },
  {
    name: 'properties',
    description: 'Property types + values (nutrition labels, allergens).',
    tools: [
      'list_property_types', 'get_property_type', 'create_property_type',
      'update_property_type', 'delete_property_type',
      'list_properties', 'get_property', 'create_property', 'update_property', 'delete_property',
    ],
  },
  {
    name: 'custom-filters',
    description: 'Saved custom recipe filters (Tandoor filter DSL).',
    tools: [
      'list_custom_filters', 'get_custom_filter', 'create_custom_filter',
      'update_custom_filter', 'delete_custom_filter',
    ],
  },
  {
    name: 'admin',
    description: 'Server settings, user preferences, automations, user files, view/import/AI logs, share links, invite links, access tokens, storages, connectors, groups, users, syncs.',
    tools: [
      'get_server_settings',
      'list_user_preferences', 'get_user_preference', 'update_user_preference',
      'list_automations', 'get_automation', 'create_automation', 'update_automation', 'delete_automation',
      'list_user_files', 'get_user_file', 'upload_user_file', 'update_user_file', 'delete_user_file',
      'list_view_logs', 'list_import_logs', 'list_ai_logs',
      'food_ai_properties', 'recipe_ai_properties', 'get_share_link',
      'list_invite_links', 'get_invite_link', 'create_invite_link', 'update_invite_link', 'delete_invite_link',
      'list_access_tokens', 'get_access_token', 'create_access_token', 'update_access_token', 'delete_access_token', 'authenticate',
      'list_storages', 'get_storage', 'create_storage', 'update_storage', 'delete_storage',
      'list_connectors', 'get_connector', 'create_connector', 'update_connector', 'delete_connector',
      'get_group', 'update_user',
      'list_syncs', 'get_sync', 'create_sync', 'update_sync', 'delete_sync', 'query_synced_folder', 'list_sync_logs', 'get_sync_log',
    ],
  },
  {
    name: 'supermarket-write',
    description: 'Supermarket CRUD (aisle-level shopping-list ordering).',
    tools: [
      'list_supermarkets', 'get_supermarket', 'create_supermarket', 'update_supermarket', 'delete_supermarket',
    ],
  },
  {
    name: 'import-export',
    description: 'Import / export recipes, import queues (recipe-import, bookmarklet, open-data, FDC search, food-inherit fields), export logs.',
    tools: [
      'export_recipes', 'list_export_logs', 'get_export_log', 'create_export_log', 'update_export_log', 'delete_export_log',
      'import_recipes',
      'create_import_log', 'get_import_log', 'update_import_log', 'delete_import_log',
      'list_open_data_imports', 'run_open_data_import',
      'list_recipe_imports', 'create_recipe_import', 'get_recipe_import', 'update_recipe_import', 'delete_recipe_import',
      'import_all_pending', 'import_pending_recipe',
      'list_bookmarklet_imports', 'create_bookmarklet_import', 'get_bookmarklet_import', 'update_bookmarklet_import', 'delete_bookmarklet_import',
      'fdc_search',
      'list_food_inherit_fields', 'get_food_inherit_field',
    ],
  },
  {
    name: 'multi-space',
    description: 'Space CRUD, user-space memberships, personal-user-space listing, switch active space.',
    tools: [
      'list_spaces', 'get_space', 'create_space', 'update_space',
      'list_user_spaces', 'get_user_space', 'update_user_space', 'delete_user_space',
      'list_all_personal_user_spaces', 'switch_active_space',
    ],
  },
  {
    name: 'tree-safety',
    description: 'Delete-preview tools (cascading / nulling / protecting) for tree-shaped resources — always call before delete_* to see impact.',
    tools: [
      'preview_food_delete_cascading', 'preview_food_delete_nulling', 'preview_food_delete_protecting',
      'preview_keyword_delete_cascading', 'preview_keyword_delete_nulling', 'preview_keyword_delete_protecting',
      'preview_recipe_delete_cascading', 'preview_recipe_delete_nulling', 'preview_recipe_delete_protecting',
      'preview_unit_delete_cascading', 'preview_unit_delete_nulling', 'preview_unit_delete_protecting',
      'preview_storage_delete_cascading', 'preview_storage_delete_nulling', 'preview_storage_delete_protecting',
      'preview_meal_type_delete_cascading', 'preview_meal_type_delete_nulling', 'preview_meal_type_delete_protecting',
      'preview_property_type_delete_cascading', 'preview_property_type_delete_nulling', 'preview_property_type_delete_protecting',
      'preview_recipe_book_delete_cascading', 'preview_recipe_book_delete_nulling', 'preview_recipe_book_delete_protecting',
      'preview_supermarket_delete_cascading', 'preview_supermarket_delete_nulling', 'preview_supermarket_delete_protecting',
      'preview_supermarket_category_delete_cascading', 'preview_supermarket_category_delete_nulling', 'preview_supermarket_category_delete_protecting',
      'preview_user_file_delete_cascading', 'preview_user_file_delete_nulling', 'preview_user_file_delete_protecting',
    ],
  },
  {
    name: 'housekeeping-read',
    description: 'Read-only housekeeping: localization, groups, users, view-log CRUD, search prefs / fields, recipe file metadata + external link, meal-plan iCal.',
    tools: [
      'get_localization',
      'list_groups', 'list_users', 'get_user',
      'get_view_log', 'update_view_log', 'delete_view_log',
      'list_search_fields', 'list_search_preferences', 'update_search_preference',
      'get_recipe_file_metadata', 'get_external_recipe_file_link',
      'export_meal_plan_ical',
    ],
  },
];

/**
 * Build a name → group-name map for fast reverse lookup.
 * Tools in CORE_TOOLS map to 'core' (the synthetic always-on group).
 */
export function buildToolToGroupIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  for (const name of CORE_TOOLS) idx.set(name, 'core');
  for (const g of TOOL_GROUPS) {
    for (const t of g.tools) {
      if (!idx.has(t)) idx.set(t, g.name);
    }
  }
  return idx;
}

/** O(1) lookup: is `name` a tool registered to the named group? */
export function groupContainsTool(group: string, name: string): boolean {
  if (group === 'core') return CORE_TOOLS.has(name);
  const g = TOOL_GROUPS.find((x) => x.name === group);
  return !!g?.tools.includes(name);
}

/** Find a tool's group, or 'ungrouped' if it's neither in core nor any named group. */
export function findToolGroup(name: string): string {
  if (CORE_TOOLS.has(name)) return 'core';
  for (const g of TOOL_GROUPS) if (g.tools.includes(name)) return g.name;
  return 'ungrouped';
}

/** All group names including the synthetic 'core'. */
export function allGroupNames(): string[] {
  return ['core', ...TOOL_GROUPS.map((g) => g.name)];
}
