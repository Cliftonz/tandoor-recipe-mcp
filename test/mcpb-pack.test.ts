// Proves the bundle carries every production dependency (jq-wasm included)
// and nothing from devDependencies.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startStub, Stub } from './helpers/stub-http.js';
import { paginated } from './helpers/factories.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let workDir: string;
let unpacked: string;
let stub: Stub;

beforeAll(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'tandoor-mcpb-test-'));
  const bundle = path.join(workDir, 'tandoor-recipes-mcp.mcpb');
  unpacked = path.join(workDir, 'unpacked');
  execSync(`node scripts/pack-mcpb.js "${bundle}"`, { cwd: REPO, stdio: 'pipe' });
  execSync(`npm run --silent mcpb -- unpack "${bundle}" "${unpacked}"`, { cwd: REPO, stdio: 'pipe' });

  stub = await startStub((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url?.startsWith('/api/server-settings/current/')) {
      return res.end(JSON.stringify({ version: '2.0.0' }));
    }
    if (req.url?.startsWith('/api/recipe/')) {
      return res.end(JSON.stringify(paginated(Array.from({ length: 80 }, (_, i) => ({
        id: i + 1,
        name: `mcpb-recipe-${i + 1}`,
        description: 'Padding so the payload exceeds the stash threshold set below.',
      })))));
    }
    res.statusCode = 404;
    res.end('{}');
  });
}, 300_000);

afterAll(async () => {
  await stub.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('Claude Desktop extension bundle', () => {
  it('ships production dependencies only', () => {
    expect(existsSync(path.join(unpacked, 'node_modules', '@modelcontextprotocol', 'sdk'))).toBe(true);
    expect(existsSync(path.join(unpacked, 'node_modules', 'jq-wasm'))).toBe(true);
    expect(existsSync(path.join(unpacked, 'node_modules', 'vitest'))).toBe(false);
    expect(existsSync(path.join(unpacked, 'node_modules', 'typescript'))).toBe(false);
  });

  it('boots from the manifest config with blank optional settings and runs jq_query', async () => {
    const manifest = JSON.parse(readFileSync(path.join(unpacked, 'manifest.json'), 'utf8'));
    const userValues: Record<string, string> = { tandoor_url: stub.url, tandoor_token: 'tok' };
    const substitute = (s: string) => s
      .replace('${__dirname}', unpacked)
      .replace(/\$\{user_config\.(\w+)\}/, (_, key: string) => userValues[key] ?? '');
    const { command, args, env } = manifest.server.mcp_config;

    const transport = new StdioClientTransport({
      command,
      args: args.map(substitute),
      cwd: tmpdir(),
      env: {
        PATH: process.env.PATH!,
        XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME!,
        TANDOOR_MCP_STASH_THRESHOLD: '500',
        ...Object.fromEntries(Object.entries(env as Record<string, string>).map(([k, v]) => [k, substitute(v)])),
      },
      stderr: 'ignore',
    });

    const client = new Client({ name: 'mcpb-pack', version: '1.0' });
    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.some((t) => t.name === 'list_recipes')).toBe(true);

      const listed = await client.callTool({ name: 'list_recipes', arguments: { page_size: 80 } }) as any;
      expect(listed.structuredContent.stashed).toBe(true);
      const jq = await client.callTool({
        name: 'jq_query',
        arguments: { handle: listed.structuredContent.handle, filter: '.count' },
      }) as any;
      expect(jq.isError).not.toBe(true);
      expect(JSON.parse(jq.content[0].text)).toBe(80);
    } finally {
      await client.close();
    }
  }, 60_000);
});
