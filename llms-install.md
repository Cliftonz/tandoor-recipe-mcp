# Install the Tandoor Recipes MCP server in Cline

These steps register `@cliftonz/tandoor-recipes-mcp` as a stdio MCP server in Cline. For Claude, Codex, and other clients, see [README.md](README.md).

Register the server through Cline's own MCP settings. Do not clone or build this repository; `npx` runs the published npm package. Do not write a custom MCP client script. Cline must start the server and call its tools itself.

## Prerequisites

- Node.js 24 or later. Run `node --version` to check.
- A running Tandoor instance that the user's machine can reach.
- A Tandoor API token with write access.

## Step 1: Ask the user for the connection settings

Ask the user for these two values. Do not guess them.

- `TANDOOR_URL`: the base URL of the Tandoor instance, such as `https://recipes.example.com`.
- `TANDOOR_TOKEN`: an API token with write access. The user creates it in Tandoor at **Settings, API Tokens, Create new token**.

## Step 2: Register the server

Use the step for the Cline that you run in.

### Cline CLI

1. Add the server:

	```bash
	cline mcp add tandoor --yes -- npx -y @cliftonz/tandoor-recipes-mcp
	```

	`cline mcp add` has no option for environment variables. It writes the entry to `~/.cline/data/settings/cline_mcp_settings.json`, or to the path in `CLINE_MCP_SETTINGS_PATH` if that variable is set.

2. Open that file. Add an `env` object to the `transport` object of the `tandoor` entry. Keep the other entries in the file. The `tandoor` entry must look like this:

	```json
	"tandoor": {
		"transport": {
			"type": "stdio",
			"command": "npx",
			"args": ["-y", "@cliftonz/tandoor-recipes-mcp"],
			"env": {
				"TANDOOR_URL": "https://recipes.example.com",
				"TANDOOR_TOKEN": "the-users-api-token"
			}
		}
	}
	```

### Cline extension for VS Code and other IDEs

1. In the Cline panel, click the **MCP Servers** icon.
2. Open the **Configure** tab and click **Configure MCP Servers**. Cline opens `cline_mcp_settings.json`.
3. Add this entry under `mcpServers`. Keep the other entries.

	```json
	"tandoor": {
		"command": "npx",
		"args": ["-y", "@cliftonz/tandoor-recipes-mcp"],
		"env": {
			"TANDOOR_URL": "https://recipes.example.com",
			"TANDOOR_TOKEN": "the-users-api-token"
		},
		"disabled": false,
		"autoApprove": []
	}
	```

4. Save the file. Cline starts the server.

To choose which tool sections load, add `TANDOOR_MCP_*` variables to `env`. The defaults suit most users. See [Tool sections](README.md#tool-sections) for the variables and their values.

## Step 3: Verify the server

1. Confirm that `tandoor` is in Cline's list of connected MCP servers.
2. Call the `list_recipes` tool on the `tandoor` server through Cline's MCP tool call. Do not use a script or `curl` for this check.
3. Confirm that the result lists recipes from the user's Tandoor instance. An empty list is correct for an instance that has no recipes.

## Troubleshooting

- **The server exits with "TANDOOR_URL and TANDOOR_TOKEN must be set".** The `env` object is missing or has a misspelled key. In the CLI file, `env` goes inside `transport`.
- **A tool call fails with a connection error or a 404.** `TANDOOR_URL` is wrong. Use the address that opens Tandoor in a browser. The server uses only the scheme, host, and port, and adds `https://` when the scheme is missing. If the instance serves plain HTTP, start the URL with `http://`.
- **A tool call returns "Authentication failed".** Tandoor answered 401. The token is wrong, expired, or deleted. Ask the user for a new token.
- **Reads work but writes return "Access forbidden".** Tandoor answered 403. The token has read access only. Ask the user to create a token with write access.
- **`npx` prints an `EBADENGINE` warning, or the server fails to start.** Run `node --version`. If the version is older than 24, ask the user to install Node.js 24 or later, then restart Cline.
