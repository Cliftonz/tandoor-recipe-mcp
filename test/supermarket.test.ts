import { describe, it, expect, vi } from 'vitest';
import {
  handleListSupermarkets,
  handleGetSupermarket,
  handleCreateSupermarket,
  handleUpdateSupermarket,
  handleDeleteSupermarket,
} from '../src/handlers/supermarket.js';
import { paginated } from './helpers/factories.js';

function mkClient(over: any = {}) {
  return {
    supermarkets: {
      listSupermarkets: vi.fn(),
      getSupermarket: vi.fn(),
      createSupermarket: vi.fn(),
      patchSupermarket: vi.fn(),
      deleteSupermarket: vi.fn(),
      ...over,
    },
  } as any;
}

describe('supermarket handlers', () => {
  it('list_supermarkets slims paginated results to id/name/description', async () => {
    const page = paginated([
      { id: 1, name: 'Aldi', description: 'discount', order: 0, category_to_supermarket: [{ id: 9 }], open_data_slug: 'aldi' },
      { id: 2, name: 'Kroger', description: null, order: 1, category_to_supermarket: [], open_data_slug: null },
    ]);
    const client = mkClient({ listSupermarkets: vi.fn(async () => page) });
    const out = await handleListSupermarkets(client, { page: 1, page_size: 25 });
    expect(client.supermarkets.listSupermarkets).toHaveBeenCalledWith({ page: 1, page_size: 25 }, { signal: undefined });
    const parsed = JSON.parse(out);
    expect(parsed.count).toBe(2);
    expect(parsed.results).toEqual([
      { id: 1, name: 'Aldi', description: 'discount' },
      { id: 2, name: 'Kroger', description: null },
    ]);
  });

  it('list_supermarkets returns full body when format=full', async () => {
    const page = paginated([{ id: 1, name: 'Aldi', description: null, category_to_supermarket: [{ id: 9 }] }]);
    const client = mkClient({ listSupermarkets: vi.fn(async () => page) });
    const out = await handleListSupermarkets(client, { format: 'full' });
    expect(client.supermarkets.listSupermarkets).toHaveBeenCalledWith({}, { signal: undefined });
    expect(JSON.parse(out).results[0]).toHaveProperty('category_to_supermarket');
  });

  it('get_supermarket slims a single record', async () => {
    const client = mkClient({
      getSupermarket: vi.fn(async () => ({
        id: 7, name: 'Trader Joe', description: 'friendly', order: 3, category_to_supermarket: [{ id: 1 }],
      })),
    });
    const out = await handleGetSupermarket(client, { id: 7 });
    expect(client.supermarkets.getSupermarket).toHaveBeenCalledWith(7, { signal: undefined });
    expect(JSON.parse(out)).toEqual({ id: 7, name: 'Trader Joe', description: 'friendly' });
  });

  it('create_supermarket POSTs body and returns confirmation with slim body', async () => {
    const client = mkClient({
      createSupermarket: vi.fn(async (body) => ({ id: 12, order: 0, category_to_supermarket: [], ...body })),
    });
    const out = await handleCreateSupermarket(client, { name: 'Wegmans', description: 'east coast' });
    expect(client.supermarkets.createSupermarket).toHaveBeenCalledWith({
      name: 'Wegmans',
      description: 'east coast',
      category_to_supermarket: [],
    }, { signal: undefined });
    expect(out).toContain('Supermarket created');
    expect(out).toContain('"id":12');
    expect(out).toContain('"name":"Wegmans"');
  });

  it('update_supermarket PATCHes only supplied fields', async () => {
    const client = mkClient({
      patchSupermarket: vi.fn(async (_id, body) => ({ id: 5, name: 'Renamed', description: null, order: 0, category_to_supermarket: [], ...body })),
    });
    const out = await handleUpdateSupermarket(client, { id: 5, name: 'Renamed' });
    expect(client.supermarkets.patchSupermarket).toHaveBeenCalledWith(5, { name: 'Renamed' }, { signal: undefined });
    expect(out).toContain('Supermarket updated');
    expect(out).toContain('"name":"Renamed"');
  });

  it('update_supermarket throws when no fields supplied', async () => {
    const client = mkClient();
    await expect(handleUpdateSupermarket(client, { id: 5 })).rejects.toThrow('At least one field required');
    expect(client.supermarkets.patchSupermarket).not.toHaveBeenCalled();
  });

  it('delete_supermarket calls DELETE and returns confirmation', async () => {
    const client = mkClient({ deleteSupermarket: vi.fn(async () => undefined) });
    const out = await handleDeleteSupermarket(client, { id: 88 });
    expect(client.supermarkets.deleteSupermarket).toHaveBeenCalledWith(88, { signal: undefined });
    expect(out).toBe('Supermarket 88 deleted.');
  });
});
