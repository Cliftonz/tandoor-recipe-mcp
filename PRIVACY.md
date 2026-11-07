# Privacy Policy

Last updated: 2026-11-07

This policy covers the Tandoor Recipes MCP server (`@cliftonz/tandoor-recipes-mcp`), including the Claude plugin, the Claude Desktop extension and the Docker image.

## Who is responsible

- **The author** (Zac Clifton) writes and publishes the software. The author does not run a service for it and receives no data from it.
- **The operator** runs a remote deployment. If you connect to a server someone else hosts, that person controls the data on it.
- **Your Tandoor instance** holds your recipe data. Its owner controls that data.

## What the author collects

Nothing. The software has no telemetry, analytics or crash reporting, and it does not contact the author.

## Where data goes

The server connects to these places, and only when needed:

- **Your Tandoor instance.** Every tool call talks to the Tandoor URL that you or the operator configured. At startup the server also asks that Tandoor instance for its version.
- **Web addresses you ask it to import.** When you import a recipe from a web address, the server first asks your Tandoor instance to fetch the page. If that fails, the server downloads the page itself. When you import a file from a web address, the server downloads the file and sends it to Tandoor. The server refuses web addresses that point to private or local networks. A test setting, `TANDOOR_MCP_ALLOW_PRIVATE_FETCH`, relaxes this for some downloads.
- **Sign-in client documents (remote mode only).** When an app signs in with a web address as its client ID, the server downloads the app's client information from that address.

## What is stored, and for how long

### On your computer (local mode)

- **Saved tool sections.** If you change which tool sections are on, the server saves that choice in `~/.config/tandoor-mcp/sections.json`, or in `tandoor-mcp/sections.json` under `$XDG_CONFIG_HOME` if it is set. The file holds only Tandoor URLs and section settings. It stays until you delete it.
- **Downloaded files.** If you set `TANDOOR_MCP_DOWNLOAD_ROOT` and ask the server to save a file, it writes the file to that folder. Files stay until you delete them.

Your Tandoor API token stays in the configuration of the app that starts the server. The server does not write it to disk in local mode.

### On the operator's server (remote mode)

- **Tandoor API tokens.** For each connected user, the server stores the user's Tandoor API token in `oauth.json` in the data folder. The data folder is `TANDOOR_MCP_DATA_DIR` if it is set to an absolute path. Otherwise it is `tandoor-mcp` under `$XDG_DATA_HOME` if that is set to an absolute path, and otherwise `~/.local/share/tandoor-mcp`. In the Docker image the default is `/data`. The token is encrypted with AES-256-GCM using the operator's `TANDOOR_MCP_SECRET_KEY`.
- **Tokens issued to Claude or ChatGPT.** The server stores only a hash of each token it issues, not the token itself.
- **Connections end** when the user revokes them, after 30 days without use, or when Tandoor rejects the stored Tandoor token. The server deletes the record of an expired connection the next time it writes `oauth.json`.
- **App registrations.** Apps that register automatically but never finish signing in are removed after 24 hours.
- **Logs.** The server writes request logs to standard error. In remote mode, rejected tokens and failed sign-ins are rate-limited by IP address but not logged with it. A request with an unexpected Host header is logged as `host_rejected` with that Host value, cut to 64 characters. In the shared-password HTTP mode (`TANDOOR_MCP_HTTP_TOKEN`), a request with a missing or wrong password is logged with the client's IP address (`auth_missing`, `auth_wrong`, and `auth_rate_limited` once the limit is hit). The operator decides whether these logs are kept.

The operator, not the author, controls this data and any backups of it.

## Third parties

- **Claude (Anthropic) or ChatGPT (OpenAI).** You choose which assistant to connect. It sees the tool results that your requests produce, which can include your recipes, meal plans and shopping lists. That assistant's own privacy policy applies to that data.
- **npm.** The Claude plugin installs the server package from the npm registry. npm's privacy policy applies to that download.
- **Websites you import from.** Those sites see a request from your Tandoor instance or from the server when you import from them.

## Contact

Ask questions or report problems through [GitHub Issues](https://github.com/Cliftonz/tandoor-recipe-mcp/issues). For anything sensitive, use a [private security advisory](https://github.com/Cliftonz/tandoor-recipe-mcp/security/advisories/new).

## Changes

Changes to this policy are made in this file. The date at the top shows the last change, and the Git history shows every past version.
