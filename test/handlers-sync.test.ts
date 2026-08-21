import { describe, it, expect, vi } from 'vitest';
import {
  handleListSyncs,
  handleGetSync,
  handleCreateSync,
  handleUpdateSync,
  handleDeleteSync,
  handleQuerySyncedFolder,
  handleListSyncLogs,
  handleGetSyncLog,
} from '../src/handlers/sync.js';

const rawSync = {
  id: 3,
  storage: { id: 4, name: 'my-dropbox', method: 'DB', token: 'secret-xyz' },
  path: '/recipes',
  active: true,
  last_checked: '2026-08-19T12:00:00Z',
  created_by: 1,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-19T12:00:00Z',
};

const rawSyncLog = {
  id: 7,
  sync: { id: 3, storage: { id: 4, name: 'my-dropbox', token: 'secret-xyz' } },
  status: 'SUCCESS',
  msg: 'imported 12 files',
  created_at: '2026-08-19T12:00:05Z',
};

describe('sync handlers', () => {
  it('handleListSyncs returns paginated slim (id, storage id, path, active, last_checked)', async () => {
    const listSyncs = vi.fn(async () => ({
      count: 1, next: null, previous: null, results: [rawSync],
    }));
    const client = { syncs: { listSyncs } } as any;
    const out = await handleListSyncs(client, { page: 1, page_size: 25 });
    expect(listSyncs).toHaveBeenCalledWith({ page: 1, page_size: 25 }, { signal: undefined });
    const parsed = JSON.parse(out);
    expect(parsed.results[0]).toEqual({
      id: 3, storage: 4, path: '/recipes', active: true, last_checked: '2026-08-19T12:00:00Z',
    });
    expect(JSON.stringify(parsed)).not.toContain('secret-xyz');
  });

  it('handleListSyncs format=full returns raw payload verbatim', async () => {
    const page = { count: 1, next: null, previous: null, results: [rawSync] };
    const listSyncs = vi.fn(async () => page);
    const client = { syncs: { listSyncs } } as any;
    const out = await handleListSyncs(client, { format: 'full' });
    expect(listSyncs).toHaveBeenCalledWith({}, { signal: undefined });
    expect(JSON.parse(out)).toEqual(page);
  });

  it('handleGetSync slim projects storage down to id', async () => {
    const getSync = vi.fn(async () => rawSync);
    const client = { syncs: { getSync } } as any;
    const out = await handleGetSync(client, { id: 3 });
    expect(getSync).toHaveBeenCalledWith(3, { signal: undefined });
    expect(JSON.parse(out)).toEqual({
      id: 3, storage: 4, path: '/recipes', active: true, last_checked: '2026-08-19T12:00:00Z',
    });
  });

  it('handleCreateSync posts nested storage envelope + returns slim confirmation', async () => {
    const createSync = vi.fn(async (b) => ({ ...rawSync, ...b, id: 9 }));
    const client = { syncs: { createSync } } as any;
    const out = await handleCreateSync(client, { storage_id: 4, path: '/recipes', active: true });
    expect(createSync).toHaveBeenCalledWith({
      storage: { id: 4 },
      path: '/recipes',
      active: true,
    }, { signal: undefined });
    expect(out).toContain('Sync created');
    expect(out).toContain('"id":9');
  });

  it('handleUpdateSync PATCHes only provided fields', async () => {
    const patchSync = vi.fn(async (id, b) => ({ ...rawSync, id, ...b }));
    const client = { syncs: { patchSync } } as any;
    const out = await handleUpdateSync(client, { id: 3, active: false });
    expect(patchSync).toHaveBeenCalledWith(3, { active: false }, { signal: undefined });
    expect(out).toContain('Sync updated');
  });

  it('handleUpdateSync rejects id-only patches', async () => {
    const patchSync = vi.fn();
    const client = { syncs: { patchSync } } as any;
    await expect(handleUpdateSync(client, { id: 3 })).rejects.toThrow(/At least one field/);
    expect(patchSync).not.toHaveBeenCalled();
  });

  it('handleDeleteSync calls delete and confirms id', async () => {
    const deleteSync = vi.fn(async () => undefined);
    const client = { syncs: { deleteSync } } as any;
    const out = await handleDeleteSync(client, { id: 12 });
    expect(deleteSync).toHaveBeenCalledWith(12, { signal: undefined });
    expect(out).toMatch(/12 deleted/);
  });

  it('handleQuerySyncedFolder POSTs to /api/sync/{id}/query_synced_folder/', async () => {
    const querySyncedFolder = vi.fn(async () => rawSyncLog);
    const client = { syncs: { querySyncedFolder } } as any;
    const out = await handleQuerySyncedFolder(client, { id: 3 });
    expect(querySyncedFolder).toHaveBeenCalledWith(3, { signal: undefined });
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({ id: 7, sync: 3, status: 'SUCCESS', created_at: '2026-08-19T12:00:05Z' });
  });

  it('handleListSyncLogs returns paginated slim (id, sync id, status, created_at)', async () => {
    const listSyncLogs = vi.fn(async () => ({
      count: 1, next: null, previous: null, results: [rawSyncLog],
    }));
    const client = { syncs: { listSyncLogs } } as any;
    const out = await handleListSyncLogs(client, { page: 1, page_size: 25 });
    expect(listSyncLogs).toHaveBeenCalledWith({ page: 1, page_size: 25 }, { signal: undefined });
    const parsed = JSON.parse(out);
    expect(parsed.results[0]).toEqual({
      id: 7, sync: 3, status: 'SUCCESS', created_at: '2026-08-19T12:00:05Z',
    });
    expect(JSON.stringify(parsed)).not.toContain('secret-xyz');
  });

  it('handleGetSyncLog slim projects sync down to id and omits msg', async () => {
    const getSyncLog = vi.fn(async () => rawSyncLog);
    const client = { syncs: { getSyncLog } } as any;
    const out = await handleGetSyncLog(client, { id: 7 });
    expect(getSyncLog).toHaveBeenCalledWith(7, { signal: undefined });
    expect(JSON.parse(out)).toEqual({
      id: 7, sync: 3, status: 'SUCCESS', created_at: '2026-08-19T12:00:05Z',
    });
  });

  it('handleGetSyncLog format=full returns raw payload including msg', async () => {
    const getSyncLog = vi.fn(async () => rawSyncLog);
    const client = { syncs: { getSyncLog } } as any;
    const out = await handleGetSyncLog(client, { id: 7, format: 'full' });
    expect(JSON.parse(out)).toEqual(rawSyncLog);
  });
});
