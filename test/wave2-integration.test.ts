import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAllTools } from '../src/lib/register-all.js';
import {
  _resetRegisteredNames,
  _resetArraySkipLog,
  shouldStash,
} from '../src/lib/register.js';
import { registeredToolNames, getRegisteredTool } from './helpers/mcp.js';
import {
  TreeSafetyClient,
  MealTypeClient,
  SupermarketClient,
  InviteLinkClient,
  AccessTokenClient,
  ExportClient,
  ImportClient,
  StorageClient,
  SyncClient,
  SpaceClient,
  HousekeepingClient,
} from '../src/clients/index.js';

const NEW_TOOLS: string[] = [
  'create_meal_type', 'get_meal_type', 'update_meal_type', 'delete_meal_type',
  'list_supermarkets', 'get_supermarket', 'create_supermarket', 'update_supermarket', 'delete_supermarket',
  'list_invite_links', 'get_invite_link', 'create_invite_link', 'update_invite_link', 'delete_invite_link',
  'list_access_tokens', 'get_access_token', 'create_access_token', 'update_access_token', 'delete_access_token', 'authenticate',
  'export_recipes', 'list_export_logs', 'get_export_log', 'create_export_log', 'update_export_log', 'delete_export_log',
  'import_recipes',
  'list_storages', 'get_storage', 'create_storage', 'update_storage', 'delete_storage',
  'list_syncs', 'get_sync', 'create_sync', 'update_sync', 'delete_sync', 'query_synced_folder', 'list_sync_logs', 'get_sync_log',
  'list_spaces', 'get_space', 'get_current_space', 'create_space', 'update_space',
  'list_user_spaces', 'get_user_space', 'update_user_space', 'delete_user_space',
  'list_all_personal_user_spaces', 'switch_active_space',
  'get_ai_provider', 'create_ai_provider', 'update_ai_provider', 'delete_ai_provider', 'ai_step_sort',
  'list_connectors', 'get_connector', 'create_connector', 'update_connector', 'delete_connector',
  'get_view_log', 'update_view_log', 'delete_view_log',
  'get_localization', 'list_groups', 'list_users', 'get_recipe_file_metadata',
  'list_recipes_flat', 'delete_recipe_external',
  'preview_food_delete_cascading', 'preview_recipe_delete_protecting',
];

describe('registerAllTools + new client wiring', () => {
  it('TandoorClient constructor does not eagerly instantiate sub-clients', () => {
    const c = new TandoorClient({ url: 'https://x.test', token: 't' });
    expect((c as any)._recipes).toBeUndefined();
    expect((c as any)._imports).toBeUndefined();
    const _touch = c.recipes;
    expect((c as any)._recipes).toBeDefined();
    expect((c as any)._imports).toBeUndefined();
  });

  it('TandoorClient exposes every new sub-client as an instance', () => {
    const client = new TandoorClient({ url: 'https://x.test', token: 't' });
    expect(client.treeSafety).toBeInstanceOf(TreeSafetyClient);
    expect(client.mealTypes).toBeInstanceOf(MealTypeClient);
    expect(client.supermarkets).toBeInstanceOf(SupermarketClient);
    expect(client.inviteLinks).toBeInstanceOf(InviteLinkClient);
    expect(client.accessTokens).toBeInstanceOf(AccessTokenClient);
    expect(client.exports).toBeInstanceOf(ExportClient);
    expect(client.imports).toBeInstanceOf(ImportClient);
    expect(client.storages).toBeInstanceOf(StorageClient);
    expect(client.syncs).toBeInstanceOf(SyncClient);
    expect(client.spaces).toBeInstanceOf(SpaceClient);
    expect(client.housekeeping).toBeInstanceOf(HousekeepingClient);
  });

  describe('registerAllTools wires every new tool', () => {
    let registered: Set<string>;

    beforeAll(() => {
      _resetRegisteredNames();
      _resetArraySkipLog();
      const server = new McpServer({ name: 'integration-stdio', version: 'integration-stdio' });
      const client = new TandoorClient({ url: 'https://x.test', token: 't' });
      registerAllTools(server, client, {
        profile: 'full',
        pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
        versionCheck: { status: 'ok', level: 'note', detail: 'integration stub' },
      });
      registered = new Set(registeredToolNames(server));
    });

    it('every new tool from Wave 1 is registered on a full-profile server', () => {
      const missing = NEW_TOOLS.filter((n) => !registered.has(n));
      expect(missing, `missing: ${missing.join(', ')}`).toEqual([]);
    });
  });

  describe('HTTP transport gates', () => {
    const prior = process.env.TANDOOR_MCP_TRANSPORT;

    beforeEach(() => {
      process.env.TANDOOR_MCP_TRANSPORT = 'http';
    });

    afterAll(() => {
      if (prior === undefined) delete process.env.TANDOOR_MCP_TRANSPORT;
      else process.env.TANDOOR_MCP_TRANSPORT = prior;
    });

    it('enable_tool_group throws with the expected message in HTTP mode', async () => {
      _resetRegisteredNames();
      _resetArraySkipLog();
      const server = new McpServer({ name: 'integration-http', version: 'integration-http' });
      const client = new TandoorClient({ url: 'https://x.test', token: 't' });
      registerAllTools(server, client, {
        profile: 'full',
        pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
        versionCheck: { status: 'ok', level: 'note', detail: 'integration http stub' },
      });
      const tool = getRegisteredTool(server, 'enable_tool_group');
      const result: any = await tool.handler({ group: 'ai' }, { signal: new AbortController().signal });
      expect(result.isError).toBe(true);
      const text = result.content?.[0]?.text ?? '';
      expect(text).toContain('Dynamic tool gating is disabled in HTTP transport mode');
      expect(text).toContain('TANDOOR_MCP_PROFILE=core|basic|full');
    });

    it('disable_tool_group throws with the expected message in HTTP mode', async () => {
      _resetRegisteredNames();
      _resetArraySkipLog();
      const server = new McpServer({ name: 'integration-http', version: 'integration-http' });
      const client = new TandoorClient({ url: 'https://x.test', token: 't' });
      registerAllTools(server, client, {
        profile: 'full',
        pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
        versionCheck: { status: 'ok', level: 'note', detail: 'integration http stub' },
      });
      const tool = getRegisteredTool(server, 'disable_tool_group');
      const result: any = await tool.handler({ group: 'ai' }, { signal: new AbortController().signal });
      expect(result.isError).toBe(true);
      const text = result.content?.[0]?.text ?? '';
      expect(text).toContain('Dynamic tool gating is disabled in HTTP transport mode');
      expect(text).toContain('TANDOOR_MCP_PROFILE=core|basic|full');
    });

    it('shouldStash returns false unconditionally in HTTP mode', () => {
      const cfg = { enabled: true, thresholdBytes: 10, maxEntries: 32, maxBytes: 10_000, ttlMs: 60_000 };
      expect(shouldStash({ big: 'a'.repeat(1000) }, 1_000_000, cfg)).toBe(false);
    });
  });

  it('no `(client as any)` cast survives in src/handlers/*.ts', () => {
    const dir = join(process.cwd(), 'src', 'handlers');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const offenders: string[] = [];
    for (const f of files) {
      const contents = readFileSync(join(dir, f), 'utf8');
      if (contents.includes('(client as any)')) offenders.push(f);
    }
    expect(offenders, `handlers still casting client: ${offenders.join(', ')}`).toEqual([]);
  });
});
