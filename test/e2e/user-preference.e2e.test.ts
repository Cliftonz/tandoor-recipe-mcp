import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TandoorClient } from '../../src/clients/index.js';
import { handleGetUserPreference, handleUpdateUserPreference } from '../../src/handlers/admin.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const describeE2E = url && token ? describe : describe.skip;

const slim = (text: string) => JSON.parse(text.slice(text.indexOf('{')));

describeE2E('user preference round-trip', () => {
  let client: TandoorClient;
  let userId: number;
  let mealTypeId: number;
  let original: { default_meal_type_id: number | null; shopping_update_food_lists: boolean };

  beforeAll(async () => {
    client = new TandoorClient({ url: url!, token: token! });
    const [pref] = await client.userPreferences.listPreferences();
    userId = pref.user.id;
    const read = slim(await handleGetUserPreference(client, { user_id: userId }));
    original = {
      default_meal_type_id: read.default_meal_type_id,
      shopping_update_food_lists: read.shopping_update_food_lists,
    };
    const mealType = await client.mealTypes.createMealType({ name: `mcp-e2e-userpref-${Date.now()}` });
    mealTypeId = mealType.id;
  });

  afterAll(async () => {
    await handleUpdateUserPreference(client, { user_id: userId, ...original });
    await client.mealTypes.deleteMealType(mealTypeId);
  });

  it('sets the default meal type by bare id', async () => {
    await handleUpdateUserPreference(client, { user_id: userId, default_meal_type_id: mealTypeId });
    const read = slim(await handleGetUserPreference(client, { user_id: userId }));
    expect(read.default_meal_type_id).toBe(mealTypeId);
  });

  it('clears the default meal type with null', async () => {
    await handleUpdateUserPreference(client, { user_id: userId, default_meal_type_id: null });
    const read = slim(await handleGetUserPreference(client, { user_id: userId }));
    expect(read.default_meal_type_id).toBeNull();
  });

  it('toggles shopping_update_food_lists', async () => {
    const flipped = !original.shopping_update_food_lists;
    await handleUpdateUserPreference(client, { user_id: userId, shopping_update_food_lists: flipped });
    const read = slim(await handleGetUserPreference(client, { user_id: userId }));
    expect(read.shopping_update_food_lists).toBe(flipped);
  });
});
