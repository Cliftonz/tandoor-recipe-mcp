// `get_version` — lets the LLM (and therefore the user) ask which MCP server
// version is running and what Tandoor version/compatibility was detected at
// startup. Answers from boot-time state; no network call.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import type { VersionCheckResult } from '../lib/version-check.js';

export const getVersionShape = {} as const;

export function registerVersionTools(
  server: McpServer,
  client: TandoorClient,
  mcp: { name: string; version: string },
  versionCheck: VersionCheckResult,
): void {
  registerStringTool(server, client, 'get_version', {
    description:
      'Report this MCP server\'s name/version and the Tandoor server version + compatibility status detected at startup (ok | unsupported | unknown). No arguments; answers from cached startup state without a network call.',
    inputSchema: getVersionShape,
  }, async () =>
    JSON.stringify(
      {
        mcp: { name: mcp.name, version: mcp.version },
        tandoor: {
          version: versionCheck.version ?? null,
          status: versionCheck.status,
          detail: versionCheck.detail,
        },
      },
      null,
      2,
    ));
}
