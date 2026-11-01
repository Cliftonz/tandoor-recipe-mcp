import { describe, it, expect, onTestFinished } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BUILT_INDEX = resolve(__dirname, '..', 'build', 'index.js');

describe('http listen error at boot', () => {
  it('exits 1 naming the port and its setting when the port is already in use', async () => {
    const holder = createServer();
    await new Promise<void>((done) => holder.listen(0, '127.0.0.1', done));
    onTestFinished(() => new Promise<void>((done) => holder.close(() => done())));
    const port = (holder.address() as AddressInfo).port;

    const child = spawn('node', [BUILT_INDEX], {
      cwd: mkdtempSync(join(tmpdir(), 'listen-error-boot-')),
      env: {
        PATH: process.env.PATH!,
        TANDOOR_URL: 'http://127.0.0.1:1',
        TANDOOR_TOKEN: 'tok',
        TANDOOR_MAX_RETRIES: '0',
        TANDOOR_MCP_TRANSPORT: 'http',
        TANDOOR_MCP_HTTP_PORT: String(port),
      },
    });
    onTestFinished(() => { child.kill(); });
    let stderr = '';
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
    const exitCode = await new Promise<number | null>((done) => child.on('exit', done));

    expect(exitCode).toBe(1);
    expect(stderr).toContain(`[tandoor-mcp] Error: port ${port} is already in use (TANDOOR_MCP_HTTP_PORT).`);
  }, 5_000);
});
