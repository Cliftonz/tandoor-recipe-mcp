// Import-domain handlers: general import, import log (CRUD),
// import-open-data, recipe-import queue, bookmarklet-import, fdc-search,
// food-inherit-field. One test per registered handler; each test mocks only
// the specific client method under test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleImportRecipes,
  handleCreateImportLog,
  handleGetImportLog,
  handleUpdateImportLog,
  handleDeleteImportLog,
  handleListOpenDataImports,
  handleRunOpenDataImport,
  handleListRecipeImports,
  handleCreateRecipeImport,
  handleGetRecipeImport,
  handleUpdateRecipeImport,
  handleDeleteRecipeImport,
  handleImportAllPending,
  handleImportPendingRecipe,
  handleListBookmarkletImports,
  handleCreateBookmarkletImport,
  handleGetBookmarkletImport,
  handleUpdateBookmarkletImport,
  handleDeleteBookmarkletImport,
  handleFdcSearch,
  handleListFoodInheritFields,
  handleGetFoodInheritField,
} from '../src/handlers/import.js';
import { paginated } from './helpers/factories.js';

function mkClient(overrides: any): any {
  return { imports: overrides };
}

// ---------- General import ----------

describe('handleImportRecipes', () => {
  it('POSTs multipart body with ai_provider_id + text and returns confirmation', async () => {
    const importRecipes = vi.fn(async () => ({ recipe_id: 42, msg: 'ok', error: false }));
    const client = mkClient({ importRecipes });
    const out = await handleImportRecipes(client, { ai_provider_id: 1, text: 'raw recipe text' });
    expect(importRecipes).toHaveBeenCalledWith({ ai_provider_id: 1, text: 'raw recipe text' }, { signal: undefined });
    expect(out).toContain('Import submitted');
    expect(out).toContain('"recipe_id":42');
  });
});

// ---------- Import log ----------

describe('handleCreateImportLog', () => {
  it('creates a log entry with type + msg', async () => {
    const createImportLog = vi.fn(async (b: any) => ({ id: 7, ...b }));
    const client = mkClient({ createImportLog });
    const out = await handleCreateImportLog(client, { type: 'URL', msg: 'started' });
    expect(createImportLog).toHaveBeenCalledWith({ type: 'URL', msg: 'started' }, { signal: undefined });
    expect(out).toContain('Import log created');
    expect(out).toContain('"id":7');
  });
});

describe('handleGetImportLog', () => {
  it('fetches by id and slims the response', async () => {
    const getImportLog = vi.fn(async () => ({
      id: 3, type: 'URL', msg: 'done', running: false,
      total_recipes: 5, imported_recipes: 5, created_at: 't',
      keyword: { id: 9, name: 'batch-1', description: 'x' },
    }));
    const client = mkClient({ getImportLog });
    const out = await handleGetImportLog(client, { id: 3 });
    expect(getImportLog).toHaveBeenCalledWith(3, { signal: undefined });
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      id: 3, type: 'URL', msg: 'done', running: false,
      total_recipes: 5, imported_recipes: 5, created_at: 't',
      keyword_id: 9,
    });
  });
});

describe('handleUpdateImportLog', () => {
  it('PATCHes with only supplied fields', async () => {
    const patchImportLog = vi.fn(async (id: number, b: any) => ({ id, ...b }));
    const client = mkClient({ patchImportLog });
    const out = await handleUpdateImportLog(client, { id: 3, msg: 'updated', running: false });
    expect(patchImportLog).toHaveBeenCalledWith(3, { msg: 'updated', running: false }, { signal: undefined });
    expect(out).toContain('Import log updated');
  });

  it('throws when no fields supplied', async () => {
    const patchImportLog = vi.fn();
    const client = mkClient({ patchImportLog });
    await expect(handleUpdateImportLog(client, { id: 3 })).rejects.toThrow(/At least one field/);
    expect(patchImportLog).not.toHaveBeenCalled();
  });
});

describe('handleDeleteImportLog', () => {
  it('deletes and confirms', async () => {
    const deleteImportLog = vi.fn(async () => undefined);
    const client = mkClient({ deleteImportLog });
    const out = await handleDeleteImportLog(client, { id: 3 });
    expect(deleteImportLog).toHaveBeenCalledWith(3, { signal: undefined });
    expect(out).toContain('Import log 3 deleted');
  });
});

// ---------- Import open data ----------

describe('handleListOpenDataImports', () => {
  it('fetches metadata and returns slim available versions/datatypes', async () => {
    const listOpenDataImports = vi.fn(async () => ({
      versions: ['v1', 'v2'],
      datatypes: ['food', 'unit'],
      en: { food: 100, unit: 20 },
    }));
    const client = mkClient({ listOpenDataImports });
    const out = await handleListOpenDataImports(client, {});
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({ versions: ['v1', 'v2'], datatypes: ['food', 'unit'] });
  });
});

describe('handleRunOpenDataImport', () => {
  it('POSTs selected version + datatypes and returns counts', async () => {
    const runOpenDataImport = vi.fn(async () => ({
      food: { total_created: 5, total_updated: 2, total_untouched: 0, total_errored: 0 },
    }));
    const client = mkClient({ runOpenDataImport });
    const out = await handleRunOpenDataImport(client, {
      selected_version: 'v1',
      selected_datatypes: ['food'],
      update_existing: true,
      use_metric: true,
    });
    expect(runOpenDataImport).toHaveBeenCalledWith({
      selected_version: 'v1',
      selected_datatypes: ['food'],
      update_existing: true,
      use_metric: true,
    }, { signal: undefined });
    expect(out).toContain('Open data import complete');
    expect(out).toContain('"total_created":5');
  });
});

// ---------- Recipe-import queue ----------

describe('handleListRecipeImports', () => {
  it('lists queued imports with pagination', async () => {
    const listRecipeImports = vi.fn(async () => paginated([
      { id: 1, name: 'a.pdf', file_uid: 'u1', file_path: '/p/a', created_at: 't', storage: 1, space: 1 },
    ]));
    const client = mkClient({ listRecipeImports });
    const out = await handleListRecipeImports(client, { page: 1 });
    expect(listRecipeImports).toHaveBeenCalledWith({ page: 1 }, { signal: undefined });
    const parsed = JSON.parse(out);
    expect(parsed.results).toEqual([
      { id: 1, name: 'a.pdf', file_uid: 'u1', file_path: '/p/a', created_at: 't', storage: 1, space: 1 },
    ]);
  });
});

describe('handleCreateRecipeImport', () => {
  it('creates a queue entry', async () => {
    const createRecipeImport = vi.fn(async (b: any) => ({ id: 5, created_at: 't', ...b }));
    const client = mkClient({ createRecipeImport });
    const out = await handleCreateRecipeImport(client, {
      name: 'b.pdf', file_uid: 'uu', file_path: '/p/b', storage: 2, space: 1,
    });
    expect(createRecipeImport).toHaveBeenCalledWith({
      name: 'b.pdf', file_uid: 'uu', file_path: '/p/b', storage: 2, space: 1,
    }, { signal: undefined });
    expect(out).toContain('Recipe import queued');
  });
});

describe('handleGetRecipeImport', () => {
  it('fetches by id', async () => {
    const getRecipeImport = vi.fn(async () => ({ id: 8, name: 'c', file_uid: 'u', file_path: '/p/c', created_at: 't', storage: 1, space: 1 }));
    const client = mkClient({ getRecipeImport });
    const out = await handleGetRecipeImport(client, { id: 8 });
    expect(getRecipeImport).toHaveBeenCalledWith(8, { signal: undefined });
    expect(JSON.parse(out)).toMatchObject({ id: 8, name: 'c' });
  });
});

describe('handleUpdateRecipeImport', () => {
  it('PATCHes queue entry with supplied fields', async () => {
    const patchRecipeImport = vi.fn(async (id: number, b: any) => ({ id, ...b, created_at: 't' }));
    const client = mkClient({ patchRecipeImport });
    const out = await handleUpdateRecipeImport(client, { id: 8, name: 'renamed' });
    expect(patchRecipeImport).toHaveBeenCalledWith(8, { name: 'renamed' }, { signal: undefined });
    expect(out).toContain('Recipe import updated');
  });

  it('throws when no fields', async () => {
    const patchRecipeImport = vi.fn();
    const client = mkClient({ patchRecipeImport });
    await expect(handleUpdateRecipeImport(client, { id: 8 })).rejects.toThrow(/At least one field/);
    expect(patchRecipeImport).not.toHaveBeenCalled();
  });
});

describe('handleDeleteRecipeImport', () => {
  it('deletes and confirms', async () => {
    const deleteRecipeImport = vi.fn(async () => undefined);
    const client = mkClient({ deleteRecipeImport });
    const out = await handleDeleteRecipeImport(client, { id: 8 });
    expect(deleteRecipeImport).toHaveBeenCalledWith(8, { signal: undefined });
    expect(out).toContain('Recipe import 8 deleted');
  });
});

describe('handleImportAllPending', () => {
  it('POSTs to /import_all/ and returns confirmation', async () => {
    const importAllPending = vi.fn(async () => ({ id: 0, name: 'batch', created_at: 't', storage: 0, space: 0 }));
    const client = mkClient({ importAllPending });
    const out = await handleImportAllPending(client, {});
    expect(importAllPending).toHaveBeenCalled();
    expect(out).toContain('Bulk import of pending recipes triggered');
  });
});

describe('handleImportPendingRecipe', () => {
  it('POSTs to /{id}/import_recipe/ and returns the newly-created recipe', async () => {
    const importPendingRecipe = vi.fn(async () => ({ id: 999, name: 'Imported' }));
    const client = mkClient({ importPendingRecipe });
    const out = await handleImportPendingRecipe(client, { id: 8 });
    expect(importPendingRecipe).toHaveBeenCalledWith(8, { signal: undefined });
    expect(out).toContain('Pending recipe 8 imported');
    expect(out).toContain('"id":999');
  });
});

// ---------- Bookmarklet import ----------

describe('bookmarklet import handlers', () => {
  beforeEach(() => { process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK = '1'; });
  afterEach(() => { delete process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK; });

  it('handleListBookmarkletImports lists with pagination and slims', async () => {
    const listBookmarkletImports = vi.fn(async () => paginated([
      { id: 1, url: 'https://x.example', created_by: 5, created_at: 't' },
    ]));
    const client = mkClient({ listBookmarkletImports });
    const out = await handleListBookmarkletImports(client, { page: 1 });
    expect(listBookmarkletImports).toHaveBeenCalledWith({ page: 1 }, { signal: undefined });
    const parsed = JSON.parse(out);
    expect(parsed.results).toEqual([{ id: 1, url: 'https://x.example', created_by: 5, created_at: 't' }]);
  });

  it('handleCreateBookmarkletImport creates with url + html', async () => {
    const createBookmarkletImport = vi.fn(async (b: any) => ({ id: 2, created_by: 5, created_at: 't', ...b }));
    const client = mkClient({ createBookmarkletImport });
    const out = await handleCreateBookmarkletImport(client, { url: 'https://x.example', html: '<html/>' });
    expect(createBookmarkletImport).toHaveBeenCalledWith({ url: 'https://x.example', html: '<html/>' }, { signal: undefined });
    expect(out).toContain('Bookmarklet import created');
  });

  it('handleGetBookmarkletImport fetches by id', async () => {
    const getBookmarkletImport = vi.fn(async () => ({ id: 2, url: 'https://x.example', html: '<html/>', created_by: 5, created_at: 't' }));
    const client = mkClient({ getBookmarkletImport });
    const out = await handleGetBookmarkletImport(client, { id: 2 });
    expect(getBookmarkletImport).toHaveBeenCalledWith(2, { signal: undefined });
    expect(JSON.parse(out)).toMatchObject({ id: 2, url: 'https://x.example' });
  });

  it('handleUpdateBookmarkletImport PATCHes with supplied fields', async () => {
    const patchBookmarkletImport = vi.fn(async (id: number, b: any) => ({ id, created_by: 5, created_at: 't', ...b }));
    const client = mkClient({ patchBookmarkletImport });
    const out = await handleUpdateBookmarkletImport(client, { id: 2, url: 'https://y.example' });
    expect(patchBookmarkletImport).toHaveBeenCalledWith(2, { url: 'https://y.example' }, { signal: undefined });
    expect(out).toContain('Bookmarklet import updated');
  });

  it('handleUpdateBookmarkletImport throws when no fields', async () => {
    const patchBookmarkletImport = vi.fn();
    const client = mkClient({ patchBookmarkletImport });
    await expect(handleUpdateBookmarkletImport(client, { id: 2 })).rejects.toThrow(/At least one field/);
    expect(patchBookmarkletImport).not.toHaveBeenCalled();
  });

  it('handleDeleteBookmarkletImport deletes and confirms', async () => {
    const deleteBookmarkletImport = vi.fn(async () => undefined);
    const client = mkClient({ deleteBookmarkletImport });
    const out = await handleDeleteBookmarkletImport(client, { id: 2 });
    expect(deleteBookmarkletImport).toHaveBeenCalledWith(2, { signal: undefined });
    expect(out).toContain('Bookmarklet import 2 deleted');
  });
});

describe('bookmarklet import SSRF guard', () => {
  beforeEach(() => { delete process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK; });

  it('handleCreateBookmarkletImport rejects IMDS URL before hitting the client', async () => {
    const createBookmarkletImport = vi.fn();
    const client = mkClient({ createBookmarkletImport });
    await expect(handleCreateBookmarkletImport(client, {
      url: 'http://169.254.169.254/latest/meta-data/', html: '<html/>',
    })).rejects.toThrow(/SSRF guard blocked/);
    expect(createBookmarkletImport).not.toHaveBeenCalled();
  });

  it('handleUpdateBookmarkletImport rejects loopback URL before hitting the client', async () => {
    const patchBookmarkletImport = vi.fn();
    const client = mkClient({ patchBookmarkletImport });
    await expect(handleUpdateBookmarkletImport(client, {
      id: 2, url: 'http://127.0.0.1:9200/',
    })).rejects.toThrow(/SSRF guard blocked/);
    expect(patchBookmarkletImport).not.toHaveBeenCalled();
  });
});

// ---------- FDC search ----------

describe('handleFdcSearch', () => {
  it('passes query and dataType, slims foods to fdcId + description + dataType', async () => {
    const fdcSearch = vi.fn(async () => ({
      totalHits: 1,
      currentPage: 1,
      totalPages: 1,
      foods: [{ fdcId: 111, description: 'Cheddar', dataType: 'Foundation', extra: 'drop me' }],
    }));
    const client = mkClient({ fdcSearch });
    const out = await handleFdcSearch(client, { query: 'cheddar', dataType: ['Foundation'] });
    expect(fdcSearch).toHaveBeenCalledWith({ query: 'cheddar', dataType: ['Foundation'] }, { signal: undefined });
    const parsed = JSON.parse(out);
    expect(parsed.foods).toEqual([{ fdcId: 111, description: 'Cheddar', dataType: 'Foundation' }]);
    expect(parsed.totalHits).toBe(1);
  });
});

// ---------- Food-inherit-field ----------

describe('handleListFoodInheritFields', () => {
  it('lists inheritable fields (bare array response)', async () => {
    const listFoodInheritFields = vi.fn(async () => [
      { id: 1, name: 'diet', field: 'diet' },
      { id: 2, name: 'supermarket_category', field: 'supermarket_category' },
    ]);
    const client = mkClient({ listFoodInheritFields });
    const out = await handleListFoodInheritFields(client, {});
    expect(listFoodInheritFields).toHaveBeenCalled();
    const parsed = JSON.parse(out);
    expect(parsed).toEqual([
      { id: 1, name: 'diet', field: 'diet' },
      { id: 2, name: 'supermarket_category', field: 'supermarket_category' },
    ]);
  });
});

describe('handleGetFoodInheritField', () => {
  it('fetches by id', async () => {
    const getFoodInheritField = vi.fn(async () => ({ id: 1, name: 'diet', field: 'diet' }));
    const client = mkClient({ getFoodInheritField });
    const out = await handleGetFoodInheritField(client, { id: 1 });
    expect(getFoodInheritField).toHaveBeenCalledWith(1, { signal: undefined });
    expect(JSON.parse(out)).toMatchObject({ id: 1, name: 'diet' });
  });
});
