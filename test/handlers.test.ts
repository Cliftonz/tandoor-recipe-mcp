import { describe, it, expect } from 'vitest';
import { handleCreateMealPlan, handleUpdateMealPlan } from '../src/handlers/mealplan.js';
import {
  handleCreateIngredient,
  handleUpdateIngredient,
  handleParseIngredient,
} from '../src/handlers/ingredient.js';
import { handleCreateShoppingEntry, handleBulkCheckShoppingEntries } from '../src/handlers/shopping.js';
import { handleCreateStep, handleUpdateStep } from '../src/handlers/step.js';
import { handleAddRecipeToShoppingList } from '../src/handlers/recipe.js';

// None of these should touch the network — they should throw before calling
// the client. A bare object stands in as a "client".
const noClient: any = {};

describe('handler argument validation', () => {
  it('create_meal_plan enforces the either-recipe-or-title semantic rule', async () => {
    // Required-field checks (from_date, meal_type_id, servings) moved to Zod.
    // The handler itself only guards the one rule Zod can't express.
    await expect(
      handleCreateMealPlan(noClient, { from_date: '2026-01-01', meal_type_id: 2, servings: 1 })
    ).rejects.toThrow(/recipe_id or title/);
  });

  it('update_meal_plan rejects no-op patches (id-only)', async () => {
    await expect(handleUpdateMealPlan(noClient, { id: 5 })).rejects.toThrow(/At least one field/);
  });

  // create_ingredient + parse_ingredient arg validation moved to the Zod
  // boundary (see test/tool-validation.test.ts). Handler itself is now
  // typed and trusts inputs.

  it('update_ingredient requires at least one field beyond id', async () => {
    await expect(handleUpdateIngredient(noClient, { id: 1 })).rejects.toThrow(/At least one field/);
  });

  // create_shopping_entry required-field checks moved to Zod.

  it('bulk_check_shopping_entries rejects empty ids array', async () => {
    await expect(
      handleBulkCheckShoppingEntries(noClient, { ids: [], checked: true })
    ).rejects.toThrow(/non-empty/);
  });

  // create_step instruction requirement moved to Zod.

  it('update_step rejects id-only patches', async () => {
    await expect(handleUpdateStep(noClient, { id: 1 })).rejects.toThrow(/At least one field/);
  });

  // add_recipe_to_shopping_list id requirement moved to Zod.
});
