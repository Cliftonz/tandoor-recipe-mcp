// Shared test helper for invoking a registered tool the way `callTool`
// would, without spinning up a stdio transport. Reaches into McpServer's
// private registry — confining that to one file means the next SDK rename
// is a one-line fix, not a four-file grep.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export async function invokeTool(
  server: McpServer,
  name: string,
  args: unknown,
): Promise<any> {
  const registered = (server as any)._registeredTools?.[name];
  if (!registered) throw new Error(`tool ${name} not registered`);
  return registered.handler(args, { signal: new AbortController().signal });
}
