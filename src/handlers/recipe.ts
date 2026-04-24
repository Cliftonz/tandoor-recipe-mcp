// Handlers for recipe tools

import { TandoorClient } from '../clients/index.js';
import { Recipe, Ingredient, Step, Keyword } from '../types/index.js';
import type {
  ListRecipesArgs,
  GetRecipeArgs,
  CreateRecipeArgs,
  UpdateRecipeArgs,
  ImportRecipeFromUrlArgs,
  UploadRecipeImageArgs,
  RelatedRecipesArgs,
  AddRecipeToShoppingListArgs,
  SearchRecipesArgs,
  RecipeBatchUpdateArgs,
} from '../tools/recipe.js';
import type { HandlerContext } from '../lib/register.js';

import { emit } from '../lib/slim.js';

// Strip the noisy fields off a Recipe so a single get fits in a normal context.
// Drops: substitute trees, properties, nutrition, image, shared, created_by,
// file_path, plus all *_at timestamps. Keeps everything needed to read or talk
// about the recipe.
export function slimRecipe(recipe: any) {
  if (!recipe || typeof recipe !== 'object') return recipe;
  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    servings: recipe.servings,
    servings_text: recipe.servings_text,
    working_time: recipe.working_time,
    waiting_time: recipe.waiting_time,
    source_url: recipe.source_url,
    rating: recipe.rating,
    last_cooked: recipe.last_cooked,
    internal: recipe.internal,
    keywords: Array.isArray(recipe.keywords)
      ? recipe.keywords.map((k: any) => k?.name ?? k?.label).filter(Boolean)
      : [],
    steps: Array.isArray(recipe.steps)
      ? recipe.steps.map((s: any) => ({
          name: s?.name || undefined,
          instruction: s?.instruction,
          time: s?.time || undefined,
          ingredients: Array.isArray(s?.ingredients)
            ? s.ingredients.map((i: any) => ({
                id: i?.id,
                food: i?.food?.name,
                unit: i?.unit?.name,
                amount: i?.amount,
                note: i?.note || undefined,
                is_header: i?.is_header || undefined,
              }))
            : [],
        }))
      : [],
  };
}

function slimRecipeOverview(r: any) {
  if (!r || typeof r !== 'object') return r;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    servings: r.servings,
    rating: r.rating,
    keywords: Array.isArray(r.keywords)
      ? r.keywords.map((k: any) => k?.name ?? k?.label).filter(Boolean)
      : undefined,
  };
}

// Helper function to process ingredients
async function processIngredients(
  client: TandoorClient,
  ingredients: any[]
): Promise<Ingredient[]> {
  const processedIngredients: Ingredient[] = [];

  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i];
    
    // Find or create food
    const food = await client.recipes.findOrCreateFood(ing.food);
    
    // Find or create unit if provided
    const unit = ing.unit ? await client.recipes.findOrCreateUnit(ing.unit) : null;

    processedIngredients.push({
      food: food as any,
      unit: unit as any,
      amount: ing.amount,
      note: ing.note,
      order: ing.order !== undefined ? ing.order : i,
      is_header: ing.is_header || false,
      no_amount: ing.no_amount || false,
    });
  }

  return processedIngredients;
}

// Helper function to process steps
async function processSteps(
  client: TandoorClient,
  steps: any[]
): Promise<Step[]> {
  const processedSteps: Step[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    const ingredients = await processIngredients(client, step.ingredients || []);

    processedSteps.push({
      name: step.name || '',
      instruction: step.instruction,
      ingredients,
      time: step.time || 0,
      order: step.order !== undefined ? step.order : i,
      show_as_header: step.show_as_header || false,
    });
  }

  return processedSteps;
}

// Helper function to process keywords
async function processKeywords(
  client: TandoorClient,
  keywordNames: string[]
): Promise<Keyword[]> {
  const keywords: Keyword[] = [];

  for (const name of keywordNames) {
    const keyword = await client.recipes.findOrCreateKeyword(name);
    keywords.push(keyword as any);
  }

  return keywords;
}

export async function handleListRecipes(
  client: TandoorClient,
  args: ListRecipesArgs
): Promise<string> {
  const { format, ...listArgs } = args;
  const result = await client.recipes.listRecipes(listArgs);
  if (format === 'full') {
    return emit(result);
  }
  return emit({
    count: result.count,
    next: result.next,
    previous: result.previous,
    results: (result.results || []).map(slimRecipeOverview),
  });
}

export async function handleGetRecipe(
  client: TandoorClient,
  args: GetRecipeArgs
): Promise<string> {
  const recipe = await client.recipes.getRecipe(args.id);
  if (args.format === 'full') {
    return emit(recipe);
  }
  return emit(slimRecipe(recipe));
}

export async function handleCreateRecipe(
  client: TandoorClient,
  args: CreateRecipeArgs
): Promise<string> {
  // Process steps with ingredients
  const steps = await processSteps(client, args.steps || []);
  
  // Process keywords
  const keywords = args.keywords 
    ? await processKeywords(client, args.keywords)
    : [];

  const recipe: Recipe = {
    name: args.name,
    description: args.description,
    servings: args.servings,
    servings_text: args.servings_text,
    working_time: args.working_time || 0,
    waiting_time: args.waiting_time || 0,
    source_url: args.source_url,
    keywords,
    steps,
    internal: args.internal !== false,
    show_ingredient_overview: args.show_ingredient_overview !== false,
    private: args.private || false,
  };
  if (args.nutrition !== undefined) {
    recipe.nutrition = args.nutrition;
  }
  if (Array.isArray(args.properties)) {
    recipe.properties = args.properties.map((p: any) => ({
      id: p.id,
      property_amount: p.property_amount,
      property_type: typeof p.property_type_id === 'number'
        ? { id: p.property_type_id }
        : p.property_type,
    })) as any;
  }

  const created = await client.recipes.createRecipe(recipe);
  const out = args.format === 'full' ? created : slimRecipe(created);
  return `Recipe created successfully!\n\n${emit(out)}`;
}

export async function handleUpdateRecipe(
  client: TandoorClient,
  args: UpdateRecipeArgs
): Promise<string> {
  const { id, ...updateData } = args;
  
  // Build update object
  const updates: Partial<Recipe> = {};
  
  if (updateData.name !== undefined) updates.name = updateData.name;
  if (updateData.description !== undefined) updates.description = updateData.description;
  if (updateData.servings !== undefined) updates.servings = updateData.servings;
  if (updateData.servings_text !== undefined) updates.servings_text = updateData.servings_text;
  if (updateData.working_time !== undefined) updates.working_time = updateData.working_time;
  if (updateData.waiting_time !== undefined) updates.waiting_time = updateData.waiting_time;
  if (updateData.source_url !== undefined) updates.source_url = updateData.source_url;
  if (updateData.internal !== undefined) updates.internal = updateData.internal;
  if (updateData.show_ingredient_overview !== undefined) {
    updates.show_ingredient_overview = updateData.show_ingredient_overview;
  }
  if (updateData.private !== undefined) updates.private = updateData.private;

  // Process steps if provided
  if (updateData.steps) {
    updates.steps = await processSteps(client, updateData.steps);
  }

  // Process keywords if provided
  if (updateData.keywords) {
    updates.keywords = await processKeywords(client, updateData.keywords);
  }

  if (updateData.nutrition !== undefined) {
    updates.nutrition = updateData.nutrition;
  }
  if (Array.isArray(updateData.properties)) {
    updates.properties = updateData.properties.map((p: any) => ({
      id: p.id,
      property_amount: p.property_amount,
      property_type: typeof p.property_type_id === 'number'
        ? { id: p.property_type_id }
        : p.property_type,
    })) as any;
  }

  const updated = await client.recipes.patchRecipe(id, updates);
  const out = args.format === 'full' ? updated : slimRecipe(updated);
  return `Recipe updated successfully!\n\n${emit(out)}`;
}

// Shape of SourceImportRecipe from /api/recipe-from-source/
export interface ScrapedRecipe {
  name?: string;
  description?: string;
  servings?: number;
  servings_text?: string;
  working_time?: number;
  waiting_time?: number;
  source_url?: string;
  image_url?: string;
  keywords?: Array<{ name?: string; label?: string }>;
  steps?: Array<{
    instruction?: string;
    show_ingredients_table?: boolean;
    ingredients?: Array<{
      amount?: number;
      food?: { name?: string };
      unit?: { name?: string } | null;
      note?: string;
      original_text?: string;
    }>;
  }>;
}

export function isUsableScrape(r: ScrapedRecipe | undefined | null): r is ScrapedRecipe {
  return !!(r && r.name && Array.isArray(r.steps) && r.steps.length > 0);
}

// Convert scraped source recipe → ingredients bag compatible with processSteps.
function scrapedStepsToInput(scraped: ScrapedRecipe): any[] {
  return (scraped.steps || []).map((s) => ({
    instruction: s.instruction || '',
    ingredients: (s.ingredients || []).map((i) => ({
      food: i.food?.name || '',
      unit: i.unit?.name,
      amount: typeof i.amount === 'number' ? i.amount : 0,
      note: i.note,
    })).filter((i) => i.food),
  }));
}

export async function saveScrapedRecipe(
  client: TandoorClient,
  scraped: ScrapedRecipe,
  url: string
): Promise<any> {
  const steps = await processSteps(client, scrapedStepsToInput(scraped));
  const keywordNames = (scraped.keywords || [])
    .map((k) => k.name || k.label)
    .filter((n): n is string => !!n);
  const keywords = keywordNames.length
    ? await processKeywords(client, keywordNames)
    : [];

  const recipe: Recipe = {
    name: scraped.name || url,
    description: scraped.description,
    servings: scraped.servings,
    servings_text: scraped.servings_text,
    working_time: scraped.working_time || 0,
    waiting_time: scraped.waiting_time || 0,
    source_url: scraped.source_url || url,
    keywords,
    steps,
    internal: true,
    show_ingredient_overview: true,
    private: false,
  };

  return client.recipes.createRecipe(recipe);
}

async function fetchUrlHtml(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        // Many recipe sites gate bots — present as a regular browser.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    // Propagate aborts so the caller sees cancellation instead of a silent null.
    if ((err as any)?.name === 'AbortError') throw err;
    return null;
  }
}

// ---------- schema.org JSON-LD extractor ----------
// Almost every major recipe site embeds a schema.org `Recipe` as JSON-LD so
// that Google Search can show rich results. Extracting it ourselves is a much
// more reliable fallback than asking Tandoor's scraper a second time.

interface JsonLdRecipe {
  name?: string;
  description?: string;
  recipeYield?: string | number | string[];
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  recipeIngredient?: string[];
  recipeInstructions?: unknown;
  keywords?: string | string[];
  recipeCategory?: string | string[];
  image?: unknown;
}

/** Parse an ISO 8601 duration (PT1H30M, PT45M, PT90S) into whole minutes. */
export function parseIso8601Minutes(d?: string): number {
  if (!d) return 0;
  const m = /^P(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(d.trim());
  if (!m) return 0;
  const h = Number(m[1] || 0);
  const mm = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return Math.round(h * 60 + mm + s / 60);
}

function findRecipeNode(node: any): JsonLdRecipe | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const x of node) {
      const r = findRecipeNode(x);
      if (r) return r;
    }
    return null;
  }
  const t = node['@type'];
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) {
    return node as JsonLdRecipe;
  }
  if (node['@graph']) return findRecipeNode(node['@graph']);
  return null;
}

/** Pull all `<script type="application/ld+json">` blocks out of raw HTML. */
export function extractJsonLdRecipe(html: string): JsonLdRecipe | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Some sites concatenate multiple objects or include trailing commas —
      // give up on this block and try the next.
      continue;
    }
    const r = findRecipeNode(parsed);
    if (r) return r;
  }
  return null;
}

function flattenInstructions(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    // Best-effort sentence split. Cheap but good enough for single-string
    // instruction fields.
    return raw.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const step of raw) {
      if (typeof step === 'string') {
        out.push(step.trim());
      } else if (step && typeof step === 'object') {
        const t = (step as any)['@type'];
        if (t === 'HowToSection' && Array.isArray((step as any).itemListElement)) {
          for (const sub of (step as any).itemListElement) {
            if (typeof sub === 'string') out.push(sub.trim());
            else if ((sub as any)?.text) out.push(String((sub as any).text).trim());
          }
        } else if ((step as any).text) {
          out.push(String((step as any).text).trim());
        }
      }
    }
    return out.filter(Boolean);
  }
  return [];
}

function flattenKeywords(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') return raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  return [];
}

/** Pull out a number of servings from the variously-shaped `recipeYield` field. */
function pickServings(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const m = /\d+/.exec(raw);
    return m ? Number(m[0]) : 1;
  }
  if (Array.isArray(raw) && raw.length > 0) return pickServings(raw[0]);
  return 1;
}

/**
 * Convert a schema.org Recipe into Tandoor's SourceImportRecipe shape so it
 * can be saved via the same `saveScrapedRecipe` pipeline as Tandoor's native
 * scraper output. Each ingredient string is parsed via Tandoor's own
 * `ingredient-from-string` endpoint to stay consistent with the UI's parser.
 */
export async function jsonLdToScrapedRecipe(
  client: TandoorClient,
  jld: JsonLdRecipe,
  url: string
): Promise<ScrapedRecipe> {
  const rawIngredients = Array.isArray(jld.recipeIngredient) ? jld.recipeIngredient : [];
  const parsed = await Promise.all(
    rawIngredients.map(async (s) => {
      const text = String(s || '').trim();
      if (!text) return null;
      try {
        return (await client.ingredients.parseIngredientString(text)) as any;
      } catch {
        // Parser miss — fall back to storing the raw text so the ingredient
        // still shows up, just without structured amount/unit.
        return { amount: 1, unit: '', food: text, note: '', original_text: text };
      }
    })
  );
  const ingredients = parsed.filter(Boolean).map((p: any) => ({
    amount: Number(p.amount) || 0,
    food: { name: String(p.food || p.original_text || 'unknown').trim() },
    unit: p.unit ? { name: String(p.unit).trim() } : null,
    note: p.note || '',
    original_text: p.original_text || '',
  }));

  const instructions = flattenInstructions(jld.recipeInstructions);
  const steps = instructions.length > 0
    ? instructions.map((inst, i) => ({
        instruction: inst,
        show_ingredients_table: i === 0,
        // Attach ingredients to the first step only — mirrors Tandoor's own
        // single-step representation for URL-imported recipes.
        ingredients: i === 0 ? (ingredients as any) : [],
      }))
    : [
        {
          instruction: 'See source URL for instructions.',
          show_ingredients_table: true,
          ingredients: ingredients as any,
        },
      ];

  const kw = [
    ...flattenKeywords(jld.keywords),
    ...flattenKeywords(jld.recipeCategory),
  ];

  return {
    name: String(jld.name || new URL(url).hostname).slice(0, 128),
    description: typeof jld.description === 'string' ? jld.description.slice(0, 512) : undefined,
    servings: Math.max(1, pickServings(jld.recipeYield)),
    working_time: parseIso8601Minutes(jld.prepTime),
    waiting_time: parseIso8601Minutes(jld.cookTime || jld.totalTime),
    source_url: url,
    keywords: kw.map((name) => ({ name, label: name })),
    steps,
  } as ScrapedRecipe;
}

/**
 * Resolve a single name to a Tandoor id via a query-based list lookup. This is
 * intentionally read-only — unlike `findOrCreateFood`, `search_recipes` should
 * never create taxonomy rows as a side effect of a search.
 */
async function resolveName(
  client: TandoorClient,
  kind: 'food' | 'keyword' | 'book',
  name: string
): Promise<number | null> {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;

  let candidates: Array<{ id: number; name: string }> = [];
  if (kind === 'food') {
    const r = await client.foodUnits.listFoods({ query: needle, page_size: 20 });
    candidates = r.results || [];
  } else if (kind === 'keyword') {
    const r = await client.keywords.listKeywords({ query: needle, page_size: 20 });
    candidates = r.results || [];
  } else {
    // Recipe books don't support a `query` filter; list and filter client-side.
    // Books are typically few (<50) so this is cheap.
    const r = await client.recipeBooks.listBooks({ page_size: 100 });
    candidates = r.results || [];
  }

  const exact = candidates.find((c) => (c.name || '').toLowerCase() === needle);
  if (exact) return exact.id;
  // Substring match as a fallback ("chicken breasts" → "chicken").
  const partial = candidates.find((c) => (c.name || '').toLowerCase().includes(needle));
  return partial ? partial.id : null;
}

async function resolveNames(
  client: TandoorClient,
  kind: 'food' | 'keyword' | 'book',
  names: string[] | undefined
): Promise<{ ids: number[]; unresolved: string[] }> {
  if (!names || names.length === 0) return { ids: [], unresolved: [] };
  const pairs = await Promise.all(
    names.map(async (n) => [n, await resolveName(client, kind, n)] as const)
  );
  const ids: number[] = [];
  const unresolved: string[] = [];
  for (const [name, id] of pairs) {
    if (id != null) ids.push(id);
    else unresolved.push(name);
  }
  return { ids, unresolved };
}

export async function handleSearchRecipes(
  client: TandoorClient,
  args: SearchRecipesArgs
): Promise<string> {
  const [foods, excludeFoods, keywords, excludeKeywords, books] = await Promise.all([
    resolveNames(client, 'food', args.foods),
    resolveNames(client, 'food', args.exclude_foods),
    resolveNames(client, 'keyword', args.keywords),
    resolveNames(client, 'keyword', args.exclude_keywords),
    resolveNames(client, 'book', args.books),
  ]);

  const unresolved: Record<string, string[]> = {};
  if (foods.unresolved.length) unresolved.foods = foods.unresolved;
  if (excludeFoods.unresolved.length) unresolved.exclude_foods = excludeFoods.unresolved;
  if (keywords.unresolved.length) unresolved.keywords = keywords.unresolved;
  if (excludeKeywords.unresolved.length) unresolved.exclude_keywords = excludeKeywords.unresolved;
  if (books.unresolved.length) unresolved.books = books.unresolved;

  // Build list_recipes call with resolved IDs.
  const listArgs: any = {};
  if (args.query) listArgs.query = args.query;
  if (foods.ids.length) listArgs.foods_and = foods.ids;
  if (excludeFoods.ids.length) listArgs.foods_and_not = excludeFoods.ids;
  if (keywords.ids.length) listArgs.keywords_or = keywords.ids;
  if (excludeKeywords.ids.length) listArgs.keywords_or_not = excludeKeywords.ids;
  if (books.ids.length) listArgs.books_or = books.ids;
  if (args.rating_gte !== undefined) listArgs.rating_gte = args.rating_gte;
  if (args.rating_lte !== undefined) listArgs.rating_lte = args.rating_lte;
  if (args.timescooked_gte !== undefined) listArgs.timescooked_gte = args.timescooked_gte;
  if (args.timescooked_lte !== undefined) listArgs.timescooked_lte = args.timescooked_lte;
  if (args.makenow !== undefined) listArgs.makenow = args.makenow;
  if (args.random !== undefined) listArgs.random = args.random;
  if (args.sort_order) listArgs.sort_order = args.sort_order;
  if (args.page !== undefined) listArgs.page = args.page;
  if (args.page_size !== undefined) listArgs.page_size = args.page_size;

  const result = await client.recipes.listRecipes(listArgs);

  const slimmed = args.format === 'full'
    ? result
    : {
        count: result.count,
        next: result.next,
        previous: result.previous,
        results: (result.results || []).map(slimRecipeOverview),
      };

  const payload: Record<string, unknown> = { ...slimmed as object };
  if (Object.keys(unresolved).length > 0) {
    payload._meta = {
      unresolved,
      hint: 'Some names did not match any existing food/keyword/book and were dropped from the filter. Browse list_foods / list_keywords / list_recipe_books to confirm the exact names.',
    };
  }
  return emit(payload);
}

export async function handleRelatedRecipes(
  client: TandoorClient,
  args: RelatedRecipesArgs
): Promise<string> {
  const r = await client.recipes.relatedRecipes(args.id);
  if (args.format === 'full') return JSON.stringify(r);
  const results = Array.isArray(r) ? r : r?.results;
  if (!Array.isArray(results)) return JSON.stringify(r);
  return JSON.stringify(results.map((x: any) => ({ id: x.id, name: x.name })));
}

export async function handleAddRecipeToShoppingList(
  client: TandoorClient,
  args: AddRecipeToShoppingListArgs
): Promise<string> {
  const r = await client.recipes.recipeShoppingUpdate(args.id, {
    servings: args.servings,
    ingredients: args.ingredients,
    list_recipe: args.list_recipe,
  });
  return `Recipe ${args.id} added to shopping list.\n\n${JSON.stringify(r)}`;
}

export async function handleUploadRecipeImage(
  client: TandoorClient,
  args: UploadRecipeImageArgs
): Promise<string> {
  if (!args.file_path && !args.file_url && !args.image_url) {
    throw new Error('Provide one of: file_path, file_url, image_url');
  }

  if (args.image_url) {
    // Let Tandoor fetch the URL server-side — no local fetch needed.
    const r = await client.recipes.uploadRecipeImage(args.id, { image_url: args.image_url });
    return `Image set from URL.\n\n${JSON.stringify(r)}`;
  }

  // Load file locally and stream bytes.
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  let data: Buffer;
  let filename: string;
  let mimeType: string;
  if (args.file_path) {
    data = await readFile(args.file_path);
    filename = path.basename(args.file_path);
    mimeType = guessImageMime(filename);
  } else {
    const res = await fetch(args.file_url!);
    if (!res.ok) throw new Error(`Failed to fetch file_url: ${res.status}`);
    data = Buffer.from(await res.arrayBuffer());
    filename = (() => {
      try { return path.basename(new URL(args.file_url!).pathname) || 'image'; } catch { return 'image'; }
    })();
    mimeType = res.headers.get('content-type') || guessImageMime(filename);
  }
  const r = await client.recipes.uploadRecipeImage(args.id, {
    file: { data, filename, mimeType },
  });
  return `Image uploaded.\n\n${JSON.stringify(r)}`;
}

function guessImageMime(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.heic': return 'image/heic';
    default: return 'application/octet-stream';
  }
}

export async function handleImportRecipeFromUrl(
  client: TandoorClient,
  args: ImportRecipeFromUrlArgs,
  ctx?: HandlerContext
): Promise<string> {
  const { url } = args;
  const signal = ctx?.signal;
  const attempts: string[] = [];
  const checkAbort = () => {
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Aborted');
  };

  checkAbort();
  // Attempt 1: let Tandoor scrape the URL directly.
  try {
    const resp = await client.recipes.recipeFromSource({ url });
    if (!resp?.error && isUsableScrape(resp?.recipe)) {
      const saved = await saveScrapedRecipe(client, resp.recipe, url);
      return emit(buildImportResult(saved, 'tandoor-scraper', args.format));
    }
    attempts.push(`tandoor-url: ${resp?.msg || 'no usable recipe returned'}`);
  } catch (err) {
    attempts.push(`tandoor-url: ${err instanceof Error ? err.message : String(err)}`);
  }

  checkAbort();
  // Attempt 2: fetch HTML ourselves and extract schema.org JSON-LD. This is a
  // genuinely different parse path — not a re-submission to the same Tandoor
  // scraper — so it catches cases where Tandoor's server can't reach the URL
  // (firewall / IP block) and cases where Tandoor's extractor doesn't support
  // the site's markup.
  const html = await fetchUrlHtml(url, signal);
  if (html) {
    const jld = extractJsonLdRecipe(html);
    if (jld) {
      try {
        const scraped = await jsonLdToScrapedRecipe(client, jld, url);
        if (isUsableScrape(scraped)) {
          const saved = await saveScrapedRecipe(client, scraped, url);
          return emit(buildImportResult(saved, 'json-ld-fallback', args.format));
        }
        attempts.push('json-ld: recipe object found but unusable (missing name or steps)');
      } catch (err) {
        attempts.push(`json-ld: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      attempts.push('json-ld: no schema.org Recipe found in page');
    }
  } else {
    attempts.push('fetch-html: request failed or returned non-ok status');
  }

  // Attempt 3: stub recipe — only if explicitly opted in.
  if (args.create_stub_on_failure === true) {
    const stubName = args.name || (() => {
      try { return new URL(url).hostname; } catch { return url; }
    })();

    const stub: Recipe = {
      name: stubName,
      description: `Imported from ${url}. Scraper could not extract content — fill in manually.`,
      source_url: url,
      working_time: 0,
      waiting_time: 0,
      keywords: [],
      steps: [
        {
          instruction: 'Add instructions here.',
          ingredients: [],
        } as any,
      ],
      internal: true,
      show_ingredient_overview: true,
      private: false,
    };
    const saved = await client.recipes.createRecipe(stub);
    return emit(buildImportResult(saved, 'stub', args.format, attempts));
  }

  // Default: surface the failure. No silent writes.
  throw new Error(
    `Could not import ${url}. Retry with create_stub_on_failure=true to write an empty placeholder.\n` +
    `Attempts:\n- ${attempts.join('\n- ')}`
  );
}

type ImportVia = 'tandoor-scraper' | 'json-ld-fallback' | 'stub';

function buildImportResult(
  saved: any,
  via: ImportVia,
  format: 'slim' | 'full' | undefined,
  attempts?: string[]
): Record<string, unknown> {
  const recipe = format === 'full' ? saved : slimRecipe(saved);
  const meta: Record<string, unknown> = { via };
  if (attempts && attempts.length > 0) meta.attempts = attempts;
  return { recipe, _meta: meta };
}

export async function handleRecipeBatchUpdate(
  client: TandoorClient,
  args: RecipeBatchUpdateArgs
): Promise<string> {
  if (!args.recipes || args.recipes.length === 0) {
    throw new Error('recipes must be a non-empty array of recipe IDs');
  }
  const r = await client.recipes.recipeBatchUpdate(args);
  return `Batch-updated ${args.recipes.length} recipe(s).\n\n${emit(r)}`;
}
