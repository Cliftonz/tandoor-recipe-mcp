import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAllTools } from '../src/lib/register-all.js';
import { parseSectionModes } from '../src/lib/sections.js';
import { _resetRegisteredNames } from '../src/lib/register.js';
import { ALL_SECTIONS_OPEN } from './helpers/mcp.js';

type Hints = [readOnly: boolean, destructive: boolean, idempotent: boolean, openWorld: boolean];

const READ: Hints = [true, false, true, false];
const CREATE: Hints = [false, false, false, false];
const UPDATE: Hints = [false, false, true, false];
const DELETE: Hints = [false, true, true, false];

const PREFIX_RULES: [RegExp, Hints][] = [
  [/^(list|get|search|preview|export|download)_/, READ],
  [/^(delete|merge)_/, DELETE],
  [/^(create|add|import)_/, CREATE],
  [/^update_/, UPDATE],
];

const RULED: Record<string, Hints> = {
  download_file: CREATE,
  download_recipe_file: CREATE,
  export_recipes: CREATE,
  get_external_recipe_file_link: UPDATE,
  get_access_token: UPDATE,
  list_access_tokens: UPDATE,
  get_storage: UPDATE,
  get_ai_provider: UPDATE,
  get_connector: UPDATE,
  delete_recipe_external: DELETE,
  create_food: UPDATE,
  create_meal_type: UPDATE,
  create_shopping_list: UPDATE,
  create_access_token: CREATE,
  create_invite_link: [false, true, false, false],
  add_recipe_to_shopping_list: [false, true, false, false],
  import_recipe_from_url: [false, false, false, true],
  import_recipe_from_image: [false, false, false, true],
  create_storage: CREATE,
  create_connector: CREATE,
  create_ai_provider: CREATE,
  create_bookmarklet_import: CREATE,
  update_storage: UPDATE,
  update_connector: UPDATE,
  update_ai_provider: UPDATE,
  update_bookmarklet_import: UPDATE,
  update_recipe: DELETE,
  update_step: DELETE,
  update_food: DELETE,
  update_user_space: DELETE,
  update_shopping_entry: UPDATE,
  related_recipes: READ,
  jq_query: READ,
  jq_stash_stats: READ,
  fdc_search: READ,
  list_tool_groups: READ,
  enable_tool_group: UPDATE,
  disable_tool_group: UPDATE,
  switch_active_space: UPDATE,
  authenticate: UPDATE,
  parse_ingredient: UPDATE,
  auto_meal_plan: CREATE,
  bulk_create_meal_plans: CREATE,
  bulk_create_shopping_list_recipe_entries: CREATE,
  bulk_check_shopping_entries: UPDATE,
  bulk_update_shopping_entries: UPDATE,
  food_batch_update: DELETE,
  recipe_batch_update: DELETE,
  food_shopping_update: [false, true, false, false],
  food_fdc_lookup: UPDATE,
  food_ai_properties: [false, false, false, true],
  recipe_ai_properties: [false, false, false, true],
  ai_step_sort: [false, false, false, true],
  consume_inventory_item: CREATE,
  move_food: UPDATE,
  move_keyword: UPDATE,
  move_inventory_item: UPDATE,
  assign_household: UPDATE,
  remove_recipe_from_book: DELETE,
  query_synced_folder: CREATE,
  run_open_data_import: [false, true, false, false],
  upload_recipe_image: [false, true, true, true],
  upload_user_file: [false, false, false, true],
};

const RULED_TITLES: Record<string, string> = {
  jq_query: 'Query stashed result with jq',
  jq_stash_stats: 'Show stash stats',
  fdc_search: 'Search USDA FDC foods',
  food_fdc_lookup: 'Look up food nutrition in USDA FDC',
  food_ai_properties: 'Generate food properties with AI',
  recipe_ai_properties: 'Generate recipe properties with AI',
  ai_step_sort: 'Sort recipe steps with AI',
  export_meal_plan_ical: 'Export meal plans as iCal',
  food_batch_update: 'Batch update foods',
  recipe_batch_update: 'Batch update recipes',
  food_shopping_update: 'Update food on shopping lists',
  related_recipes: 'List related recipes',
  auto_meal_plan: 'Auto-generate meal plans',
  query_synced_folder: 'Scan synced folder',
  delete_recipe_external: "Remove recipe's external source",
  list_recipes_flat: 'List recipes (flat)',
  authenticate: 'Get token from username and password',
  download_file: 'Download user file',
  list_ai_providers: 'List AI providers',
  import_recipe_from_url: 'Import recipe from URL',
  preview_food_delete_cascading: 'Preview food delete (cascading)',
  preview_meal_type_delete_protecting: 'Preview meal type delete (protecting)',
};

const ACRONYMS: Record<string, string> = { ai: 'AI', url: 'URL', ical: 'iCal', fdc: 'FDC' };

function expectedTitle(name: string): string {
  if (RULED_TITLES[name]) return RULED_TITLES[name];
  const preview = /^preview_(.+)_delete_(cascading|nulling|protecting)$/.exec(name);
  if (preview) return `Preview ${preview[1].replace(/_/g, ' ')} delete (${preview[2]})`;
  const words = name.split('_').map((w) => ACRONYMS[w] ?? w).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function expectedHints(name: string): Hints | undefined {
  return RULED[name] ?? PREFIX_RULES.find(([re]) => re.test(name))?.[1];
}

function hintsOf(tool: Tool): unknown[] {
  const a = tool.annotations ?? {};
  return [a.readOnlyHint, a.destructiveHint, a.idempotentHint, a.openWorldHint];
}

let tools: Tool[];

beforeAll(async () => {
  _resetRegisteredNames();
  const server = new McpServer({ name: 'annotations', version: 'annotations' });
  registerAllTools(server, new TandoorClient({ url: 'https://x.test', token: 't' }), {
    sections: parseSectionModes(ALL_SECTIONS_OPEN),
    pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
    versionCheck: { status: 'ok', level: 'note', detail: 'annotations stub' },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'annotations-client', version: '1.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  tools = (await client.listTools()).tools;
});

describe('tool titles and annotations over tools/list', () => {
  it('lists all 306 tools', () => {
    expect(tools).toHaveLength(306);
  });

  it('gives every tool a non-empty title and four explicit boolean hints', () => {
    const missing = tools.filter((t) => !t.title?.trim() || !hintsOf(t).every((h) => typeof h === 'boolean'));
    expect(missing.map((t) => t.name)).toEqual([]);
  });

  it('annotates every tool by its prefix rule or its ruled override', () => {
    const wrong = tools
      .map((t) => ({ name: t.name, got: hintsOf(t), want: expectedHints(t.name) }))
      .filter((r) => JSON.stringify(r.got) !== JSON.stringify(r.want));
    expect(wrong).toEqual([]);
  });

  it('titles every tool in sentence case from its name, with the ruled adjustments', () => {
    const wrong = tools
      .map((t) => ({ name: t.name, got: t.title, want: expectedTitle(t.name) }))
      .filter((r) => r.got !== r.want);
    expect(wrong).toEqual([]);
  });

  it('covers every ruled tool', () => {
    const names = new Set(tools.map((t) => t.name));
    expect([...Object.keys(RULED), ...Object.keys(RULED_TITLES)].filter((n) => !names.has(n))).toEqual([]);
  });
});
