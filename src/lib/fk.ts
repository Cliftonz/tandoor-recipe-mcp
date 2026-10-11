// Foreign-key envelope helpers.
//
// Tandoor's writable nested serializers (Food, Unit, PropertyType) validate
// `name` as required even when `id` identifies an existing row, so a bare
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

/** Resolve `id` → envelope, passing `null` through (used to clear an FK). */
export async function nullableRef(
  resolve: (client: TandoorClient, id: number) => Promise<{ id: number; name: string }>,
  client: TandoorClient,
  id: number | null
): Promise<{ id: number; name: string } | null> {
  return id == null ? null : resolve(client, id);
}
