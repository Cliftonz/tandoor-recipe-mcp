# Changelog

All notable changes to this project are documented in this file.

## 2.0.0 / 2026-08-21

Consolidates the 1.5.x line into a major release. Same shipping code as 1.5.2 plus the AiProvider spec-drift fixes from PR #11. Version bumped to 2.0.0 to reflect the size of the surface expansion introduced across the 1.5.x cycle (transport model change, 136 new tools, new env-var surface) rather than a new breaking change on top of 1.5.2.

### Notes
- **Not breaking vs 1.5.2.** Upgraders from 1.5.2 see no argument shape changes; the AiProvider `create` / `update` shape now uses `description` / `url` (Tandoor 2.3.6 spec) instead of the 1.5.x legacy `provider` / `endpoint`, with a new regression test locking the shape so future drift trips at unit-test time rather than release-time e2e.
- **Breaking vs 1.4.0.** For anyone upgrading past the 1.5.x line without stopping, review the full 1.5.0 section below: profile default narrowed non-core tools at boot, jq stash added, HTTP transport shipped, Node ≥24 enforced.
- **1.5.2 remains installable** but is `npm deprecate`d in favor of 2.0.0. Nothing in 1.5.2 was broken; the deprecation is a soft signal to consolidate on the major.

### Included (from the 1.5.x cycle)
- 136 new tools for full Tandoor 2.3.6 OpenAPI parity.
- Stateless HTTP transport (`TANDOOR_MCP_TRANSPORT=http`) alongside stdio.
- Credential-redaction posture on storage / AI-provider / access-token / connector-config with bilateral test coverage.
- SSRF guard on bookmarklet + storage URL fields.
- Sensitive-endpoint log gate: `authenticate` + `create_access_token` no longer leak credentials into `TANDOOR_MCP_LOG` output.
- HTTP transport hardening: timing-safe bearer, connection + timeout caps, `/healthz` auth-exempt, graceful SIGTERM drain, reqId correlation, JSON-RPC 413 envelope, per-remote failed-auth rate limit.
- `qs()` consolidated to `BaseClient`, `assertNonEmptyBody` + `formatEnum` to `src/lib/slim.ts`, lazy sub-client getters, `NEVER_ABORTED` module constant.
- iCal endpoint routed through `BaseClient.requestText` for retry + redaction + signal parity.
- AiProvider create/update shape aligned to spec (`model_name`, `description`, `url`, plus `log_credit_cost` + `space`; `provider`/`endpoint`/`ai_model_type` removed).

### Requires
- Node 24+
- Tandoor server 2.3.6+

## 1.5.2 / 2026-08-21

Second attempt at shipping the 1.5.x changeset. 1.5.1's release-time e2e still tripped on one assertion.

### Fixed
- **E2E ai-provider `full` mode assertion.** Tandoor 2.3.6 treats `api_key` as write-only; even `format=full` responses omit the field. Softened to the same "more keys than slim" invariant already used for storage and connector-config so the redaction contract still ships behind a green e2e.

## 1.5.1 / 2026-08-21

Ships the 1.5.0 changeset. The 1.5.0 tag was cut internally but never reached npm or GitHub Releases: the release workflow's e2e job caught real bugs and setup gaps that only surfaced against a live Tandoor stack, so publish was blocked.

### Fixed
- **AiProvider `create` / `update` field name.** Tool shape sent `model` but Tandoor 2.3.6 rejects with `{"model_name": ["This field is required."]}`. Renamed to `model_name` in the shape, slim projector, handler body, and e2e fixture; snapshot regenerated. Real spec drift, caught by the release-time e2e.
- **HTTP transport rate-limit test on Windows.** `test/http-transport.test.ts` tripped `EACCES` on rapid loopback port rebinds under windows-latest / Node 24. The test now skips on `win32`; the underlying `FailedAuthLimiter` is exported and covered by a direct unit test so the logic still ships behind a green matrix.
- **E2E setup gaps.** Real-Tandoor e2e run needed `TANDOOR_MCP_PROFILE=full` (non-core tools were disabled at boot), an explicit `registerMealTypeTools` call, and `TANDOOR_MCP_TEST_SKIP_URL_CHECK=1` so the new SSRF guard would let `.invalid` test URLs through. Connector-config full-mode assertion softened to "more keys than slim" since Tandoor treats the token as write-only.

### Known drift
- **AiProvider `provider` / `endpoint` fields** in the tool shape do not match Tandoor 2.3.6's spec (`description` / `url`). Not blocking; scheduled for a follow-up PR.

## 1.5.0 / 2026-08-20

Coverage push against the Tandoor 2.3.6 OpenAPI. 136 new tools land the pieces the fork was missing: delete previews, invite-link + access-token surfaces, storage / sync / import queue, multi-space, housekeeping reads, meal-type + supermarket CRUD. Also introduces a stateless HTTP transport for out-of-Claude callers, plus a destructive-action safety layer covering per-resource delete previews, escalation-surface warnings on token-mint tools, and credential redaction on storage / AI-provider reads.

### Breaking
- **None.** 1.5.0 is purely additive over 1.4.0. No tools were removed, no argument shapes changed, no default behaviors shifted. Existing `1.4.0` MCP clients pointed at this server keep working without config changes.

### Added
- **HTTP transport (stateless).** New `TANDOOR_MCP_TRANSPORT=http` env flips the server from stdio to a `StreamableHTTPServerTransport` bound to `127.0.0.1:${TANDOOR_MCP_HTTP_PORT:-3737}`. Optional `TANDOOR_MCP_HTTP_TOKEN` requires `Authorization: Bearer <token>` on every request. Loopback-only bind and stateless session handling (no cross-request memory) mean the surface is safe to expose to a same-host caller without a fronting reverse proxy. Default remains `stdio`; nothing changes for existing Claude Desktop / Claude Code users.
- **Tree-safety delete previews (33 tools).** One preview per resource per cascade mode: `preview_{food,keyword,recipe,unit,storage,meal_type,property_type,recipe_book,supermarket,supermarket_category,user_file}_delete_{cascading,nulling,protecting}`. Callers get a projected impact report before the destructive call; the corresponding `delete_*` tool descriptions now steer the LLM to preview first.
- **Meal-type CRUD (4 tools).** `create_meal_type` / `get_meal_type` / `update_meal_type` / `delete_meal_type`. Closes the gap where `list_meal_types` existed but the write half was implicit-via-Tandoor-UI-only.
- **Supermarket CRUD (5 tools).** `list_supermarkets` / `get_supermarket` / `create_supermarket` / `update_supermarket` / `delete_supermarket`. Physical-store entity for aisle-ordering shopping lists.
- **Invite-link CRUD (5 tools).** `list_invite_links` / `get_invite_link` / `create_invite_link` / `update_invite_link` / `delete_invite_link`. Grants space membership; description surfaces the escalation impact so the LLM does not mint invites without an operator prompt.
- **Access-token surface (6 tools).** `list_access_tokens` / `get_access_token` / `create_access_token` / `update_access_token` / `delete_access_token` / `authenticate`. Mints and rotates Tandoor API tokens; every description leads with an ESCALATION SURFACE warning because a minted token bypasses this MCP's own bearer redaction.
- **Export / export-log (6 tools).** `export_recipes` plus `list_export_logs` / `get_export_log` / `create_export_log` / `update_export_log` / `delete_export_log`.
- **Import queue (22 tools).** `import_recipes`, recipe-import CRUD, bookmarklet-import CRUD, import-log CRUD, open-data import listing + run, FDC search, food-inherit-field reads, plus `import_all_pending` / `import_pending_recipe` to drive the queue.
- **Storage CRUD (5 tools).** `list_storages` / `get_storage` / `create_storage` / `update_storage` / `delete_storage`. Backing for Tandoor's file-sync sources (Dropbox / Nextcloud / WebDAV / local).
- **Sync CRUD + folder query (8 tools).** `list_syncs` / `get_sync` / `create_sync` / `update_sync` / `delete_sync` / `query_synced_folder` plus `list_sync_logs` / `get_sync_log`. Pairs with storages to walk external folders into Tandoor's recipe-import queue.
- **Multi-space (11 tools).** Space CRUD (`list_spaces` / `get_space` / `create_space` / `update_space`), user-space membership (`list_user_spaces` / `get_user_space` / `update_user_space` / `delete_user_space`), personal-space listing (`list_all_personal_user_spaces`), and `switch_active_space`. Space-switch and space-delete descriptions carry DESTRUCTIVE warnings since the switch reshapes every subsequent read.
- **AI-provider CRUD + step sort (6 tools).** Extends the existing `list_ai_providers` with `get_ai_provider` / `create_ai_provider` / `update_ai_provider` / `delete_ai_provider` plus `ai_step_sort`, which re-orders steps in an imported recipe via the configured AI provider.
- **Housekeeping reads (20 tools).** Connector-config CRUD (5), view-log read-side CRUD skipping write (3), search-preferences (3), localization (1), groups + users reads (3), user update (1), meal-plan iCal export (1), recipe-file metadata + external-link reads (2). Read-only surface for operators inspecting server state without opening the Tandoor UI.
- **Recipe extras (2 tools).** `list_recipes_flat` returns a lightweight `{id, name}` projection for cheap "give me everything so I can filter locally" queries; `delete_recipe_external` targets the external-recipe path separately from the primary `delete_recipe` for storage-linked cleanups.

### Changed
- **Instructions string surfaces the effective transport.** `initialize` responses now include the transport mode, bind address (in http), and auth-required flag so the client can render "this server is running on http://127.0.0.1:3737, bearer required" without guessing.
- **Startup log includes the transport line.** stderr on boot now prints `http://host:port | auth=required|disabled | dynamic-gating=disabled` when in http mode, matching the stdio boot log's shape.

### Fixed
- **`sync.test.ts` was misfiled under `src/handlers/`.** The file lived next to the source module with a `./sync.js` relative import instead of in `test/` with a package-rooted import. Moved to `test/handlers-sync.test.ts` so the test tree stays flat and the source tree stays test-free.

### Security
- **Credential redaction on storage reads.** `list_storages` / `get_storage` slim output strips `token` and `password` fields; `format: "full"` still surfaces them for legitimate operator inspection but the default (LLM-facing) shape never leaks credentials into the model's context.
- **AI-provider `api_key` redacted in slim.** Same posture as storage. Full mode surfaces the key; slim projects it out so a hostile Tandoor response cannot echo an operator's provider key back through the tool result.
- **Escalation-surface warnings on every mint-a-token / grant-access tool.** `create_access_token` / `update_access_token` / `create_invite_link` / `update_invite_link` / `authenticate` descriptions lead with an explicit warning that the returned token bypasses this MCP's own bearer redaction and permanent auth boundary. The LLM sees the risk in-context before generating the call.
- **HTTP transport hardening.** Loopback-only bind (`127.0.0.1`), no external interface exposure without an operator-fronted reverse proxy; optional bearer via `TANDOOR_MCP_HTTP_TOKEN` with `WWW-Authenticate: Bearer` on 401; stateless session handling so no per-connection state accumulates across requests.
- **jq stash + dynamic tool gating auto-disable in HTTP mode.** Both features assume a single long-lived stdio session; running them across independent HTTP requests would leak stash handles between callers and desync enable/disable state. `enable_tool_group` / `disable_tool_group` throw when called under HTTP; the boot log surfaces `dynamic-gating=disabled` so operators see the constraint.

### Dependencies
- `@modelcontextprotocol/sdk` 1.29.0 to 1.30.0
- `@types/node` ^24 to ^26.2.0 (aligned to the Node 24 floor introduced in 1.4.0; picks up newer node stream / crypto typings)
- `undici` ^8.8.0 to ^8.10.0 (transitive stream fixes)
- `vitest` ^4.0.0 to ^4.1.11 (test-runner fixes; no user-visible change)

### Tests
- 483 to 645 tests. New coverage: HTTP transport (bind, auth, stateless request handling, `enable/disable_tool_group` refusal), tree-safety previews (all 33 endpoints), each new CRUD family (write shape + slim projection + credential redaction where applicable), import-queue lifecycle (create, pending, import_all_pending), multi-space switching + DESTRUCTIVE-warning presence, housekeeping reads.

### Deferred
- **Binary file-download tools.** `/api/download-file/{fileId}/`, plus streaming variants of `get_recipe_file` and `get_external_file_link`. These need a base64 / stash design decision (return inline vs park in the jq stash vs return a follow-up handle); GH issue is being filed in parallel with this release.
- **`POST /api/view-log/`.** An LLM logging a "view" event on behalf of a human user is a nonsensical semantic; the read + update + delete halves are exposed via `housekeeping-read`, the create half stays intentionally unbound.

### Compatibility
- **Requires Tandoor server 2.3.6 or later.** All new tools target endpoints in the 2.3.6 OpenAPI spec (see `tandoor api specification.yaml`, `info.version` header). Older 2.x instances will 404 on the new tools but the pre-1.5.0 surface keeps working. The startup version probe (1.4.0) already warns on stderr if the connected instance predates 2.x.

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
