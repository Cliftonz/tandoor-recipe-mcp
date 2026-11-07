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

function boot(env: Record<string, string>): Promise<Boot> {
  return new Promise((done) => {
    const child = spawn('node', [BUILT_INDEX], {
      cwd: mkdtempSync(join(tmpdir(), 'plugin-option-boot-')),
      env: { PATH: process.env.PATH!, TANDOOR_MAX_RETRIES: '0', ...env },
    });
    let stderr = '';
    child.stderr.on('data', (b: Buffer) => {
      stderr += b.toString();
      if (/on stdio/.test(stderr)) child.kill();
    });
    child.on('exit', (code) => done({ stderr, exitCode: code }));
  });
}

describe('plugin option settings at boot', () => {
  it('starts with only the plugin options for URL and token', async () => {
    const result = await boot({ CLAUDE_PLUGIN_OPTION_TANDOOR_URL: 'http://127.0.0.1:2', CLAUDE_PLUGIN_OPTION_TANDOOR_TOKEN: 'tok' });
    expect(result.stderr).toContain('on stdio | api=http://127.0.0.1:2');
  }, 15_000);

  it('prefers the plugin URL option over TANDOOR_URL', async () => {
    const result = await boot({
      CLAUDE_PLUGIN_OPTION_TANDOOR_URL: 'http://127.0.0.1:2',
      TANDOOR_URL: 'http://127.0.0.1:1',
      TANDOOR_TOKEN: 'tok',
    });
    expect(result.stderr).toContain('on stdio | api=http://127.0.0.1:2');
  }, 15_000);

  it('falls back to TANDOOR_URL when the plugin URL option is blank', async () => {
    const result = await boot({ CLAUDE_PLUGIN_OPTION_TANDOOR_URL: '  ', TANDOOR_URL: 'http://127.0.0.1:1', TANDOOR_TOKEN: 'tok' });
    expect(result.stderr).toContain('on stdio | api=http://127.0.0.1:1');
  }, 15_000);

  it('names both the variable and the plugin setting when the URL is missing', async () => {
    const result = await boot({ CLAUDE_PLUGIN_OPTION_TANDOOR_URL: '', CLAUDE_PLUGIN_OPTION_TANDOOR_TOKEN: 'tok' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "Error: TANDOOR_URL and TANDOOR_TOKEN must be set in .env file (or set the plugin's Tandoor URL and Tandoor API Token settings)",
    );
  }, 15_000);

  it('reports an invalid plugin section option under its own name', async () => {
    const result = await boot({ CLAUDE_PLUGIN_OPTION_TANDOOR_URL: 'http://127.0.0.1:2', CLAUDE_PLUGIN_OPTION_TANDOOR_TOKEN: 'tok', CLAUDE_PLUGIN_OPTION_COOKLOG: 'full' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error: CLAUDE_PLUGIN_OPTION_COOKLOG=full is not valid. Valid values: off, on.');
  }, 15_000);
});
