// Regression guard for Item 5 (P1 Sec): with TANDOOR_MCP_LOG=all set at
// module load, the authenticate and create_access_token surfaces must never
// echo the password or minted token to stderr.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

let handleAuthenticate: any;
let handleCreateAccessToken: any;
let TandoorClient: any;

beforeAll(async () => {
  // TANDOOR_MCP_LOG is snapshotted at module load in base.ts; set it before
  // any client module is imported so the log gate is armed.
  process.env.TANDOOR_MCP_LOG = 'all';
  vi.resetModules();
  const handlers = await import('../src/handlers/access-token.js');
  const clients = await import('../src/clients/index.js');
  handleAuthenticate = handlers.handleAuthenticate;
  handleCreateAccessToken = handlers.handleCreateAccessToken;
  TandoorClient = clients.TandoorClient;
});

afterAll(() => {
  delete process.env.TANDOOR_MCP_LOG;
  vi.resetModules();
});

function mockFetchOnce(body: unknown): ReturnType<typeof vi.spyOn> {
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
  return spy;
}

describe('sensitive endpoint log gate', () => {
  it('authenticate handler does not leak password or minted token to stderr', async () => {
    const client = new TandoorClient({ url: 'https://tandoor.test', token: 'irrelevant' });
    const fetchSpy = mockFetchOnce({ token: 'sk-MINT-secret' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await handleAuthenticate(client, { username: 'alice', password: 'hunter2' });
      const stderr = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(stderr).not.toContain('hunter2');
      expect(stderr).not.toContain('sk-MINT-secret');
      // Confirm the gate did fire so we know logging was actually active.
      expect(stderr).toContain('<redacted-credentials>');
    } finally {
      errSpy.mockRestore();
      fetchSpy.mockRestore();
    }
  });

  it('create_access_token POST does not leak the minted token to stderr', async () => {
    const client = new TandoorClient({ url: 'https://tandoor.test', token: 'irrelevant' });
    const fetchSpy = mockFetchOnce({ id: 1, scope: 'read', expires: '2030-01-01T00:00:00Z', created: '2026-01-01T00:00:00Z', token: 'ATK-secret-value' });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await handleCreateAccessToken(client, { scope: 'read', expires: '2030-01-01T00:00:00Z' });
      const stderr = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(stderr).not.toContain('ATK-secret-value');
      expect(stderr).toContain('<redacted-credentials>');
    } finally {
      errSpy.mockRestore();
      fetchSpy.mockRestore();
    }
  });
});
