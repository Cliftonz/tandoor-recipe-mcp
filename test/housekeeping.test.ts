// Handler coverage for src/handlers/housekeeping.ts. One test per tool.

import { describe, it, expect, vi } from 'vitest';
import {
  handleListConnectors,
  handleGetConnector,
  handleCreateConnector,
  handleUpdateConnector,
  handleDeleteConnector,
  handleGetViewLog,
  handleUpdateViewLog,
  handleDeleteViewLog,
  handleListSearchFields,
  handleListSearchPreferences,
  handleUpdateSearchPreference,
  handleGetLocalization,
  handleListGroups,
  handleGetGroup,
  handleListUsers,
  handleGetUser,
  handleUpdateUser,
  handleExportMealPlanIcal,
  handleGetExternalRecipeFileLink,
  handleGetRecipeFileMetadata,
} from '../src/handlers/housekeeping.js';
import { paginated } from './helpers/factories.js';
import { mockClient } from './helpers/mock-client.js';
import type { TandoorClient } from '../src/clients/index.js';
import type { HousekeepingClient } from '../src/clients/housekeeping.js';

// Widen the mock type to expose `housekeeping` since older TandoorClient
// typings did not include it directly.
type ClientWithHousekeeping = TandoorClient & { housekeeping: HousekeepingClient };

const mock = (impl: Parameters<typeof mockClient<ClientWithHousekeeping>>[0]) =>
  mockClient<ClientWithHousekeeping>(impl) as TandoorClient;

describe('handlers/housekeeping.ts', () => {
  describe('connector-config', () => {
    it('list slims to id/name/type/enabled', async () => {
      const client = mock({
        housekeeping: {
          listConnectors: async () => paginated([{
            id: 1, name: 'ha', type: 'HomeAssistant', enabled: true,
            url: 'http://x', token: 'secret', extra: 'gone',
          }]),
        },
      });
      const res = await handleListConnectors(client, {} as any);
      const parsed = JSON.parse(res);
      expect(parsed.results[0]).toMatchObject({ id: 1, name: 'ha', type: 'HomeAssistant', enabled: true });
      expect(parsed.results[0]).not.toHaveProperty('extra');
      expect(parsed.results[0]).not.toHaveProperty('token');
    });

    it('get returns slim shape', async () => {
      const client = mock({
        housekeeping: { getConnector: async () => ({ id: 5, name: 'n', type: 'HomeAssistant', enabled: false, junk: 'x' }) },
      });
      const res = await handleGetConnector(client, { id: 5 } as any);
      expect(JSON.parse(res)).not.toHaveProperty('junk');
    });

    it('list format=full preserves token verbatim', async () => {
      const client = mock({
        housekeeping: {
          listConnectors: async () => paginated([{
            id: 1, name: 'ha', type: 'HomeAssistant', enabled: true,
            url: 'http://x', token: 'ha-secret', extra: {},
          }]),
        },
      });
      const res = await handleListConnectors(client, { format: 'full' } as any);
      expect(res).toContain('ha-secret');
      const parsed = JSON.parse(res);
      expect(parsed.results[0].token).toBe('ha-secret');
    });

    it('get format=full preserves token verbatim', async () => {
      const client = mock({
        housekeeping: { getConnector: async () => ({ id: 5, name: 'n', type: 'HomeAssistant', enabled: false, token: 'ha-secret' }) },
      });
      const res = await handleGetConnector(client, { id: 5, format: 'full' } as any);
      expect(res).toContain('ha-secret');
      expect(JSON.parse(res).token).toBe('ha-secret');
    });

    it('create forwards every supplied field', async () => {
      const create = vi.fn().mockResolvedValue({ id: 1, name: 'ha', type: 'HomeAssistant' });
      const client = mock({ housekeeping: { createConnector: create } });
      await handleCreateConnector(client, {
        name: 'ha', type: 'HomeAssistant', url: 'http://x', token: 't',
        todo_entity: 'todo.shopping', enabled: true,
      } as any);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'ha', type: 'HomeAssistant', url: 'http://x', token: 't',
        todo_entity: 'todo.shopping', enabled: true,
      }), { signal: undefined });
    });

    it('update throws when no fields supplied', async () => {
      const client = mock({ housekeeping: { patchConnector: vi.fn() } });
      await expect(handleUpdateConnector(client, { id: 1 } as any)).rejects.toThrow(/At least one field/);
    });

    it('delete returns confirmation text', async () => {
      const del = vi.fn().mockResolvedValue(undefined);
      const client = mock({ housekeeping: { deleteConnector: del } });
      const res = await handleDeleteConnector(client, { id: 42 } as any);
      expect(del).toHaveBeenCalledWith(42, { signal: undefined });
      expect(res).toMatch(/Connector 42 deleted/);
    });
  });

  describe('view-log', () => {
    it('get returns slim shape', async () => {
      const client = mock({
        housekeeping: { getViewLog: async () => ({ id: 1, recipe: 7, created_at: 't', created_by: 3, junk: 'x' }) },
      });
      const res = await handleGetViewLog(client, { id: 1 } as any);
      expect(JSON.parse(res)).not.toHaveProperty('junk');
    });

    it('update throws when no fields supplied', async () => {
      const client = mock({ housekeeping: { patchViewLog: vi.fn() } });
      await expect(handleUpdateViewLog(client, { id: 1 } as any)).rejects.toThrow(/At least one field/);
    });

    it('delete returns confirmation text', async () => {
      const del = vi.fn().mockResolvedValue(undefined);
      const client = mock({ housekeeping: { deleteViewLog: del } });
      const res = await handleDeleteViewLog(client, { id: 5 } as any);
      expect(del).toHaveBeenCalledWith(5, { signal: undefined });
      expect(res).toMatch(/View log 5 deleted/);
    });
  });

  describe('search preferences', () => {
    it('list_search_fields returns slim array', async () => {
      const client = mock({
        housekeeping: {
          listSearchFields: async () => [
            { id: 1, name: 'Name', field: 'name', junk: 'x' },
            { id: 2, name: 'Desc', field: 'description' },
          ],
        },
      });
      const res = await handleListSearchFields(client, {} as any);
      const parsed = JSON.parse(res);
      expect(parsed[0]).not.toHaveProperty('junk');
      expect(parsed[0]).toMatchObject({ id: 1, field: 'name' });
    });

    it('list_search_preferences returns slim shape', async () => {
      const client = mock({
        housekeeping: {
          listSearchPreferences: async () => [{
            user: { id: 1, username: 'alice' },
            search: 'PLAIN', lookup: true,
            unaccent: [{ id: 1, field: 'name' }],
            icontains: [], istartswith: null, trigram: [], fulltext: [],
            trigram_threshold: 0.2,
          }],
        },
      });
      const res = await handleListSearchPreferences(client, {} as any);
      const parsed = JSON.parse(res);
      expect(parsed[0]).toMatchObject({ user_id: 1, search: 'PLAIN', lookup: true });
      expect(parsed[0].unaccent).toEqual([1]);
    });

    it('update_search_preference throws when no fields supplied', async () => {
      const client = mock({ housekeeping: { patchSearchPreference: vi.fn() } });
      await expect(handleUpdateSearchPreference(client, { user: 1 } as any)).rejects.toThrow(/At least one field/);
    });
  });

  describe('localization', () => {
    it('get_localization returns raw payload', async () => {
      const data = [{ code: 'en', language: 'English' }];
      const client = mock({ housekeeping: { getLocalization: async () => data } });
      const res = await handleGetLocalization(client, {} as any);
      expect(JSON.parse(res)).toEqual(data);
    });
  });

  describe('groups', () => {
    it('list_groups slims to id/name', async () => {
      const client = mock({
        housekeeping: { listGroups: async () => [{ id: 1, name: 'admin', junk: 'x' }] },
      });
      const res = await handleListGroups(client, {} as any);
      expect(JSON.parse(res)[0]).toEqual({ id: 1, name: 'admin' });
    });

    it('get_group slims to id/name', async () => {
      const client = mock({
        housekeeping: { getGroup: async () => ({ id: 2, name: 'guest', junk: 'x' }) },
      });
      expect(JSON.parse(await handleGetGroup(client, { id: 2 } as any))).toEqual({ id: 2, name: 'guest' });
    });
  });

  describe('users', () => {
    it('list_users slims to id/username/display_name', async () => {
      const client = mock({
        housekeeping: {
          listUsers: async () => [{
            id: 1, username: 'alice', display_name: 'Alice A.', first_name: 'Alice', last_name: 'A',
            is_staff: false, is_superuser: false, is_active: true, junk: 'x',
          }],
        },
      });
      const parsed = JSON.parse(await handleListUsers(client, {} as any));
      expect(parsed[0]).toMatchObject({ id: 1, username: 'alice', display_name: 'Alice A.' });
      expect(parsed[0]).not.toHaveProperty('junk');
    });

    it('get_user slims to key user fields', async () => {
      const client = mock({
        housekeeping: {
          getUser: async () => ({
            id: 3, username: 'bob', display_name: 'Bob', first_name: 'Bob',
            is_staff: false, is_superuser: false, is_active: true, junk: 'x',
          }),
        },
      });
      const parsed = JSON.parse(await handleGetUser(client, { id: 3 } as any));
      expect(parsed).not.toHaveProperty('junk');
      expect(parsed).toMatchObject({ id: 3, username: 'bob' });
    });

    it('update_user throws when no fields supplied', async () => {
      const client = mock({ housekeeping: { patchUser: vi.fn() } });
      await expect(handleUpdateUser(client, { id: 1 } as any)).rejects.toThrow(/At least one field/);
    });

    it('update_user forwards first_name / last_name', async () => {
      const patch = vi.fn().mockResolvedValue({ id: 1, username: 'a', first_name: 'A', last_name: 'B' });
      const client = mock({ housekeeping: { patchUser: patch } });
      await handleUpdateUser(client, { id: 1, first_name: 'A', last_name: 'B' } as any);
      expect(patch).toHaveBeenCalledWith(1, { first_name: 'A', last_name: 'B' }, { signal: undefined });
    });
  });

  describe('meal-plan iCal', () => {
    it('export returns raw ics text', async () => {
      const ics = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n';
      const client = mock({ housekeeping: { exportMealPlanIcal: async () => ics } });
      const res = await handleExportMealPlanIcal(client, { from_date: '2026-01-01', to_date: '2026-01-31' } as any);
      expect(res).toBe(ics);
    });

    it('exportMealPlanIcal throws on non-2xx response', async () => {
      const { HousekeepingClient } = await import('../src/clients/housekeeping.js');
      const client = new HousekeepingClient({ url: 'http://tandoor.example', token: 'tok' });
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '',
      }) as any;
      try {
        await expect(client.exportMealPlanIcal()).rejects.toThrow(/Tandoor API error: 500/);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('recipe file / external link', () => {
    it('get_external_recipe_file_link returns raw payload', async () => {
      const client = mock({ housekeeping: { getExternalFileLink: async () => ({ url: 'https://example.com/x' }) } });
      const res = await handleGetExternalRecipeFileLink(client, { id: 1 } as any);
      expect(JSON.parse(res)).toEqual({ url: 'https://example.com/x' });
    });

    it('get_recipe_file_metadata returns raw payload', async () => {
      const client = mock({ housekeeping: { getRecipeFileMetadata: async () => ({ id: 1, name: 'x.pdf' }) } });
      const res = await handleGetRecipeFileMetadata(client, { id: 1 } as any);
      expect(JSON.parse(res)).toEqual({ id: 1, name: 'x.pdf' });
    });
  });
});
