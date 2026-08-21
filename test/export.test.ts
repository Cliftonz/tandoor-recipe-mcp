import { describe, it, expect, vi } from 'vitest';
import {
  handleExportRecipes,
  handleListExportLogs,
  handleGetExportLog,
  handleCreateExportLog,
  handleUpdateExportLog,
  handleDeleteExportLog,
} from '../src/handlers/export.js';

describe('export handlers', () => {
  it('handleExportRecipes forwards recipe ids and type to the sub-client', async () => {
    const exportRecipes = vi.fn(async () => ({
      id: 42,
      type: 'json',
      msg: 'queued',
      running: true,
      total_recipes: 3,
      exported_recipes: 0,
      cache_duration: 3600,
      possibly_not_expired: true,
      created_by: 1,
      created_at: '2026-01-01T00:00:00Z',
    }));
    const client = { exports: { exportRecipes } } as any;
    const out = await handleExportRecipes(client, { recipes: [1, 2, 3], type: 'json' });
    expect(exportRecipes).toHaveBeenCalledWith({
      recipes: [{ id: 1 }, { id: 2 }, { id: 3 }],
      type: 'json',
      all: false,
    }, { signal: undefined });
    expect(out).toContain('Export started');
    const body = out.split('\n\n')[1];
    expect(JSON.parse(body)).toEqual({
      id: 42,
      type: 'json',
      status: undefined,
      running: true,
      created_at: '2026-01-01T00:00:00Z',
    });
  });

  it('handleExportRecipes throws when neither recipes[] nor all=true is provided', async () => {
    const exportRecipes = vi.fn();
    const client = { exports: { exportRecipes } } as any;
    await expect(handleExportRecipes(client, { type: 'json' })).rejects.toThrow(
      /Provide either recipes\[\] with at least one id, or all=true/,
    );
    await expect(handleExportRecipes(client, { type: 'json', recipes: [] })).rejects.toThrow(
      /Provide either recipes\[\] with at least one id, or all=true/,
    );
    expect(exportRecipes).not.toHaveBeenCalled();
  });

  it('handleExportRecipes with all=true omits recipes', async () => {
    const exportRecipes = vi.fn(async () => ({ id: 1, type: 'zip', running: true, created_at: 't' }));
    const client = { exports: { exportRecipes } } as any;
    await handleExportRecipes(client, { type: 'zip', all: true });
    expect(exportRecipes).toHaveBeenCalledWith({ recipes: [], type: 'zip', all: true }, { signal: undefined });
  });

  it('handleExportRecipes forwards custom_filter=null verbatim (clears the filter)', async () => {
    const exportRecipes = vi.fn(async () => ({ id: 1, type: 'json', running: true, created_at: 't' }));
    const client = { exports: { exportRecipes } } as any;
    await handleExportRecipes(client, { type: 'json', all: true, custom_filter: null });
    expect(exportRecipes).toHaveBeenCalledWith(
      { recipes: [], type: 'json', all: true, custom_filter: null },
      { signal: undefined },
    );
  });

  it('handleExportRecipes wraps a numeric custom_filter id as { id }', async () => {
    const exportRecipes = vi.fn(async () => ({ id: 1, type: 'json', running: true, created_at: 't' }));
    const client = { exports: { exportRecipes } } as any;
    await handleExportRecipes(client, { type: 'json', all: true, custom_filter: 42 });
    expect(exportRecipes).toHaveBeenCalledWith(
      { recipes: [], type: 'json', all: true, custom_filter: { id: 42 } },
      { signal: undefined },
    );
  });

  it('handleListExportLogs slims paginated results and forwards pagination', async () => {
    const listExportLogs = vi.fn(async () => ({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 5,
        type: 'json',
        msg: 'done',
        running: false,
        total_recipes: 2,
        exported_recipes: 2,
        cache_duration: 0,
        possibly_not_expired: false,
        created_by: 1,
        created_at: '2026-01-02T00:00:00Z',
      }],
    }));
    const client = { exports: { listExportLogs } } as any;
    const out = await handleListExportLogs(client, { page: 2, page_size: 10 });
    expect(listExportLogs).toHaveBeenCalledWith({ page: 2, page_size: 10 }, { signal: undefined });
    const parsed = JSON.parse(out);
    expect(parsed.results[0]).toEqual({
      id: 5,
      type: 'json',
      status: undefined,
      running: false,
      created_at: '2026-01-02T00:00:00Z',
    });
  });

  it('handleGetExportLog returns slim projection by default', async () => {
    const getExportLog = vi.fn(async () => ({
      id: 5,
      type: 'json',
      msg: 'done',
      running: false,
      total_recipes: 2,
      exported_recipes: 2,
      cache_duration: 0,
      created_by: 1,
      created_at: '2026-01-02T00:00:00Z',
    }));
    const client = { exports: { getExportLog } } as any;
    const out = await handleGetExportLog(client, { id: 5 });
    expect(getExportLog).toHaveBeenCalledWith(5, { signal: undefined });
    expect(JSON.parse(out)).toEqual({
      id: 5,
      type: 'json',
      status: undefined,
      running: false,
      created_at: '2026-01-02T00:00:00Z',
    });
  });

  it('handleGetExportLog format=full returns raw', async () => {
    const raw = { id: 5, type: 'json', msg: 'done', running: false, created_at: 't', created_by: 1 };
    const getExportLog = vi.fn(async () => raw);
    const client = { exports: { getExportLog } } as any;
    const out = await handleGetExportLog(client, { id: 5, format: 'full' });
    expect(JSON.parse(out)).toEqual(raw);
  });

  it('handleCreateExportLog posts body and returns slim projection', async () => {
    const createExportLog = vi.fn(async (b) => ({ ...b, id: 9, running: false, created_at: 't' }));
    const client = { exports: { createExportLog } } as any;
    const out = await handleCreateExportLog(client, { type: 'json' });
    expect(createExportLog).toHaveBeenCalledWith({ type: 'json' }, { signal: undefined });
    expect(out).toContain('Export log created');
    expect(out).toContain('"id":9');
  });

  it('handleUpdateExportLog PATCHes only provided fields', async () => {
    const patchExportLog = vi.fn(async (id, body) => ({ id, type: 'json', running: false, created_at: 't', ...body }));
    const client = { exports: { patchExportLog } } as any;
    await handleUpdateExportLog(client, { id: 5, msg: 'retry' });
    expect(patchExportLog).toHaveBeenCalledWith(5, { msg: 'retry' }, { signal: undefined });
  });

  it('handleUpdateExportLog rejects id-only updates', async () => {
    const patchExportLog = vi.fn();
    const client = { exports: { patchExportLog } } as any;
    await expect(handleUpdateExportLog(client, { id: 5 })).rejects.toThrow(/At least one field/);
    expect(patchExportLog).not.toHaveBeenCalled();
  });

  it('handleDeleteExportLog calls delete and confirms id', async () => {
    const deleteExportLog = vi.fn(async () => undefined);
    const client = { exports: { deleteExportLog } } as any;
    const out = await handleDeleteExportLog(client, { id: 7 });
    expect(deleteExportLog).toHaveBeenCalledWith(7, { signal: undefined });
    expect(out).toMatch(/7 deleted/);
  });
});
