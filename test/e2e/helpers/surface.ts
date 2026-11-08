import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TandoorClient } from '../../../src/clients/index.js';
import { checkTandoorVersion } from '../../../src/lib/version-check.js';
import { connectAllTools } from './tools.js';

export interface Surface {
  tandoorVersion: string;
  called: Set<string>;
  raw(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
  call(name: string, args: Record<string, unknown>): Promise<any>;
  close(): Promise<void>;
}

export function textOf(res: CallToolResult): string {
  return res.content.flatMap((c) => (c.type === 'text' ? [c.text] : [])).join('\n');
}

export function bodyOf(text: string): any {
  const start = text.search(/[[{]/);
  return start === -1 ? text : JSON.parse(text.slice(start));
}

export async function openSurface(url: string, token: string): Promise<Surface> {
  const tandoor = new TandoorClient({ url, token });
  const versionCheck = await checkTandoorVersion(tandoor);
  const mcp = await connectAllTools(tandoor, versionCheck);
  const called = new Set<string>();

  async function raw(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    called.add(name);
    return (await mcp.callTool({ name, arguments: args })) as CallToolResult;
  }

  return {
    tandoorVersion: versionCheck.version!,
    called,
    raw,
    async call(name, args) {
      const res = await raw(name, args);
      if (res.isError) throw new Error(`${name} errored: ${textOf(res)}`);
      return bodyOf(textOf(res));
    },
    close: () => mcp.close(),
  };
}
