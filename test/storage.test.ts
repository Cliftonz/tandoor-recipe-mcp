import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleListStorages,
  handleGetStorage,
  handleCreateStorage,
  handleUpdateStorage,
  handleDeleteStorage,
} from '../src/handlers/storage.js';

const raw = {
  id: 4,
  name: 'my-dropbox',
  method: 'DB',
  username: 'zac',
  password: 'p@ss',
  token: 'secret-token-xyz',
  url: 'https://api.dropbox.example',
  path: '/tandoor',
  created_by: 1,
};

describe('storage handlers', () => {
  beforeEach(() => { process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK = '1'; });
  afterEach(() => { delete process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK; });
  it('handleListStorages returns paginated slim (id, name, method, url, path) with token + password stripped', async () => {
    const listStorages = vi.fn(async () => ({
      count: 1,
      next: null,
      previous: null,
      results: [raw],
    }));
    const client = { storages: { listStorages } } as any;
    const out = await handleListStorages(client, { page: 1, page_size: 25 });
    expect(listStorages).toHaveBeenCalledWith({ page: 1, page_size: 25 }, { signal: undefined });
    const parsed = JSON.parse(out);
    expect(parsed.count).toBe(1);
    expect(parsed.results[0]).toEqual({
      id: 4,
      name: 'my-dropbox',
      method: 'DB',
      url: 'https://api.dropbox.example',
      path: '/tandoor',
    });
    expect(parsed.results[0]).not.toHaveProperty('token');
    expect(parsed.results[0]).not.toHaveProperty('password');
    expect(parsed.results[0]).not.toHaveProperty('username');
    expect(parsed.results[0]).not.toHaveProperty('created_by');
  });

  it('handleListStorages format=full returns raw payload including token + password', async () => {
    const page = { count: 1, next: null, previous: null, results: [raw] };
    const listStorages = vi.fn(async () => page);
    const client = { storages: { listStorages } } as any;
    const out = await handleListStorages(client, { format: 'full' });
    expect(listStorages).toHaveBeenCalledWith({}, { signal: undefined });
    expect(JSON.parse(out)).toEqual(page);
  });

  it('handleGetStorage slim omits credentials', async () => {
    const getStorage = vi.fn(async () => raw);
    const client = { storages: { getStorage } } as any;
    const out = await handleGetStorage(client, { id: 4 });
    expect(getStorage).toHaveBeenCalledWith(4, { signal: undefined });
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      id: 4,
      name: 'my-dropbox',
      method: 'DB',
      url: 'https://api.dropbox.example',
      path: '/tandoor',
    });
    expect(parsed).not.toHaveProperty('token');
    expect(parsed).not.toHaveProperty('password');
  });

  it('handleGetStorage format=full returns credentials verbatim', async () => {
    const getStorage = vi.fn(async () => raw);
    const client = { storages: { getStorage } } as any;
    const out = await handleGetStorage(client, { id: 4, format: 'full' });
    const parsed = JSON.parse(out);
    expect(parsed.token).toBe('secret-token-xyz');
    expect(parsed.password).toBe('p@ss');
  });

  it('handleCreateStorage posts required + optional fields, returns slim confirmation without token', async () => {
    const createStorage = vi.fn(async (b) => ({ ...raw, ...b }));
    const client = { storages: { createStorage } } as any;
    const out = await handleCreateStorage(client, {
      name: 'my-dropbox',
      method: 'DB',
      token: 'secret-token-xyz',
      path: '/tandoor',
      url: 'https://api.dropbox.example',
      username: 'zac',
      password: 'p@ss',
    });
    expect(createStorage).toHaveBeenCalledWith({
      name: 'my-dropbox',
      method: 'DB',
      token: 'secret-token-xyz',
      path: '/tandoor',
      url: 'https://api.dropbox.example',
      username: 'zac',
      password: 'p@ss',
    }, { signal: undefined });
    expect(out).toContain('Storage created');
    expect(out).toContain('"name":"my-dropbox"');
    expect(out).not.toContain('secret-token-xyz');
    expect(out).not.toContain('p@ss');
  });

  it('handleCreateStorage format=full returns credentials in confirmation', async () => {
    const createStorage = vi.fn(async (b) => ({ ...raw, ...b }));
    const client = { storages: { createStorage } } as any;
    const out = await handleCreateStorage(client, {
      name: 'x',
      method: 'LOCAL',
      path: '/x',
      token: 'secret-token-xyz',
      format: 'full',
    });
    expect(out).toContain('secret-token-xyz');
  });

  it('handleUpdateStorage PATCHes only provided fields and slims response', async () => {
    const patchStorage = vi.fn(async (id, b) => ({ ...raw, id, ...b }));
    const client = { storages: { patchStorage } } as any;
    const out = await handleUpdateStorage(client, { id: 4, path: '/new' });
    expect(patchStorage).toHaveBeenCalledWith(4, { path: '/new' }, { signal: undefined });
    expect(out).toContain('Storage updated');
    expect(out).not.toContain('secret-token-xyz');
  });

  it('handleUpdateStorage rejects id-only updates', async () => {
    const patchStorage = vi.fn();
    const client = { storages: { patchStorage } } as any;
    await expect(handleUpdateStorage(client, { id: 4 })).rejects.toThrow(/At least one field/);
    expect(patchStorage).not.toHaveBeenCalled();
  });

  it('handleDeleteStorage calls delete and confirms id', async () => {
    const deleteStorage = vi.fn(async () => undefined);
    const client = { storages: { deleteStorage } } as any;
    const out = await handleDeleteStorage(client, { id: 12 });
    expect(deleteStorage).toHaveBeenCalledWith(12, { signal: undefined });
    expect(out).toMatch(/12 deleted/);
  });
});

describe('storage SSRF guard', () => {
  beforeEach(() => { delete process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK; });

  it('handleCreateStorage rejects IMDS URL before hitting the client', async () => {
    const createStorage = vi.fn();
    const client = { storages: { createStorage } } as any;
    await expect(handleCreateStorage(client, {
      name: 'x', method: 'NEXTCLOUD', path: '/', url: 'http://169.254.169.254/latest/meta-data/',
    })).rejects.toThrow(/SSRF guard blocked/);
    expect(createStorage).not.toHaveBeenCalled();
  });

  it('handleUpdateStorage rejects loopback URL before hitting the client', async () => {
    const patchStorage = vi.fn();
    const client = { storages: { patchStorage } } as any;
    await expect(handleUpdateStorage(client, {
      id: 1, url: 'http://127.0.0.1:9200/',
    })).rejects.toThrow(/SSRF guard blocked/);
    expect(patchStorage).not.toHaveBeenCalled();
  });
});
