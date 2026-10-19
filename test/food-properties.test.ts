import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TandoorClient } from '../src/clients/index.js';
import { handleUpdateFood } from '../src/handlers/foodunit.js';
import { startStub, Stub } from './helpers/stub-http.js';

interface Recorded { method: string; url: string; body: any }

const existingFood = {
  id: 5,
  name: 'oats',
  properties: [
    { id: 11, property_amount: 1.5, property_type: { id: 1, name: 'fat' } },
    { id: 12, property_amount: 2, property_type: { id: 2, name: 'protein' } },
    { id: 13, property_amount: 3, property_type: { id: 2, name: 'protein' } },
    { id: 14, property_amount: 4, property_type: { id: 3, name: 'sugar' } },
  ],
};

let stub: Stub;
let requests: Recorded[];
let client: TandoorClient;

beforeAll(async () => {
  stub = await startStub((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      requests.push({ method: req.method!, url: req.url!, body: raw ? JSON.parse(raw) : undefined });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(existingFood));
    });
  });
  client = new TandoorClient({ url: stub.url, token: 't' });
});

afterAll(() => stub.close());
beforeEach(() => { requests = []; });

const patchBody = () => requests.find((r) => r.method === 'PATCH')!.body;

describe('update_food properties', () => {
  it('replaces set types, drops removed types, keeps untouched rows by id', async () => {
    await handleUpdateFood(client, {
      id: 5,
      properties: [
        { property_type_id: 2, property_amount: 5 },
        { property_type_id: 4, property_amount: null },
      ],
      remove_property_type_ids: [3],
    });
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/food/5/', 'PATCH /api/food/5/']);
    expect(patchBody()).toEqual({
      properties: [
        { id: 11, property_amount: 1.5, property_type: 1 },
        { property_amount: 5, property_type: 2 },
        { property_amount: null, property_type: 4 },
      ],
    });
  });

  it('removes types with only remove_property_type_ids', async () => {
    await handleUpdateFood(client, { id: 5, remove_property_type_ids: [1, 2] });
    expect(patchBody()).toEqual({
      properties: [{ id: 14, property_amount: 4, property_type: 3 }],
    });
  });

  it('rejects a property_type_id repeated in properties before any request', async () => {
    await expect(handleUpdateFood(client, {
      id: 5,
      properties: [
        { property_type_id: 7, property_amount: 1 },
        { property_type_id: 7, property_amount: 2 },
      ],
    })).rejects.toThrow(/property_type_id 7/);
    expect(requests).toEqual([]);
  });

  it('rejects an id in both properties and remove_property_type_ids before any request', async () => {
    await expect(handleUpdateFood(client, {
      id: 5,
      properties: [{ property_type_id: 9, property_amount: 1 }],
      remove_property_type_ids: [9],
    })).rejects.toThrow(/property_type_id 9/);
    expect(requests).toEqual([]);
  });

  it('empty arrays leave properties untouched', async () => {
    await handleUpdateFood(client, { id: 5, name: 'rolled oats', properties: [], remove_property_type_ids: [] });
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['PATCH /api/food/5/']);
    expect(patchBody()).toEqual({ name: 'rolled oats' });
  });
});
