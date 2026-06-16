// Handler coverage for src/handlers/admin.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  handleListUserPreferences,
  handleUpdateUserPreference,
  handleCreateAutomation,
  handleUpdateAutomation,
  handleDeleteAutomation,
  handleListAutomations,
  handleGetAutomation,
  handleUploadUserFile,
  handleListUserFiles,
  handleListViewLogs,
  handleListImportLogs,
  handleListAiLogs,
  handleGetServerSettings,
  handleFoodAiProperties,
  handleRecipeAiProperties,
} from '../src/handlers/admin.js';
import { paginated } from './helpers/factories.js';
import { mockClient } from './helpers/mock-client.js';
import type { TandoorClient } from '../src/clients/index.js';

// Typed mock — TypeScript rejects misspelled client methods (QA F15).
const mock = (impl: Parameters<typeof mockClient<TandoorClient>>[0]) => mockClient<TandoorClient>(impl);

describe('handlers/admin.ts', () => {
  describe('user preferences', () => {
    it('list returns slim array shape by default', async () => {
      const client = mock({
        userPreferences: {
          listPreferences: async () => [
            { user: { id: 1, username: 'alice' }, theme: 'TANDOOR', default_page: 'PLAN', plan_share: [{ id: 2 }], shopping_share: [] },
            { user: { id: 3, username: 'bob' }, theme: 'BOOTSTRAP', plan_share: null },
          ],
        },
      });
      const res = await handleListUserPreferences(client, {} as any);
      const parsed = JSON.parse(res);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].username).toBe('alice');
      expect(parsed[0].plan_share_user_ids).toEqual([2]);
      expect(parsed[0].shopping_share_user_ids).toEqual([]);
      expect(parsed[1].plan_share_user_ids).toEqual([]);
    });

    it('list returns raw response when format=full', async () => {
      const raw = [{ user: { id: 1 }, extra: 'kept' }];
      const client = mock({ userPreferences: { listPreferences: async () => raw } });
      const res = await handleListUserPreferences(client, { format: 'full' } as any);
      expect(JSON.parse(res)).toEqual(raw);
    });

    it('list tolerates non-array response (single-prefs-object endpoints)', async () => {
      const client = mock({ userPreferences: { listPreferences: async () => ({ user: { id: 1, username: 'solo' } }) } });
      const res = await handleListUserPreferences(client, {} as any);
      const parsed = JSON.parse(res);
      expect(parsed).toMatchObject({ user: { id: 1 } });
    });

    it('update throws when no fields supplied', async () => {
      const client = mock({ userPreferences: { patchPreference: vi.fn() } });
      await expect(
        handleUpdateUserPreference(client, { user_id: 1 } as any),
      ).rejects.toThrow(/At least one field/);
    });

    it('update maps plan_share_user_ids → plan_share: [{id}]', async () => {
      const patch = vi.fn().mockResolvedValue({ user: { id: 1 }, plan_share: [{ id: 9 }] });
      const client = mock({ userPreferences: { patchPreference: patch } });
      await handleUpdateUserPreference(client, {
        user_id: 1,
        plan_share_user_ids: [9],
        shopping_share_user_ids: [10, 11],
      } as any);
      expect(patch).toHaveBeenCalledWith(1, {
        plan_share: [{ id: 9 }],
        shopping_share: [{ id: 10 }, { id: 11 }],
      });
    });

    it('update with empty plan_share_user_ids → POSTs plan_share: []', async () => {
      // "Clear all shares" is a real user intent — empty array must reach
      // Tandoor, not get filtered out by Array.isArray && length truthiness
      // (QA F7).
      const patch = vi.fn().mockResolvedValue({ user: { id: 1 }, plan_share: [] });
      const client = mock({ userPreferences: { patchPreference: patch } });
      await handleUpdateUserPreference(client, {
        user_id: 1,
        plan_share_user_ids: [],
      } as any);
      expect(patch).toHaveBeenCalledWith(1, { plan_share: [] });
    });

    it('update with null plan_share_user_ids skips that field (treated as "no change")', async () => {
      // null reads as "not Array.isArray" → the field is not in the body.
      // Plus another real field so the empty-body guard doesn't fire.
      const patch = vi.fn().mockResolvedValue({ user: { id: 1 } });
      const client = mock({ userPreferences: { patchPreference: patch } });
      await handleUpdateUserPreference(client, {
        user_id: 1,
        plan_share_user_ids: null as any,
        theme: 'TANDOOR',
      } as any);
      const body = patch.mock.calls[0][1];
      expect(body).not.toHaveProperty('plan_share');
      expect(body).toMatchObject({ theme: 'TANDOOR' });
    });
  });

  describe('automations', () => {
    it('list slims to id/type/name/order/etc.', async () => {
      const client = mock({
        automations: {
          listAutomations: async () => paginated([{
            id: 1, type: 'KEYWORD_ALIAS', name: 'pizza-alias',
            description: 'alias', param_1: 'piza', param_2: 'pizza',
            param_3: null, order: 0, disabled: false,
            extra_field_should_be_dropped: 'gone',
          }]),
        },
      });
      const res = await handleListAutomations(client, {} as any);
      const parsed = JSON.parse(res);
      expect(parsed.results[0]).not.toHaveProperty('extra_field_should_be_dropped');
      expect(parsed.results[0]).toMatchObject({ name: 'pizza-alias', param_1: 'piza' });
    });

    it('get returns slim shape', async () => {
      const client = mock({
        automations: { getAutomation: async () => ({ id: 1, type: 'X', name: 'n', extra: 'gone' }) },
      });
      const res = await handleGetAutomation(client, { id: 1 } as any);
      const parsed = JSON.parse(res);
      expect(parsed).not.toHaveProperty('extra');
    });

    it('create defaults name to type when missing', async () => {
      const create = vi.fn().mockResolvedValue({ id: 1, type: 'X', name: 'X' });
      const client = mock({ automations: { createAutomation: create } });
      await handleCreateAutomation(client, { type: 'X' } as any);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: 'X', name: 'X' }));
    });

    it('create forwards every supplied field', async () => {
      const create = vi.fn().mockResolvedValue({ id: 1, type: 'X', name: 'custom' });
      const client = mock({ automations: { createAutomation: create } });
      await handleCreateAutomation(client, {
        type: 'X', name: 'custom', description: 'd',
        param_1: 'a', param_2: 'b', param_3: 'c',
        order: 5, disabled: true,
      } as any);
      expect(create).toHaveBeenCalledWith({
        type: 'X', name: 'custom', description: 'd',
        param_1: 'a', param_2: 'b', param_3: 'c',
        order: 5, disabled: true,
      });
    });

    it('update throws when no fields supplied', async () => {
      const client = mock({ automations: { patchAutomation: vi.fn() } });
      await expect(handleUpdateAutomation(client, { id: 1 } as any)).rejects.toThrow(/At least one field/);
    });

    it('delete returns confirmation text', async () => {
      const del = vi.fn().mockResolvedValue(undefined);
      const client = mock({ automations: { deleteAutomation: del } });
      const res = await handleDeleteAutomation(client, { id: 42 } as any);
      expect(del).toHaveBeenCalledWith(42);
      expect(res).toMatch(/Automation 42 deleted/);
    });
  });

  describe('user files', () => {
    let tmp: string;
    beforeEach(() => { tmp = mkdtempSync(path.join(tmpdir(), 'admin-test-')); });

    it('list slims to file metadata only', async () => {
      const client = mock({
        userFiles: {
          listUserFiles: async () => paginated([{
            id: 1, name: 'shot.png', file_size_kb: 32,
            file_download: '/a', preview: '/b', created_at: 'x',
            binary_data_we_should_not_echo: 'secret',
          }]),
        },
      });
      const res = await handleListUserFiles(client, {} as any);
      expect(JSON.parse(res).results[0]).not.toHaveProperty('binary_data_we_should_not_echo');
    });

    it('upload throws when neither file_path nor file_url given', async () => {
      const client = mock({ userFiles: { createUserFile: vi.fn() } });
      await expect(handleUploadUserFile(client, { name: 'x' } as any)).rejects.toThrow(/file_path or file_url/);
    });

    it('upload via file_path reads bytes + guesses MIME from extension', async () => {
      const filePath = path.join(tmp, 'logo.png');
      writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4E, 0x47]));
      const create = vi.fn().mockResolvedValue({ id: 1, name: 'logo.png' });
      const client = mock({ userFiles: { createUserFile: create } });
      await handleUploadUserFile(client, { name: 'logo', file_path: filePath } as any);
      const call = create.mock.calls[0][0];
      expect(call.file.mimeType).toBe('image/png');
      expect(call.file.filename).toBe('logo.png');
      expect(call.file.data).toBeInstanceOf(Buffer);
    });

    it('upload via file_path with unknown ext falls back to octet-stream', async () => {
      const filePath = path.join(tmp, 'mystery.xyz');
      writeFileSync(filePath, 'hi');
      const create = vi.fn().mockResolvedValue({ id: 1 });
      const client = mock({ userFiles: { createUserFile: create } });
      await handleUploadUserFile(client, { name: 'm', file_path: filePath } as any);
      expect(create.mock.calls[0][0].file.mimeType).toBe('application/octet-stream');
    });

    // Handler-boundary path-guard tests (Codex high). Proves the handler
    // calls assertSafeUploadPath BEFORE readFile + createUserFile — a
    // refactor that strips the guard would not be caught by path-guard's
    // own library tests.
    describe('refuses paths outside the allow-list', () => {
      let allowed: string;
      let outside: string;
      let prevRoot: string | undefined;

      beforeEach(() => {
        allowed = mkdtempSync(path.join(tmpdir(), 'allow-userfile-'));
        outside = mkdtempSync(path.join(tmpdir(), 'outside-userfile-'));
        prevRoot = process.env.TANDOOR_MCP_UPLOAD_ROOT;
        process.env.TANDOOR_MCP_UPLOAD_ROOT = allowed;
      });
      afterEach(() => {
        rmSync(allowed, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
        if (prevRoot === undefined) delete process.env.TANDOOR_MCP_UPLOAD_ROOT;
        else process.env.TANDOOR_MCP_UPLOAD_ROOT = prevRoot;
      });

      it('refuses an out-of-root file and never calls Tandoor', async () => {
        const secret = path.join(outside, 'shadow');
        writeFileSync(secret, 'root:!:19000:0:99999:7:::');
        const create = vi.fn();
        const client = mock({ userFiles: { createUserFile: create } });
        await expect(handleUploadUserFile(client, { name: 's', file_path: secret } as any))
          .rejects.toThrow(/outside the allowed upload roots/);
        expect(create).not.toHaveBeenCalled();
      });

      it.skipIf(process.platform === 'win32')('refuses a symlink in-root pointing out-of-root', async () => {
        const secret = path.join(outside, 'aws-creds');
        writeFileSync(secret, 'aws_secret_access_key=...');
        const trojan = path.join(allowed, 'photo.png');
        symlinkSync(secret, trojan);
        const create = vi.fn();
        const client = mock({ userFiles: { createUserFile: create } });
        await expect(handleUploadUserFile(client, { name: 'p', file_path: trojan } as any))
          .rejects.toThrow(/outside the allowed upload roots/);
        expect(create).not.toHaveBeenCalled();
      });
    });

    describe('refuses SSRF-targeted file_url', () => {
      let prev: string | undefined;
      beforeEach(() => {
        prev = process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
        delete process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH;
      });
      afterEach(() => {
        if (prev !== undefined) process.env.TANDOOR_MCP_ALLOW_PRIVATE_FETCH = prev;
      });

      it('loopback file_url → SsrfBlockedError; no Tandoor call', async () => {
        const create = vi.fn();
        const client = mock({ userFiles: { createUserFile: create } });
        await expect(handleUploadUserFile(client, {
          name: 'x', file_url: 'http://127.0.0.1/x.png',
        } as any)).rejects.toThrow(/SSRF guard blocked/);
        expect(create).not.toHaveBeenCalled();
      });

      it('IMDS file_url → SsrfBlockedError; no Tandoor call', async () => {
        const create = vi.fn();
        const client = mock({ userFiles: { createUserFile: create } });
        await expect(handleUploadUserFile(client, {
          name: 'x', file_url: 'http://169.254.169.254/cred.png',
        } as any)).rejects.toThrow(/SSRF guard blocked/);
        expect(create).not.toHaveBeenCalled();
      });
    });
  });

  describe('logs', () => {
    it('view logs slim to id/recipe/created_at', async () => {
      const client = mock({
        logs: {
          listViewLogs: async () => paginated([
            { id: 1, recipe: 7, created_at: 't', created_by: { id: 2 }, sensitive: 'gone' },
          ]),
        },
      });
      const res = await handleListViewLogs(client, {} as any);
      expect(JSON.parse(res).results[0]).not.toHaveProperty('sensitive');
    });

    it('import logs project keyword via .name', async () => {
      const client = mock({
        logs: {
          listImportLogs: async () => paginated([
            { id: 1, type: 'URL', msg: 'ok', running: false, keyword: { id: 5, name: 'weeknight' }, total_recipes: 10, imported_recipes: 9 },
          ]),
        },
      });
      const res = await handleListImportLogs(client, {} as any);
      expect(JSON.parse(res).results[0].keyword).toBe('weeknight');
    });

    it('ai logs project ai_provider via .name', async () => {
      const client = mock({
        logs: {
          listAiLogs: async () => paginated([
            { id: 1, function: 'IMG', ai_provider: { id: 3, name: 'openai' }, credit_cost: 0.001, tokens: 1500 },
          ]),
        },
      });
      const res = await handleListAiLogs(client, {} as any);
      expect(JSON.parse(res).results[0].provider).toBe('openai');
    });
  });

  it('food_ai_properties hydrates the current food before POST', async () => {
    const getFood = vi.fn().mockResolvedValue({ id: 1, name: 'apple' });
    const fap = vi.fn().mockResolvedValue({ id: 1, name: 'apple', properties: [{ id: 9 }] });
    const client = mock({
      foodUnits: { getFood, foodAiProperties: fap },
    });
    await handleFoodAiProperties(client, { id: 1, provider: 5 } as any);
    expect(getFood).toHaveBeenCalledWith(1);
    expect(fap).toHaveBeenCalledWith(1, { id: 1, name: 'apple' }, 5);
  });

  it('recipe_ai_properties hydrates the current recipe before POST', async () => {
    const getRecipe = vi.fn().mockResolvedValue({ id: 7, name: 'pizza' });
    const rap = vi.fn().mockResolvedValue({ id: 7, properties: [] });
    const client = mock({
      recipes: { getRecipe, recipeAiProperties: rap },
    });
    await handleRecipeAiProperties(client, { id: 7, provider: 2 } as any);
    expect(getRecipe).toHaveBeenCalledWith(7);
    expect(rap).toHaveBeenCalledWith(7, { id: 7, name: 'pizza' }, 2);
  });

  it('get_server_settings returns raw payload', async () => {
    const settings = { version: '2.0.0', terms_url: '', hosted: false };
    const client = mock({ serverSettings: { getCurrent: async () => settings } });
    const res = await handleGetServerSettings(client, {} as any);
    expect(JSON.parse(res)).toEqual(settings);
  });
});
