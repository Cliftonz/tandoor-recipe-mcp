import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import { TandoorClient } from '../src/clients/index.js';
import { handleGetUserPreference, handleUpdateUserPreference } from '../src/handlers/admin.js';
import { updateUserPreferenceShape } from '../src/tools/admin.js';
import { startStub, Stub } from './helpers/stub-http.js';

let stub: Stub;
afterEach(() => stub.close());

async function stubPreference(response: object) {
  const seen: { method?: string; body?: any } = {};
  stub = await startStub((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      seen.method = req.method;
      seen.body = raw ? JSON.parse(raw) : undefined;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(response));
    });
  });
  return { client: new TandoorClient({ url: stub.url, token: 't' }), seen };
}

const breakfast = { id: 4, name: 'Breakfast', order: 0, time: null, color: null, created_by: 1 };

describe('user preference wire shape', () => {
  it('sends default_meal_type_id as a bare integer default_meal_type', async () => {
    const { client, seen } = await stubPreference({ user: { id: 1 }, default_meal_type: breakfast });
    await handleUpdateUserPreference(client, { user_id: 1, default_meal_type_id: 4 });
    expect(seen.method).toBe('PATCH');
    expect(seen.body).toEqual({ default_meal_type: 4 });
  });

  it('sends a null default_meal_type_id as default_meal_type: null', async () => {
    const { client, seen } = await stubPreference({ user: { id: 1 }, default_meal_type: null });
    await handleUpdateUserPreference(client, { user_id: 1, default_meal_type_id: null });
    expect(seen.body).toEqual({ default_meal_type: null });
  });

  it('sends shopping_update_food_lists through unchanged', async () => {
    const { client, seen } = await stubPreference({ user: { id: 1 }, shopping_update_food_lists: true });
    await handleUpdateUserPreference(client, { user_id: 1, shopping_update_food_lists: true });
    expect(seen.body).toEqual({ shopping_update_food_lists: true });
  });

  it('slim output reports default_meal_type_id and shopping_update_food_lists without share fields', async () => {
    const { client } = await stubPreference({
      user: { id: 1, username: 'alice' },
      default_meal_type: breakfast,
      shopping_update_food_lists: false,
      plan_share: [{ id: 2 }],
      shopping_share: [{ id: 3 }],
    });
    const parsed = JSON.parse(await handleGetUserPreference(client, { user_id: 1 }));
    expect(parsed.default_meal_type_id).toBe(4);
    expect(parsed.shopping_update_food_lists).toBe(false);
    expect(parsed).not.toHaveProperty('plan_share_user_ids');
    expect(parsed).not.toHaveProperty('shopping_share_user_ids');
  });

  it('slim output reports a cleared default meal type as null', async () => {
    const { client } = await stubPreference({ user: { id: 1 }, default_meal_type: null });
    const parsed = JSON.parse(await handleGetUserPreference(client, { user_id: 1 }));
    expect(parsed.default_meal_type_id).toBeNull();
  });

  it('input schema accepts a null default_meal_type_id and drops the share fields', () => {
    const schema = z.object(updateUserPreferenceShape).strict();
    expect(schema.safeParse({ user_id: 1, default_meal_type_id: null }).success).toBe(true);
    expect(schema.safeParse({ user_id: 1, plan_share_user_ids: [2] }).success).toBe(false);
    expect(schema.safeParse({ user_id: 1, shopping_share_user_ids: [2] }).success).toBe(false);
  });
});
