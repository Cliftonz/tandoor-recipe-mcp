import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from 'dotenv';

const TMP_ENV = join(tmpdir(), `.env-dotenv-smoke-${process.pid}`);

const VARS = {
  TANDOOR_URL: 'https://tandoor.example.com',
  TANDOOR_TOKEN: 'test-api-token-abc123',
  TANDOOR_MCP_PROFILE: 'full',
};

describe('dotenv v17 smoke — env vars populate process.env', () => {
  beforeEach(() => {
    writeFileSync(
      TMP_ENV,
      Object.entries(VARS)
        .map(([k, v]) => `${k}="${v}"`)
        .join('\n') + '\n',
      'utf8'
    );
    // Remove any pre-existing values so we confirm dotenv actually sets them.
    for (const key of Object.keys(VARS)) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    unlinkSync(TMP_ENV);
    for (const key of Object.keys(VARS)) {
      delete process.env[key];
    }
  });

  it('sets each key from the .env file into process.env', () => {
    config({ path: TMP_ENV, quiet: true });

    for (const [key, expected] of Object.entries(VARS)) {
      expect(process.env[key], `process.env.${key}`).toBe(expected);
    }
  });

  it('TANDOOR_URL and TANDOOR_TOKEN are non-empty strings after load', () => {
    config({ path: TMP_ENV, quiet: true });

    expect(typeof process.env.TANDOOR_URL).toBe('string');
    expect(process.env.TANDOOR_URL!.length).toBeGreaterThan(0);

    expect(typeof process.env.TANDOOR_TOKEN).toBe('string');
    expect(process.env.TANDOOR_TOKEN!.length).toBeGreaterThan(0);
  });

  it('does not overwrite an already-set env var (dotenv default behavior)', () => {
    process.env.TANDOOR_URL = 'https://already-set.example.com';

    config({ path: TMP_ENV, quiet: true });

    // dotenv never overwrites existing values by default.
    expect(process.env.TANDOOR_URL).toBe('https://already-set.example.com');
    // Other vars not pre-set are still populated.
    expect(process.env.TANDOOR_TOKEN).toBe(VARS.TANDOOR_TOKEN);
  });

  it('returns a parsed object containing the loaded key/value pairs', () => {
    const result = config({ path: TMP_ENV, quiet: true });

    expect(result.error).toBeUndefined();
    expect(result.parsed).toBeDefined();
    expect(result.parsed!['TANDOOR_URL']).toBe(VARS.TANDOOR_URL);
    expect(result.parsed!['TANDOOR_TOKEN']).toBe(VARS.TANDOOR_TOKEN);
  });
});
