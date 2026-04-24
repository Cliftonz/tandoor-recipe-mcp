// Handlers for meal plan tools.
//
// ---- Tandoor MealPlanSerializer quirks (all enforced here) ----
// 1. Nested `recipe` write must be `{id, name, keywords}` — bare `{id}` is 400.
//    We hydrate `name` + `keywords` via GET /api/recipe/{id}/ before POST.
// 2. Nested `meal_type` write must be `{id, name}` — bare `{id}` is 400.
//    We hydrate via GET /api/meal-type/{id}/ before POST.
// 3. `servings` must be a string, not a number.
// 4. `from_date` / `to_date` must include a time component; bare `YYYY-MM-DD`
//    is rejected. We promote bare dates to `YYYY-MM-DDT00:00:00`.
//
// ---- Prompt-injection posture ----
// The hydrated `recipe.name`, `meal_type.name`, and each `keywords[].name` come
// from Tandoor and may be attacker-controlled (shared recipes, compromised
// instance). We:
//   - only echo numeric ids + structural fields back to the LLM (see
//     `slimCreated`), not user-visible names;
//   - cap keywords at MAX_KEYWORDS and strip them to `{id, name}` so a huge or
//     mass-assignment-shaped keyword object can't amplify through our process.
//
// ---- Resource budget ----
// Each create/update issues up to 3 HTTP calls (recipe GET + meal_type GET +
// write). Hydration GETs are capped at 1 retry (`maxRetries: 1`) so one flaky
// upstream can't blow the user's budget on auxiliary reads; the write itself
// keeps the default retry budget.

import { TandoorClient } from '../clients/index.js';
import type { HandlerContext } from '../lib/register.js';
import type {
  ListMealPlansArgs,
  GetMealPlanArgs,
  CreateMealPlanArgs,
  UpdateMealPlanArgs,
  DeleteMealPlanArgs,
  AutoMealPlanArgs,
  BulkCreateMealPlansArgs,
} from '../tools/mealplan.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HYDRATION_MAX_RETRIES = 1;
const MAX_KEYWORDS = 50;

/** Tandoor rejects bare `YYYY-MM-DD`; appends midnight so the serializer accepts it. */
function appendMidnightIfDateOnly(d: string): string {
  return DATE_ONLY.test(d) ? `${d}T00:00:00` : d;
}

/** Project a possibly-malicious keywords array into the minimal shape the serializer needs. */
function slimKeywords(keywords: unknown): { id: number; name: string }[] {
  if (!Array.isArray(keywords)) return [];
  return keywords
    .slice(0, MAX_KEYWORDS)
    .filter((k: any) => k && typeof k.id === 'number' && typeof k.name === 'string')
    .map((k: any) => ({ id: k.id, name: k.name }));
}

/**
 * Wrap hydration-step errors so the LLM/on-call can tell which leg failed and
 * which tool call triggered it — not just "Tandoor API error: 404".
 */
function labelHydrationError<T>(
  p: Promise<T>,
  label: string
): Promise<T> {
  return p.catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${label}: ${msg}`);
  });
}

/**
 * Strict shape guard on the hydrated response. A 200 with an empty body, a
 * reverse-proxy HTML page, or a soft-deleted row could otherwise cascade into
 * a `TypeError: Cannot read properties of null` that confuses the caller.
 */
function assertRef(
  ref: { id?: number; name?: string } | null | undefined,
  kind: 'recipe' | 'meal_type',
  id: number
): asserts ref is { id: number; name: string } {
  if (!ref || typeof ref.id !== 'number' || typeof ref.name !== 'string') {
    throw new Error(
      `${kind} ${id} response missing id/name — Tandoor returned an unexpected shape`
    );
  }
}

/**
 * Trim a created/updated meal plan down to the numeric + structural fields
 * that a caller can verify without round-tripping. We deliberately omit
 * `recipe.name`, `meal_type.name`, and any keyword names so a hostile Tandoor
 * instance can't inject model-steering content into the LLM's context via the
 * tool output. Callers who need names can call `get_recipe` / `get_meal_type`.
 */
function slimCreated(m: any): Record<string, unknown> {
  return {
    id: m?.id,
    from_date: m?.from_date,
    to_date: m?.to_date,
    servings: m?.servings,
    title: m?.title,
    note: m?.note,
    addshopping: m?.addshopping,
    recipe_id: m?.recipe?.id ?? null,
    meal_type_id: m?.meal_type?.id ?? null,
  };
}

export async function handleListMealPlans(
  client: TandoorClient,
  args: ListMealPlansArgs
): Promise<string> {
  const result = await client.mealPlans.listMealPlans(args);
  return JSON.stringify(result, null, 2);
}

export async function handleGetMealPlan(
  client: TandoorClient,
  args: GetMealPlanArgs
): Promise<string> {
  const mealPlan = await client.mealPlans.getMealPlan(args.id);
  return JSON.stringify(mealPlan, null, 2);
}

export async function handleCreateMealPlan(
  client: TandoorClient,
  args: CreateMealPlanArgs,
  ctx?: HandlerContext
): Promise<string> {
  if (!args.recipe_id && !args.title) {
    throw new Error('Either recipe_id or title must be provided');
  }

  const signal = ctx?.signal;
  const hydrateOpts = { signal, maxRetries: HYDRATION_MAX_RETRIES };

  const [recipe, mealType] = await Promise.all([
    args.recipe_id
      ? labelHydrationError(
          client.recipes.getRecipe(args.recipe_id, hydrateOpts),
          `Failed to hydrate recipe ${args.recipe_id} for create_meal_plan`
        )
      : Promise.resolve(null),
    labelHydrationError(
      client.mealPlans.getMealType(args.meal_type_id, hydrateOpts),
      `Failed to hydrate meal_type ${args.meal_type_id} for create_meal_plan`
    ),
  ]);

  assertRef(mealType, 'meal_type', args.meal_type_id);
  if (args.recipe_id) assertRef(recipe, 'recipe', args.recipe_id);

  const mealPlan: any = {
    servings: String(args.servings),
    from_date: appendMidnightIfDateOnly(args.from_date),
    meal_type: { id: mealType.id, name: mealType.name },
  };

  if (recipe) {
    mealPlan.recipe = {
      id: recipe.id,
      name: recipe.name,
      keywords: slimKeywords(recipe.keywords),
    };
  }
  if (args.title) mealPlan.title = args.title;
  if (args.to_date) mealPlan.to_date = appendMidnightIfDateOnly(args.to_date);
  if (args.note) mealPlan.note = args.note;
  if (args.addshopping !== undefined) mealPlan.addshopping = args.addshopping;

  const created = await client.mealPlans.createMealPlan(mealPlan);
  return `Meal plan created successfully!\n\n${JSON.stringify(slimCreated(created))}`;
}

export async function handleUpdateMealPlan(
  client: TandoorClient,
  args: UpdateMealPlanArgs,
  ctx?: HandlerContext
): Promise<string> {
  const { id, ...updateData } = args;

  const needRecipe = updateData.recipe_id !== undefined && updateData.recipe_id !== null;
  const needMealType = updateData.meal_type_id !== undefined;

  const signal = ctx?.signal;
  const hydrateOpts = { signal, maxRetries: HYDRATION_MAX_RETRIES };

  const [recipe, mealType] = await Promise.all([
    needRecipe
      ? labelHydrationError(
          client.recipes.getRecipe(updateData.recipe_id as number, hydrateOpts),
          `Failed to hydrate recipe ${updateData.recipe_id} for update_meal_plan`
        )
      : Promise.resolve(null),
    needMealType
      ? labelHydrationError(
          client.mealPlans.getMealType(updateData.meal_type_id as number, hydrateOpts),
          `Failed to hydrate meal_type ${updateData.meal_type_id} for update_meal_plan`
        )
      : Promise.resolve(null),
  ]);

  if (needRecipe) assertRef(recipe, 'recipe', updateData.recipe_id as number);
  if (needMealType) assertRef(mealType, 'meal_type', updateData.meal_type_id as number);

  const updates: any = {};
  if (updateData.recipe_id !== undefined) {
    updates.recipe = updateData.recipe_id === null
      ? null
      : { id: recipe!.id, name: recipe!.name, keywords: slimKeywords((recipe as any).keywords) };
  }
  if (updateData.title !== undefined) updates.title = updateData.title;
  if (updateData.servings !== undefined) updates.servings = String(updateData.servings);
  if (updateData.from_date !== undefined) updates.from_date = appendMidnightIfDateOnly(updateData.from_date);
  if (updateData.to_date !== undefined) updates.to_date = appendMidnightIfDateOnly(updateData.to_date);
  if (updateData.meal_type_id !== undefined) {
    updates.meal_type = { id: mealType!.id, name: mealType!.name };
  }
  if (updateData.note !== undefined) updates.note = updateData.note;

  if (Object.keys(updates).length === 0) {
    throw new Error('At least one field must be provided to update');
  }

  const updated = await client.mealPlans.patchMealPlan(id, updates);
  return `Meal plan updated successfully!\n\n${JSON.stringify(slimCreated(updated))}`;
}

export async function handleDeleteMealPlan(
  client: TandoorClient,
  args: DeleteMealPlanArgs
): Promise<string> {
  await client.mealPlans.deleteMealPlan(args.id);
  return `Meal plan ${args.id} deleted successfully!`;
}

export async function handleAutoMealPlan(
  client: TandoorClient,
  args: AutoMealPlanArgs
): Promise<string> {
  if (args.keyword_ids.length === 0) {
    throw new Error('keyword_ids must be a non-empty array of keyword IDs');
  }
  const startDate = new Date(args.start_date);
  const endDate = new Date(args.end_date);
  if (startDate > endDate) {
    throw new Error('start_date must be before or equal to end_date');
  }

  const result = await client.mealPlans.autoCreateMealPlans({
    start_date: args.start_date,
    end_date: args.end_date,
    meal_type_id: args.meal_type_id,
    keyword_ids: args.keyword_ids,
    servings: args.servings,
    addshopping: args.addshopping,
  });

  return `Auto meal plan created successfully!\n\n${JSON.stringify(result, null, 2)}`;
}

export async function handleListMealTypes(
  client: TandoorClient,
  _args: unknown
): Promise<string> {
  const mealTypes = await client.mealPlans.listMealTypes();
  return JSON.stringify(mealTypes, null, 2);
}

/**
 * Client-side batched create_meal_plan. Tandoor has no server-side bulk
 * endpoint for meal plans, so we:
 *   1. Dedupe unique recipe_ids + meal_type_ids across entries.
 *   2. Hydrate each unique id ONCE (parallel Promise.all) — shares the cost
 *      across all entries that reference the same recipe/meal_type.
 *   3. Build hydrated bodies + POST in parallel via Promise.allSettled so one
 *      Tandoor rejection doesn't tank the whole batch.
 *   4. Return {count, created, failed} so the caller can retry just the bad
 *      entries instead of redoing the full batch.
 *
 * For 7 entries (week plan) referencing 3 unique meal_types + 5 unique
 * recipes, this drops from 21 calls (7×3) to 13 (5 recipe GET + 3 meal_type
 * GET + 7 POST), plus eliminates the per-entry retry-budget duplication.
 */
export async function handleBulkCreateMealPlans(
  client: TandoorClient,
  args: BulkCreateMealPlansArgs,
  ctx?: HandlerContext
): Promise<string> {
  if (!args.entries || args.entries.length === 0) {
    throw new Error('entries must be a non-empty array');
  }

  // Validate and collect unique ids before any network call.
  args.entries.forEach((e, i) => {
    if (!e.recipe_id && !e.title) {
      throw new Error(`entries[${i}]: either recipe_id or title must be provided`);
    }
  });

  const recipeIds = Array.from(new Set(
    args.entries.map((e) => e.recipe_id).filter((v): v is number => typeof v === 'number')
  ));
  const mealTypeIds = Array.from(new Set(args.entries.map((e) => e.meal_type_id)));

  const signal = ctx?.signal;
  const hydrateOpts = { signal, maxRetries: HYDRATION_MAX_RETRIES };

  // Hydrate all unique ids in one fan-out.
  const [recipeList, mealTypeList] = await Promise.all([
    Promise.all(recipeIds.map((id) =>
      client.recipes.getRecipe(id, hydrateOpts).catch((err) => {
        throw new Error(`Failed to hydrate recipe ${id} for bulk_create_meal_plans: ${err instanceof Error ? err.message : String(err)}`);
      })
    )),
    Promise.all(mealTypeIds.map((id) =>
      client.mealPlans.getMealType(id, hydrateOpts).catch((err) => {
        throw new Error(`Failed to hydrate meal_type ${id} for bulk_create_meal_plans: ${err instanceof Error ? err.message : String(err)}`);
      })
    )),
  ]);

  // Validate shapes and index for fast lookup.
  const recipeMap = new Map<number, any>();
  recipeIds.forEach((id, i) => {
    assertRef(recipeList[i], 'recipe', id);
    recipeMap.set(id, recipeList[i]);
  });
  const mealTypeMap = new Map<number, any>();
  mealTypeIds.forEach((id, i) => {
    assertRef(mealTypeList[i], 'meal_type', id);
    mealTypeMap.set(id, mealTypeList[i]);
  });

  // POST each entry in parallel. Individual rejections do NOT abort the batch.
  const results = await Promise.allSettled(
    args.entries.map((entry) => {
      const recipe = entry.recipe_id ? recipeMap.get(entry.recipe_id) : null;
      const mealType = mealTypeMap.get(entry.meal_type_id)!;
      const body: any = {
        servings: String(entry.servings),
        from_date: appendMidnightIfDateOnly(entry.from_date),
        meal_type: { id: mealType.id, name: mealType.name },
      };
      if (recipe) {
        body.recipe = {
          id: recipe.id,
          name: recipe.name,
          keywords: slimKeywords(recipe.keywords),
        };
      }
      if (entry.title) body.title = entry.title;
      if (entry.to_date) body.to_date = appendMidnightIfDateOnly(entry.to_date);
      if (entry.note) body.note = entry.note;
      if (entry.addshopping !== undefined) body.addshopping = entry.addshopping;
      return client.mealPlans.createMealPlan(body);
    })
  );

  const created: Array<Record<string, unknown> & { index: number }> = [];
  const failed: Array<{ index: number; error: string }> = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      created.push({ index: i, ...slimCreated(r.value) });
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      failed.push({ index: i, error: msg });
    }
  });

  const summary = `Batch created ${created.length} of ${args.entries.length} meal plan(s)` +
    (failed.length > 0 ? `; ${failed.length} failed` : '') + '.';
  return `${summary}\n\n${JSON.stringify({ count: args.entries.length, created, failed })}`;
}

// Test-only exports — not part of the public handler surface.
export const __test__ = { appendMidnightIfDateOnly, slimKeywords, slimCreated };
