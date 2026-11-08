import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Surface } from './surface.js';

const JPEG_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'local-storage', 'e2e-local-jpeg.jpg');

export const SEED_COVERS = [
  'create_keyword',
  'create_unit',
  'create_supermarket_category',
  'create_food',
  'create_recipe',
  'create_meal_type',
  'create_meal_plan',
  'create_shopping_list',
  'create_shopping_entry',
  'create_shopping_list_recipe',
  'create_household',
  'assign_household',
  'create_inventory_location',
  'add_inventory_item',
  'create_supermarket',
  'create_supermarket_category_relation',
  'create_recipe_book',
  'add_recipe_to_book',
  'create_cook_log',
  'create_unit_conversion',
  'create_property_type',
  'create_property',
  'create_custom_filter',
  'create_automation',
  'upload_user_file',
  'create_export_log',
  'create_import_log',
  'create_bookmarklet_import',
  'create_storage',
  'create_recipe_import',
  'create_sync',
  'create_invite_link',
  'delete_keyword',
  'delete_unit',
  'delete_supermarket_category',
  'delete_food',
  'delete_recipe',
  'delete_meal_type',
  'delete_meal_plan',
  'delete_shopping_list',
  'delete_shopping_entry',
  'delete_shopping_list_recipe',
  'delete_household',
  'delete_inventory_location',
  'delete_inventory_entry',
  'delete_supermarket',
  'delete_supermarket_category_relation',
  'delete_recipe_book',
  'remove_recipe_from_book',
  'delete_cook_log',
  'delete_unit_conversion',
  'delete_property_type',
  'delete_property',
  'delete_custom_filter',
  'delete_automation',
  'delete_user_file',
  'delete_export_log',
  'delete_import_log',
  'delete_bookmarklet_import',
  'delete_storage',
  'delete_recipe_import',
  'delete_sync',
  'delete_invite_link',
  'delete_view_log',
] as const;

export interface Seed {
  prefix: string;
  date: string;
  keywordId: number;
  unitId: number;
  unit2Id: number;
  categoryId: number;
  foodId: number;
  recipeId: number;
  stepId: number;
  ingredientId: number;
  mealTypeId: number;
  mealPlanId: number;
  shoppingListId: number;
  shoppingEntryId: number;
  shoppingListRecipeId: number;
  householdId: number;
  inventoryLocationId: number;
  inventoryEntryId: number;
  inventoryLogId: number;
  supermarketId: number;
  categoryRelationId: number;
  bookId: number;
  bookEntryId: number;
  cookLogId: number;
  unitConversionId: number;
  propertyTypeId: number;
  propertyId: number;
  customFilterId: number;
  automationId: number;
  userFileId: number;
  exportLogId: number;
  importLogId: number;
  bookmarkletImportId: number;
  storageId: number;
  recipeImportId: number;
  syncId: number;
  inviteLinkId: number;
  viewLogId: number;
  spaceId: number;
  userId: number;
  userSpaceId: number;
  groupId: number;
  foodInheritFieldId: number;
  syncLogId: number;
  stashHandle: string;
}

export interface Seeder {
  run(): Promise<Seed>;
  teardown(): Promise<void>;
}

export function seeder(s: Surface, url: string, token: string): Seeder {
  const prefix = `e2e-rs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const date = new Date().toISOString().slice(0, 10);
  const undo: (() => Promise<unknown>)[] = [];

  async function create(tool: string, args: Record<string, unknown>, deleteTool: string): Promise<any> {
    const created = await s.call(tool, { ...args, format: 'full' });
    undo.push(() => s.call(deleteTool, { id: created.id }));
    return created;
  }

  async function teardown(): Promise<void> {
    const failures: string[] = [];
    for (const step of undo.reverse()) {
      await step().catch((err: Error) => failures.push(err.message));
    }
    if (failures.length) throw new Error(`seed teardown left data behind:\n${failures.join('\n')}`);
  }

  async function run(): Promise<Seed> {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'tandoor-e2e-seed-'));
    undo.push(() => rm(tempDir, { recursive: true }));
    const keyword = await create('create_keyword', { name: `${prefix}-kw` }, 'delete_keyword');
    const unit = await create('create_unit', { name: `${prefix}-g` }, 'delete_unit');
    const unit2 = await create('create_unit', { name: `${prefix}-kg` }, 'delete_unit');
    const category = await create('create_supermarket_category', { name: `${prefix}-aisle` }, 'delete_supermarket_category');
    const food = await create('create_food', { name: `${prefix}-flour`, supermarket_category_id: category.id }, 'delete_food');
    const recipe = await create('create_recipe', {
      name: `${prefix}-bread`,
      description: 'seeded by the read sweep',
      servings: 2,
      keywords: [keyword.name],
      steps: [{ instruction: 'Mix and bake.', time: 5, ingredients: [{ food: food.name, amount: 500, unit: unit.name }] }],
    }, 'delete_recipe');
    const mealType = await create('create_meal_type', { name: `${prefix}-meal` }, 'delete_meal_type');
    const mealPlan = await create('create_meal_plan', { recipe_id: recipe.id, servings: 2, from_date: date, meal_type_id: mealType.id }, 'delete_meal_plan');
    const shoppingList = await create('create_shopping_list', { name: `${prefix}-list` }, 'delete_shopping_list');
    const shoppingEntry = await create('create_shopping_entry', { amount: 2, food_id: food.id, unit_id: unit.id, shopping_list_ids: [shoppingList.id] }, 'delete_shopping_entry');
    const shoppingListRecipe = await create('create_shopping_list_recipe', { servings: 1, name: `${prefix}-slr`, recipe: recipe.id }, 'delete_shopping_list_recipe');

    const userSpace = (await s.call('list_all_personal_user_spaces', {})).find((us: any) => us.active);
    const household = await create('create_household', { name: `${prefix}-home` }, 'delete_household');
    await s.call('assign_household', { user_space_ids: [userSpace.id], household_id: household.id });
    undo.push(() => s.call('assign_household', { user_space_ids: [userSpace.id], household_id: userSpace.household?.id ?? null }));
    const location = await create('create_inventory_location', { name: `${prefix}-pantry` }, 'delete_inventory_location');
    const inventoryEntry = await create('add_inventory_item', { food_id: food.id, unit_id: unit.id, amount: 5, location_id: location.id }, 'delete_inventory_entry');
    const inventoryLog = (await s.call('list_inventory_logs', { entry_id: inventoryEntry.id })).results[0];

    const supermarket = await create('create_supermarket', { name: `${prefix}-market` }, 'delete_supermarket');
    const relation = await create('create_supermarket_category_relation', { category_id: category.id, supermarket: supermarket.id }, 'delete_supermarket_category_relation');
    const book = await create('create_recipe_book', { name: `${prefix}-book` }, 'delete_recipe_book');
    const bookEntry = await create('add_recipe_to_book', { book: book.id, recipe: recipe.id }, 'remove_recipe_from_book');
    const cookLog = await create('create_cook_log', { recipe: recipe.id, servings: 2, rating: 4, comment: prefix }, 'delete_cook_log');
    const conversion = await create('create_unit_conversion', { base_amount: 1000, base_unit_id: unit.id, converted_amount: 1, converted_unit_id: unit2.id, food_id: food.id }, 'delete_unit_conversion');
    const propertyType = await create('create_property_type', { name: `${prefix}-fiber`, unit: 'g' }, 'delete_property_type');
    const property = await create('create_property', { property_type_id: propertyType.id, property_amount: 3 }, 'delete_property');
    const customFilter = await create('create_custom_filter', { name: `${prefix}-filter`, search: JSON.stringify({ query: prefix }) }, 'delete_custom_filter');
    const automation = await create('create_automation', { type: 'FOOD_ALIAS', name: `${prefix}-alias`, param_1: `${prefix}-meal-flour`, param_2: food.name }, 'delete_automation');

    const upload = path.join(tempDir, `${prefix}.jpg`);
    await copyFile(JPEG_FIXTURE, upload);
    const userFile = await create('upload_user_file', { name: `${prefix}-photo`, file_path: upload }, 'delete_user_file');

    const exportLog = await create('create_export_log', { type: 'DEFAULT', msg: prefix }, 'delete_export_log');
    const importLog = await create('create_import_log', { type: 'DEFAULT', msg: prefix }, 'delete_import_log');
    const bookmarklet = await create('create_bookmarklet_import', { html: `<html><title>${prefix}</title></html>` }, 'delete_bookmarklet_import');
    const storage = await create('create_storage', { name: `${prefix}-storage`, method: 'LOCAL', path: `/tmp/${prefix}` }, 'delete_storage');
    const recipeImport = await create('create_recipe_import', { name: `${prefix}-pending`, storage: storage.id }, 'delete_recipe_import');
    const sync = await create('create_sync', { storage_id: storage.id, path: `/tmp/${prefix}`, active: false }, 'delete_sync');

    const groups = await s.call('list_groups', {});
    const group = groups.find((g: any) => g.name === 'user');
    const validUntil = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const invite = await create('create_invite_link', { email: `${prefix}@example.invalid`, group: group.id, valid_until: validUntil, internal_note: prefix }, 'delete_invite_link');

    const viewLog = await (await fetch(`${url}/api/view-log/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe: recipe.id }),
    })).json();
    undo.push(() => s.call('delete_view_log', { id: viewLog.id }));

    const space = await s.call('get_current_space', {});
    const preferences = await s.call('list_user_preferences', {});
    const inheritFields = await s.call('list_food_inherit_fields', {});
    const syncLogs = await s.call('list_sync_logs', {});

    process.env.TANDOOR_MCP_STASH_THRESHOLD = '1';
    const stashed = await s.raw('list_units', { query: prefix });
    delete process.env.TANDOOR_MCP_STASH_THRESHOLD;

    const step = recipe.steps[0];
    return {
      prefix,
      date,
      keywordId: keyword.id,
      unitId: unit.id,
      unit2Id: unit2.id,
      categoryId: category.id,
      foodId: food.id,
      recipeId: recipe.id,
      stepId: step.id,
      ingredientId: step.ingredients[0].id,
      mealTypeId: mealType.id,
      mealPlanId: mealPlan.id,
      shoppingListId: shoppingList.id,
      shoppingEntryId: shoppingEntry.id,
      shoppingListRecipeId: shoppingListRecipe.id,
      householdId: household.id,
      inventoryLocationId: location.id,
      inventoryEntryId: inventoryEntry.id,
      inventoryLogId: inventoryLog.id,
      supermarketId: supermarket.id,
      categoryRelationId: relation.id,
      bookId: book.id,
      bookEntryId: bookEntry.id,
      cookLogId: cookLog.id,
      unitConversionId: conversion.id,
      propertyTypeId: propertyType.id,
      propertyId: property.id,
      customFilterId: customFilter.id,
      automationId: automation.id,
      userFileId: userFile.id,
      exportLogId: exportLog.id,
      importLogId: importLog.id,
      bookmarkletImportId: bookmarklet.id,
      storageId: storage.id,
      recipeImportId: recipeImport.id,
      syncId: sync.id,
      inviteLinkId: invite.id,
      viewLogId: viewLog.id,
      spaceId: space.id,
      userId: preferences[0].user_id,
      userSpaceId: userSpace.id,
      groupId: group.id,
      foodInheritFieldId: inheritFields[0].id,
      syncLogId: syncLogs.results[0].id,
      stashHandle: (stashed.structuredContent as { handle: string }).handle,
    };
  }

  return { run, teardown };
}
