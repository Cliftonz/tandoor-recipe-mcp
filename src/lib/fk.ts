// Foreign-key envelope helpers.
//
// Tandoor's writable nested serializers (Food, Unit, PropertyType,
// SupermarketCategory, Storage, CustomFilter) validate `name` as required even when `id` identifies an existing row, so a bare
// `{ id }` envelope is rejected with 400 "name: This field is required."
// These helpers fetch the referenced object and return `{ id, name }`.

import { TandoorClient } from '../clients/index.js';

export async function foodRef(client: TandoorClient, id: number): Promise<{ id: number; name: string }> {
  const f = await client.foodUnits.getFood(id);
  return { id: f.id, name: f.name };
}

export async function unitRef(client: TandoorClient, id: number): Promise<{ id: number; name: string }> {
  const u = await client.foodUnits.getUnit(id);
  return { id: u.id, name: u.name };
}

export async function propertyTypeRef(client: TandoorClient, id: number): Promise<{ id: number; name: string }> {
  const t = await client.propertyTypes.getPropertyType(id);
  return { id: t.id, name: t.name };
}

export async function supermarketCategoryRef(client: TandoorClient, id: number): Promise<{ id: number; name: string }> {
  const c = await client.supermarketCategories.getCategory(id);
  return { id: c.id, name: c.name };
}

export async function storageRef(client: TandoorClient, id: number): Promise<{ id: number; name: string }> {
  const s = await client.storages.getStorage(id);
  return { id: s.id, name: s.name };
}

/** CustomFilter also requires `search`. */
export async function customFilterRef(
  client: TandoorClient,
  id: number
): Promise<{ id: number; name: string; search: string }> {
  const f = await client.customFilters.getFilter(id);
  return { id: f.id, name: f.name, search: f.search };
}

/** Resolve `id` → envelope, passing `null` through (used to clear an FK). */
export async function nullableRef<T>(
  resolve: (client: TandoorClient, id: number) => Promise<T>,
  client: TandoorClient,
  id: number | null
): Promise<T | null> {
  return id == null ? null : resolve(client, id);
}
