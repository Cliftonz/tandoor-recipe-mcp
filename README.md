# Tandoor Recipes MCP

[![npm version](https://img.shields.io/npm/v/@clifton/tandoor-recipes-mcp.svg)](https://www.npmjs.com/package/@clifton/tandoor-recipes-mcp)

A Model Context Protocol (MCP) server that gives LLM agents full read/write access to a [Tandoor Recipes](https://tandoor.dev) instance — recipes, meal plans, ingredients, shopping lists, cook logs, nutrition, and AI-powered URL/image imports.

> Turn "plan the week and make me a grocery list" into one prompt.

## Why this server

- **Full Tandoor API coverage** — 100+ typed tools spanning recipes, meal plans, ingredients, steps, shopping lists, cook logs, recipe books, foods, units, keywords, supermarket categories, property types / nutrition, custom filters, unit conversions, automations, user files, user prefs, activity logs.
- **Resources + Prompts, not just tools** — read-only subscribable resources like `tandoor://meal-plan/this-week` and `tandoor://pantry/on-hand`, plus ready-made prompts (`plan_week`, `grocery_list_for_plan`, `what_can_i_make_tonight`). Most Tandoor MCP forks ship tools only.
- **Slim-by-default responses** — a full recipe GET shrinks from ~20k characters to ~2k by stripping substitute trees, readonly timestamps, image URLs, etc. Pass `format: "full"` anywhere for the raw Tandoor response.
- **3-stage URL import with a real fallback** — tries Tandoor's native scraper first, then extracts schema.org JSON-LD from the page ourselves (works when Tandoor can't reach the URL or doesn't support the site), with an optional stub-on-failure escape hatch.
- **AI import from images / PDFs** — multipart upload to Tandoor's `ai-import/` endpoint, saves the parsed recipe.
- **Validated inputs** — every tool has a Zod input schema; invalid calls are rejected at the MCP boundary before reaching the handler.
- **Transport-safe** — retries with jittered backoff on 429 / 5xx, redacts your bearer token from error messages, reads response bodies exactly once (no "Body is unusable" footguns).
- **`structuredContent` + text** — clients that support structured output skip a JSON re-parse round-trip; older clients still get `text` content.

## Install

```bash
npm install -g @clifton/tandoor-recipes-mcp
```

Or `npx` without installing:

```bash
npx -y @clifton/tandoor-recipes-mcp
```

## Configure

1. In Tandoor: **Settings → API Tokens → Create new token**.
2. Point your MCP client at the server.

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "tandoor": {
      "command": "npx",
      "args": ["-y", "@clifton/tandoor-recipes-mcp"],
      "env": {
        "TANDOOR_URL": "https://your-tandoor-instance.com",
        "TANDOOR_TOKEN": "your-api-token",
        "TANDOOR_MCP_PROFILE": "full"
      }
    }
  }
}
```

### Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `TANDOOR_URL` | ✅ | — | Base URL of your Tandoor instance |
| `TANDOOR_TOKEN` | ✅ | — | API token with write access |
| `TANDOOR_MCP_PROFILE` | — | `full` | `basic` exposes core tools only (~40); `full` includes everything (~100) |
| `TANDOOR_MCP_INCLUDE_ONLY` | — | — | Comma-separated allowlist (glob `*` supported). E.g. `list_*,get_*,create_meal_plan` |
| `TANDOOR_MCP_EXCLUDE` | — | — | Comma-separated denylist. E.g. `merge_*,delete_*` to hide destructive tools |
| `TANDOOR_MCP_LOG` | — | — | Stderr trace mode. `request`, `response`, `error`, `all`, or comma list. Bearer token redacted. |

The `basic` profile is useful when context size matters — every MCP client loads every tool schema into the model's context on startup. `INCLUDE_ONLY` and `EXCLUDE` compose on top of the profile for finer control (e.g. "give me only read tools" or "hide destructive ops from this agent").

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
> 1. `import_recipe_from_url({url: "..."})` — JSON-LD extraction handles sites Tandoor doesn't know
> 2. `create_meal_plan({recipe_id, meal_type_id: <Dinner>, from_date: "2026-04-24", servings: 4})`

**Cook log:**

> You: "Log that I made the Thai green curry last night — 4 out of 5, kids loved it."
>
> Claude: `create_cook_log({recipe: <id>, rating: 4, comment: "Kids loved it", servings: 4})`

## Tool catalog

All write-returning tools default to a slim JSON shape. Pass `format: "full"` for the raw Tandoor response.

### Recipes
`search_recipes` · `list_recipes` · `get_recipe` · `create_recipe` · `update_recipe` · `import_recipe_from_url` · `upload_recipe_image` · `related_recipes` · `add_recipe_to_shopping_list` · `recipe_ai_properties`

`search_recipes` is the preferred high-level entry point: it accepts food/keyword/book *names* (not IDs) and resolves them internally. Use `list_recipes` only for the raw ID-based filter surface.

`list_recipes` takes the full Tandoor filter surface: `query`, `sort_order`, `rating[_gte|_lte]`, `timescooked[_gte|_lte]`, `cookedon_[gte|lte]`, `keywords[_or|_and|_or_not|_and_not][]`, `foods[...]`, `books[...]`, `makenow`, `new`, `random`, `internal`, `filter`, date ranges, pagination.

### Meal plans
`list_meal_plans` · `get_meal_plan` · `create_meal_plan` · `update_meal_plan` · `delete_meal_plan` · `auto_meal_plan` · `list_meal_types`

### Ingredients + steps
`list_ingredients` · `get_ingredient` · `create_ingredient` · `update_ingredient` · `delete_ingredient` · `parse_ingredient`
`list_steps` · `get_step` · `create_step` · `update_step` · `delete_step`

### Shopping lists
`list_shopping_entries` · `get_shopping_entry` · `create_shopping_entry` · `update_shopping_entry` · `delete_shopping_entry` · `bulk_check_shopping_entries` · `list_shopping_list_recipes` · `get_shopping_list_recipe` · `create_shopping_list_recipe` · `update_shopping_list_recipe` · `delete_shopping_list_recipe` · `bulk_create_shopping_list_recipe_entries`

### Foods + units + keywords + categories *(full profile)*
`list_foods` · `get_food` · `create_food` · `update_food` · `delete_food` · `merge_food` · `move_food` · `food_shopping_update` · `food_fdc_lookup` · `food_ai_properties`
`list_units` · `get_unit` · `create_unit` · `update_unit` · `delete_unit` · `merge_unit`
`list_unit_conversions` · `get_unit_conversion` · `create_unit_conversion` · `update_unit_conversion` · `delete_unit_conversion`
`list_keywords` · `get_keyword` · `create_keyword` · `update_keyword` · `delete_keyword` · `merge_keyword` · `move_keyword`
`list_supermarket_categories` · `*_supermarket_category_relation`

### Cook log + recipe books *(full profile)*
`list_cook_logs` · `get_cook_log` · `create_cook_log` · `update_cook_log` · `delete_cook_log`
`list_recipe_books` · `get_recipe_book` · `create_recipe_book` · `update_recipe_book` · `delete_recipe_book` · `list_recipe_book_entries` · `get_recipe_book_entry` · `add_recipe_to_book` · `remove_recipe_from_book`

### Nutrition + property types + custom filters *(full profile)*
`list_property_types` · `get_property_type` · `create_property_type` · `update_property_type` · `delete_property_type`
`list_properties` · `get_property` · `create_property` · `update_property` · `delete_property`
`list_custom_filters` · `get_custom_filter` · `create_custom_filter` · `update_custom_filter` · `delete_custom_filter`

### AI imports *(full profile)*
`list_ai_providers` · `import_recipe_from_image` (file path, URL, or text)

### Automations, user files, prefs, logs *(full profile)*
`list_automations` · `*_automation` · `list_user_files` · `*_user_file` · `list_user_preferences` · `get_user_preference` · `update_user_preference` · `get_server_settings` · `get_share_link` · `list_view_logs` · `list_import_logs` · `list_ai_logs`

## Resources

| URI | Purpose |
|---|---|
| `tandoor://meal-plan/this-week` | Monday–Sunday meal plan entries, slimmed to `{id, date, meal_type, recipe_name, servings, note}` |
| `tandoor://pantry/on-hand` | Foods flagged `food_onhand=true` |
| `tandoor://shopping-list/active` | Unchecked, recent shopping entries |
| `tandoor://meal-types` | Breakfast/Lunch/Dinner/etc. with IDs |

## Prompts

| Name | Purpose |
|---|---|
| `plan_week` | Plan 7 days of dinners, optionally pantry-biased and keyword-filtered |
| `grocery_list_for_plan` | Turn this week's meal plan into a shopping list grouped by aisle |
| `what_can_i_make_tonight` | Find makeable recipes ≤ N minutes from on-hand foods |
| `import_and_plan` | Import a URL recipe and schedule it in one shot |

## Development

```bash
git clone https://github.com/Cliftonz/tandoor-recipe-mcp.git
cd tandoor-recipe-mcp
npm install
npm run build
npm test
```

Tests use Vitest and mock `fetch` — no live Tandoor instance needed for the default run.

### End-to-end tests

An opt-in E2E suite exercises the full write path against a real Tandoor instance. **Run it only against a throwaway/isolated Tandoor space** — the suite creates and deletes real rows.

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

## License

MIT
