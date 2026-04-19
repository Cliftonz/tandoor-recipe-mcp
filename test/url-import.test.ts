// Tests for the URL-import handler's fallback chain:
//   1. Tandoor's scraper succeeds
//   2. Tandoor's scraper fails → our JSON-LD extraction succeeds
//   3. Both fail → throws unless create_stub_on_failure=true
//
// Also exercises the pure JSON-LD helpers so regressions in schema.org parsing
// are caught without needing a live Tandoor instance.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  extractJsonLdRecipe,
  parseIso8601Minutes,
  handleImportRecipeFromUrl,
} from '../src/handlers/recipe.js';

const SAMPLE_JSON_LD_PAGE = `
<html>
<head>
  <title>World's Best Lasagna</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "World's Best Lasagna",
    "description": "Cheesy layered pasta.",
    "recipeYield": "12 servings",
    "prepTime": "PT30M",
    "cookTime": "PT2H30M",
    "recipeIngredient": ["1 pound ground beef", "2 cups ricotta"],
    "recipeInstructions": [
      { "@type": "HowToStep", "text": "Brown the beef." },
      { "@type": "HowToStep", "text": "Layer and bake." }
    ],
    "keywords": "italian, pasta, comfort food"
  }
  </script>
</head>
<body>...</body>
</html>
`;

const SAMPLE_GRAPH_PAGE = `
<script type="application/ld+json">
{
  "@context":"https://schema.org",
  "@graph": [
    {"@type":"WebSite","name":"cooking.example"},
    {"@type":"Recipe","name":"Graph Stew","recipeYield":4,
     "recipeIngredient":["salt"],"recipeInstructions":"Mix and serve."}
  ]
}
</script>
`;

const PAGE_WITHOUT_RECIPE = `
<html><head>
<script type="application/ld+json">{"@type":"Article","headline":"Not a recipe"}</script>
</head><body></body></html>
`;

describe('parseIso8601Minutes', () => {
  it('parses hours + minutes', () => {
    expect(parseIso8601Minutes('PT1H30M')).toBe(90);
  });
  it('parses minutes only', () => {
    expect(parseIso8601Minutes('PT45M')).toBe(45);
  });
  it('parses seconds into rounded minutes', () => {
    expect(parseIso8601Minutes('PT90S')).toBe(2); // 90s = 1.5m → rounds to 2
  });
  it('handles fractional values', () => {
    expect(parseIso8601Minutes('PT0.5H')).toBe(30);
  });
  it('returns 0 for junk or missing', () => {
    expect(parseIso8601Minutes(undefined)).toBe(0);
    expect(parseIso8601Minutes('')).toBe(0);
    expect(parseIso8601Minutes('thirty minutes')).toBe(0);
  });
});

describe('extractJsonLdRecipe', () => {
  it('finds a bare Recipe block', () => {
    const r = extractJsonLdRecipe(SAMPLE_JSON_LD_PAGE);
    expect(r).toBeTruthy();
    expect(r!.name).toBe("World's Best Lasagna");
    expect(Array.isArray(r!.recipeInstructions)).toBe(true);
  });

  it('walks @graph to find the Recipe', () => {
    const r = extractJsonLdRecipe(SAMPLE_GRAPH_PAGE);
    expect(r).toBeTruthy();
    expect(r!.name).toBe('Graph Stew');
  });

  it('returns null when no Recipe is present', () => {
    expect(extractJsonLdRecipe(PAGE_WITHOUT_RECIPE)).toBeNull();
  });

  it('skips script blocks that fail to parse as JSON', () => {
    const page = `
      <script type="application/ld+json">{not valid json}</script>
      ${SAMPLE_JSON_LD_PAGE}
    `;
    const r = extractJsonLdRecipe(page);
    expect(r?.name).toBe("World's Best Lasagna");
  });
});

describe('handleImportRecipeFromUrl fallback chain', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function fakeClient(overrides: Record<string, any> = {}) {
    // Minimal stand-in for TandoorClient — just the methods the handler uses.
    return {
      recipes: {
        recipeFromSource: vi.fn(async () => ({ error: true, msg: 'not supported' })),
        createRecipe: vi.fn(async (r: any) => ({ ...r, id: 999 })),
        ...overrides.recipes,
      },
      ingredients: {
        parseIngredientString: vi.fn(async (text: string) => ({
          amount: 1,
          unit: '',
          food: text,
          note: '',
          original_text: text,
        })),
      },
      // `findOrCreateFood/Unit/Keyword` are called by `saveScrapedRecipe`.
      // They live on `client.recipes` in the real client.
      ...overrides,
    } as any;
  }

  it('attempt 1: Tandoor scraper succeeds → saves and returns', async () => {
    const scraped = {
      name: 'Stew',
      steps: [{ instruction: 'stir', ingredients: [] }],
      source_url: 'https://example.test/recipe',
    };
    const client = fakeClient({
      recipes: {
        recipeFromSource: vi.fn(async () => ({ error: false, recipe: scraped })),
        createRecipe: vi.fn(async (r: any) => ({ ...r, id: 42 })),
        findOrCreateFood: vi.fn(async (n: string) => ({ id: 1, name: n })),
        findOrCreateUnit: vi.fn(async (n: string) => ({ id: 2, name: n })),
        findOrCreateKeyword: vi.fn(async (n: string) => ({ id: 3, name: n })),
      },
    });
    const out = await handleImportRecipeFromUrl(client, { url: 'https://example.test/recipe' });
    expect(out).toContain('Imported via Tandoor scraper');
    expect(out).toContain('"id":42');
    // We never had to call fetch — Tandoor did the scrape server-side.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('attempt 2: Tandoor fails, JSON-LD fallback succeeds', async () => {
    const client = fakeClient({
      recipes: {
        recipeFromSource: vi.fn(async () => ({ error: true, msg: 'unsupported site' })),
        createRecipe: vi.fn(async (r: any) => ({ ...r, id: 77 })),
        findOrCreateFood: vi.fn(async (n: string) => ({ id: 10, name: n })),
        findOrCreateUnit: vi.fn(async (n: string) => ({ id: 20, name: n })),
        findOrCreateKeyword: vi.fn(async (n: string) => ({ id: 30, name: n })),
      },
    });
    fetchSpy.mockResolvedValueOnce(new Response(SAMPLE_JSON_LD_PAGE, { status: 200 }));

    const out = await handleImportRecipeFromUrl(client, { url: 'https://example.test/recipe' });
    expect(out).toContain('Imported via JSON-LD fallback');
    expect(out).toContain('"id":77');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('both attempts fail → throws with attempts log', async () => {
    const client = fakeClient({
      recipes: {
        recipeFromSource: vi.fn(async () => ({ error: true, msg: 'unsupported' })),
        createRecipe: vi.fn(async () => {
          throw new Error('should not be called');
        }),
      },
    });
    fetchSpy.mockResolvedValueOnce(new Response(PAGE_WITHOUT_RECIPE, { status: 200 }));

    await expect(
      handleImportRecipeFromUrl(client, { url: 'https://example.test/recipe' })
    ).rejects.toThrow(/Could not import[\s\S]*tandoor-url[\s\S]*json-ld/);
  });

  it('both attempts fail + create_stub_on_failure=true → writes stub', async () => {
    const createRecipe = vi.fn(async (r: any) => ({ ...r, id: 100 }));
    const client = fakeClient({
      recipes: {
        recipeFromSource: vi.fn(async () => ({ error: true, msg: 'nope' })),
        createRecipe,
      },
    });
    fetchSpy.mockResolvedValueOnce(new Response('<html></html>', { status: 200 }));

    const out = await handleImportRecipeFromUrl(client, {
      url: 'https://cool-food.example/lasagna',
      create_stub_on_failure: true,
      name: 'My Manual Lasagna',
    });
    expect(out).toContain('Stub recipe created');
    expect(out).toContain('"id":100');
    expect(createRecipe).toHaveBeenCalledTimes(1);
    // Stub should carry the user-supplied name + source_url.
    const body = createRecipe.mock.calls[0][0];
    expect(body.name).toBe('My Manual Lasagna');
    expect(body.source_url).toBe('https://cool-food.example/lasagna');
  });
});
