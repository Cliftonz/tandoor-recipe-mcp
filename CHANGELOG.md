# Changelog

All notable changes to this project are documented in this file.

## 1.2.6 — 2026-04-23

### Fixed
- **`create_meal_plan` / `update_meal_plan`** — Tandoor's `MealPlanSerializer` rejects the bare `{id: N}` nested envelope we were sending. Handlers now hydrate `recipe` to `{id, name, keywords}` and `meal_type` to `{id, name}` via a parallel `GET /api/recipe/{id}/` + `GET /api/meal-type/{id}/`, coerce `servings` to a string, and promote bare `YYYY-MM-DD` dates to `YYYY-MM-DDT00:00:00`. Thanks to the `starbuck93/tandoor-mcp-server` README for documenting the contract.

### Security
- **Prompt-injection posture (hostile-Tandoor threat model)** — `create_meal_plan` / `update_meal_plan` no longer echo `recipe.name`, `meal_type.name`, or any `keywords[].name` back through the tool response. Slimmed output returns ids + structural fields only. A hostile or compromised Tandoor instance can no longer inject model-steering content into the LLM's context via these handlers.
- **Keyword payload hardening** — hydrated `recipe.keywords` is capped at 50 entries and projected to `{id, name}` before being forwarded into the write body. Stops bandwidth amplification and closes a mass-assignment exposure if a future Tandoor serializer starts honoring extra keyword fields.
- **Strict hydration shape guard** — `recipe` / `meal_type` GET responses must carry numeric `id` and string `name` or the handler throws a typed error before the write. Previously a misconfigured reverse proxy returning 200+HTML could have cascaded into a `TypeError`.

### Robustness
- **Typed hydration errors** — hydration failures now surface as `Failed to hydrate recipe N for create_meal_plan: <upstream error>` (and update equivalent), so the LLM can tell which leg failed and which tool call triggered it.
- **Retry budget capped on hydration** — `getRecipe` / `getMealType` in the hydration path use `maxRetries: 1` so one flaky upstream can't burn the full retry budget on auxiliary reads. The write itself keeps the default retries. New `TandoorRequestOptions.maxRetries` knob on `BaseClient.request`.
- **AbortSignal threaded through hydration** — `HandlerContext.signal` now propagates into both hydration GETs, matching the pattern used by `import_recipe_from_url` (1.2.0). Caller aborts cancel in-flight hydration instead of leaving orphan requests.

### Tests
- 81 → 125 tests. New integration-layer suite (`test/integration/mealplan.integration.test.ts`) mocks `fetch` with a fixture that replicates Tandoor's real 400 response on bare-`{id}` writes — gives the handler's wire contract end-to-end coverage for the first time. New unit coverage includes `appendMidnightIfDateOnly` ISO boundary cases (date-only / local / UTC / offset), partial-update matrix, hydration null-return guards, error-prefix format, abort-signal + maxRetries threading, keyword cap + strip, `addshopping` tri-state, and `handleAutoMealPlan` guards.

### Housekeeping
- Renamed `ensureDatetime` → `appendMidnightIfDateOnly` — the old name implied validation it never did.
- Removed unused `refId` helper from `src/lib/slim.ts`. Every handler writes `{id: x}` inline; the exported helper had zero call sites and was false signal.

### Shipped
- **Claude Code plugin** (`.claude-plugin/plugin.json` + `marketplace.json`) — one-shot `/plugin install` flow with prompts for `TANDOOR_URL`/`TANDOOR_TOKEN` stored securely, no manual `mcpServers` JSON editing.
- **Committed `.claude/settings.json`** with a read-auto-allow / write-ask permission tier for the MCP's own tools.
- **npm trusted publishing (OIDC)** + `scripts/sync-plugin-version.js` wired to `npm version` so plugin manifests track `package.json` automatically.

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
