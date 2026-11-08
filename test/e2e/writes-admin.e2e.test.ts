import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSurface, textOf, type Surface } from './helpers/surface.js';
import { COVERS } from './helpers/coverage.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const JPEG_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'local-storage', 'e2e-local-jpeg.jpg');
const FIXTURE_DIR = '/opt/recipes/local-storage';

(url && token ? describe : describe.skip)('admin, space and housekeeping writes against live Tandoor', () => {
  const prefix = `e2e-wa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const undo: (() => Promise<unknown>)[] = [];
  const called = new Set<string>();
  let admin: Surface;
  let s: Surface;
  let scopedTokenId: number;
  let spaceId: number;
  let userId: number;

  async function made(tool: string, args: Record<string, unknown>, deleteTool: string): Promise<any> {
    const created = await s.call(tool, { ...args, format: 'full' });
    undo.push(() => s.call(deleteTool, { id: created.id }));
    return created;
  }

  async function errorText(tool: string, args: Record<string, unknown>): Promise<string> {
    const res = await s.raw(tool, args);
    expect(res.isError, textOf(res)).toBe(true);
    return textOf(res);
  }

  async function finishedExport(id: number): Promise<{ running: boolean; total: number }> {
    let log = await s.call('get_export_log', { id, format: 'full' });
    for (let i = 0; i < 60 && log.running; i++) {
      await new Promise((r) => setTimeout(r, 500));
      log = await s.call('get_export_log', { id, format: 'full' });
    }
    return { running: log.running, total: log.total_recipes };
  }

  async function bootstrapMembership(): Promise<any> {
    return (await s.call('list_all_personal_user_spaces', { format: 'full' })).find((us: any) => us.space === spaceId);
  }

  beforeAll(async () => {
    admin = await openSurface(url!, token!);
    const expires = new Date(Date.now() + 86_400_000).toISOString();
    const scoped = await admin.call('create_access_token', { scope: 'read write bookmarklet', expires });
    scopedTokenId = scoped.id;
    s = await openSurface(url!, scoped.token);
    spaceId = (await s.call('get_current_space', {})).id;
    userId = (await s.call('list_user_preferences', {}))[0].user_id;
  });

  afterAll(async () => {
    const failures: string[] = [];
    for (const step of undo.reverse()) await step().catch((err: Error) => failures.push(err.message));
    if ((await s.call('get_current_space', {})).id !== spaceId) await s.call('switch_active_space', { spaceId });
    const membership = await bootstrapMembership();
    const current = (await s.call('get_current_space', {})).id;
    for (const t of [...s.called, ...admin.called]) called.add(t);
    await s.close();
    await admin.call('delete_access_token', { id: scopedTokenId });
    await admin.close();
    expect(failures).toEqual([]);
    expect({ current, active: membership.active, groups: membership.groups.map((g: any) => g.name) })
      .toEqual({ current: spaceId, active: true, groups: ['admin'] });
    expect(COVERS['writes-admin.e2e.test.ts'].filter((t) => !called.has(t))).toEqual([]);
  });

  it('renames, nests and merges keywords', async () => {
    const parent = await made('create_keyword', { name: `${prefix}-kw-parent` }, 'delete_keyword');
    const child = await made('create_keyword', { name: `${prefix}-kw-child` }, 'delete_keyword');
    const doomed = await s.call('create_keyword', { name: `${prefix}-kw-doomed`, format: 'full' });
    undo.push(() => s.raw('delete_keyword', { id: doomed.id }));

    await s.call('update_keyword', { id: child.id, description: `${prefix} described` });
    expect((await s.call('get_keyword', { id: child.id, format: 'full' })).description).toBe(`${prefix} described`);

    await s.call('move_keyword', { id: child.id, parent: parent.id });
    const under = await s.call('list_keywords', { root: parent.id, format: 'full' });
    expect(under.results.map((k: any) => k.id)).toEqual([child.id]);

    await s.call('merge_keyword', { id: doomed.id, target: parent.id });
    expect(await errorText('get_keyword', { id: doomed.id })).toMatch(/404/);
  });

  it('renames and merges supermarket categories', async () => {
    const keep = await made('create_supermarket_category', { name: `${prefix}-aisle` }, 'delete_supermarket_category');
    const doomed = await s.call('create_supermarket_category', { name: `${prefix}-aisle-doomed`, format: 'full' });
    undo.push(() => s.raw('delete_supermarket_category', { id: doomed.id }));

    await s.call('update_supermarket_category', { id: keep.id, name: `${prefix}-aisle-renamed` });
    expect((await s.call('get_supermarket_category', { id: keep.id, format: 'full' })).name).toBe(`${prefix}-aisle-renamed`);

    await s.call('merge_supermarket_category', { id: doomed.id, target: keep.id });
    expect(await errorText('get_supermarket_category', { id: doomed.id })).toMatch(/404/);
  });

  it('updates a unit conversion, property type, property, custom filter and category relation', async () => {
    const grams = await made('create_unit', { name: `${prefix}-g` }, 'delete_unit');
    const kilos = await made('create_unit', { name: `${prefix}-kg` }, 'delete_unit');
    const conversion = await made('create_unit_conversion', { base_amount: 1000, base_unit_id: grams.id, converted_amount: 1, converted_unit_id: kilos.id }, 'delete_unit_conversion');
    await s.call('update_unit_conversion', { id: conversion.id, converted_amount: 2 });
    expect(Number((await s.call('get_unit_conversion', { id: conversion.id, format: 'full' })).converted_amount)).toBe(2);

    const propertyType = await made('create_property_type', { name: `${prefix}-fiber`, unit: 'g' }, 'delete_property_type');
    await s.call('update_property_type', { id: propertyType.id, unit: 'mg' });
    expect((await s.call('get_property_type', { id: propertyType.id, format: 'full' })).unit).toBe('mg');

    const property = await made('create_property', { property_type_id: propertyType.id, property_amount: 3 }, 'delete_property');
    await s.call('update_property', { id: property.id, property_amount: 7 });
    expect(Number((await s.call('get_property', { id: property.id, format: 'full' })).property_amount)).toBe(7);

    const filter = await made('create_custom_filter', { name: `${prefix}-filter`, search: JSON.stringify({ query: prefix }) }, 'delete_custom_filter');
    await s.call('update_custom_filter', { id: filter.id, name: `${prefix}-filter-renamed` });
    expect((await s.call('get_custom_filter', { id: filter.id, format: 'full' })).name).toBe(`${prefix}-filter-renamed`);

    const category = await made('create_supermarket_category', { name: `${prefix}-rel-aisle` }, 'delete_supermarket_category');
    const market = await made('create_supermarket', { name: `${prefix}-market` }, 'delete_supermarket');
    const relation = await made('create_supermarket_category_relation', { category_id: category.id, supermarket: market.id, order: 1 }, 'delete_supermarket_category_relation');
    await s.call('update_supermarket_category_relation', { id: relation.id, order: 5 });
    expect((await s.call('get_supermarket_category_relation', { id: relation.id, format: 'full' })).order).toBe(5);
  });

  it('updates an automation, renames and downloads a user file, and renames a household', async () => {
    const automation = await made('create_automation', { type: 'FOOD_ALIAS', name: `${prefix}-alias`, param_1: `${prefix}-a`, param_2: `${prefix}-b` }, 'delete_automation');
    await s.call('update_automation', { id: automation.id, name: `${prefix}-alias-renamed`, disabled: true });
    expect(await s.call('get_automation', { id: automation.id, format: 'full' })).toMatchObject({ name: `${prefix}-alias-renamed`, disabled: true });

    const dir = await mkdtemp(path.join(tmpdir(), 'tandoor-e2e-wa-'));
    undo.push(() => rm(dir, { recursive: true }));
    const upload = path.join(dir, `${prefix}.jpg`);
    await copyFile(JPEG_FIXTURE, upload);
    const file = await made('upload_user_file', { name: `${prefix}-photo`, file_path: upload }, 'delete_user_file');
    await s.call('update_user_file', { id: file.id, name: `${prefix}-photo-renamed` });
    expect((await s.call('get_user_file', { id: file.id, format: 'full' })).name).toBe(`${prefix}-photo-renamed`);
    const download = await s.raw('download_file', { file_id: file.id });
    expect(download.isError, textOf(download)).toBeFalsy();
    const image = download.content.find((c) => c.type === 'image');
    expect(Buffer.from((image as { data: string }).data, 'base64')).toEqual(await readFile(JPEG_FIXTURE));

    const household = await made('create_household', { name: `${prefix}-home` }, 'delete_household');
    await s.call('update_household', { id: household.id, name: `${prefix}-home-renamed` });
    expect((await s.call('get_household', { id: household.id, format: 'full' })).name).toBe(`${prefix}-home-renamed`);
  });

  it('updates an invite link', async () => {
    const group = (await s.call('list_groups', {})).find((g: any) => g.name === 'user');
    const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const invite = await made('create_invite_link', { email: `${prefix}@example.invalid`, group: group.id, valid_until: validUntil }, 'delete_invite_link');
    await s.call('update_invite_link', { id: invite.id, internal_note: `${prefix}-note`, reusable: true });
    expect(await s.call('get_invite_link', { id: invite.id, format: 'full' })).toMatchObject({ internal_note: `${prefix}-note`, reusable: true });
  });

  it('lists, reads and updates a scratch access token', async () => {
    const expires = new Date(Date.now() + 86_400_000).toISOString().replace(/\.\d+Z$/, 'Z');
    const scratch = await made('create_access_token', { scope: 'read', expires }, 'delete_access_token');

    const listed = await s.call('list_access_tokens', { page_size: 100 });
    expect((listed.results ?? listed).map((t: any) => t.id)).toContain(scratch.id);
    expect((await s.call('get_access_token', { id: scratch.id, format: 'full' })).scope).toBe('read');

    await s.call('update_access_token', { id: scratch.id, scope: 'read write' });
    expect((await s.call('get_access_token', { id: scratch.id, format: 'full' })).scope).toBe('read write');
  });

  it('authenticate mints a working token for the right password and rejects a wrong one', async () => {
    // Tandoor 2.6 /api-token-auth/ returns the user's first live read write token instead of minting one.
    const legacyAuth = s.tandoorVersion === '2.6.0';
    const { username } = await s.call('get_user', { id: userId, format: 'full' });
    const password = `${prefix}-pw`;
    execFileSync('docker', [
      'compose', '-f', process.env.TANDOOR_COMPOSE_FILE!, 'exec', '-T', '-e', `E2E_USER=${username}`, '-e', `E2E_PASS=${password}`, 'web_recipes',
      'sh', '-c', `cd /opt/recipes && source venv/bin/activate && python manage.py shell -c "import os; from django.contrib.auth import get_user_model; u = get_user_model().objects.get(username=os.environ['E2E_USER']); u.set_password(os.environ['E2E_PASS']); u.save()"`,
    ]);
    const recipesWith = async (bearer: string) => (await fetch(`${url}/api/recipe/`, { headers: { Authorization: `Bearer ${bearer}` } })).status;
    const tokenIds = async () => {
      const listed = await s.call('list_access_tokens', { page_size: 100 });
      return new Set<number>((listed.results ?? listed).map((t: any) => t.id));
    };

    const before = await tokenIds();
    const minted = await s.raw('authenticate', { username, password });
    const text = textOf(minted);
    const mintedIds = [...await tokenIds()].filter((id) => !before.has(id));
    for (const id of mintedIds) undo.push(() => s.raw('delete_access_token', { id }));
    expect(minted.isError, text).toBeFalsy();
    expect(text).toMatch(/^Bearer token minted \(text-only, not mirrored to structuredContent\):\n\S+$/);
    const bearer = text.split('\n')[1];
    expect(await recipesWith(bearer)).toBe(200);
    if (legacyAuth) {
      expect(mintedIds).toEqual([]);
    } else {
      expect(mintedIds).toHaveLength(1);
      await s.call('delete_access_token', { id: mintedIds[0] });
      expect(await recipesWith(bearer)).not.toBe(200);
    }

    const rejected = await errorText('authenticate', { username, password: `${password}-wrong` });
    expect(rejected).toContain(legacyAuth ? 'Unable to log in with provided credentials.' : 'username_password_mismatch');
    expect(rejected).not.toContain('non-JSON');
  });

  it('exports a filtered recipe and a listed recipe, and updates export and import logs', async () => {
    const recipe = await made('create_recipe', { name: `${prefix}-export-me`, steps: [{ instruction: 'Serve.', ingredients: [] }] }, 'delete_recipe');
    const filter = await made('create_custom_filter', { name: `${prefix}-export-filter`, search: JSON.stringify({ query: recipe.name }) }, 'delete_custom_filter');
    const started = await s.call('export_recipes', { type: 'DEFAULT', custom_filter: filter.id, format: 'full' });
    undo.push(() => s.call('delete_export_log', { id: started.id }));
    expect(await finishedExport(started.id)).toEqual({ running: false, total: 1 });

    const listed = await s.call('export_recipes', { type: 'DEFAULT', recipes: [recipe.id], format: 'full' });
    undo.push(() => s.call('delete_export_log', { id: listed.id }));
    expect(await finishedExport(listed.id)).toEqual({ running: false, total: 1 });

    await s.call('update_export_log', { id: started.id, msg: `${prefix}-exported` });
    expect((await s.call('get_export_log', { id: started.id, format: 'full' })).msg).toBe(`${prefix}-exported`);

    const importLog = await made('create_import_log', { type: 'DEFAULT', msg: prefix }, 'delete_import_log');
    await s.call('update_import_log', { id: importLog.id, msg: `${prefix}-imported`, running: false });
    expect((await s.call('get_import_log', { id: importLog.id, format: 'full' })).msg).toBe(`${prefix}-imported`);

    const bookmarklet = await made('create_bookmarklet_import', { html: `<html><title>${prefix}</title></html>` }, 'delete_bookmarklet_import');
    await s.call('update_bookmarklet_import', { id: bookmarklet.id, html: `<html><title>${prefix}-edited</title></html>` });
    expect((await s.call('get_bookmarklet_import', { id: bookmarklet.id, format: 'full' })).html).toBe(`<html><title>${prefix}-edited</title></html>`);
  });

  it('manages a local storage, its sync and its recipe-import queue', async () => {
    const storage = await made('create_storage', { name: `${prefix}-storage`, method: 'LOCAL', path: FIXTURE_DIR }, 'delete_storage');
    await s.call('update_storage', { id: storage.id, name: `${prefix}-storage-renamed` });
    expect((await s.call('get_storage', { id: storage.id })).name).toBe(`${prefix}-storage-renamed`);

    const sync = await made('create_sync', { storage_id: storage.id, path: FIXTURE_DIR, active: false }, 'delete_sync');
    const syncLog = await s.call('query_synced_folder', { id: sync.id, format: 'full' });
    expect({ sync: syncLog.sync.id, status: syncLog.status }).toEqual({ sync: sync.id, status: 'SUCCESS' });
    expect((await s.call('get_sync', { id: sync.id, format: 'full' })).last_checked).not.toBeNull();
    await s.call('update_sync', { id: sync.id, path: `${FIXTURE_DIR}/${prefix}` });
    expect((await s.call('get_sync', { id: sync.id, format: 'full' })).path).toBe(`${FIXTURE_DIR}/${prefix}`);

    const recipeNamed = async (name: string) => (await s.call('list_recipes', { query: name, format: 'full' })).results.filter((r: any) => r.name === name);
    const one = await s.call('create_recipe_import', { name: `${prefix}-queued-one`, storage: storage.id, format: 'full' });
    await s.call('update_recipe_import', { id: one.id, name: `${prefix}-queued-renamed` });
    expect((await s.call('get_recipe_import', { id: one.id, format: 'full' })).name).toBe(`${prefix}-queued-renamed`);
    await s.call('import_pending_recipe', { id: one.id });
    const [fromOne] = await recipeNamed(`${prefix}-queued-renamed`);
    undo.push(() => s.call('delete_recipe', { id: fromOne.id }));

    await s.call('create_recipe_import', { name: `${prefix}-queued-two`, storage: storage.id });
    await s.call('import_all_pending', {});
    let fromAll: any[] = [];
    for (let i = 0; i < 60 && fromAll.length === 0; i++) {
      fromAll = await recipeNamed(`${prefix}-queued-two`);
      if (fromAll.length === 0) await new Promise((r) => setTimeout(r, 500));
    }
    for (const r of fromAll) undo.push(() => s.call('delete_recipe', { id: r.id }));
    expect(fromAll).toHaveLength(1);
    const queue = await s.call('list_recipe_imports', { page_size: 100 });
    expect(queue.results.filter((q: any) => q.name.startsWith(prefix))).toEqual([]);
  });

  it('updates a view log', async () => {
    const first = await made('create_recipe', { name: `${prefix}-viewed`, steps: [{ instruction: 'Look.', ingredients: [] }] }, 'delete_recipe');
    const second = await made('create_recipe', { name: `${prefix}-viewed-instead`, steps: [{ instruction: 'Look again.', ingredients: [] }] }, 'delete_recipe');
    const viewLog = await (await fetch(`${url}/api/view-log/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe: first.id }),
    })).json();
    undo.push(() => s.call('delete_view_log', { id: viewLog.id }));
    await s.call('update_view_log', { id: viewLog.id, recipe: second.id });
    expect((await s.call('get_view_log', { id: viewLog.id, format: 'full' })).recipe).toBe(second.id);
  });

  it('creates, reads, updates and deletes an AI provider and a connector without contacting them', async () => {
    const provider = await s.call('create_ai_provider', { name: `${prefix}-ai`, model_name: 'e2e-model', api_key: prefix, url: 'http://127.0.0.1:9', space: spaceId, format: 'full' });
    undo.push(() => s.raw('delete_ai_provider', { id: provider.id }));
    expect((await s.call('get_ai_provider', { id: provider.id, format: 'full' })).space).toBe(spaceId);
    await s.call('update_ai_provider', { id: provider.id, model_name: 'e2e-model-2' });
    expect(await s.call('get_ai_provider', { id: provider.id, format: 'full' })).toMatchObject({ name: `${prefix}-ai`, model_name: 'e2e-model-2', space: spaceId });
    await s.call('delete_ai_provider', { id: provider.id });
    expect(await errorText('get_ai_provider', { id: provider.id })).toMatch(/404/);

    const connector = await s.call('create_connector', { name: `${prefix}-ha`, type: 'HomeAssistant', url: 'http://127.0.0.1:9', token: prefix, todo_entity: 'todo.e2e', enabled: false, format: 'full' });
    undo.push(() => s.raw('delete_connector', { id: connector.id }));
    await s.call('update_connector', { id: connector.id, todo_entity: 'todo.e2e_renamed' });
    expect(await s.call('get_connector', { id: connector.id, format: 'full' })).toMatchObject({ name: `${prefix}-ha`, todo_entity: 'todo.e2e_renamed', enabled: false });
    await s.call('delete_connector', { id: connector.id });
    expect(await errorText('get_connector', { id: connector.id })).toMatch(/404/);
  });

  it('downloads the synced bootstrap JPEG recipe file', async () => {
    const [recipe] = (await s.call('list_recipes', { query: 'e2e-local-jpeg', format: 'full' })).results.filter((r: any) => r.name === 'e2e-local-jpeg');
    const res = await s.raw('download_recipe_file', { recipe_id: recipe.id });
    expect(res.isError, textOf(res)).toBeFalsy();
    const image = res.content.find((c) => c.type === 'image');
    expect(Buffer.from((image as { data: string }).data, 'base64')).toEqual(await readFile(JPEG_FIXTURE));
  });

  it('changes and restores the bootstrap user, preference and search preference', async () => {
    const user = await s.call('get_user', { id: userId, format: 'full' });
    const preference = await s.call('get_user_preference', { user_id: userId, format: 'full' });
    const search = (await s.call('list_search_preferences', {}))[0];
    try {
      await s.call('update_user', { id: userId, first_name: `${prefix}-first` });
      expect((await s.call('get_user', { id: userId, format: 'full' })).first_name).toBe(`${prefix}-first`);

      await s.call('update_user_preference', { user_id: userId, use_fractions: !preference.use_fractions });
      expect((await s.call('get_user_preference', { user_id: userId, format: 'full' })).use_fractions).toBe(!preference.use_fractions);

      await s.call('update_search_preference', { user: userId, trigram_threshold: 0.35 });
      expect((await s.call('list_search_preferences', {}))[0].trigram_threshold).toBe(0.35);
    } finally {
      await s.call('update_user', { id: userId, first_name: user.first_name });
      await s.call('update_user_preference', { user_id: userId, use_fractions: preference.use_fractions });
      await s.call('update_search_preference', { user: userId, trigram_threshold: search.trigram_threshold });
    }
    expect((await s.call('get_user', { id: userId, format: 'full' })).first_name).toBe(user.first_name);
    expect((await s.call('get_user_preference', { user_id: userId, format: 'full' })).use_fractions).toBe(preference.use_fractions);
    expect((await s.call('list_search_preferences', {}))[0].trigram_threshold).toBe(search.trigram_threshold);
  });

  it('creates a scratch space, works inside it, and switches back; delete_user_space covered on its owner-refusal path only', async () => {
    const space = await s.call('create_space', { name: `${prefix}-space`, format: 'full' });
    expect((await s.call('list_spaces', { page_size: 100 })).results.map((x: any) => x.id)).toContain(space.id);
    try {
      await s.call('switch_active_space', { spaceId: space.id });
      expect((await s.call('get_current_space', {})).id).toBe(space.id);

      await s.call('update_space', { id: space.id, message: `${prefix}-message` });
      expect((await s.call('get_space', { id: space.id, format: 'full' })).message).toBe(`${prefix}-message`);

      const [membership] = (await s.call('list_user_spaces', { format: 'full' })).results;
      expect(membership.space).toBe(space.id);
      await s.call('update_user_space', { id: membership.id, internal_note: `${prefix}-note` });
      expect((await s.call('get_user_space', { id: membership.id, format: 'full' })).internal_note).toBe(`${prefix}-note`);

      expect(await errorText('delete_user_space', { id: membership.id })).toContain('Cannot delete Space owner permission');
      expect((await s.call('get_user_space', { id: membership.id, format: 'full' })).groups.map((g: any) => g.name)).toEqual(['admin']);
    } finally {
      await s.call('switch_active_space', { spaceId });
    }
    expect((await s.call('get_current_space', {})).id).toBe(spaceId);
  });

  it('disables and re-enables a tool group, persisting each change', async () => {
    const groups = await openSurface(url!, token!);
    const configHome = await mkdtemp(path.join(tmpdir(), 'tandoor-e2e-wa-config-'));
    const previous = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = configHome;
    const saved = async () => Object.values(JSON.parse(await readFile(path.join(configHome, 'tandoor-mcp', 'sections.json'), 'utf8')))[0];
    try {
      await groups.call('disable_tool_group', { group: 'ai' });
      expect((await groups.raw('list_ai_providers', {})).isError).toBe(true);
      expect(await saved()).toEqual({ ai: 'off' });

      await groups.call('enable_tool_group', { group: 'ai' });
      expect((await groups.raw('list_ai_providers', {})).isError).toBeFalsy();
      expect(await saved()).toEqual({ ai: 'on' });
    } finally {
      process.env.XDG_CONFIG_HOME = previous;
      await rm(configHome, { recursive: true });
      for (const t of groups.called) called.add(t);
      await groups.close();
    }
  });
});
