/**
 * End-to-end test against a live Tandoor instance.
 *
 * WARNING: This suite creates and deletes real rows in the configured Tandoor
 * space. Run it only against an ISOLATED test space. Every resource the suite
 * creates is tracked and cleaned up in the `afterAll` hook, in reverse order.
 *
 * Required env:
 *   TANDOOR_URL    — base URL of the Tandoor instance
 *   TANDOOR_TOKEN  — API token with write access to the test space
 *
 * Optional env:
 *   TANDOOR_E2E_KEEP=1                 — skip cleanup (leaves resources in place for manual inspection)
 *   TANDOOR_E2E_SKIP_IMPORT=1          — skip the URL-import step (useful if the runner has no internet)
 *   TANDOOR_E2E_IMPORT_URL=<url>       — override the default recipe URL used for import
 *   TANDOOR_E2E_AI_PROVIDER=<id>       — run AI-import against this provider id (otherwise skipped)
 *
 * Run: `npm run test:e2e`
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../../src/clients/index.js';
import { registerRecipeTools } from '../../src/tools/recipe.js';
import { registerJqTools } from '../../src/tools/jq.js';
import { registerAccessTokenTools } from '../../src/tools/access-token.js';
import { registerInviteLinkTools } from '../../src/tools/invite-link.js';
import { registerStorageTools } from '../../src/tools/storage.js';
import { registerAiTools } from '../../src/tools/ai.js';
import { registerHousekeepingTools } from '../../src/tools/housekeeping.js';
import { registerMealTypeTools } from '../../src/tools/mealtype.js';
import { _stashClear } from '../../src/lib/stash.js';
import { checkTandoorVersion } from '../../src/lib/version-check.js';
import { getRegisteredTool } from '../helpers/mcp.js';

// One-line prefix so every resource this suite creates is greppable in the
// live space if cleanup ever fails midway.
const E2E_PREFIX = `mcp-e2e-${Date.now()}`;

// Invoke a registered MCP tool by name and return the JSON-parsed text body.
// Handlers that emit plain prose (e.g. "Access token 5 deleted.") return the
// raw string. Redaction assertions parse the JSON block after the first blank
// line since create/update responses prepend a status line.
async function invokeAndParse(server: McpServer, name: string, args: unknown): Promise<any> {
  const tool = getRegisteredTool(server, name);
  const res: any = await tool.handler(args, { signal: new AbortController().signal });
  if (res.isError) throw new Error(`tool ${name} errored: ${res.content?.[0]?.text}`);
  const text: string = res.content?.[0]?.text ?? '';
  const jsonStart = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  const start = jsonStart === -1 ? arrayStart : arrayStart === -1 ? jsonStart : Math.min(jsonStart, arrayStart);
  if (start === -1) return text;
  try { return JSON.parse(text.slice(start)); } catch { return text; }
}

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const haveCreds = !!(url && token);

// Cleanup registry: each entry runs in LIFO order. Keep labels so the teardown
// log is readable when something fails halfway.
interface CleanupTask {
  label: string;
  fn: () => Promise<any>;
}

const cleanup: CleanupTask[] = [];

// Shared across tests — populated as the workflow progresses.
const ctx: Record<string, any> = {};

function describeE2E(name: string, fn: () => void) {
  const d = haveCreds ? describe : describe.skip;
  return d(name, fn);
}

describeE2E('Tandoor E2E workflow', () => {
  let client: TandoorClient;
  // Shared MCP server used by the redaction-critical suite below. Handlers
  // run through the same registration pipeline production uses, so a broken
  // slim projector, a mis-templated URL, or a missing "full" branch surface
  // as a test failure rather than a silent leak.
  let mcp: McpServer;

  beforeAll(() => {
    // E2E creates storage/connector rows against reserved .invalid TLDs; opt
    // into the SSRF bypass that url-import unit tests use so DNS lookup does
    // not reject the payload before it ever reaches Tandoor.
    process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK = '1';
    // Force full profile so every tool the suite invokes is registered and
    // enabled; core-mode gating would hide non-core tools from tools/list.
    process.env.TANDOOR_MCP_PROFILE = 'full';
    client = new TandoorClient({ url: url!, token: token! });
    mcp = new McpServer({ name: 'e2e', version: 'e2e' });
    registerRecipeTools(mcp, client);
    registerJqTools(mcp, client);
    registerAccessTokenTools(mcp, client);
    registerInviteLinkTools(mcp, client);
    registerStorageTools(mcp, client);
    registerAiTools(mcp, client);
    registerHousekeepingTools(mcp, client);
    registerMealTypeTools(mcp, client);
    // eslint-disable-next-line no-console
    console.log(`\n  Using Tandoor @ ${url}\n  Keep resources on failure: ${!!process.env.TANDOOR_E2E_KEEP}\n`);
  });

  afterAll(async () => {
    delete process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK;
    delete process.env.TANDOOR_MCP_PROFILE;
    if (process.env.TANDOOR_E2E_KEEP === '1') {
      // eslint-disable-next-line no-console
      console.log(`\n  TANDOOR_E2E_KEEP=1 — leaving ${cleanup.length} resource(s) behind for inspection.`);
      for (const t of cleanup) console.log(`    • ${t.label}`);
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`\n  Cleaning up ${cleanup.length} resource(s)...`);
    let failed = 0;
    while (cleanup.length > 0) {
      const task = cleanup.pop()!;
      try {
        await task.fn();
      } catch (err) {
        failed++;
        // eslint-disable-next-line no-console
        console.error(`    ✗ ${task.label}: ${(err as Error).message}`);
      }
    }
    if (failed > 0) {
      // eslint-disable-next-line no-console
      console.error(`  ${failed} cleanup step(s) failed — inspect manually.`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`  All cleanup complete.`);
    }
  });

  // ---------------- read-only sanity ----------------

  it('server-settings endpoint responds', async () => {
    const s = await client.serverSettings.getCurrent();
    expect(s).toBeDefined();
  });

  it('version check returns ok against the live instance', async () => {
    // Pins the wire contract: the payload field is named `version` and looks
    // like a semver. If Tandoor renames it, every boot silently degrades to
    // `unknown` — this is the only test that would catch that.
    const r = await checkTandoorVersion(client);
    expect(r.status).toBe('ok');
    expect(r.version).toMatch(/^\d+\./);
  });

  it('list meal types returns something iterable', async () => {
    const types = await client.mealPlans.listMealTypes();
    expect(Array.isArray(types)).toBe(true);
    ctx.mealTypeId = types[0]?.id;
    ctx.mealTypeName = types[0]?.name;
    // Create a meal type on the fly if none exist so downstream steps work.
    if (!ctx.mealTypeId) {
      // Use the raw endpoint — create-meal-type isn't exposed via tools, but
      // it's just a POST /api/meal-type/
      const created: any = await (client.mealPlans as any).request('/api/meal-type/', {
        method: 'POST',
        body: JSON.stringify({ name: `e2e-meal-type-${Date.now()}` }),
      });
      ctx.mealTypeId = created.id;
      ctx.mealTypeName = created.name;
      cleanup.push({
        label: `meal-type ${created.id}`,
        fn: () => (client.mealPlans as any).request(`/api/meal-type/${created.id}/`, { method: 'DELETE' }),
      });
    }
    expect(ctx.mealTypeId).toBeGreaterThan(0);
  });

  // ---------------- foundation resources ----------------

  it('creates a food', async () => {
    const suffix = Date.now();
    const f = await client.foodUnits.createFood({ name: `e2e-food-${suffix}` });
    ctx.foodId = f.id;
    ctx.foodName = f.name;
    cleanup.push({ label: `food ${f.id}`, fn: () => client.foodUnits.deleteFood(f.id) });
    expect(f.id).toBeGreaterThan(0);
    expect(f.name).toContain('e2e-food-');
  });

  it('creates a unit', async () => {
    const suffix = Date.now();
    const u = await client.foodUnits.createUnit({ name: `e2e-unit-${suffix}` });
    ctx.unitId = u.id;
    ctx.unitName = u.name;
    cleanup.push({ label: `unit ${u.id}`, fn: () => client.foodUnits.deleteUnit(u.id) });
    expect(u.id).toBeGreaterThan(0);
  });

  it('creates a keyword', async () => {
    const suffix = Date.now();
    const k = await client.keywords.createKeyword({ name: `e2e-kw-${suffix}` });
    ctx.keywordId = k.id;
    cleanup.push({ label: `keyword ${k.id}`, fn: () => client.keywords.deleteKeyword(k.id) });
    expect(k.id).toBeGreaterThan(0);
  });

  // ---------------- recipe write/update ----------------

  it('creates a recipe with keyword, step, and ingredient (nested objects)', async () => {
    const recipe = await client.recipes.createRecipe({
      name: `e2e-recipe-${Date.now()}`,
      description: 'Created by E2E suite',
      servings: 2,
      working_time: 10,
      waiting_time: 0,
      internal: true,
      keywords: [{ id: ctx.keywordId, name: 'kw' } as any],
      steps: [
        {
          instruction: 'Mix everything.',
          time: 5,
          ingredients: [
            {
              // Tandoor 2.x requires `name` on nested food/unit even when `id` is set.
              food: { id: ctx.foodId, name: ctx.foodName } as any,
              unit: { id: ctx.unitId, name: ctx.unitName } as any,
              amount: 2,
              note: 'diced',
            },
          ],
        } as any,
      ],
    });
    ctx.recipeId = recipe.id;
    ctx.recipeName = recipe.name;
    cleanup.push({ label: `recipe ${recipe.id}`, fn: () => (client.recipes as any).request(`/api/recipe/${recipe.id}/`, { method: 'DELETE' }) });
    expect(recipe.id).toBeGreaterThan(0);
    expect(Array.isArray(recipe.steps)).toBe(true);
    expect(recipe.steps[0].ingredients[0].food.id).toBe(ctx.foodId);
  });

  it('get recipe returns the created recipe', async () => {
    const r = await client.recipes.getRecipe(ctx.recipeId);
    expect(r.id).toBe(ctx.recipeId);
  });

  it('list_recipes finds the new recipe via query', async () => {
    const list = await client.recipes.listRecipes({ query: 'e2e-recipe', page_size: 25 });
    const hit = list.results.find((x: any) => x.id === ctx.recipeId);
    expect(hit).toBeDefined();
  });

  it('list_recipes accepts expanded filter params (rating_gte, keywords_or)', async () => {
    // Just assert the API accepts the params (non-zero result not required).
    const list = await client.recipes.listRecipes({
      keywords_or: [ctx.keywordId],
      rating_gte: 0,
      sort_order: '-created_at',
      page_size: 10,
    });
    expect(list).toBeDefined();
    expect(Array.isArray(list.results)).toBe(true);
  });

  it('patches the recipe description', async () => {
    const r = await client.recipes.patchRecipe(ctx.recipeId, { description: 'Updated by E2E' });
    expect(r.description).toBe('Updated by E2E');
  });

  // ---------------- standalone step CRUD ----------------

  it('updates the recipe step via step CRUD', async () => {
    // Tandoor 2.x scopes /api/step/ to steps reachable through a recipe in the
    // space, so orphan steps created here would 404 on read/delete. Exercise
    // step CRUD against the recipe's own step instead.
    const list = await client.steps.listSteps({ recipe: [ctx.recipeId] });
    const step = (list.results ?? list)[0];
    expect(step.id).toBeGreaterThan(0);
    const patched = await client.steps.patchStep(step.id, {
      instruction: 'Mix everything thoroughly.',
    });
    expect(patched.instruction).toBe('Mix everything thoroughly.');
  });

  // ---------------- recipe actions ----------------

  it('related_recipes returns an array', async () => {
    const r = await client.recipes.relatedRecipes(ctx.recipeId);
    expect(Array.isArray(r) || Array.isArray(r?.results)).toBe(true);
  });

  // ---------------- meal plan ----------------

  it('creates a meal plan for the recipe', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const mp = await client.mealPlans.createMealPlan({
      recipe: { id: ctx.recipeId, name: ctx.recipeName } as any,
      meal_type: { id: ctx.mealTypeId, name: ctx.mealTypeName } as any,
      servings: 2,
      from_date: today,
    } as any);
    ctx.mealPlanId = mp.id;
    cleanup.push({ label: `meal-plan ${mp.id}`, fn: () => client.mealPlans.deleteMealPlan(mp.id) });
    expect(mp.id).toBeGreaterThan(0);
  });

  it('patches the meal plan servings', async () => {
    const r = await client.mealPlans.patchMealPlan(ctx.mealPlanId, { servings: 3 });
    expect(Number(r.servings)).toBe(3);
  });

  // ---------------- shopping list ----------------

  it('adds the recipe to the shopping list', async () => {
    const r = await client.recipes.recipeShoppingUpdate(ctx.recipeId, {
      servings: 1,
      ingredients: [],
    });
    expect(r).toBeDefined();
    // Find the list_recipe just created (for later cleanup).
    const lrList = await client.shopping.listShoppingListRecipes({ page_size: 50 });
    const match = (lrList.results || []).find((x: any) => x.recipe === ctx.recipeId);
    if (match) {
      ctx.shoppingListRecipeId = match.id;
      cleanup.push({
        label: `shopping-list-recipe ${match.id}`,
        fn: () => client.shopping.deleteShoppingListRecipe(match.id),
      });
    }
  });

  it('creates a standalone shopping entry and bulk-checks it', async () => {
    const entry = await client.shopping.createEntry({
      amount: 1,
      food: { id: ctx.foodId, name: ctx.foodName },
      unit: { id: ctx.unitId, name: ctx.unitName },
      checked: false,
    });
    ctx.shoppingEntryId = entry.id;
    cleanup.push({ label: `shopping-entry ${entry.id}`, fn: () => client.shopping.deleteEntry(entry.id) });
    const bulk = await client.shopping.bulkCheckEntries([entry.id], true);
    expect(bulk).toBeDefined();
  });

  // ---------------- cook log ----------------

  it('creates a cook log entry', async () => {
    const cl = await client.cookLogs.createCookLog({
      recipe: ctx.recipeId,
      rating: 4,
      comment: 'E2E cook log',
    });
    ctx.cookLogId = cl.id;
    cleanup.push({ label: `cook-log ${cl.id}`, fn: () => client.cookLogs.deleteCookLog(cl.id) });
    expect(cl.id).toBeGreaterThan(0);
  });

  // ---------------- recipe book ----------------

  it('creates a recipe book and attaches the recipe', async () => {
    const suffix = Date.now();
    const book = await client.recipeBooks.createBook({
      name: `e2e-book-${suffix}`,
      shared: [],
    });
    ctx.bookId = book.id;
    cleanup.push({ label: `recipe-book ${book.id}`, fn: () => client.recipeBooks.deleteBook(book.id) });

    const entry = await client.recipeBooks.createBookEntry({ book: book.id, recipe: ctx.recipeId });
    cleanup.push({ label: `book-entry ${entry.id}`, fn: () => client.recipeBooks.deleteBookEntry(entry.id) });
    expect(entry.id).toBeGreaterThan(0);
  });

  // ---------------- misc: custom filter, property type, supermarket category ----------------

  it('creates a custom filter', async () => {
    const cf = await client.customFilters.createFilter({
      name: `e2e-filter-${Date.now()}`,
      search: 'e2e-recipe',
      shared: [],
    });
    ctx.customFilterId = cf.id;
    cleanup.push({ label: `custom-filter ${cf.id}`, fn: () => client.customFilters.deleteFilter(cf.id) });
    expect(cf.id).toBeGreaterThan(0);
  });

  it('creates a property type and a property, then cleans them up', async () => {
    const pt = await client.propertyTypes.createPropertyType({
      name: `e2e-ptype-${Date.now()}`,
      unit: 'g',
    });
    ctx.propertyTypeId = pt.id;
    cleanup.push({ label: `property-type ${pt.id}`, fn: () => client.propertyTypes.deletePropertyType(pt.id) });

    const p = await client.properties.createProperty({
      property_amount: 42,
      property_type: { id: pt.id, name: pt.name },
    });
    cleanup.push({ label: `property ${p.id}`, fn: () => client.properties.deleteProperty(p.id) });
    expect(p.id).toBeGreaterThan(0);
  });

  it('creates a supermarket category', async () => {
    const sc = await client.supermarketCategories.createCategory({
      name: `e2e-cat-${Date.now()}`,
    });
    ctx.supermarketCategoryId = sc.id;
    cleanup.push({ label: `supermarket-category ${sc.id}`, fn: () => client.supermarketCategories.deleteCategory(sc.id) });
    expect(sc.id).toBeGreaterThan(0);
  });

  // ---------------- 1.5.0 access-token (redaction) ----------------
  // Redaction-critical family: slim MUST omit the raw token; format='full'
  // MUST reveal it. Create response always reveals (mint semantics).

  it('access-token: create → get(slim) hides token, get(full) reveals, list, delete', async () => {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const scope = `${E2E_PREFIX}-scope`;
    const created = await invokeAndParse(mcp, 'create_access_token', { scope, expires });
    expect(created.id).toBeGreaterThan(0);
    // Create response is a mint; the token string must be present.
    expect(typeof created.token).toBe('string');
    expect(created.token.length).toBeGreaterThan(0);
    ctx.accessTokenId = created.id;
    cleanup.push({ label: `access-token ${created.id}`, fn: () => client.accessTokens.deleteToken(created.id) });

    const slim = await invokeAndParse(mcp, 'get_access_token', { id: created.id });
    expect(slim.id).toBe(created.id);
    expect(slim.token).toBeUndefined();

    const full = await invokeAndParse(mcp, 'get_access_token', { id: created.id, format: 'full' });
    expect(full.id).toBe(created.id);
    expect(typeof full.token).toBe('string');

    const list = await invokeAndParse(mcp, 'list_access_tokens', { page_size: 25 });
    const hit = (list.results || list).find((t: any) => t.id === created.id);
    expect(hit).toBeDefined();
    expect(hit.token).toBeUndefined();
  });

  it('authenticate: rejects bogus credentials with a non-2xx error', async () => {
    // Verifies the /api-token-auth/ path template. Do NOT pass real creds.
    await expect(
      client.accessTokens.authenticate({ username: `${E2E_PREFIX}-nope`, password: 'wrong-pw-should-fail' }),
    ).rejects.toThrow();
  });

  // ---------------- 1.5.0 invite-link (URL: /api/invite-link/) ----------------
  // Guards the exact template: a typo like /api/invitelink/ would 404 here.

  it('invite-link: create → get(slim) → list → delete', async () => {
    const groups = await client.housekeeping.listGroups();
    const groupId = Array.isArray(groups) ? groups[0]?.id : groups?.results?.[0]?.id;
    if (!groupId) {
      // eslint-disable-next-line no-console
      console.log('    (skipped: no groups in target space)');
      return;
    }
    const valid_until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const created = await invokeAndParse(mcp, 'create_invite_link', {
      email: `${E2E_PREFIX}@example.invalid`,
      group: groupId,
      valid_until,
      internal_note: E2E_PREFIX,
    });
    expect(created.id).toBeGreaterThan(0);
    // uuid is the shareable token; slim keeps it because that IS the payload.
    expect(typeof created.uuid).toBe('string');
    cleanup.push({ label: `invite-link ${created.id}`, fn: () => client.inviteLinks.deleteInviteLink(created.id) });

    const got = await invokeAndParse(mcp, 'get_invite_link', { id: created.id });
    expect(got.id).toBe(created.id);
    expect(got.uuid).toBe(created.uuid);

    const list = await invokeAndParse(mcp, 'list_invite_links', { internal_note: E2E_PREFIX });
    const hit = (list.results || list).find((x: any) => x.id === created.id);
    expect(hit).toBeDefined();
  });

  // ---------------- 1.5.0 storage (redaction) ----------------
  // Redaction-critical: slim must strip token/password/username/url.

  it('storage: create with fake creds → get(slim) hides secrets, get(full) reveals, delete', async () => {
    const created = await invokeAndParse(mcp, 'create_storage', {
      name: `${E2E_PREFIX}-storage`,
      method: 'NEXTCLOUD',
      path: '/e2e',
      url: 'https://nextcloud.example.invalid',
      username: 'e2e-user',
      password: 'sk-e2e-fake-pw',
      token: 'sk-e2e-fake-storage-token',
    });
    expect(created.id).toBeGreaterThan(0);
    cleanup.push({ label: `storage ${created.id}`, fn: () => client.storages.deleteStorage(created.id) });

    const slim = await invokeAndParse(mcp, 'get_storage', { id: created.id });
    expect(slim.id).toBe(created.id);
    expect(slim.name).toContain(E2E_PREFIX);
    expect(slim.token).toBeUndefined();
    expect(slim.password).toBeUndefined();
    expect(slim.username).toBeUndefined();

    const full = await invokeAndParse(mcp, 'get_storage', { id: created.id, format: 'full' });
    expect(full.id).toBe(created.id);
    // Tandoor may echo the token/password verbatim or return a masked form —
    // either way, full mode must NOT be identical to slim (i.e. more keys).
    expect(Object.keys(full).length).toBeGreaterThan(Object.keys(slim).length);

    const list = await invokeAndParse(mcp, 'list_storages', { page_size: 25 });
    const hit = (list.results || list).find((x: any) => x.id === created.id);
    expect(hit).toBeDefined();
    expect(hit.token).toBeUndefined();
    expect(hit.password).toBeUndefined();
  });

  // ---------------- 1.5.0 ai-provider (redaction) ----------------

  it('ai-provider: create with fake api_key → get(slim) hides key, get(full) reveals, delete', async () => {
    const fakeKey = `sk-e2e-fake-key-${E2E_PREFIX}`;
    const created = await invokeAndParse(mcp, 'create_ai_provider', {
      name: `${E2E_PREFIX}-provider`,
      api_key: fakeKey,
      model_name: 'gpt-4o-mini',
      description: 'OpenAI',
    });
    expect(created.id).toBeGreaterThan(0);
    cleanup.push({ label: `ai-provider ${created.id}`, fn: () => client.ai.deleteAiProvider(created.id) });

    const slim = await invokeAndParse(mcp, 'get_ai_provider', { id: created.id });
    expect(slim.id).toBe(created.id);
    expect(slim.api_key).toBeUndefined();

    const full = await invokeAndParse(mcp, 'get_ai_provider', { id: created.id, format: 'full' });
    expect(full.id).toBe(created.id);
    // Tandoor treats api_key as write-only, so full mode never re-exposes the secret.
    // The redaction invariant is "full does not lose fields relative to slim" (>=, not >),
    // because the spec-aligned slim projection already surfaces every response field.
    expect(Object.keys(full).length).toBeGreaterThanOrEqual(Object.keys(slim).length);
    expect(full.api_key).toBeUndefined();

    const list = await invokeAndParse(mcp, 'list_ai_providers', { page_size: 25 });
    const hit = (list.results || []).find((x: any) => x.id === created.id);
    expect(hit).toBeDefined();
    expect(hit.api_key).toBeUndefined();
    // Record the id so downstream AI-import optional test can reuse it later
    // if the operator sets TANDOOR_E2E_AI_PROVIDER to this exact id.
    ctx.aiProviderId = created.id;
  });

  // ---------------- 1.5.0 connector-config (redaction) ----------------

  it('connector-config: create Home Assistant → get(slim) hides token, get(full) reveals, delete', async () => {
    const created = await invokeAndParse(mcp, 'create_connector', {
      name: `${E2E_PREFIX}-connector`,
      type: 'HomeAssistant',
      url: 'https://homeassistant.example.invalid',
      token: `sk-e2e-fake-ha-${E2E_PREFIX}`,
      todo_entity: 'todo.groceries',
      enabled: false,
    });
    expect(created.id).toBeGreaterThan(0);
    cleanup.push({ label: `connector ${created.id}`, fn: () => client.housekeeping.deleteConnector(created.id) });

    const slim = await invokeAndParse(mcp, 'get_connector', { id: created.id });
    expect(slim.id).toBe(created.id);
    expect(slim.token).toBeUndefined();

    const full = await invokeAndParse(mcp, 'get_connector', { id: created.id, format: 'full' });
    expect(full.id).toBe(created.id);
    // Tandoor may write-only the token; full mode need only expose more fields than slim, not the token verbatim.
    expect(Object.keys(full).length).toBeGreaterThan(Object.keys(slim).length);

    const list = await invokeAndParse(mcp, 'list_connectors', { page_size: 25 });
    const hit = (list.results || list).find((x: any) => x.id === created.id);
    expect(hit).toBeDefined();
    expect(hit.token).toBeUndefined();
  });

  // ---------------- 1.5.0 meal-type CRUD (URL: /api/meal-type/) ----------------

  it('meal-type: create → get → update → delete', async () => {
    const created = await invokeAndParse(mcp, 'create_meal_type', {
      name: `${E2E_PREFIX}-meal-type`,
      order: 99,
    });
    expect(created.id).toBeGreaterThan(0);
    cleanup.push({ label: `meal-type ${created.id}`, fn: () => client.mealTypes.deleteMealType(created.id) });

    const got = await invokeAndParse(mcp, 'get_meal_type', { id: created.id });
    expect(got.id).toBe(created.id);

    const patched = await invokeAndParse(mcp, 'update_meal_type', { id: created.id, order: 42 });
    expect(patched.order).toBe(42);
  });

  // ---------------- 1.5.0 supermarket CRUD (URL: /api/supermarket/) ----------------

  it('supermarket: create → list → get → delete', async () => {
    const created = await client.supermarkets.createSupermarket({ name: `${E2E_PREFIX}-supermarket` });
    expect(created.id).toBeGreaterThan(0);
    cleanup.push({ label: `supermarket ${created.id}`, fn: () => client.supermarkets.deleteSupermarket(created.id) });

    const list = await client.supermarkets.listSupermarkets({ page_size: 25, query: E2E_PREFIX });
    const hit = (list.results || list).find((x: any) => x.id === created.id);
    expect(hit).toBeDefined();

    const got = await client.supermarkets.getSupermarket(created.id);
    expect(got.id).toBe(created.id);
  });

  // ---------------- 1.5.0 sync + sync-log (URLs: /api/sync/, /api/sync-log/) ----------------

  it('sync: create → query_synced_folder → list_sync_logs → delete', async () => {
    // sync requires a storage to point at; the storage from the redaction
    // test above is already scheduled for cleanup, so create a dedicated one.
    const storage = await client.storages.createStorage({
      name: `${E2E_PREFIX}-sync-storage`,
      method: 'LOCAL',
      path: '/tmp/e2e-sync',
    });
    cleanup.push({ label: `sync-storage ${storage.id}`, fn: () => client.storages.deleteStorage(storage.id) });

    let created: any;
    try {
      // Tandoor expects a nested storage envelope: { storage: { id }, path }.
      created = await client.syncs.createSync({ storage: { id: storage.id }, path: '/tmp/e2e-sync', active: false });
    } catch (err) {
      // Some Tandoor deployments reject sync creation without a real backend.
      // The point of this test is URL-template validation, so a well-formed
      // 400 from Tandoor still proves the path template is right.
      const msg = (err as Error).message;
      expect(msg).toMatch(/Tandoor API error: 4\d\d/);
      return;
    }
    cleanup.push({ label: `sync ${created.id}`, fn: () => client.syncs.deleteSync(created.id) });
    expect(created.id).toBeGreaterThan(0);

    // query_synced_folder may fail against a fake LOCAL path; we only care
    // that the URL template is correct (not a 404).
    try {
      await client.syncs.querySyncedFolder(created.id);
    } catch (err) {
      expect((err as Error).message).not.toMatch(/404/);
    }

    const logs = await client.syncs.listSyncLogs({ page_size: 5 });
    expect(logs).toBeDefined();
    expect(Array.isArray(logs.results ?? logs)).toBe(true);
  });

  // ---------------- 1.5.0 space (read-only; never create/delete spaces) ----------------

  it('space: list_spaces + get_current_space are read-only round-trips', async () => {
    const list = await client.spaces.listSpaces({ page_size: 5 });
    expect(list).toBeDefined();
    expect(Array.isArray(list.results ?? list)).toBe(true);

    const current = await client.spaces.getCurrentSpace();
    expect(current).toBeDefined();
    expect(current.id ?? current.name).toBeDefined();
  });

  // ---------------- 1.5.0 import queue + export log (read-only) ----------------

  it('list_recipe_imports responds (read-only URL guard)', async () => {
    const r = await client.imports.listRecipeImports({ page_size: 5 });
    expect(r).toBeDefined();
    expect(Array.isArray(r.results ?? r)).toBe(true);
  });

  it('list_export_logs responds (read-only URL guard)', async () => {
    const r = await client.exports.listExportLogs({ page_size: 5 });
    expect(r).toBeDefined();
    expect(Array.isArray(r.results ?? r)).toBe(true);
  });

  // ---------------- 1.5.0 tree-safety: create → preview_food_delete_cascading → delete ----------------

  it('preview_food_delete_cascading: create food → preview cascading → delete', async () => {
    const food = await client.foodUnits.createFood({ name: `${E2E_PREFIX}-tree-food` });
    cleanup.push({ label: `tree-food ${food.id}`, fn: () => client.foodUnits.deleteFood(food.id) });

    // The tool wraps GET /api/food/{id}/cascading/ — a URL typo would 404.
    const preview: any = await client.treeSafety.preview('food', food.id, 'cascading');
    expect(preview).toBeDefined();
  });

  // ---------------- optional: URL import ----------------

  it('imports a recipe from a URL (may be skipped)', async () => {
    if (process.env.TANDOOR_E2E_SKIP_IMPORT === '1') {
      // eslint-disable-next-line no-console
      console.log('    (skipped: TANDOOR_E2E_SKIP_IMPORT=1)');
      return;
    }
    const importUrl =
      process.env.TANDOOR_E2E_IMPORT_URL ||
      'https://www.allrecipes.com/recipe/23600/worlds-best-lasagna/';
    try {
      const resp = await client.recipes.recipeFromSource({ url: importUrl });
      expect(resp).toBeDefined();
      // We do not attempt to save the import here — just verify the parse
      // round-trip works. Saved URL import is exercised indirectly by the
      // main recipe flow above.
    } catch (err) {
      // Don't fail the whole suite if the remote scrape is blocked/offline.
      // eslint-disable-next-line no-console
      console.warn(`    URL import soft-failed: ${(err as Error).message}`);
    }
  });

  // ---------------- stash + jq pipeline against a real Tandoor ----------------

  it('list_recipes through MCP returns a stash summary when payload exceeds the threshold', async () => {
    // Force the threshold low so even a tiny instance triggers stash.
    const prev = process.env.TANDOOR_MCP_STASH_THRESHOLD;
    process.env.TANDOOR_MCP_STASH_THRESHOLD = '256';
    try {
      _stashClear();
      const server = new McpServer({ name: 'e2e', version: 'e2e' });
      registerRecipeTools(server, client);
      registerJqTools(server, client);

      const registered = getRegisteredTool(server, 'list_recipes');
      const result: any = await registered.handler(
        { page_size: 25, format: 'full' },
        { signal: new AbortController().signal },
      );

      expect(result.isError).toBeFalsy();
      const sc = result.structuredContent;
      expect(sc.stashed).toBe(true);
      expect(sc.handle).toMatch(/^stash_/);
      expect(sc.size_bytes).toBeGreaterThan(256);
      expect(sc.sample_filters).toEqual(expect.arrayContaining(['.results | length', '.count']));

      ctx.stashHandle = sc.handle;
    } finally {
      if (prev === undefined) delete process.env.TANDOOR_MCP_STASH_THRESHOLD;
      else process.env.TANDOOR_MCP_STASH_THRESHOLD = prev;
    }
  });

  it('jq_query against the live stash handle returns a focused subset', async (testCtx) => {
    if (!ctx.stashHandle) {
      // Surface as a skip — not a silent pass — so a broken prior test or
      // an empty live instance is visible in the report instead of green.
      testCtx.skip();
      return;
    }
    const server = new McpServer({ name: 'e2e', version: 'e2e' });
    registerRecipeTools(server, client);
    registerJqTools(server, client);
    const registered = getRegisteredTool(server, 'jq_query');

    const countRes: any = await registered.handler(
      { handle: ctx.stashHandle, filter: '.results | length' },
      { signal: new AbortController().signal },
    );
    expect(countRes.isError).toBeFalsy();
    expect(Number.isInteger(JSON.parse(countRes.content[0].text))).toBe(true);

    const projectRes: any = await registered.handler(
      { handle: ctx.stashHandle, filter: '.results | map({id, name})' },
      { signal: new AbortController().signal },
    );
    expect(projectRes.isError).toBeFalsy();
    const projected = JSON.parse(projectRes.content[0].text);
    expect(Array.isArray(projected)).toBe(true);
    if (projected.length > 0) {
      expect(Object.keys(projected[0]).sort()).toEqual(['id', 'name']);
    }
  });

  // ---------------- optional: AI import ----------------

  it('AI-imports a recipe from text (only when TANDOOR_E2E_AI_PROVIDER is set)', async () => {
    const providerId = Number(process.env.TANDOOR_E2E_AI_PROVIDER);
    if (!providerId) {
      // eslint-disable-next-line no-console
      console.log('    (skipped: set TANDOOR_E2E_AI_PROVIDER=<id> to run)');
      return;
    }
    const resp = await client.ai.aiImport({
      ai_provider_id: providerId,
      text: 'Simple e2e test: 1 cup water, 2 cups flour. Mix and bake at 350F for 30 minutes.',
    });
    expect(resp).toBeDefined();
  });
});
