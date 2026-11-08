import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleAuthenticate } from '../src/handlers/access-token.js';
import { TandoorClient } from '../src/clients/index.js';

type Route = (init: RequestInit) => Response;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const loginRedirect = () =>
  new Response(null, { status: 302, headers: { Location: '/account/login/?next=/api-token-auth/' } });

const calls: { path: string; init: RequestInit }[] = [];

function serve(routes: Record<string, Route>): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const path = new URL(String(input)).pathname;
    calls.push({ path, init });
    return routes[path](init);
  });
}

const client = () => new TandoorClient({ url: 'https://tandoor.test', token: 'configured-token' });
const creds = { username: 'alice', password: 'hunter2' };

beforeEach(() => {
  calls.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-08T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('authenticate on Tandoor 2.6 (/api-token-auth/ answers)', () => {
  it('returns the minted token', async () => {
    serve({ '/api-token-auth/': () => json(200, { token: 'tda_legacy' }) });
    const res = await handleAuthenticate(client(), creds);
    expect(res).toBe('Bearer token minted (text-only, not mirrored to structuredContent):\ntda_legacy');
  });

  it('surfaces Tandoor\'s wrong-credentials error', async () => {
    serve({ '/api-token-auth/': () => json(400, { non_field_errors: ['Unable to log in with provided credentials.'] }) });
    await expect(handleAuthenticate(client(), creds)).rejects.toThrow('Unable to log in with provided credentials.');
  });
});

describe('authenticate on Tandoor 2.7 (/api-token-auth/ redirects to login)', () => {
  it('logs in through allauth and mints a one-year read write token with the session token', async () => {
    serve({
      '/api-token-auth/': loginRedirect,
      '/_allauth/app/v1/auth/login': () => json(200, { status: 200, meta: { is_authenticated: true, session_token: 'sess-123' } }),
      '/api/access-token/': () => json(201, { id: 7, token: 'tda_new', scope: 'read write' }),
    });
    const res = await handleAuthenticate(client(), creds);
    expect(res).toBe('Bearer token minted (text-only, not mirrored to structuredContent):\ntda_new');

    const login = calls.find((c) => c.path === '/_allauth/app/v1/auth/login')!;
    expect(JSON.parse(String(login.init.body))).toEqual(creds);
    const mint = calls.find((c) => c.path === '/api/access-token/')!;
    expect((mint.init.headers as Record<string, string>)['X-Session-Token']).toBe('sess-123');
    expect(mint.init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(mint.init.body))).toEqual({ scope: 'read write', expires: '2027-11-08T12:00:00.000Z' });
  });

  it('asks for a Settings > API token when the account needs an extra login step', async () => {
    serve({
      '/api-token-auth/': loginRedirect,
      '/_allauth/app/v1/auth/login': () => json(401, { status: 401, data: { flows: [{ id: 'mfa_authenticate', is_pending: true }] }, meta: { is_authenticated: false } }),
    });
    await expect(handleAuthenticate(client(), creds)).rejects.toThrow(
      'This account needs an extra login step (MFA or email verification). Create a token in Tandoor under Settings > API.',
    );
    expect(calls.map((c) => c.path)).not.toContain('/api/access-token/');
  });

  it('surfaces allauth\'s wrong-credentials error', async () => {
    serve({
      '/api-token-auth/': loginRedirect,
      '/_allauth/app/v1/auth/login': () => json(400, { status: 400, errors: [{ message: 'The username and/or password you specified are not correct.', code: 'username_password_mismatch' }] }),
    });
    await expect(handleAuthenticate(client(), creds)).rejects.toThrow('The username and/or password you specified are not correct.');
  });
});

describe('authenticate when /api-token-auth/ redirects somewhere other than login', () => {
  it('does not start the allauth flow', async () => {
    serve({ '/api-token-auth/': () => new Response(null, { status: 302, headers: { Location: '/elsewhere/' } }) });
    await expect(handleAuthenticate(client(), creds)).rejects.toThrow('302');
    expect(calls.map((c) => c.path)).toEqual(['/api-token-auth/']);
  });
});
