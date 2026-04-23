# Changelog

All notable changes to this project are documented in this file.

## 1.2.0 — 2026-04-19

Second polish pass after shipping 1.1.0.

### Added
- **`search_recipes`** — new high-level tool. Accepts food/keyword/book *names* and resolves them internally; typically collapses 3-4 round-trips into 1. Returns `_meta.unresolved` when names don't match so the caller knows what was dropped.
- **`serverInfo.instructions`** — one-paragraph steering message sent on MCP initialize, pointing the model at resources + prompts before a 100-tool scan.
- **`TANDOOR_MCP_LOG`** env var — stderr-log request/response/error traces with bearer token redacted. Accepts `request`, `response`, `error`, `all`, or comma lists.
- **AbortSignal threading** — MCP's `extra.signal` reaches long-running handlers (URL import) via a `HandlerContext` 3rd arg. URL import checks for abort at each stage and forwards the signal into `fetch()`. Base client honors the signal and skips retry on abort.
- **npm provenance CI** — `.github/workflows/publish.yml` publishes on `v*` tags with `--provenance` (sigstore attestation linking the package to the GitHub Actions build).

### Changed
- **Import return shape**: `import_recipe_from_url` returns `{recipe, _meta: {via, attempts?}}` instead of the "Imported via X.\n\n{json}" string. Cleaner for `structuredContent` consumers.
- **Shared slim helpers**: new `src/lib/slim.ts` with `emit`, `slimPaginated`, `refId`, `slimResponse`. Replaced 8 per-handler copies.
- **Race-safe find-or-create**: `findOrCreateFood/Unit/Keyword` catch uniqueness-violation responses and re-lookup, returning whichever writer won.

### Tests
- 49 → 78 tests. New `test/handlers-full.test.ts` covers payload shaping (nested `{id:n}` envelopes, shared/null handling), slim library helpers, find-or-create-via-names in steps, and the full `search_recipes` resolution path.

## 1.1.0 — 2026-04-18

Polish pass informed by an HN-commenter-style self-review.

### Added
- **Resources**: `tandoor://meal-plan/this-week`, `tandoor://pantry/on-hand`, `tandoor://shopping-list/active`, `tandoor://meal-types`. Clients can subscribe without calling a tool.
- **Prompts**: `plan_week`, `grocery_list_for_plan`, `what_can_i_make_tonight`, `import_and_plan` — user-invokable `/` templates.
- **`structuredContent`** on every tool response alongside `text` — MCP clients that support it skip the JSON re-parse round-trip.
- **`TANDOOR_MCP_PROFILE`** env (`basic` | `full`) gates which tool groups register — `basic` exposes ~40 core tools + resources + prompts.
- **`TANDOOR_MCP_INCLUDE_ONLY`** / **`TANDOOR_MCP_EXCLUDE`** env vars for fine-grained per-tool filtering with `*` glob support. Compose with `TANDOOR_MCP_PROFILE`.
- **schema.org JSON-LD fallback** for URL import — a genuinely different parse path (not a re-submission to Tandoor's scraper). Parses `@graph`, `HowToStep`/`HowToSection`, ISO-8601 durations.
- **`create_stub_on_failure`** opt-in flag on `import_recipe_from_url` — replaces the previous write-amplification behavior where every failure wrote a junk recipe.

### Changed
- **Typed every handler** — inferred Zod shapes flow from `src/tools/*.ts` via exported `*Shape` consts + `z.infer` aliases into handler signatures. Eliminated all 67 `args: any` occurrences and the `cb as any` cast in `src/lib/register.ts`.
- **MCP server version** now read from `package.json` at runtime — no more hard-coded `'1.0.0'` drift.
- **`dotenv`** moved to `devDependencies` and dynamic-imported only when available. Production `npx` installs are smaller and faster.
- **Retry/backoff on 429 / 5xx / network errors** in `BaseClient` with jittered exponential backoff and `Retry-After` header support.
- **Bearer token redacted** from all error messages.
- **README** rewritten — differentiators lead, 3 example conversations, full tool catalog by profile, env var table.

### Tests
- 24 → 49 tests across 7 files. New coverage: `structuredContent` detection, `TANDOOR_MCP_*` filter logic, MCP-boundary Zod rejection via `InMemoryTransport`, JSON-LD extraction edge cases, URL-import 3-stage fallback chain with mocked `fetch`.

## 1.0.0 — Initial fork

Full Tandoor API coverage (~100 tools) under `@cliftonz/tandoor-recipes-mcp`.

- Recipes, meal plans, ingredients, steps, shopping lists, cook logs, recipe books, foods, units, keywords, supermarket categories, property types, custom filters, unit conversions, automations, user files, user prefs, activity logs.
- URL recipe import with Tandoor-scraper-first fallback chain.
- AI recipe import from image/PDF via Tandoor AI providers (`import_recipe_from_image`).
- Recipe image upload (local bytes or image_url passthrough).
- Slim-by-default JSON output; `format: "full"` opt-in for raw API responses.
- High-level `McpServer` + Zod input-schema registration pattern.
- Single-read fix for response bodies (no more "Body is unusable" on errors).
- Correct nested `{id: n}` payload shape for MealPlan/Ingredient/ShoppingListEntry writes.
- Vitest test suite (unit + mocked HTTP + server-boot smoke).
- GitHub Actions CI (Node 20 + 22).

- Full Tandoor API coverage: recipes, meal plans, ingredients, steps, shopping lists, cook logs, recipe books, foods, units, keywords, supermarket categories, property types, custom filters, unit conversions, automations, user files, user prefs, activity logs.
- URL recipe import with 3-stage fallback (Tandoor scraper → fetched HTML → stub).
- AI recipe import from image/PDF via Tandoor AI providers (`import_recipe_from_image`).
- Recipe image upload (local bytes or image_url passthrough).
- Slim-by-default JSON output; `format: "full"` opt-in for raw API responses.
- High-level `McpServer` + Zod input-schema registration pattern.
- Single-read fix for response bodies (no more "Body is unusable" on errors).
- Correct nested `{id: n}` payload shape for MealPlan/Ingredient/ShoppingListEntry writes.
- Vitest test suite (unit + mocked HTTP + server-boot smoke).
- GitHub Actions CI (Node 20 + 22).
