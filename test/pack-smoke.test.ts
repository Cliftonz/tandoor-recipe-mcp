// Pack the package into a tarball, install it into a clean temp dir from a
// DIFFERENT working directory, and drive the binary over stdio. Mirrors what
// a real `npx @cliftonz/tandoor-recipes-mcp` user gets.
//
// Catches the class of bug that shipped in rc.2: jq-wasm was resolved via
// `process.cwd()` instead of the package's own install location, so
// everything worked in `npm test` (cwd = repo) and broke under any consumer
// (cwd = user's project). The published tarball is the only test surface
// that catches this — source tests cannot.
//
// To actually exercise jq-wasm (QA F1), the stub returns a payload large
// enough to trip the default stash threshold, and the scenario calls
// jq_query against the returned handle. If jq-wasm resolution regresses,
// jq_query throws MODULE_NOT_FOUND and the stderr filter catches it.

import { describe, it, expect, beforeAll, afterAll, onTestFailed } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startStub, Stub } from './helpers/stub-http.js';
import { paginated } from './helpers/factories.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let installDir: string;
let installedBin: string;
let stub: Stub;
let setupFailed = false;

// Build a payload large enough to comfortably exceed the default stash
// threshold (25KB). This is what forces the jq path to actually load
// jq-wasm during the test.
function bigPayload() {
  return paginated(Array.from({ length: 80 }, (_, i) => ({
    id: i + 1,
    name: `pack-smoke-recipe-${i + 1}`,
    description: `A long description for recipe ${i + 1} that pads the payload past the default 25KB stash threshold. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.`,
    rating: (i % 5) + 1,
    keywords: [{ id: (i % 3) + 1, name: `kw-${(i % 3) + 1}` }],
    working_time: 10,
    waiting_time: 5,
    servings: 4,
    internal: true,
  })));
}

beforeAll(async () => {
  try {
    installDir = mkdtempSync(path.join(tmpdir(), 'tandoor-mcp-pack-'));

    execSync(`npm pack --pack-destination "${installDir}"`, {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tarballName = readdirSync(installDir).find((f) => f.endsWith('.tgz'));
    if (!tarballName) throw new Error(`packed tarball not found in ${installDir}`);

    execSync(
      `npm init -y && npm install --no-audit --no-fund --ignore-scripts "./${tarballName}"`,
      { cwd: installDir, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    installedBin = path.join(installDir, 'node_modules', '@cliftonz', 'tandoor-recipes-mcp', 'build', 'index.js');
    if (!existsSync(installedBin)) {
      throw new Error(`installed binary not found at ${installedBin}`);
    }

    stub = await startStub((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url?.startsWith('/api/server-settings/current/')) {
        return res.end(JSON.stringify({ version: '2.0.0' }));
      }
      if (req.url?.startsWith('/api/recipe/')) {
        return res.end(JSON.stringify(bigPayload()));
      }
      // Top-level bare array — exercises the isJsonObject guard end-to-end
      // through the packed binary, so a regression that re-introduces the
      // rc.x-class "expected: record" failure is caught here too (QA F10).
      if (req.url?.startsWith('/api/meal-type/')) {
        return res.end(JSON.stringify({
          count: 2, next: null, previous: null,
          results: [
            { id: 1, name: 'Breakfast', order: 0, color: '#ff0', default: true },
            { id: 2, name: 'Dinner', order: 1, color: '#f0f', default: false },
          ],
        }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
  } catch (err) {
    setupFailed = true;
    console.error('[pack-smoke setup] failed:', err);
    throw err;
  }
}, 120_000);

afterAll(async () => {
  if (stub) await stub.close();
  if (installDir && existsSync(installDir)) {
    rmSync(installDir, { recursive: true, force: true });
  }
});

describe('packed tarball smoke', () => {
  it('packaged binary starts, lists tools, stashes, and runs jq_query from a foreign cwd', async () => {
    if (setupFailed) throw new Error('setup failed; see beforeAll output');

    const foreignCwd = tmpdir();
    const transport = new StdioClientTransport({
      command: 'node',
      args: [installedBin],
      cwd: foreignCwd,
      env: {
        ...process.env,
        TANDOOR_URL: stub.url,
        TANDOOR_TOKEN: 'tok',
        // Low threshold guarantees the payload trips the stash gate so the
        // jq path actually runs — this is the regression guard for the rc.2
        // jq-wasm cwd-resolution bug. With the default 25KB threshold the
        // 80-row stub payload sits below the cutoff on some Node versions.
        TANDOOR_MCP_STASH_THRESHOLD: '500',
      } as Record<string, string>,
      stderr: 'pipe',
    });

    const stderrBuf: string[] = [];
    transport.stderr?.on('data', (b: Buffer) => { stderrBuf.push(b.toString()); });
    onTestFailed(() => {
      if (stderrBuf.length) {
        // eslint-disable-next-line no-console
        console.error('[server stderr]\n' + stderrBuf.join(''));
      }
    });

    const client = new Client({ name: 'pack-smoke', version: '1.0' });
    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(50);
      expect(tools.tools.some((t) => t.name === 'list_recipes')).toBe(true);
      expect(tools.tools.some((t) => t.name === 'jq_query')).toBe(true);

      const listed = await client.callTool({ name: 'list_recipes', arguments: { page_size: 80 } }) as any;
      expect(listed.isError).not.toBe(true);
      // Must stash — 80 padded rows comfortably exceeds the default threshold.
      const sc = listed.structuredContent;
      expect(sc?.stashed).toBe(true);
      const handle = sc?.handle as string;
      expect(handle).toMatch(/^stash_[0-9a-f-]{36}$/);

      // The actual regression guard: jq_query forces jq-wasm to load from
      // the installed package's own location, NOT process.cwd() (which is
      // foreignCwd above). If the rc.2 cwd-resolution bug regresses, this
      // throws MODULE_NOT_FOUND.
      const jq = await client.callTool({
        name: 'jq_query',
        arguments: { handle, filter: '.count' },
      }) as any;
      expect(jq.isError).not.toBe(true);
      expect(JSON.parse(jq.content[0].text)).toBe(80);

      // Top-level array path through the packed binary. If the isJsonObject
      // guard regresses in source AND the build is shipped from the same
      // tree, this surfaces because the SDK Client validates the response
      // shape (QA F10).
      const mt = await client.callTool({
        name: 'list_meal_types',
        arguments: {},
      }) as any;
      expect(mt.isError).not.toBe(true);
      const parsedMt = JSON.parse(mt.content[0].text);
      expect(Array.isArray(parsedMt)).toBe(true);
      expect(parsedMt.length).toBe(2);
      // Array must NOT be attached to structuredContent (strict-SDK contract).
      expect(mt.structuredContent).toBeUndefined();
    } finally {
      await client.close();
      const serverStderr = stderrBuf.join('');
      // Widened net beyond the rc.2 specific markers — any stderr indicating
      // module-resolution failure or unhandled crash counts.
      if (/Cannot find module|MODULE_NOT_FOUND|Aborted\(\)|UnhandledRejection|throw\b/i.test(serverStderr)) {
        throw new Error(`server stderr surfaced a module-resolution failure:\n${serverStderr}`);
      }
    }
  }, 60_000);
});
