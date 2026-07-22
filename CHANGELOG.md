# Changelog

All notable changes to this project are documented in this file.

## 1.4.0 — 2026-07-21

Dynamic tool gating flips the default surface from "every tool visible" to a ~25-tool core, cutting boot-time context cost for small workflows. Also: worker-isolated jq stash for large payloads, live Tandoor version probe, Node floor bump to 24, single-workflow release pipeline, and a full dependency refresh.

### Breaking
- **Node ≥24 required.** `engines.node` was `>=18`; now `>=24`. npm will refuse installs on older runtimes with `EBADENGINE`. CI runners, Dockerfiles, and Claude Desktop launcher scripts pinned to Node 18/20/22 must upgrade.
- **Default tool visibility narrows from ~131 to ~21.** New `TANDOOR_MCP_PROFILE` env controls the surface: `core` (default) exposes always-on tools plus `enable_tool_group` / `disable_tool_group` / `list_tool_groups` meta tools; `basic` skips admin/misc families; `full` restores prior behavior. Existing workflows that reference gated tools directly must either switch to `full` or call `enable_tool_group` first. Rationale: every MCP client loads every tool schema on `list_tools`; ~135 tools × ~400 tokens each was a real cost for callers only using a handful.

### Added
- **`jq_query` stash** — large tool responses (default >5000 bytes) return a `stash_<uuid>` handle plus a `SchemaSummary` instead of the raw payload. Follow-up `jq_query` calls resolve the handle through worker-isolated `jq-wasm`, letting the LLM narrow the result without re-fetching. Worker enforces a hard 5s timeout + 5MB output cap; pathological filters terminate the worker without freezing the parent. TTL, LRU eviction, and stats surfaced via `jq_stash_stats`.
- **Startup version probe** — server calls `/api/version/` at boot and warns on stderr when the connected Tandoor is pre-2.x, so operators know why some tools may 404 before they hit them.
- **`get_version`** tool — reports MCP server version, protocol version, and connected Tandoor version in one call.
- **`delete_recipe`** tool — round-trip parity with `create_recipe` for cleanup workflows.
- **TANDOOR_URL path stripping** — pasted browser URLs (`https://tandoor.example.com/recipes/`) no longer fail against the API root; the client strips path segments from `TANDOOR_URL` before building endpoint URLs.

### Changed
- **Release pipeline collapsed to a single workflow.** `release.yml` now runs detect → e2e gate → build → test → tag → npm publish → GH release atomically on `package.json` version changes. Removes the GitHub-App-token bridge that the previous two-workflow split required (App install could rotate, uninstall, or fail; default `GITHUB_TOKEN` handles the single workflow cleanly).
- **Prereleases route to npm `next` dist-tag** and are marked as GitHub prereleases, so `npm install -g @cliftonz/tandoor-recipes-mcp` still resolves to the last stable.
- **CI matrix expanded** to Ubuntu + macOS + Windows on Node 24 with an `npm audit` gate.

### Fixed
- **`jq-wasm` module resolution** — resolve from the package's own location instead of `process.cwd()`, so globally-installed / npx-launched servers don't fail with `Cannot find package 'jq-wasm'` when the client launches from a directory without `jq-wasm` in scope.
- **jq worker `Aborted()` noise** — worker stderr is now captured and folded into the exit error message instead of inheriting the parent's stderr, so an Emscripten WASM abort from a pathological filter no longer prints raw `Aborted()` into MCP server logs.

### Security
- **Prompt-injection guards** for the new jq stash surface: handles are opaque UUIDs, unknown/expired handles surface a generic recoverable message without echoing the handle back, and jq results that are themselves oversized get re-stashed instead of returned inline.

### Dependencies
- Added `jq-wasm` @ 3.0.0-jq-1.8.2 (powers the new stash / `jq_query` surface)
- Added `undici` @ 8.8.0 (replaces ad-hoc fetch wrapping; used for streaming uploads)
- `@modelcontextprotocol/sdk` ^1.24.3 → 1.29.0 (pinned)
- `zod` (^3||^4) → ^4.4.3 (drops v3 range)
- `typescript` 5 → 7 (via 6.0.3 stepping stone; NodeNext module resolution)
- `dotenv` 16 → 17
- `@types/node` 22 → ^24 (aligned to `engines` floor)
- `vitest` 2 → 4
- Full `package-lock.json` regeneration to resolve optional-dep platform mismatches

### Tests
- 138 → 483 tests. New coverage: worker-isolated jq (timeout, output cap, worker recycle after abort, module resolution from install location), stash lifecycle (TTL, LRU, re-stash recursion, prompt-injection surface), version probe, path-stripping URL normalization, tool-registration completeness, tool-group gating, workflow shape, and a live end-to-end suite (`test/e2e/tandoor.e2e.test.ts`) that hits a real Tandoor instance and cleans up after itself.

## 1.3.0 — 2026-04-24

Three new batch tools for fewer round-trips on "operate on a set" workflows.

### Added
- **`food_batch_update`** — exposes Tandoor's `/api/food/batch_update/` endpoint. Apply `category`, `on_hand`, substitute links, inherit fields, and parent across many foods in one call. Client method existed since 1.0.0 but had no tool. Typed Zod shape mirrors `FoodBatchUpdate`.
- **`recipe_batch_update`** — exposes Tandoor's `/api/recipe/batch_update/` endpoint. Bulk keyword retagging, bulk share-user changes, bulk servings/working_time/private/etc. Narrow set — no bulk ingredient or step edits.
- **`bulk_create_meal_plans`** — client-side batched `create_meal_plan`. Tandoor has no server-side bulk endpoint here, so the handler dedupes unique recipe_ids + meal_type_ids across entries, hydrates each unique id ONCE in parallel, then POSTs all entries via `Promise.allSettled`. For a 7-entry week plan referencing 3 unique meal_types + 5 unique recipes: drops from 21 HTTP calls to 13, eliminates per-entry retry-budget duplication, and surfaces partial success (`{count, created, failed}`) so the caller can retry only the failed entries.

### Tests
- 125 → 138 tests. New coverage: payload forwarding + empty-array guards for `food_batch_update` / `recipe_batch_update`; dedup behavior, partial-failure aggregation, per-entry validation, abort signal propagation, and prompt-injection slim-response proof for `bulk_create_meal_plans`.

## 1.2.7 — 2026-04-24

### Added
- **FDC rate-limit guidance** — README now documents the USDA `DEMO_KEY` 30 req/hour/IP cap and the 2-minute `FDC_API_KEY` fix on the Tandoor container. `food_fdc_lookup`'s MCP description also surfaces the limit so an agent hitting 429s has the operator fix in-context.
- **In-description fallback/recommendation guidance on 10 tools.** When a tool has a characteristic failure → known alternative, the description tells the agent where to pivot without a human prompt:
  - `food_ai_properties`, `recipe_ai_properties` — no AI provider? Suggest `food_fdc_lookup` when an fdc_id exists, else operator-setup hint.
  - `import_recipe_from_image` — no AI provider? Suggest `import_recipe_from_url` (no AI required) or manual `create_recipe`.
  - `import_recipe_from_url` — all stages failed? Suggest `create_stub_on_failure: true`, `import_recipe_from_image` for image/PDF pages, or manual entry.
  - `list_recipes` — empty result? Suggest broadening or using `search_recipes` (name-resolution).
  - `parse_ingredient` — garbage output? Suggest `create_ingredient` with explicit ids via `find_or_create_*`.
  - `upload_recipe_image` — large-file failure? Suggest `image_url` so Tandoor fetches server-side.
  - `merge_food` / `merge_unit` / `merge_keyword` — destructive; suggest verifying `numrecipe` counts and base-unit compatibility first.
  - `delete_food` / `delete_unit` / `delete_keyword` — destructive; suggest `list_recipes({foods|keywords: [id]})` usage check and `merge_*` as the non-destructive alternative.

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
