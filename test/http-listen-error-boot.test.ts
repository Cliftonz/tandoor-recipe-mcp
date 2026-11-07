import { describe, it, expect, onTestFinished } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BUILT_INDEX = resolve(__dirname, '..', 'build', 'index.js');

function spawnHttp(port: number, host?: string) {
  const child = spawn('node', [BUILT_INDEX], {
    cwd: mkdtempSync(join(tmpdir(), 'listen-error-boot-')),
    env: {
      PATH: process.env.PATH!,
      TANDOOR_URL: 'http://127.0.0.1:1',
      TANDOOR_TOKEN: 'tok',
      TANDOOR_MAX_RETRIES: '0',
      TANDOOR_MCP_TRANSPORT: 'http',
      TANDOOR_MCP_HTTP_PORT: String(port),
      ...(host ? { TANDOOR_MCP_HTTP_HOST: host } : {}),
    },
  });
  onTestFinished(() => { child.kill(); });
  return child;
}

async function bootHttp(port: number, host?: string): Promise<{ exitCode: number | null; stderr: string }> {
  const child = spawnHttp(port, host);
  let stderr = '';
  child.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
  const exitCode = await new Promise<number | null>((done) => child.on('exit', done));
  return { exitCode, stderr };
}

describe('http listen error at boot', () => {
  it('exits 1 naming the port and its setting when the port is already in use', async () => {
    const holder = createServer();
    await new Promise<void>((done) => holder.listen(0, '127.0.0.1', done));
    onTestFinished(() => new Promise<void>((done) => holder.close(() => done())));
    const port = (holder.address() as AddressInfo).port;

    const { exitCode, stderr } = await bootHttp(port);

    expect(exitCode).toBe(1);
    expect(stderr).toContain(`[tandoor-mcp] Error: port ${port} is already in use (TANDOOR_MCP_HTTP_PORT).`);
  }, 5_000);

  it('exits 1 with the listen error itself when the port is out of range', async () => {
    const { exitCode, stderr } = await bootHttp(70000);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('ERR_SOCKET_BAD_PORT');
    expect(stderr).not.toContain('is already in use');
  }, 5_000);

  it('exits 1 with the listen error itself when TANDOOR_MCP_HTTP_HOST cannot be bound', async () => {
    const { exitCode, stderr } = await bootHttp(0, '192.0.2.1');

    expect(exitCode).toBe(1);
    expect(stderr).toContain('EADDRNOTAVAIL');
  }, 5_000);

  it('logs the configured host in the startup line', async () => {
    const child = spawnHttp(0, '::1');
    const stderr = await new Promise<string>((done) => {
      let buf = '';
      child.stderr.on('data', (b: Buffer) => {
        buf += b.toString();
        if (buf.includes(' on http://')) done(buf);
      });
      child.on('exit', () => done(buf));
    });

    expect(stderr).toContain(' on http://::1:0/mcp');
  }, 5_000);
});
