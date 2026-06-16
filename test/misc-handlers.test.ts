// Handler coverage for src/handlers/misc.ts (39 tools across 7 resource types).

import { describe, it, expect, vi } from 'vitest';
import {
  handleListKeywords,
  handleCreateKeyword,
  handleUpdateKeyword,
  handleMergeKeyword,
  handleMoveKeyword,
  handleListSupermarketCategories,
  handleMergeSupermarketCategory,
  handleListPropertyTypes,
  handleCreatePropertyType,
  handleUpdatePropertyType,
  handleListProperties,
  handleCreateProperty,
  handleUpdateProperty,
  handleListCustomFilters,
  handleCreateCustomFilter,
  handleUpdateCustomFilter,
  handleListSupermarketCategoryRelations,
  handleCreateSupermarketCategoryRelation,
  handleUpdateSupermarketCategoryRelation,
  handleListUnitConversions,
  handleCreateUnitConversion,
  handleUpdateUnitConversion,
} from '../src/handlers/misc.js';

import { paginated } from './helpers/factories.js';

function mock<T extends object>(impl: T): any { return impl; }

describe('handlers/misc.ts', () => {
  describe('slim projections drop extra fields', () => {
    it('keyword', async () => {
      const client = mock({
        keywords: { listKeywords: async () => paginated([
          { id: 1, name: 'weeknight', label: 'W', description: 'd', parent: null, numchild: 0, full_name: 'weeknight', extra: 'gone', secret: 'gone' },
        ]) },
      });
      const r = JSON.parse(await handleListKeywords(client, {} as any));
      expect(r.results[0]).not.toHaveProperty('extra');
      expect(r.results[0]).not.toHaveProperty('secret');
    });

    it('supermarket category', async () => {
      const client = mock({
        supermarketCategories: { listCategories: async () => paginated([
          { id: 1, name: 'Produce', description: 'd', extra: 'gone' },
        ]) },
      });
      const r = JSON.parse(await handleListSupermarketCategories(client, {} as any));
      expect(r.results[0]).not.toHaveProperty('extra');
    });

    it('property type', async () => {
      const client = mock({
        propertyTypes: { listPropertyTypes: async () => paginated([
          { id: 1, name: 'Protein', unit: 'g', description: 'd', order: 0, open_data_slug: 'protein', fdc_id: 1003, extra: 'gone' },
        ]) },
      });
      const r = JSON.parse(await handleListPropertyTypes(client, {} as any));
      expect(r.results[0]).toMatchObject({ name: 'Protein', unit: 'g' });
      expect(r.results[0]).not.toHaveProperty('extra');
    });

    it('property flattens property_type.{id,name,unit} into property_type_*', async () => {
      const client = mock({
        properties: { listProperties: async () => paginated([
          { id: 1, property_amount: 12.5, property_type: { id: 9, name: 'Protein', unit: 'g' } },
        ]) },
      });
      const r = JSON.parse(await handleListProperties(client, {} as any));
      expect(r.results[0]).toEqual({
        id: 1, property_amount: 12.5,
        property_type_id: 9, property_type_name: 'Protein', property_type_unit: 'g',
      });
    });

    it('custom filter shared → shared_user_ids', async () => {
      const client = mock({
        customFilters: { listFilters: async () => paginated([
          { id: 1, name: 'q', search: 'dsl', shared: [{ id: 2 }, { id: 3 }], extra: 'gone' },
        ]) },
      });
      const r = JSON.parse(await handleListCustomFilters(client, {} as any));
      expect(r.results[0].shared_user_ids).toEqual([2, 3]);
      expect(r.results[0]).not.toHaveProperty('shared');
    });

    it('custom filter missing shared → empty array', async () => {
      const client = mock({
        customFilters: { listFilters: async () => paginated([
          { id: 1, name: 'q', search: 'dsl' },
        ]) },
      });
      const r = JSON.parse(await handleListCustomFilters(client, {} as any));
      expect(r.results[0].shared_user_ids).toEqual([]);
    });

    it('supermarket category relation flattens category.{id,name}', async () => {
      const client = mock({
        supermarketCategoryRelations: { listRelations: async () => paginated([
          { id: 1, order: 0, supermarket: 7, category: { id: 3, name: 'Produce' } },
        ]) },
      });
      const r = JSON.parse(await handleListSupermarketCategoryRelations(client, {} as any));
      expect(r.results[0]).toEqual({ id: 1, order: 0, supermarket: 7, category_id: 3, category_name: 'Produce' });
    });

    it('unit conversion flattens base_unit/converted_unit/food', async () => {
      const client = mock({
        unitConversions: { listConversions: async () => paginated([
          {
            id: 1, name: '1 cup = 240 ml',
            base_amount: 1, base_unit: { id: 1, name: 'cup' },
            converted_amount: 240, converted_unit: { id: 2, name: 'ml' },
            food: { id: 5, name: 'flour' },
          },
        ]) },
      });
      const r = JSON.parse(await handleListUnitConversions(client, {} as any));
      expect(r.results[0]).toEqual({
        id: 1, name: '1 cup = 240 ml',
        base_amount: 1, base_unit: 'cup', base_unit_id: 1,
        converted_amount: 240, converted_unit: 'ml', converted_unit_id: 2,
        food: 'flour', food_id: 5,
      });
    });
  });

  describe('empty PATCH bodies throw', () => {
    const cases: [string, (c: any) => Promise<unknown>][] = [
      ['keyword', (c) => handleUpdateKeyword(c, { id: 1 } as any)],
      ['property_type', (c) => handleUpdatePropertyType(c, { id: 1 } as any)],
      ['property', (c) => handleUpdateProperty(c, { id: 1 } as any)],
      ['custom_filter', (c) => handleUpdateCustomFilter(c, { id: 1 } as any)],
      ['relation', (c) => handleUpdateSupermarketCategoryRelation(c, { id: 1 } as any)],
      ['unit_conversion', (c) => handleUpdateUnitConversion(c, { id: 1 } as any)],
    ];
    for (const [label, fn] of cases) {
      it(`update_${label} throws when no fields supplied`, async () => {
        const client = mock({
          keywords: { patchKeyword: vi.fn() },
          propertyTypes: { patchPropertyType: vi.fn() },
          properties: { patchProperty: vi.fn() },
          customFilters: { patchFilter: vi.fn() },
          supermarketCategoryRelations: { patchRelation: vi.fn() },
          unitConversions: { patchConversion: vi.fn() },
        });
        await expect(fn(client)).rejects.toThrow(/At least one field/);
      });
    }
  });

  describe('body builders forward nested-id envelopes', () => {
    it('create_property wraps property_type_id into {property_type:{id}}', async () => {
      const create = vi.fn().mockResolvedValue({ id: 1, property_type: { id: 9 } });
      const client = mock({ properties: { createProperty: create } });
      await handleCreateProperty(client, { property_amount: 5, property_type_id: 9 } as any);
      expect(create).toHaveBeenCalledWith({ property_amount: 5, property_type: { id: 9 } });
    });

    it('create_unit_conversion wraps base/converted/food ids', async () => {
      const create = vi.fn().mockResolvedValue({ id: 1 });
      const client = mock({ unitConversions: { createConversion: create } });
      await handleCreateUnitConversion(client, {
        base_amount: 1, converted_amount: 240,
        base_unit_id: 1, converted_unit_id: 2, food_id: 5,
      } as any);
      expect(create).toHaveBeenCalledWith({
        base_amount: 1, converted_amount: 240,
        base_unit: { id: 1 }, converted_unit: { id: 2 },
        food: { id: 5 },
      });
    });

    it('update_unit_conversion food_id=null clears the food link', async () => {
      const patch = vi.fn().mockResolvedValue({ id: 1 });
      const client = mock({ unitConversions: { patchConversion: patch } });
      await handleUpdateUnitConversion(client, { id: 1, food_id: null as any } as any);
      expect(patch).toHaveBeenCalledWith(1, { food: null });
    });

    it('create_relation wraps category_id and forwards order when present', async () => {
      const create = vi.fn().mockResolvedValue({ id: 1 });
      const client = mock({ supermarketCategoryRelations: { createRelation: create } });
      await handleCreateSupermarketCategoryRelation(client, {
        category_id: 7, supermarket: 3, order: 2,
      } as any);
      expect(create).toHaveBeenCalledWith({
        category: { id: 7 }, supermarket: 3, order: 2,
      });
    });

    it('create_custom_filter omits shared when shared_user_ids not provided', async () => {
      const create = vi.fn().mockResolvedValue({ id: 1, shared: [] });
      const client = mock({ customFilters: { createFilter: create } });
      await handleCreateCustomFilter(client, { name: 'q', search: 's' } as any);
      expect(create).toHaveBeenCalledWith({ name: 'q', search: 's', shared: [] });
    });

    it('create_custom_filter maps shared_user_ids → shared:[{id}]', async () => {
      const create = vi.fn().mockResolvedValue({ id: 1, shared: [{ id: 2 }] });
      const client = mock({ customFilters: { createFilter: create } });
      await handleCreateCustomFilter(client, {
        name: 'q', search: 's', shared_user_ids: [2, 3],
      } as any);
      expect(create.mock.calls[0][0].shared).toEqual([{ id: 2 }, { id: 3 }]);
    });

    it('create_property_type only forwards defined optional fields', async () => {
      const create = vi.fn().mockResolvedValue({ id: 1 });
      const client = mock({ propertyTypes: { createPropertyType: create } });
      await handleCreatePropertyType(client, {
        name: 'Carbs', unit: 'g',
      } as any);
      expect(create).toHaveBeenCalledWith({ name: 'Carbs', unit: 'g' });
    });

    it('create_keyword omits description when not provided', async () => {
      const create = vi.fn().mockResolvedValue({ id: 1, name: 'k' });
      const client = mock({ keywords: { createKeyword: create } });
      await handleCreateKeyword(client, { name: 'k' } as any);
      expect(create).toHaveBeenCalledWith({ name: 'k' });
    });
  });

  describe('destructive op confirmation text', () => {
    it('merge_keyword surfaces source + target', async () => {
      const merge = vi.fn().mockResolvedValue({ id: 9, name: 'kept' });
      const client = mock({ keywords: { mergeKeyword: merge } });
      const res = await handleMergeKeyword(client, { id: 1, target: 9 } as any);
      expect(merge).toHaveBeenCalledWith(1, 9);
      expect(res).toMatch(/merged into 9/);
    });

    it('move_keyword surfaces destination parent', async () => {
      const move = vi.fn().mockResolvedValue({ id: 1, parent: 2, name: 'k' });
      const client = mock({ keywords: { moveKeyword: move } });
      const res = await handleMoveKeyword(client, { id: 1, parent: 2 } as any);
      expect(move).toHaveBeenCalledWith(1, 2);
      expect(res).toMatch(/moved under 2/);
    });

    it('merge_supermarket_category surfaces source + target', async () => {
      const merge = vi.fn().mockResolvedValue({ id: 9, name: 'Produce' });
      const client = mock({ supermarketCategories: { mergeCategory: merge } });
      const res = await handleMergeSupermarketCategory(client, { id: 1, target: 9 } as any);
      expect(merge).toHaveBeenCalledWith(1, 9);
      expect(res).toMatch(/merged into 9/);
    });
  });
});
