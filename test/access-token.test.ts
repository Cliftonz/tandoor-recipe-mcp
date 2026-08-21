import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  handleListAccessTokens,
  handleGetAccessToken,
  handleCreateAccessToken,
  handleUpdateAccessToken,
  handleDeleteAccessToken,
  handleAuthenticate,
  __test__ as accessTokenInternals,
} from '../src/handlers/access-token.js';
import type { TandoorClient } from '../src/clients/index.js';
import type { AccessTokenClient } from '../src/clients/access-token.js';
import {
  listAccessTokensShape as _l,
  getAccessTokenShape as _g,
  createAccessTokenShape,
  updateAccessTokenShape,
  deleteAccessTokenShape as _d,
  authenticateShape as _a,
} from '../src/tools/access-token.js';

const mock = (impl: Partial<AccessTokenClient>): TandoorClient => ({ accessTokens: impl } as unknown as TandoorClient);

describe('slimAccessToken', () => {
  it('omits the token field', () => {
    const out = accessTokenInternals.slimAccessToken({
      id: 1, scope: 'read', expires: 'e', created: 'c', token: 'raw-abc',
    });
    expect(out).not.toHaveProperty('token');
    expect(out).toEqual({ id: 1, scope: 'read', expires: 'e', created: 'c' });
  });

  it('passes through null/undefined', () => {
    expect(accessTokenInternals.slimAccessToken(null)).toBeNull();
    expect(accessTokenInternals.slimAccessToken(undefined)).toBeUndefined();
  });
});

describe('access token handlers', () => {
  it('handleListAccessTokens slims each token and redacts token string', async () => {
    const listTokens = vi.fn(async () => [
      { id: 1, scope: 'read', expires: '2027-01-01T00:00:00Z', created: '2026-01-01T00:00:00Z', token: 'raw-abc', updated: '2026-06-01T00:00:00Z' },
    ]);
    const res = await handleListAccessTokens(mock({ listTokens }), {});
    const parsed = JSON.parse(res);
    expect(parsed[0]).not.toHaveProperty('token');
    expect(parsed[0]).toEqual({ id: 1, scope: 'read', expires: '2027-01-01T00:00:00Z', created: '2026-01-01T00:00:00Z' });
  });

  it('handleGetAccessToken slim (default) omits token', async () => {
    const getToken = vi.fn(async () => ({ id: 5, scope: 's', expires: 'e', created: 'c', token: 'raw-xyz' }));
    const res = await handleGetAccessToken(mock({ getToken }), { id: 5 });
    const parsed = JSON.parse(res);
    expect(parsed).not.toHaveProperty('token');
    expect(res).not.toMatch(/raw-xyz/);
  });

  it('handleGetAccessToken format=full returns raw with token', async () => {
    const getToken = vi.fn(async () => ({ id: 5, scope: 's', expires: 'e', created: 'c', token: 'raw-xyz', extra: 'kept' }));
    const res = await handleGetAccessToken(mock({ getToken }), { id: 5, format: 'full' });
    const parsed = JSON.parse(res);
    expect(parsed.token).toBe('raw-xyz');
    expect(parsed.extra).toBe('kept');
  });

  it('handleCreateAccessToken posts scope and expires', async () => {
    const createToken = vi.fn(async (b) => ({ id: 9, ...b, token: 'new-token', created: 'now' }));
    const res = await handleCreateAccessToken(mock({ createToken }), { scope: 'write', expires: '2027-12-31T00:00:00Z' });
    expect(createToken).toHaveBeenCalledWith({ scope: 'write', expires: '2027-12-31T00:00:00Z' }, { signal: undefined });
    expect(res).toMatch(/Access token created/);
    expect(res).toMatch(/new-token/);
  });

  it('handleUpdateAccessToken throws when body is empty', async () => {
    const patchToken = vi.fn();
    await expect(
      handleUpdateAccessToken(mock({ patchToken }), { id: 1 }),
    ).rejects.toThrow(/At least one field/);
    expect(patchToken).not.toHaveBeenCalled();
  });

  it('handleUpdateAccessToken PATCHes only supplied fields', async () => {
    const patchToken = vi.fn(async (_id, b) => ({ id: 1, ...b }));
    await handleUpdateAccessToken(mock({ patchToken }), { id: 1, scope: 'read-only' });
    expect(patchToken).toHaveBeenCalledWith(1, { scope: 'read-only' }, { signal: undefined });
  });

  it('handleDeleteAccessToken deletes by id', async () => {
    const deleteToken = vi.fn(async () => undefined);
    const res = await handleDeleteAccessToken(mock({ deleteToken }), { id: 42 });
    expect(deleteToken).toHaveBeenCalledWith(42, { signal: undefined });
    expect(res).toMatch(/42 deleted/);
  });

  it('handleAuthenticate returns the token verbatim from /api-token-auth/ as plain text (no JSON body)', async () => {
    const authenticate = vi.fn(async () => ({ token: 'secret-bearer-xyz' }));
    const res = await handleAuthenticate(mock({ authenticate }), { username: 'alice', password: 'hunter2' });
    expect(authenticate).toHaveBeenCalledWith({ username: 'alice', password: 'hunter2' }, { signal: undefined });
    expect(res).toContain('secret-bearer-xyz');
    // WHY: the register middleware auto-extracts structuredContent from any
    // JSON-shaped return string. Assert the response is NOT JSON-shaped so
    // no structured mirror is minted; the token stays text-only.
    expect(() => JSON.parse(res)).toThrow();
    const trimmed = res.trim();
    expect(trimmed.startsWith('{')).toBe(false);
    expect(trimmed.startsWith('[')).toBe(false);
    // The `\n\n` + JSON header-split path must not fire either.
    expect(/\n\n[\[{]/.test(res)).toBe(false);
  });
});

describe('access token input schema', () => {
  it('create rejects non-datetime expires at the MCP boundary', () => {
    const schema = z.object(createAccessTokenShape);
    const bad = schema.safeParse({ scope: 'read', expires: 'tomorrow' });
    expect(bad.success).toBe(false);
    const good = schema.safeParse({ scope: 'read', expires: '2027-12-31T00:00:00Z' });
    expect(good.success).toBe(true);
  });

  it('update rejects non-datetime expires at the MCP boundary', () => {
    const schema = z.object(updateAccessTokenShape);
    const bad = schema.safeParse({ id: 1, expires: 'never' });
    expect(bad.success).toBe(false);
    const good = schema.safeParse({ id: 1, expires: '2027-12-31T00:00:00Z' });
    expect(good.success).toBe(true);
  });

  it('create accepts a past ISO datetime (shape check only, no recency refinement)', () => {
    // Locks the ruling: the datetime constraint validates shape, not recency.
    // A silent tightening to `> now()` would break audit-log / historical use.
    const schema = z.object(createAccessTokenShape);
    const parsed = schema.safeParse({ scope: 'read', expires: '2020-01-01T00:00:00Z' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.expires).toBe('2020-01-01T00:00:00Z');
  });
});

describe('access token tool descriptions', () => {
  it('escalation warning appears on create, list, get, and authenticate descriptions', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/tools/access-token.ts', import.meta.url), 'utf8'),
    );
    // WHY: assert on the source string rather than a live McpServer registration,
    // to keep the test hermetic and independent of tool-registration order.
    const lower = src.toLowerCase();
    expect(lower).toContain('escalation surface');
    // Every security-relevant tool description references the shared warning.
    for (const name of ['list_access_tokens', 'get_access_token', 'create_access_token', 'authenticate']) {
      const idx = src.indexOf(`'${name}'`);
      expect(idx, `${name} registration present`).toBeGreaterThan(-1);
    }
  });
});
