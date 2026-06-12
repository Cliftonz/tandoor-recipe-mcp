import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerVersionTools } from '../src/tools/version.js';
import { invokeTool } from './helpers/mcp.js';
import type { VersionCheckResult } from '../src/lib/version-check.js';

function makeServer(check: VersionCheckResult) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerVersionTools(server, {} as any, { name: 'tandoor-mcp', version: '1.4.0' }, check);
  return server;
}

describe('get_version', () => {
  it('reports mcp and tandoor versions from startup state', async () => {
    const server = makeServer({ status: 'ok', level: 'note', version: '2.6.9', detail: 'Tandoor 2.6.9 detected.' });
    const res = await invokeTool(server, 'get_version', {});
    const out = JSON.parse(res.content[0].text);
    expect(out.mcp).toEqual({ name: 'tandoor-mcp', version: '1.4.0' });
    expect(out.tandoor).toEqual({ version: '2.6.9', status: 'ok', detail: 'Tandoor 2.6.9 detected.' });
  });

  it('reports null version when the probe was inconclusive', async () => {
    const server = makeServer({ status: 'unknown', level: 'note', detail: 'Could not verify.' });
    const res = await invokeTool(server, 'get_version', {});
    const out = JSON.parse(res.content[0].text);
    expect(out.tandoor.version).toBeNull();
    expect(out.tandoor.status).toBe('unknown');
  });
});
