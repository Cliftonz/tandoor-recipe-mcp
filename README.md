# Tandoor Recipes MCP

[![npm version](https://img.shields.io/npm/v/@cliftonz/tandoor-recipes-mcp.svg)](https://www.npmjs.com/package/@cliftonz/tandoor-recipes-mcp)

A Model Context Protocol (MCP) server that gives LLM agents full read/write access to a [Tandoor Recipes](https://tandoor.dev) instance: recipes, meal plans, ingredients, shopping lists, cook logs, nutrition, AI-powered URL/image imports, invite/access tokens, storages, sync, spaces, exports, imports, and more.

> Turn "plan the week and make me a grocery list" into one prompt.

## New in 1.5.0

- **271 tools across 21 groups** (up from ~135 across 16 in 1.4.0). Coverage push against the Tandoor 2.3.6 OpenAPI.
- **Stateless HTTP transport** via `TANDOOR_MCP_TRANSPORT=http`, loopback-only bind on `127.0.0.1:3737`, optional bearer auth. See [Transport modes](#transport-modes).
- **33 tree-safety delete previews.** Preview the blast radius before every destructive call.
- **Escalation-surface warnings** on every tool that mints tokens or grants access.
- **Credential redaction on slim reads** for storages (`token`, `password`) and AI providers (`api_key`).
- **New CRUD families:** meal-type, supermarket, invite-link, access-token, export, import queue, storage, sync, multi-space, AI-provider extend + step sort, housekeeping reads.
- **Requires Tandoor server 2.3.6 or later.** See [Tandoor compatibility](#tandoor-compatibility).

## Why this server

- **Full Tandoor 2.3.6 API coverage.** 291 typed tools, spanning every domain the Tandoor OpenAPI exposes.
- **Resources + prompts, not just tools.** Read-only subscribable resources like `tandoor://meal-plan/this-week` and `tandoor://pantry/on-hand`, plus ready-made prompts (`plan_week`, `grocery_list_for_plan`, `what_can_i_make_tonight`). Most Tandoor MCP forks ship tools only.
- **Slim-by-default responses.** A full recipe GET shrinks from ~20k characters to ~2k by stripping substitute trees, readonly timestamps, image URLs, etc. Pass `format: "full"` anywhere for the raw Tandoor response.
- **Per-section tool settings.** One env var per section (recipes, meal plan, shopping, and so on) sets it. Tiered sections take `off`, `simple`, or `full`. Toggle sections take `off` or `on`. In stdio mode the LLM can turn a hidden section on mid-session with `enable_tool_group`. See [Tool sections](#tool-sections).
- **jq stash for large payloads.** Responses larger than 5KB return a stash handle plus a schema summary; the LLM follows up with `jq_query` to project just the fields it needs.
- **3-stage URL import with a real fallback.** Tries Tandoor's native scraper first, then extracts schema.org JSON-LD from the page directly (works when Tandoor can't reach the URL or doesn't support the site), with an optional stub-on-failure escape hatch.
- **AI import from images / PDFs.** Multipart upload to Tandoor's `ai-import/` endpoint, saves the parsed recipe.
- **Two transport modes.** Stdio (default, for Claude Desktop / Claude Code) or stateless HTTP (for out-of-Claude callers).
- **Destructive-action safety layer.** Every tree-shaped delete has a `preview_*` sibling that projects the cascade before it runs; every token-mint tool leads with an ESCALATION SURFACE warning.

## Install

```bash
npm install -g @cliftonz/tandoor-recipes-mcp
```

Or `npx` without installing:

```bash
npx -y @cliftonz/tandoor-recipes-mcp
```

Node 24 or later is required (see `engines.node` in `package.json`).

## Configure

1. In Tandoor: **Settings, API Tokens, Create new token**.
2. Point your MCP client at the server.

### Claude Code, one-shot plugin install

```
/plugin marketplace add Cliftonz/tandoor-recipe-mcp
/plugin install tandoor-recipes-mcp@cliftonz-tandoor
```

Claude Code prompts you for `TANDOOR_URL` and `TANDOOR_TOKEN` on install and stores the token securely. No `mcpServers` JSON editing needed.

### Claude Desktop / Claude Code, manual config

```json
{
  "mcpServers": {
    "tandoor": {
      "command": "npx",
      "args": ["-y", "@cliftonz/tandoor-recipes-mcp"],
      "env": {
        "TANDOOR_URL": "https://your-tandoor-instance.com",
        "TANDOOR_TOKEN": "your-api-token"
      }
    }
  }
}
```

### Recommended Claude Code permissions

The repo ships a `.claude/settings.json` that auto-allows read tools and prompts for everything else. Copy these into your own project's `.claude/settings.json` to reduce permission friction:

```json
{
  "permissions": {
    "allow": [
      "mcp__tandoor__list_*",
      "mcp__tandoor__get_*",
      "mcp__tandoor__preview_*"
    ],
    "ask": [
      "mcp__tandoor__create_*",
      "mcp__tandoor__update_*",
      "mcp__tandoor__delete_*",
      "mcp__tandoor__merge_*",
      "mcp__tandoor__switch_active_space",
      "mcp__tandoor__create_access_token",
      "mcp__tandoor__create_invite_link"
    ]
  }
}
```

## Transport modes

The server ships two transports. Default is `stdio`; opt in to HTTP with an env var.

| Mode | When to use | Auth |
|---|---|---|
| `stdio` (default) | Claude Desktop, Claude Code, any MCP client that spawns the server as a subprocess. | Inherited from parent process. |
| `http` (stateless) | Out-of-Claude callers, local scripts, other agents on the same host. | Optional bearer via `TANDOOR_MCP_HTTP_TOKEN`. |

### HTTP mode

```bash
TANDOOR_URL=https://tandoor.example.com \
TANDOOR_TOKEN=... \
TANDOOR_MCP_TRANSPORT=http \
TANDOOR_MCP_HTTP_PORT=3737 \
TANDOOR_MCP_HTTP_TOKEN=some-long-random-string \
npx -y @cliftonz/tandoor-recipes-mcp
```

The server listens on `http://127.0.0.1:${TANDOOR_MCP_HTTP_PORT:-3737}/mcp` (POST only for JSON-RPC requests). Any other method on that path gets a 405 with `Allow: POST` and a JSON-RPC error body. Auth is checked first, so a request without a valid token gets a 401 instead. The bind is loopback-only; expose it to another host only through an operator-managed reverse proxy.

If `TANDOOR_MCP_HTTP_TOKEN` is set, every request must include `Authorization: Bearer <token>`. Missing or wrong tokens get a 401 with `WWW-Authenticate: Bearer`.

**HTTP-mode constraints:** the jq stash and dynamic tool gating both assume a single long-lived session. In HTTP mode both are auto-disabled: `enable_tool_group` and `disable_tool_group` throw, and every tool response is inlined rather than stashed. The [section settings](#tool-sections) fix the tool list at startup, so set every section you need before you start the server.

## Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `TANDOOR_URL` | yes | none | Base URL of your Tandoor instance. |
| `TANDOOR_TOKEN` | yes | none | API token with write access. |
| `TANDOOR_MCP_TRANSPORT` | no | `stdio` | `stdio` or `http`. |
| `TANDOOR_MCP_HTTP_PORT` | no | `3737` | HTTP-mode port. |
| `TANDOOR_MCP_HTTP_TOKEN` | no | none | HTTP-mode bearer token. If unset, HTTP transport runs open (loopback-only, still). |
| `TANDOOR_MCP_<SECTION>` | no | per section | One variable per tool section, such as `TANDOOR_MCP_RECIPES`. See [Tool sections](#tool-sections) for every variable, its values, and its default. |
| `TANDOOR_MCP_INCLUDE_ONLY` | no | none | Comma-separated allowlist (glob `*` supported). E.g. `list_*,get_*,create_meal_plan`. |
| `TANDOOR_MCP_EXCLUDE` | no | none | Comma-separated denylist. E.g. `merge_*,delete_*` to hide destructive tools. |
| `TANDOOR_MCP_LOG` | no | none | Stderr trace mode. `request`, `response`, `error`, `all`, or comma list. Bearer token redacted. |
| `TANDOOR_MCP_STASH_ENABLED` | no | `1` | Park large tool results in an in-memory cache and return a `{stashed:true, handle, shape}` summary; the LLM calls `jq_query` to extract subsets. Set `0` to disable. Auto-disabled in HTTP mode. |
| `TANDOOR_MCP_STASH_THRESHOLD` | no | `25000` | Stash payloads strictly larger than this many bytes. |
| `TANDOOR_MCP_STASH_MAX_ENTRIES` | no | `32` | LRU cap on stashed handles. |
| `TANDOOR_MCP_STASH_MAX_BYTES` | no | `32000000` | Total-bytes cap on the stash; LRU eviction kicks in past this budget. |
| `TANDOOR_MCP_STASH_TTL_MS` | no | `600000` | Per-entry TTL in milliseconds (default 10 minutes). |

`INCLUDE_ONLY` and `EXCLUDE` run before the section settings and give finer control ("give me only read tools" or "hide destructive ops from this agent").

## Tandoor compatibility

**Minimum:** Tandoor server 2.3.6.

The 1.5.0 tool surface targets the endpoints in the 2.3.6 OpenAPI spec (see `tandoor api specification.yaml`, `info.version` header). Older 2.x instances will 404 on the new tools; the pre-1.5.0 surface still works.

To check your instance version from an LLM session:

```
> Ask: what version of Tandoor am I connected to?
> Claude calls: get_version
> Returns: { mcp: "1.5.0", protocol: "...", tandoor: "2.3.6" }
```

The server also probes `/api/version/` at boot and writes a WARNING to stderr if the connected instance is older than 2.x.

## Migration from 2.x

3.0.0 removes `TANDOOR_MCP_PROFILE` and the old tool-group names. The per-section settings in [Tool sections](#tool-sections) replace both.

- **`TANDOOR_MCP_PROFILE` is ignored.** When it has a value, the server prints one stderr warning.
- **`TANDOOR_MCP_PROFILE=full`:** set every tiered section to `full` and every toggle section to `on`.
- **Claude Code plugin users:** the plugin used to default to `full` (every tool). It now starts with the section defaults. To get more tools back, set `recipes`, `meal_plan`, `shopping`, `inventory`, `foods`, `cooklog`, `recipe_books`, `ai`, `import_export`, `household_space`, and `admin` in the plugin settings.
- **Old group names are gone, with no aliases.** Use the section names in `enable_tool_group`. The always-on group is now `always` (was `core`). The [CHANGELOG](CHANGELOG.md) lists every removed name.

## Migration from 1.4.0

- **Stdio users:** nothing required. No breaking changes, no config edits.
- **HTTP users:** opt in with `TANDOOR_MCP_TRANSPORT=http`. Set `TANDOOR_MCP_HTTP_TOKEN` and expect the jq stash + dynamic gating to be off (both are stdio-session assumptions).

## Tool sections

Each section has one env var. The server trims each value and ignores case. An unset, empty, or whitespace-only variable means the default. If any section variable is invalid, the server stops at startup with one error that names every invalid variable and its valid values.

Tiered sections take `off`, `simple`, or `full` and default to `simple`. `full` includes everything in `simple`.

| Section | Env var | `simple` | `full` adds |
|---|---|---|---|
| `recipes` | `TANDOOR_MCP_RECIPES` | Browse, search, get, related recipes, create, update, import from URL, read keywords. | Delete, steps, ingredients, images, batch update, keyword writes, custom filters, file links, share links. |
| `meal-plan` | `TANDOOR_MCP_MEAL_PLAN` | Meal plan create, read, update, and delete. Read meal types. | Auto-plan, bulk create, meal type writes, iCal export. |
| `shopping` | `TANDOOR_MCP_SHOPPING` | Shopping entry create, read, update, delete, and check. Add a recipe or food to the list. | Shopping-list-recipe create, read, update, and delete. Supermarkets, categories, and category relations. |
| `inventory` | `TANDOOR_MCP_INVENTORY` | List locations, list entries, add, consume, and move. `add_inventory_item` always creates a new entry. `consume_inventory_item` stops at 0 and warns when you consume more than the entry holds. `move_inventory_item` moves a whole entry. | Location create, get, update, and delete. Entry get, update, and delete. The read-only inventory log. Delete previews. Deleting a location also deletes its entries and the log rows of every entry that was ever in it, including entries moved elsewhere since. Deleting an entry deletes its log rows. |
| `foods` | `TANDOOR_MCP_FOODS` | List, get, create, and update foods. Parse an ingredient. List units. | Delete, merge, move, FDC lookup and search, batch update, unit CRUD, unit merge, food inherit fields, unit conversions, properties, and property types. |

Toggle sections take `off` or `on` and default to `off`.

| Section | Env var | Contents |
|---|---|---|
| `cooklog` | `TANDOOR_MCP_COOKLOG` | Cook-log entries: when and how often a recipe was made. |
| `recipe-books` | `TANDOOR_MCP_RECIPE_BOOKS` | Recipe books (collections) and their entries. |
| `ai` | `TANDOOR_MCP_AI` | AI providers, AI recipe import from images, AI step sort and property estimation, AI logs. |
| `import-export` | `TANDOOR_MCP_IMPORT_EXPORT` | Recipe import and export, import queues, bookmarklet and open-data imports, their logs. |
| `household-space` | `TANDOOR_MCP_HOUSEHOLD_SPACE` | Spaces, memberships, households and household assignment, users, groups, invite links, user preferences. Only the space owner can use the household tools and `update_user_space`; Tandoor answers space admins with a 403. |
| `admin` | `TANDOOR_MCP_ADMIN` | Server settings, access tokens, storages, syncs, connectors, automations, user files, view logs, search settings, localization. |

A delete preview (`preview_*_delete_*`) belongs to the same section and tier as its delete tool.

These tools are always on, whatever the section settings: `list_tool_groups`, `enable_tool_group`, `disable_tool_group`, `get_version`, `jq_query`, `jq_stash_stats`, `get_guard_stats`, and `get_current_space`. Every `tandoor://` resource and every prompt is also always available. `list_tool_groups` reports them as the `always` group.

The server applies the settings in this order:

1. `TANDOOR_MCP_INCLUDE_ONLY` and `TANDOOR_MCP_EXCLUDE` filter the tool list. `EXCLUDE` is a hard block: nothing can enable an excluded tool.
2. The section settings decide which of the remaining tools are visible at startup. An `off` section is hidden.

In stdio mode the LLM can change sections during a session:

- `enable_tool_group({group, tier?})` widens a section: `off` to `simple` or `full`, or `simple` to `full`. It never narrows a section. For a tiered section, `tier` is `simple` or `full` and defaults to `full`. Passing `tier` for an on/off section is an error.
- `disable_tool_group({group})` sets a section to `off`. It cannot disable `always`.
- `enable_tool_group({group: "always"})` succeeds and changes nothing.

A section with no registered tools does not count as a section at runtime. That covers any section that `INCLUDE_ONLY` or `EXCLUDE` empties. `enable_tool_group` and `disable_tool_group` reject it as unknown, and `list_tool_groups` and the server instructions leave it out.

From an active session, call `list_tool_groups` for a live listing of sections and their tools.

## Example conversations

**Plan the week + generate a grocery list:**

> You: "Plan dinners for the week biased toward vegetarian recipes I've rated 4+, using what's on-hand where possible. Then give me the shopping list grouped by aisle."
>
> Claude:
> 1. Reads `tandoor://pantry/on-hand` and `tandoor://meal-types`
> 2. Calls `list_recipes({keywords_or: [<vegetarian>], rating_gte: 4, sort_order: '-rating'})`
> 3. Calls `create_meal_plan` for each day of the week
> 4. Calls `add_recipe_to_shopping_list` for each plan
> 5. Reads `tandoor://shopping-list/active` and groups by supermarket category

**Import a recipe from a URL and schedule it:**

> You: "Import https://example.com/lasagna and schedule it for Friday dinner, 4 servings."
>
> Claude:
> 1. `import_recipe_from_url({url: "..."})`, JSON-LD extraction handles sites Tandoor doesn't know
> 2. `create_meal_plan({recipe_id, meal_type_id: <Dinner>, from_date: "2026-04-24", servings: 4})`

**Preview a destructive delete before running it:**

> You: "Delete the 'Test Keyword' keyword."
>
> Claude:
> 1. `preview_keyword_delete_protecting({id: <k>})` to see what recipes still reference it
> 2. If safe: `delete_keyword({id: <k>})`
> 3. If not safe: reports the reference list back to you before proceeding

## Destructive tools

Destructive tools (`delete_*`, `merge_*`, `switch_active_space`, `create_access_token`, `create_invite_link`) are irreversible or expose escalation surface. Their descriptions instruct the model to:

- **For deletes on tree-shaped resources**, call the matching `preview_*_delete_{cascading,nulling,protecting}` first.
- **For merges**, verify `numrecipe` counts and base-unit compatibility first.
- **For token / invite creation**, warn the user before generating the call. Every such description leads with an explicit ESCALATION SURFACE line.

Operators who want them gone entirely can set `TANDOOR_MCP_EXCLUDE="delete_*,merge_*,switch_active_space,create_access_token,create_invite_link"`. The permission config in [Recommended Claude Code permissions](#recommended-claude-code-permissions) makes Claude Code ask before any destructive call.

## Gotchas

### FDC lookups rate-limit after 30 requests/hour

`food_fdc_lookup` delegates to Tandoor, which calls the USDA FoodData Central API. Out of the box Tandoor uses USDA's public `DEMO_KEY`, capped at **30 requests/hour per IP**. Bulk-enriching a grocery list hits that ceiling fast and you'll see 429s on Tandoor's side.

**Fix (takes 2 minutes):**

1. Register a free personal key at [api.data.gov/signup](https://api.data.gov/signup/); no approval needed, instant.
2. Set it on the Tandoor container, **not** the MCP server:

   ```yaml
   # docker-compose.yml, under the tandoor service
   environment:
     - FDC_API_KEY=<your-key>
   ```

   Kubernetes / Helm: add `FDC_API_KEY` to the Tandoor deployment's env or a secret. Restart the Tandoor pod.

3. The limit jumps to **1,000 requests/hour**; plenty for bulk enrichment.

If FDC returns 404 for a food, the `fdc_id` you passed doesn't exist in USDA's database; try `food_ai_properties` as a fallback (uses Tandoor's configured AI provider instead of USDA).

## Resources

| URI | Purpose |
|---|---|
| `tandoor://meal-plan/this-week` | Monday to Sunday meal plan entries, slimmed to `{id, date, meal_type, recipe_name, servings, note}` |
| `tandoor://pantry/on-hand` | Inventory entries by location, plus on-hand foods with no entry; at most 500 of each |
| `tandoor://shopping-list/active` | Unchecked, recent shopping entries |
| `tandoor://meal-types` | Breakfast/Lunch/Dinner/etc. with IDs |

## Prompts

| Name | Purpose |
|---|---|
| `plan_week` | Plan 7 days of dinners, optionally pantry-biased and keyword-filtered |
| `grocery_list_for_plan` | Turn this week's meal plan into a shopping list grouped by aisle |
| `what_can_i_make_tonight` | Find makeable recipes at most N minutes from on-hand foods |
| `import_and_plan` | Import a URL recipe and schedule it in one shot |

## Development

```bash
git clone https://github.com/Cliftonz/tandoor-recipe-mcp.git
cd tandoor-recipe-mcp
npm install
npm run build
npm test
```

Tests use Vitest and mock `fetch`; no live Tandoor instance needed for the default run.

### End-to-end tests

An opt-in E2E suite exercises the full write path against a real Tandoor instance. **Run it only against a throwaway/isolated Tandoor space**; the suite creates and deletes real rows.

```bash
TANDOOR_URL=https://your-tandoor.example \
TANDOOR_TOKEN=... \
npm run test:e2e
```

| Var | Effect |
|---|---|
| `TANDOOR_E2E_KEEP=1` | Skip cleanup; leave created resources for inspection |
| `TANDOOR_E2E_SKIP_IMPORT=1` | Skip the URL-import step (offline runners) |
| `TANDOOR_E2E_IMPORT_URL=<url>` | Override the default recipe URL |
| `TANDOOR_E2E_AI_PROVIDER=<id>` | Run the AI-import step against this provider |

## Security posture

This server treats the configured Tandoor instance as **trusted enough to read+write on your behalf**; you provide the bearer token. It does NOT treat the instance as fully trusted for content:

- **Tool responses from `create_meal_plan` / `update_meal_plan` are slimmed.** Only ids and structural fields flow back to the LLM. User-visible names (`recipe.name`, `meal_type.name`, keyword names) are omitted so a hostile or compromised Tandoor instance can't inject model-steering text into Claude's context via these paths. Call `get_recipe` or `list_meal_types` if you need the human-readable form.
- **Storage `token` / `password` and AI-provider `api_key` are redacted in slim reads.** `format: "full"` still surfaces them for operator inspection. Default (LLM-facing) responses never leak credentials into the model's context.
- **Keyword payloads are capped at 50 entries and projected to `{id, name}`** before being forwarded into writes; stops amplification and mass-assignment exposure.
- **Every mint-a-token / grant-access tool description leads with an ESCALATION SURFACE warning.** `create_access_token`, `update_access_token`, `create_invite_link`, `update_invite_link`, and `authenticate` all warn in-context that the returned token bypasses this MCP's own bearer redaction.
- **Bearer tokens are redacted** from every error message and log line.
- **HTTP transport binds loopback-only** (`127.0.0.1`) with optional bearer auth and stateless session handling. No per-connection state accumulates across requests.

If your Tandoor deployment is single-tenant and you own every recipe, the posture is conservative for your case. If you share a Tandoor instance with untrusted users, or run one exposed to the public internet with anonymous sharing, the hardening above matters.

## License

MIT
