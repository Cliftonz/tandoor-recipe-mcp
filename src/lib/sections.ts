export const ALWAYS_ON_GROUP = 'always';

export const ALWAYS_ON_TOOLS: readonly string[] = [
  'list_tool_groups',
  'enable_tool_group',
  'disable_tool_group',
  'get_version',
  'jq_query',
  'jq_stash_stats',
  'get_guard_stats',
  'get_current_space',
];

const TIERED_MODES = ['off', 'simple', 'full'] as const;
const TOGGLE_MODES = ['off', 'on'] as const;
export type SectionMode = (typeof TIERED_MODES)[number] | (typeof TOGGLE_MODES)[number];

interface SectionBase {
  name: string;
  envVar: string;
  description: string;
}

interface TieredSection extends SectionBase {
  kind: 'tiered';
  simple: readonly string[];
  full: readonly string[];
}

interface ToggleSection extends SectionBase {
  kind: 'toggle';
  tools: readonly string[];
}

export type Section = TieredSection | ToggleSection;

const preview = (resource: string): string[] =>
  ['cascading', 'nulling', 'protecting'].map((k) => `preview_${resource}_delete_${k}`);

const crud = (resource: string, plural = `${resource}s`): string[] => [
  `list_${plural}`, `get_${resource}`, `create_${resource}`, `update_${resource}`, `delete_${resource}`,
];

export const SECTIONS: readonly Section[] = [
  {
    kind: 'tiered',
    name: 'recipes',
    envVar: 'TANDOOR_MCP_RECIPES',
    description: 'Recipes, steps, ingredients, keywords, custom filters, recipe files and share links.',
    simple: [
      'list_recipes', 'list_recipes_flat', 'search_recipes', 'get_recipe', 'related_recipes',
      'create_recipe', 'update_recipe', 'import_recipe_from_url', 'list_keywords', 'get_keyword',
    ],
    full: [
      'delete_recipe', 'delete_recipe_external', 'upload_recipe_image', 'recipe_batch_update',
      ...crud('step'),
      ...crud('ingredient'),
      'create_keyword', 'update_keyword', 'delete_keyword', 'merge_keyword', 'move_keyword',
      ...preview('recipe'),
      ...preview('keyword'),
      ...crud('custom_filter'),
      'get_recipe_file_metadata', 'get_external_recipe_file_link', 'get_share_link',
    ],
  },
  {
    kind: 'tiered',
    name: 'meal-plan',
    envVar: 'TANDOOR_MCP_MEAL_PLAN',
    description: 'Meal plans and meal types.',
    simple: [
      'list_meal_plans', 'get_meal_plan', 'list_meal_types', 'get_meal_type',
      'create_meal_plan', 'update_meal_plan', 'delete_meal_plan',
    ],
    full: [
      'auto_meal_plan', 'bulk_create_meal_plans',
      'create_meal_type', 'update_meal_type', 'delete_meal_type',
      'export_meal_plan_ical',
      ...preview('meal_type'),
    ],
  },
  {
    kind: 'tiered',
    name: 'shopping',
    envVar: 'TANDOOR_MCP_SHOPPING',
    description: 'Shopping list entries, shopping-list recipes, supermarkets and their categories.',
    simple: [
      ...crud('shopping_entry', 'shopping_entries'),
      'bulk_check_shopping_entries', 'add_recipe_to_shopping_list', 'food_shopping_update',
    ],
    full: [
      ...crud('shopping_list_recipe'),
      'bulk_create_shopping_list_recipe_entries',
      ...crud('supermarket'),
      ...crud('supermarket_category', 'supermarket_categories'),
      'merge_supermarket_category',
      ...crud('supermarket_category_relation'),
      ...preview('supermarket'),
      ...preview('supermarket_category'),
    ],
  },
  {
    kind: 'tiered',
    name: 'inventory',
    envVar: 'TANDOOR_MCP_INVENTORY',
    description: 'Pantry inventory.',
    simple: [],
    full: [],
  },
  {
    kind: 'tiered',
    name: 'foods',
    envVar: 'TANDOOR_MCP_FOODS',
    description: 'Foods, units, unit conversions, properties and property types, FDC nutrition lookup.',
    simple: ['list_foods', 'get_food', 'parse_ingredient', 'create_food', 'update_food', 'list_units'],
    full: [
      'delete_food', 'merge_food', 'move_food', 'food_fdc_lookup', 'food_batch_update',
      'get_unit', 'create_unit', 'update_unit', 'delete_unit', 'merge_unit',
      ...crud('unit_conversion'),
      ...crud('property', 'properties'),
      ...crud('property_type'),
      ...preview('food'),
      ...preview('unit'),
      ...preview('property_type'),
      'fdc_search', 'list_food_inherit_fields', 'get_food_inherit_field',
    ],
  },
  {
    kind: 'toggle',
    name: 'cooklog',
    envVar: 'TANDOOR_MCP_COOKLOG',
    description: 'Cook-log entries: when and how often a recipe was made.',
    tools: crud('cook_log'),
  },
  {
    kind: 'toggle',
    name: 'recipe-books',
    envVar: 'TANDOOR_MCP_RECIPE_BOOKS',
    description: 'Recipe books (collections) and their entries.',
    tools: [
      ...crud('recipe_book'),
      'list_recipe_book_entries', 'get_recipe_book_entry', 'add_recipe_to_book', 'remove_recipe_from_book',
      ...preview('recipe_book'),
    ],
  },
  {
    kind: 'toggle',
    name: 'ai',
    envVar: 'TANDOOR_MCP_AI',
    description: 'AI providers, AI recipe import from images, AI step sort and property estimation, AI logs.',
    tools: [
      ...crud('ai_provider'),
      'ai_step_sort', 'import_recipe_from_image', 'food_ai_properties', 'recipe_ai_properties', 'list_ai_logs',
    ],
  },
  {
    kind: 'toggle',
    name: 'import-export',
    envVar: 'TANDOOR_MCP_IMPORT_EXPORT',
    description: 'Recipe import and export, import queues, bookmarklet and open-data imports, their logs.',
    tools: [
      'export_recipes', ...crud('export_log'),
      'import_recipes', ...crud('import_log'),
      ...crud('recipe_import'),
      'import_all_pending', 'import_pending_recipe',
      ...crud('bookmarklet_import'),
      'list_open_data_imports', 'run_open_data_import',
    ],
  },
  {
    kind: 'toggle',
    name: 'household-space',
    envVar: 'TANDOOR_MCP_HOUSEHOLD_SPACE',
    description: 'Spaces, space memberships, users, groups, invite links, user preferences.',
    tools: [
      'list_spaces', 'get_space', 'create_space', 'update_space',
      'list_user_spaces', 'get_user_space', 'update_user_space', 'delete_user_space',
      'list_all_personal_user_spaces', 'switch_active_space',
      'list_users', 'get_user', 'update_user', 'list_groups', 'get_group',
      ...crud('invite_link'),
      'list_user_preferences', 'get_user_preference', 'update_user_preference',
    ],
  },
  {
    kind: 'toggle',
    name: 'admin',
    envVar: 'TANDOOR_MCP_ADMIN',
    description: 'Server settings, automations, user files, view logs, access tokens, storages, connectors, syncs, search settings.',
    tools: [
      'get_server_settings',
      ...crud('automation'),
      'list_user_files', 'get_user_file', 'upload_user_file', 'update_user_file', 'delete_user_file',
      ...preview('user_file'),
      'list_view_logs', 'get_view_log', 'update_view_log', 'delete_view_log',
      ...crud('access_token'), 'authenticate',
      ...crud('storage'),
      ...preview('storage'),
      ...crud('connector'),
      ...crud('sync'), 'query_synced_folder', 'list_sync_logs', 'get_sync_log',
      'get_localization', 'list_search_fields', 'list_search_preferences', 'update_search_preference',
    ],
  },
];

export type SectionModes = Map<string, SectionMode>;

const DEFAULT_MODE = { tiered: 'simple', toggle: 'off' } as const satisfies Record<Section['kind'], SectionMode>;

export function modesOf(section: Section): readonly SectionMode[] {
  return section.kind === 'tiered' ? TIERED_MODES : TOGGLE_MODES;
}

function parseMode(section: Section, raw: string | undefined): SectionMode {
  const modes = modesOf(section);
  if (!raw) return DEFAULT_MODE[section.kind];
  const mode = modes.find((m) => m === raw.toLowerCase());
  if (!mode) throw new Error(`${section.envVar}=${raw} is not valid. Valid values: ${modes.join(', ')}.`);
  return mode;
}

export function parseSectionModes(env: Record<string, string | undefined>): SectionModes {
  return new Map(SECTIONS.map((s) => [s.name, parseMode(s, env[s.envVar])]));
}

export function sectionTools(section: Section): readonly string[] {
  return section.kind === 'tiered' ? [...section.simple, ...section.full] : section.tools;
}

export function visibleTools(section: Section, mode: SectionMode): readonly string[] {
  if (mode === 'off') return [];
  if (section.kind === 'toggle') return section.tools;
  return mode === 'simple' ? section.simple : sectionTools(section);
}

export const SECTION_ENV_VARS = SECTIONS.map((s) => s.envVar).join(', ');

export function formatSectionModes(modes: SectionModes): string {
  return [...modes].map(([name, mode]) => `${name}=${mode}`).join(', ');
}
