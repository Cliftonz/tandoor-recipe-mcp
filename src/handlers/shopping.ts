// Shopping list handlers.

import { TandoorClient } from '../clients/index.js';
import type {
  ListShoppingEntriesArgs,
  GetShoppingEntryArgs,
  CreateShoppingEntryArgs,
  UpdateShoppingEntryArgs,
  DeleteShoppingEntryArgs,
  BulkCheckShoppingEntriesArgs,
  ListShoppingListRecipesArgs,
  GetShoppingListRecipeArgs,
  CreateShoppingListRecipeArgs,
  UpdateShoppingListRecipeArgs,
  DeleteShoppingListRecipeArgs,
  BulkCreateShoppingListRecipeEntriesArgs,
  ListShoppingListsArgs,
  GetShoppingListArgs,
  CreateShoppingListArgs,
  UpdateShoppingListArgs,
  DeleteShoppingListArgs,
  BulkUpdateShoppingEntriesArgs,
  ListOperations,
} from '../tools/shopping.js';
import type { HandlerContext } from '../lib/register.js';
import { emit, assertNonEmptyBody, slimPaginated } from '../lib/slim.js';

function assertNoRepeatedIds(field: string, ids: number[]): void {
  const repeated = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))].sort((a, b) => a - b);
  if (repeated.length > 0) throw new Error(`These shopping list ids appear more than once in ${field}: ${repeated.join(', ')}.`);
}

export async function checkShoppingListIds(client: TandoorClient, ids: number[], signal?: AbortSignal): Promise<void> {
  assertNoRepeatedIds('shopping_list_ids', ids);
  await client.shopping.assertShoppingListsExist(ids, { signal });
}

export function listMismatch(requested: number[] | undefined, lists: { id: number }[]): string | null {
  if (requested === undefined) return null;
  const got = lists.map((l) => l.id);
  const missing = requested.filter((id) => !got.includes(id));
  const extra = got.filter((id) => !requested.includes(id)).sort((a, b) => a - b);
  const parts = [
    missing.length > 0 ? `Tandoor did not put it on these shopping lists: ${missing.join(', ')}` : null,
    extra.length > 0 ? `Tandoor also put it on these shopping lists: ${extra.join(', ')}` : null,
  ].filter((p) => p !== null);
  return parts.length > 0 ? parts.join('; ') : null;
}

export function assertListsApplied(outcome: string, requested: number[] | undefined, lists: { id: number }[], advice = ''): void {
  const mismatch = listMismatch(requested, lists);
  if (mismatch) throw new Error(`${outcome}, but ${mismatch}.${advice}`);
}

export const doNotRetry = (tool: string, id: number) => ` Do not retry; use ${tool} on id ${id}.`;

export function slimListRefs(lists: any[]) {
  return lists.map((l) => ({ id: l.id, name: l.name }));
}

function slimShoppingList(l: any) {
  return { id: l.id, name: l.name, description: l.description, color: l.color };
}

export async function handleListShoppingLists(
  client: TandoorClient,
  args: ListShoppingListsArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.shopping.listShoppingLists(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimPaginated(r, slimShoppingList));
}

export async function handleGetShoppingList(
  client: TandoorClient,
  args: GetShoppingListArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.shopping.getShoppingList(args.id, { signal: ctx?.signal });
  return emit(args.format === 'full' ? r : slimShoppingList(r));
}

export async function handleCreateShoppingList(
  client: TandoorClient,
  args: CreateShoppingListArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...body } = args;
  const r = await client.shopping.createShoppingList(body, { signal: ctx?.signal });
  return `Shopping list created.\n\n${emit(format === 'full' ? r : slimShoppingList(r))}`;
}

export async function handleUpdateShoppingList(
  client: TandoorClient,
  args: UpdateShoppingListArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { id, format, ...body } = args;
  assertNonEmptyBody(body);
  if (body.name !== undefined) {
    const key = (n: string) => n.trim().toLowerCase();
    const name = key(body.name);
    const lists = await client.shopping.listAllShoppingLists({ signal: ctx?.signal });
    const own = lists.find((l) => l.id === id);
    const taken = own && key(own.name) === name ? undefined : lists.find((l) => l.id !== id && key(l.name) === name);
    if (taken) throw new Error(`A shopping list named ${taken.name} already exists (id ${taken.id}); choose another name.`);
  }
  const r = await client.shopping.patchShoppingList(id, body, { signal: ctx?.signal });
  return `Shopping list updated.\n\n${emit(format === 'full' ? r : slimShoppingList(r))}`;
}

export async function handleDeleteShoppingList(
  client: TandoorClient,
  args: DeleteShoppingListArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.shopping.deleteShoppingList(args.id, { signal: ctx?.signal });
  return `Shopping list ${args.id} deleted.`;
}

function slimEntry(e: any) {
  if (!e) return e;
  return {
    id: e.id,
    food: e.food?.name ?? null,
    food_id: e.food?.id ?? null,
    unit: e.unit?.name ?? null,
    unit_id: e.unit?.id ?? null,
    amount: e.amount,
    checked: e.checked,
    completed_at: e.completed_at,
    list_recipe: e.list_recipe,
    ingredient: e.ingredient,
    delay_until: e.delay_until,
    shopping_lists: slimListRefs(e.shopping_lists),
  };
}

function slimEntryPage(p: any) {
  if (!p?.results) return p;
  return {
    count: p.count,
    next: p.next,
    previous: p.previous,
    results: p.results.map(slimEntry),
  };
}

function slimShoppingListRecipe(r: any) {
  if (!r) return r;
  return {
    id: r.id,
    name: r.name,
    recipe: r.recipe,
    recipe_name: r.recipe_data?.name,
    mealplan: r.mealplan,
    servings: r.servings,
  };
}

export async function handleListShoppingEntries(
  client: TandoorClient,
  args: ListShoppingEntriesArgs
): Promise<string> {
  const { format, ...params } = args;
  const result = await client.shopping.listEntries(params);
  return format === 'full' ? emit(result) : emit(slimEntryPage(result));
}

export async function handleGetShoppingEntry(
  client: TandoorClient,
  args: GetShoppingEntryArgs
): Promise<string> {
  const e = await client.shopping.getEntry(args.id);
  return args.format === 'full' ? emit(e) : emit(slimEntry(e));
}

export async function handleCreateShoppingEntry(
  client: TandoorClient,
  args: CreateShoppingEntryArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {
    amount: args.amount,
    food: args.food_id,
    unit: args.unit_id ?? null,
    checked: args.checked ?? false,
  };
  if (args.list_recipe !== undefined) body.list_recipe = args.list_recipe;
  if (args.ingredient !== undefined) body.ingredient = args.ingredient;
  if (args.order !== undefined) body.order = args.order;
  if (args.delay_until !== undefined) body.delay_until = args.delay_until;
  if (args.mealplan_id !== undefined) body.mealplan_id = args.mealplan_id;
  if (args.shopping_list_ids !== undefined) {
    await checkShoppingListIds(client, args.shopping_list_ids, ctx?.signal);
    body.shopping_lists = args.shopping_list_ids;
  }

  let created = await client.shopping.createEntry(body);
  if (args.shopping_list_ids?.length === 0) {
    created = await client.shopping.patchEntry(created.id, { shopping_lists: [], checked: created.checked }).catch((e: Error) => {
      throw new Error(`Shopping entry ${created.id} was created, possibly with its food's shopping lists; clearing its lists failed: ${e.message}${doNotRetry('update_shopping_entry', created.id)}`);
    });
  }
  assertListsApplied(`Shopping entry ${created.id} was created`, args.shopping_list_ids, created.shopping_lists, doNotRetry('update_shopping_entry', created.id));
  return `Shopping entry created.\n\n${emit(args.format === 'full' ? created : slimEntry(created))}`;
}

export async function handleUpdateShoppingEntry(
  client: TandoorClient,
  args: UpdateShoppingEntryArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.amount !== undefined) body.amount = args.amount;
  if (args.food_id !== undefined) body.food = args.food_id;
  if (args.unit_id !== undefined) body.unit = args.unit_id;
  if (args.checked !== undefined) body.checked = args.checked;
  if (args.order !== undefined) body.order = args.order;
  if (args.delay_until !== undefined) body.delay_until = args.delay_until;
  if (args.shopping_list_ids !== undefined) {
    await checkShoppingListIds(client, args.shopping_list_ids, ctx?.signal);
    body.shopping_lists = args.shopping_list_ids;
  }
  assertNonEmptyBody(body);
  if (args.checked === undefined) body.checked = (await client.shopping.getEntry(args.id)).checked;

  const updated = await client.shopping.patchEntry(args.id, body);
  assertListsApplied(`Shopping entry ${args.id} was updated`, args.shopping_list_ids, updated.shopping_lists);
  return `Shopping entry updated.\n\n${emit(args.format === 'full' ? updated : slimEntry(updated))}`;
}

export async function handleDeleteShoppingEntry(
  client: TandoorClient,
  args: DeleteShoppingEntryArgs
): Promise<string> {
  await client.shopping.deleteEntry(args.id);
  return `Shopping entry ${args.id} deleted.`;
}

export async function handleBulkCheckShoppingEntries(
  client: TandoorClient,
  args: BulkCheckShoppingEntriesArgs
): Promise<string> {
  if (args.ids.length === 0) throw new Error('ids must be a non-empty array');
  const r = await client.shopping.bulkCheckEntries(args.ids, args.checked);
  return emit(r);
}

const nonEmpty = (ids?: number[]) => (ids?.length ? ids : undefined);

export function parseListOperations<T extends ListOperations>(args: T): { request: T; listIds: number[] | null } {
  const add = nonEmpty(args.shopping_lists_add);
  const remove = nonEmpty(args.shopping_lists_remove);
  const { shopping_lists_set: set, shopping_lists_remove_all: removeAll } = args;
  if (set?.length === 0) {
    throw new Error('shopping_lists_set: [] does nothing in Tandoor. To take every list off, use shopping_lists_remove_all: true.');
  }
  const given = [
    add || remove ? 'shopping_lists_add or shopping_lists_remove' : null,
    set ? 'shopping_lists_set' : null,
    removeAll ? 'shopping_lists_remove_all' : null,
  ].filter((g) => g !== null);
  for (const [field, ids] of [['shopping_lists_add', add], ['shopping_lists_remove', remove], ['shopping_lists_set', set]] as const) {
    if (ids) assertNoRepeatedIds(field, ids);
  }
  const inBoth = (add ?? []).filter((id) => remove?.includes(id)).sort((a, b) => a - b);
  if (inBoth.length > 0) {
    throw new Error(`These shopping list ids are in both shopping_lists_add and shopping_lists_remove: ${inBoth.join(', ')}.`);
  }
  if (given.length > 1) {
    throw new Error(`Only shopping_lists_add and shopping_lists_remove can be combined; shopping_lists_set and shopping_lists_remove_all must be used alone. Got: ${given.join(', ')}.`);
  }
  return {
    request: { ...args, shopping_lists_add: add, shopping_lists_remove: remove },
    listIds: given.length === 0 ? null : [...(add ?? []), ...(remove ?? []), ...(set ?? [])],
  };
}

export async function handleBulkUpdateShoppingEntries(
  client: TandoorClient,
  args: BulkUpdateShoppingEntriesArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { request, listIds } = parseListOperations(args);
  if (listIds === null && args.checked === undefined) throw new Error('Give checked, a list change, or both.');
  await client.shopping.assertShoppingListsExist(listIds ?? [], { signal: ctx?.signal });
  return emit(await client.shopping.bulkUpdateEntries(request, { signal: ctx?.signal }));
}

export async function handleListShoppingListRecipes(
  client: TandoorClient,
  args: ListShoppingListRecipesArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.shopping.listShoppingListRecipes(params);
  if (format === 'full') return emit(r);
  return emit({
    count: r.count,
    next: r.next,
    previous: r.previous,
    results: (r.results || []).map(slimShoppingListRecipe),
  });
}

export async function handleGetShoppingListRecipe(
  client: TandoorClient,
  args: GetShoppingListRecipeArgs
): Promise<string> {
  const r = await client.shopping.getShoppingListRecipe(args.id);
  return args.format === 'full' ? emit(r) : emit(slimShoppingListRecipe(r));
}

export async function handleCreateShoppingListRecipe(
  client: TandoorClient,
  args: CreateShoppingListRecipeArgs
): Promise<string> {
  const body: any = { servings: args.servings };
  if (args.name !== undefined) body.name = args.name;
  if (args.recipe !== undefined) body.recipe = args.recipe;
  if (args.mealplan !== undefined) body.mealplan = args.mealplan;
  const created = await client.shopping.createShoppingListRecipe(body);
  return `Shopping list recipe created.\n\n${emit(args.format === 'full' ? created : slimShoppingListRecipe(created))}`;
}

export async function handleUpdateShoppingListRecipe(
  client: TandoorClient,
  args: UpdateShoppingListRecipeArgs
): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.servings !== undefined) body.servings = args.servings;
  if (args.recipe !== undefined) body.recipe = args.recipe;
  if (args.mealplan !== undefined) body.mealplan = args.mealplan;
  assertNonEmptyBody(body);
  const updated = await client.shopping.patchShoppingListRecipe(args.id, body);
  return `Shopping list recipe updated.\n\n${emit(args.format === 'full' ? updated : slimShoppingListRecipe(updated))}`;
}

export async function handleDeleteShoppingListRecipe(
  client: TandoorClient,
  args: DeleteShoppingListRecipeArgs
): Promise<string> {
  await client.shopping.deleteShoppingListRecipe(args.id);
  return `Shopping list recipe ${args.id} deleted.`;
}

export async function handleBulkCreateShoppingListRecipeEntries(
  client: TandoorClient,
  args: BulkCreateShoppingListRecipeEntriesArgs,
  ctx?: HandlerContext,
): Promise<string> {
  if (args.entries.length === 0) throw new Error('entries must be a non-empty array');
  if (args.shopping_list_ids?.length === 0) {
    throw new Error("[] is not supported here; Tandoor would copy each food's lists. Omit shopping_list_ids for that.");
  }
  const listIds = args.shopping_list_ids ?? [];
  await checkShoppingListIds(client, listIds, ctx?.signal);
  const r = await client.shopping.bulkCreateRecipeEntries(args.id, args.entries, listIds);
  return emit(r);
}
