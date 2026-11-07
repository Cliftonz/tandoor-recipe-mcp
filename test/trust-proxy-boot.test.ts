import { describe, it, expect, onTestFinished } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BUILT_INDEX = resolve(__dirname, '..', 'build', 'index.js');

describe('TANDOOR_MCP_TRUST_PROXY at boot', () => {
  it('exits 1 naming the variable when the value is invalid', async () => {
    const child = spawn('node', [BUILT_INDEX], {
      cwd: mkdtempSync(join(tmpdir(), 'trust-proxy-boot-')),
      env: {
        PATH: process.env.PATH!,
        TANDOOR_URL: 'http://127.0.0.1:1',
        TANDOOR_TOKEN: 'tok',
        TANDOOR_MAX_RETRIES: '0',
        TANDOOR_MCP_TRANSPORT: 'http',
        TANDOOR_MCP_HTTP_PORT: '0',
        TANDOOR_MCP_TRUST_PROXY: 'true',
      },
    });
    onTestFinished(() => { child.kill(); });
    let stderr = '';
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
    const exitCode = await new Promise<number | null>((done) => child.on('exit', done));

    expect(exitCode).toBe(1);
    expect(stderr).toContain('TANDOOR_MCP_TRUST_PROXY must be a hop count');
  }, 5_000);
});
