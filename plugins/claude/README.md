# Tandoor Recipes MCP

Connects Claude to your own Tandoor Recipes instance: recipes, meal plans, shopping lists, pantry inventory, foods, cook logs, and AI import.

## Requirements

- A Tandoor URL and an API token. Enter both in the plugin settings. The token is stored as sensitive.
- Node.js. The server runs with `npx @cliftonz/tandoor-recipes-mcp@<version>`.

## Tool sections

In the settings, set each tool section to off, simple, or full. During a chat, Claude can turn a section on with `enable_tool_group`. Those changes are saved to `~/.config/tandoor-mcp/sections.json`, or under `$XDG_CONFIG_HOME` when it is set.

## Data

It sends your data only to the Tandoor URL you configure. When you import a recipe or file from a web address, it downloads that page or file. Private and local network addresses are blocked. The saved file holds only the Tandoor URL and section settings.

## Where it runs

This plugin runs in Claude Code. For Claude Desktop Chat and Cowork, use the desktop extension (.mcpb) instead. It is not available on claude.ai web.

## Documentation

Full docs: https://github.com/Cliftonz/tandoor-recipe-mcp#readme
