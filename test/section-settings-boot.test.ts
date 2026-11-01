import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BUILT_INDEX = resolve(__dirname, '..', 'build', 'index.js');

interface Boot {
  stderr: string;
  exitCode: number | null;
}

function boot(env: Record<string, string>, until?: RegExp): Promise<Boot> {
  return new Promise((done) => {
    const child = spawn('node', [BUILT_INDEX], {
      cwd: mkdtempSync(join(tmpdir(), 'section-boot-')),
      env: { PATH: process.env.PATH!, TANDOOR_URL: 'http://127.0.0.1:1', TANDOOR_TOKEN: 'tok', TANDOOR_MAX_RETRIES: '0', ...env },
    });
    let stderr = '';
    child.stderr.on('data', (b: Buffer) => {
      stderr += b.toString();
      if (until?.test(stderr)) child.kill();
    });
    child.on('exit', (code) => done({ stderr, exitCode: code }));
  });
}

describe('section settings at boot', () => {
  it('fails startup on an invalid section value, naming the variable and its valid values', async () => {
    const result = await boot({ TANDOOR_MCP_COOKLOG: 'full' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('TANDOOR_MCP_COOKLOG=full is not valid. Valid values: off, on.');
  }, 15_000);

  it('warns once that TANDOOR_MCP_PROFILE is ignored and keeps starting', async () => {
    const result = await boot({ TANDOOR_MCP_PROFILE: 'full' }, /on stdio/);
    expect(result.stderr.match(/TANDOOR_MCP_PROFILE/g)).toHaveLength(1);
    expect(result.stderr).toContain(
      'WARNING: TANDOOR_MCP_PROFILE is ignored. Choose tools with the section settings: TANDOOR_MCP_RECIPES,',
    );
    expect(result.stderr).toContain('on stdio');
  }, 15_000);
});
