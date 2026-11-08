---
name: tandoor-setup
description: Set up, enable features in, and troubleshoot the Tandoor Recipes MCP server. Use when the user wants to turn on or enable a Tandoor feature (cook log, AI import, recipe books, pantry, admin), asks what is needed to do something in Tandoor, when a Tandoor tool is not available, when a call fails with 401, 403 or "Tandoor rejected your token", when the token or the connection to Tandoor does not work, when the server warns about the Tandoor version, or when an operator is setting up remote mode behind a reverse proxy.
---

# Tandoor MCP setup and troubleshooting

## A tool or feature is missing

Tools come in sections. Tools load on demand, so search for a tool before you decide it is missing. If it is not available after searching for it, call `list_tool_groups`. It lists every section with its current mode, the modes it accepts, and its tools.

Tiered sections take off, simple or full, and default to simple. Full includes everything in simple. Toggle sections take off or on, and default to off.

| Task | Section | Mode that has it |
|---|---|---|
| Recipe search, create, update, import from a URL | `recipes` | simple |
| Recipe delete, steps, ingredients, images, keyword writes | `recipes` | full |
| Meal plans | `meal-plan` | simple |
| Auto meal plan, bulk create, meal type writes, iCal export | `meal-plan` | full |
| Shopping entries, add a recipe to the shopping list | `shopping` | simple |
| Named shopping lists, supermarkets and categories | `shopping` | full |
| Pantry: add, consume and move items | `inventory` | simple |
| Pantry locations and the inventory log | `inventory` | full |
| Foods, units, ingredient parsing | `foods` | simple or full |
| AI import from a photo, AI step sort, AI properties | `ai` | on |
| Recipe import and export files, import queues | `import-export` | on |
| Cook logs | `cooklog` | on |
| Recipe books | `recipe-books` | on |
| Spaces, households, users, invite links | `household-space` | on |
| Server settings, access tokens, storages, syncs, automations | `admin` | on |

### Local mode (stdio)

Call `enable_tool_group` with the section as group. For a tiered section, pass tier simple or full; the default is full. A toggle section takes no tier. Enabling never narrows a section. The client refreshes its tool list during the conversation. If the new tools do not appear, ask the user to restart the app.

Then tell the user the section and mode you turned on, for example "turned on the `cooklog` section" or "set the `meal-plan` section to full".

The server saves the change per Tandoor URL (scheme, host and port), so it survives a restart. The file is ~/.config/tandoor-mcp/sections.json, or the same path under `XDG_CONFIG_HOME` when that is set to an absolute path. Call `disable_tool_group` to turn a section off again and free context.

Read the result of `enable_tool_group`:

- If it says the section env var is set and will override the saved value on restart, the change lasts for this session only. Tell the user to change that env var or plugin setting.
- If it says the change was not saved, the change also lasts for this session only.
- An "unknown section" error for a real section name means `TANDOOR_MCP_INCLUDE_ONLY` or `TANDOOR_MCP_EXCLUDE` removed every tool in it. Nothing can enable a tool that `TANDOOR_MCP_EXCLUDE` blocks.

### Remote mode (HTTP)

Over HTTP, `enable_tool_group` and `disable_tool_group` fail with "Dynamic tool gating is disabled in HTTP transport mode". The operator's settings fix the sections at startup for every connected user. Tell the user which env var the operator must set, and the value, then restart the server:

| Section | Env var |
|---|---|
| `recipes` | `TANDOOR_MCP_RECIPES` |
| `meal-plan` | `TANDOOR_MCP_MEAL_PLAN` |
| `shopping` | `TANDOOR_MCP_SHOPPING` |
| `inventory` | `TANDOOR_MCP_INVENTORY` |
| `foods` | `TANDOOR_MCP_FOODS` |
| `cooklog` | `TANDOOR_MCP_COOKLOG` |
| `recipe-books` | `TANDOOR_MCP_RECIPE_BOOKS` |
| `ai` | `TANDOOR_MCP_AI` |
| `import-export` | `TANDOOR_MCP_IMPORT_EXPORT` |
| `household-space` | `TANDOOR_MCP_HOUSEHOLD_SPACE` |
| `admin` | `TANDOOR_MCP_ADMIN` |

For example, the auto meal planner needs this setting:

```bash
TANDOOR_MCP_MEAL_PLAN=full
```

## Errors

**403 with "Your API token may not have the required permissions".** This usually means a read-only token tried to write. Reads still work. Ask the user to create a read-write token in Tandoor at /settings/api and use it in place of the old one. Some calls also need the space owner; their 403 says "This call requires the space owner and a read-write token".

**401 with "Authentication failed".** In local mode the token in `TANDOOR_TOKEN`, or the plugin's Tandoor API Token setting, is invalid. Ask for a new token from /settings/api.

**"Tandoor rejected your token. Reconnect this connector to sign in again."** This is remote mode. Tandoor no longer accepts the stored token, usually because the user deleted it in Tandoor or it expired. The server has already ended the connection. Ask the user to reconnect the connector and paste a new token on the sign-in page.

**A WARNING line about the Tandoor version.** The connected Tandoor is older than 2.6.0. Write tools for recipes, meal plans and shopping entries will likely fail. Ask the user to upgrade Tandoor. A warning about a 404 from /api/server-settings/current/ means Tandoor is 1.x, or `TANDOOR_URL` points at the wrong server.

## Remote mode checks (for the operator)

- The connector URL is the full public URL and ends in /mcp, for example https://mcp.example.com/mcp. It must equal `TANDOOR_MCP_PUBLIC_URL` exactly, and its path must equal `TANDOOR_MCP_HTTP_PATH` (default /mcp). The URL must use https.
- The proxy must forward the whole host, not only /mcp, because the OAuth routes live at the root.
- The proxy must pass the original Host header. Without it the server answers 403 and logs host_rejected. In nginx, add this line to the location block:

  ```nginx
  proxy_set_header Host $host;
  ```

- Behind a proxy or tunnel, set `TANDOOR_MCP_TRUST_PROXY`, for example to 1, or every visitor shares one rate limit.
- `TANDOOR_TOKEN` and `TANDOOR_MCP_HTTP_TOKEN` must be unset; the server refuses to start in remote mode when either is set. `TANDOOR_MCP_SECRET_KEY` is required.
- The sign-in page, titled "Connect to Tandoor", asks for a Tandoor API token. Each user creates their own at /settings/api on their Tandoor. If `TANDOOR_URL` is an internal address, set `TANDOOR_MCP_TANDOOR_PUBLIC_URL` so the page links to the address users open.

For the full settings, proxy examples and client steps, see the "Remote mode" section of the project README.
