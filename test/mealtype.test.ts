import { describe, it, expect, vi } from 'vitest';
import {
  handleCreateMealType,
  handleGetMealType,
  handleUpdateMealType,
  handleDeleteMealType,
} from '../src/handlers/mealtype.js';

describe('meal type handlers', () => {
  it('handleCreateMealType posts name (plus optional fields) and returns slim payload with id', async () => {
    const createMealType = vi.fn(async (b) => ({
      id: 7,
      name: b.name,
      order: b.order ?? 0,
      color: b.color ?? null,
      default: b.default ?? false,
      created_by: 1,
    }));
    const client = { mealTypes: { createMealType } } as any;
    const out = await handleCreateMealType(client, {
      name: 'Brunch',
      order: 2,
      color: '#abcdef',
      default: true,
    });
    expect(createMealType.mock.calls[0][0]).toEqual({
      name: 'Brunch',
      order: 2,
      color: '#abcdef',
      default: true,
    });
    expect(out).toContain('Meal type created');
    expect(out).toContain('"id":7');
    expect(out).toContain('"name":"Brunch"');
  });

  it('handleGetMealType returns slim projection (id, name, order, color, default) and drops created_by', async () => {
    const getMealType = vi.fn(async () => ({
      id: 3,
      name: 'Dinner',
      order: 5,
      time: null,
      color: '#ff0000',
      default: false,
      created_by: 9,
    }));
    const client = { mealTypes: { getMealType } } as any;
    const out = await handleGetMealType(client, { id: 3 });
    expect(getMealType).toHaveBeenCalledWith(3, { signal: undefined });
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      id: 3,
      name: 'Dinner',
      order: 5,
      color: '#ff0000',
      default: false,
    });
    expect(parsed).not.toHaveProperty('created_by');
    expect(parsed).not.toHaveProperty('time');
  });

  it('handleGetMealType with format=full returns raw response verbatim', async () => {
    const raw = { id: 3, name: 'Dinner', order: 5, time: null, color: null, default: false, created_by: 9 };
    const getMealType = vi.fn(async () => raw);
    const client = { mealTypes: { getMealType } } as any;
    const out = await handleGetMealType(client, { id: 3, format: 'full' });
    expect(JSON.parse(out)).toEqual(raw);
  });

  it('handleUpdateMealType PATCHes only provided fields', async () => {
    const patchMealType = vi.fn(async (id, body) => ({
      id,
      name: 'Old',
      order: 0,
      color: null,
      default: false,
      ...body,
    }));
    const client = { mealTypes: { patchMealType } } as any;
    await handleUpdateMealType(client, { id: 4, color: '#000000', default: true });
    expect(patchMealType).toHaveBeenCalledWith(4, { color: '#000000', default: true }, { signal: undefined });
  });

  it('handleUpdateMealType rejects id-only updates', async () => {
    const patchMealType = vi.fn();
    const client = { mealTypes: { patchMealType } } as any;
    await expect(handleUpdateMealType(client, { id: 4 })).rejects.toThrow(/At least one field/);
    expect(patchMealType).not.toHaveBeenCalled();
  });

  it('handleDeleteMealType calls delete and confirms id', async () => {
    const deleteMealType = vi.fn(async () => undefined);
    const client = { mealTypes: { deleteMealType } } as any;
    const out = await handleDeleteMealType(client, { id: 12 });
    expect(deleteMealType).toHaveBeenCalledWith(12, { signal: undefined });
    expect(out).toMatch(/12 deleted/);
  });
});
