import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { z } from 'zod';
import { TandoorClient } from '../src/clients/index.js';
import { updateFoodShape } from '../src/tools/foodunit.js';
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
let failingDeletes: Record<string, number>;
let client: TandoorClient;

beforeAll(async () => {
  stub = await startStub((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      requests.push({ method: req.method!, url: req.url!, body: raw ? JSON.parse(raw) : undefined });
      res.setHeader('content-type', 'application/json');
      const failStatus = req.method === 'DELETE' ? failingDeletes[req.url!] : undefined;
      if (failStatus) {
        res.statusCode = failStatus;
        res.setHeader('retry-after', '0');
        res.end(JSON.stringify({ detail: `refused-${failStatus}` }));
        return;
      }
      res.end(JSON.stringify(existingFood));
    });
  });
  client = new TandoorClient({ url: stub.url, token: 't' });
});

afterAll(() => stub.close());
beforeEach(() => { requests = []; failingDeletes = {}; });

const patchBody = () => requests.find((r) => r.method === 'PATCH')!.body;

describe('update_food properties', () => {
  it('updates set types in place, adds new types, deletes removed and duplicate rows', async () => {
    await handleUpdateFood(client, {
      id: 5,
      properties: [
        { property_type_id: 2, property_amount: 5 },
        { property_type_id: 4, property_amount: null },
      ],
      remove_property_type_ids: [3],
    });
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /api/food/5/',
      'PATCH /api/food/5/',
      'DELETE /api/property/13/',
      'DELETE /api/property/14/',
    ]);
    expect(patchBody()).toEqual({
      properties: [
        { id: 11, property_amount: 1.5, property_type: 1 },
        { id: 12, property_amount: 5, property_type: 2 },
        { property_amount: null, property_type: 4 },
      ],
    });
  });

  it('removes types with only remove_property_type_ids', async () => {
    await handleUpdateFood(client, { id: 5, remove_property_type_ids: [1, 2] });
    expect(patchBody()).toEqual({
      properties: [{ id: 14, property_amount: 4, property_type: 3 }],
    });
    expect(requests.filter((r) => r.method === 'DELETE').map((r) => r.url)).toEqual([
      '/api/property/11/',
      '/api/property/12/',
      '/api/property/13/',
    ]);
  });

  it('treats a 404 on a row delete as already deleted and keeps deleting', async () => {
    failingDeletes['/api/property/12/'] = 404;
    const result = await handleUpdateFood(client, { id: 5, remove_property_type_ids: [2, 3] });
    expect(result).toMatch(/^Food updated\./);
    expect(requests.filter((r) => r.method === 'DELETE').map((r) => r.url)).toEqual([
      '/api/property/12/',
      '/api/property/13/',
      '/api/property/14/',
    ]);
  });

  it('tries every row delete and names each failed row with its Tandoor error', async () => {
    failingDeletes['/api/property/12/'] = 500;
    failingDeletes['/api/property/13/'] = 403;
    const error = await handleUpdateFood(client, { id: 5, remove_property_type_ids: [2, 3] }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/12\b[^\n]*500[\s\S]*refused-500/);
    expect(message).toMatch(/13\b[^\n]*403[\s\S]*refused-403/);
    expect(new Set(requests.filter((r) => r.method === 'DELETE').map((r) => r.url))).toEqual(
      new Set(['/api/property/12/', '/api/property/13/', '/api/property/14/']),
    );
  });

  it('rejects a property_type_id repeated in properties before any request', async () => {
    await expect(handleUpdateFood(client, {
      id: 5,
      properties: [
        { property_type_id: 7, property_amount: 1 },
        { property_type_id: 7, property_amount: 2 },
      ],
    })).rejects.toThrow('property_type_id 7 appears more than once in properties');
    expect(requests).toEqual([]);
  });

  it('rejects a property_type_id repeated in remove_property_type_ids before any request', async () => {
    await expect(handleUpdateFood(client, {
      id: 5,
      remove_property_type_ids: [3, 3],
    })).rejects.toThrow('property_type_id 3 appears more than once in remove_property_type_ids');
    expect(requests).toEqual([]);
  });

  it('rejects an id in both properties and remove_property_type_ids before any request', async () => {
    await expect(handleUpdateFood(client, {
      id: 5,
      properties: [{ property_type_id: 9, property_amount: 1 }],
      remove_property_type_ids: [9],
    })).rejects.toThrow('property_type_id 9 is in both properties and remove_property_type_ids');
    expect(requests).toEqual([]);
  });

  it('sends properties and other fields in one PATCH', async () => {
    await handleUpdateFood(client, { id: 5, name: 'rolled oats', remove_property_type_ids: [3] });
    expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);
    expect(patchBody()).toEqual({
      name: 'rolled oats',
      properties: [
        { id: 11, property_amount: 1.5, property_type: 1 },
        { id: 12, property_amount: 2, property_type: 2 },
        { id: 13, property_amount: 3, property_type: 2 },
      ],
    });
  });

  it('removing a type the food does not have deletes nothing and re-sends the current rows', async () => {
    const result = await handleUpdateFood(client, { id: 5, remove_property_type_ids: [99] });
    expect(result).toMatch(/^Food updated\./);
    expect(requests.filter((r) => r.method === 'DELETE')).toEqual([]);
    expect(patchBody()).toEqual({
      properties: [
        { id: 11, property_amount: 1.5, property_type: 1 },
        { id: 12, property_amount: 2, property_type: 2 },
        { id: 13, property_amount: 3, property_type: 2 },
        { id: 14, property_amount: 4, property_type: 3 },
      ],
    });
  });

  it('sends the properties reference amount and unit, the unit as a bare id', async () => {
    await handleUpdateFood(client, { id: 5, properties_food_amount: 50, properties_food_unit_id: 7 });
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['PATCH /api/food/5/']);
    expect(patchBody()).toEqual({ properties_food_amount: 50, properties_food_unit: 7 });
  });

  it('clears the properties reference unit with null', async () => {
    const args = z.object(updateFoodShape).parse({ id: 5, properties_food_unit_id: null });
    await handleUpdateFood(client, args);
    expect(patchBody()).toEqual({ properties_food_unit: null });
  });

  it('empty arrays leave properties untouched', async () => {
    await handleUpdateFood(client, { id: 5, name: 'rolled oats', properties: [], remove_property_type_ids: [] });
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual(['PATCH /api/food/5/']);
    expect(patchBody()).toEqual({ name: 'rolled oats' });
  });
});
