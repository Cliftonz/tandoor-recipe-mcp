import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { accessTokenVerifier, authRouter, consentLimiter } from '../src/lib/oauth/server.js';
import { openStore } from '../src/lib/oauth/store.js';
import { startStub, type Stub } from './helpers/stub-http.js';

const PUBLIC_URL = 'https://mcp.example.com/mcp';
const ISSUER = 'https://mcp.example.com/';
const CLAUDE_REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const CHATGPT_REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
const CIMD_HOST = 'https://client.example';
const CIMD_ID = `${CIMD_HOST}/oauth/client.json`;
const GOOD_TOKEN = 'good-token';
const REJECTED = 'Tandoor rejected that token. Check it in Tandoor&#39;s API settings and try again.';
const UNREACHABLE = 'Tandoor didn&#39;t respond properly. Try again.';
const EXPIRED = 'This sign-in form expired. Start connecting again from your app.';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

let root: string;
let key: Buffer;
let clock: number;
const now = () => clock;
let store: ReturnType<typeof openStore>;
let tandoor: Stub;
let server: Server;
let base: string;
let cimd: { status: number; body: Record<string, unknown> | undefined; hang: boolean; throws: boolean };
let cimdFetches: string[];
let stderr: string[];

const cimdDoc = (overrides: Record<string, unknown> = {}) => ({
  client_id: CIMD_ID,
  client_name: 'Claude',
  redirect_uris: [CLAUDE_REDIRECT],
  token_endpoint_auth_method: 'none',
  ...overrides,
});

async function startServer({ trustProxy = false, tandoorPublicUrl = tandoor.url } = {}): Promise<void> {
  const app = express();
  if (trustProxy) app.set('trust proxy', 1);
  app.use(authRouter({ publicUrl: new URL(PUBLIC_URL), secretKey: key, tandoorUrl: tandoor.url, tandoorPublicUrl, store, verifier: accessTokenVerifier(store, `${ISSUER}.well-known/oauth-protected-resource/mcp`, tandoor.url), now }));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function stopServer(): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'oauth-server-'));
  key = randomBytes(32);
  clock = 1_700_000_000_000;
  store = openStore({ dir: join(root, 'data'), key, now });
  tandoor = await startStub((req, res) => {
    if (req.url !== '/api/space/current/') return void res.writeHead(404).end();
    const auth = req.headers.authorization;
    if (auth === `Bearer ${GOOD_TOKEN}`) return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"id":1}');
    if (auth === 'Bearer flaky-token') return void res.writeHead(502).end();
    if (auth === 'Bearer redirect-token') return void res.writeHead(302, { Location: '/accounts/login/' }).end();
    if (auth === 'Bearer forbidden-token') return void res.writeHead(403).end();
    if (auth === 'Bearer boom-token') return void req.socket.destroy();
    if (auth === 'Bearer slow-token') return;
    res.writeHead(401).end();
  });
  cimd = { status: 200, body: undefined, hang: false, throws: false };
  cimdFetches = [];
  stderr = [];
  process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK = '1';
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    if (new URL(url).hostname !== 'client.example') return realFetch(input, init);
    cimdFetches.push(url);
    if (cimd.throws) return Promise.reject(new Error('cimd host exploded'));
    if (cimd.hang) return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)));
    const body = cimd.body ?? cimdDoc({ client_id: url });
    const headers = { 'Content-Type': 'application/json', ...(cimd.status === 302 ? { Location: `${CIMD_HOST}/elsewhere.json` } : {}) };
    return Promise.resolve(new Response(JSON.stringify(body), { status: cimd.status, headers }));
  });
  const realWrite = process.stderr.write.bind(process.stderr);
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array, ...rest: never[]) => {
    stderr.push(String(chunk));
    return realWrite(chunk, ...rest);
  });
  await startServer();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await stopServer();
  await tandoor.close();
  rmSync(root, { recursive: true, force: true });
  delete process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK;
});

const form = (fields: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(fields).filter((entry): entry is [string, string] => entry[1] !== undefined));

function register(body: Record<string, unknown> = {}, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ redirect_uris: [CLAUDE_REDIRECT], token_endpoint_auth_method: 'none', client_name: 'Claude', ...body }),
  });
}

async function registeredClient(body: Record<string, unknown> = {}): Promise<string> {
  const res = await register(body);
  return ((await res.json()) as { client_id: string }).client_id;
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

function authorize(clientId: string, challenge: string, overrides: Record<string, string | undefined> = {}, headers: Record<string, string> = {}): Promise<Response> {
  const query = form({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CLAUDE_REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'state-123',
    resource: PUBLIC_URL,
    scope: 'tandoor',
    ...overrides,
  });
  return fetch(`${base}/authorize?${query}`, { redirect: 'manual', headers });
}

const unescapeHtml = (text: string) =>
  text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

interface Consent {
  fields: Record<string, string>;
  cookie: string;
  html: string;
}

async function readConsent(res: Response): Promise<Consent> {
  const html = await res.text();
  const fields = Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map((m) => [m[1]!, unescapeHtml(m[2]!)]));
  return { fields, cookie: res.headers.get('set-cookie')!.split(';')[0]!, html };
}

function submit(consent: Consent, action: 'approve' | 'deny', tandoorToken = '', headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}/consent`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: consent.cookie, ...headers },
    body: form({ ...consent.fields, tandoor_token: tandoorToken, action }),
  });
}

async function startConsent(clientId?: string, overrides: Record<string, string | undefined> = {}) {
  const id = clientId ?? (await registeredClient());
  const { verifier, challenge } = pkce();
  const consent = await readConsent(await authorize(id, challenge, overrides));
  return { clientId: id, verifier, consent };
}

async function obtainCode(clientId?: string, overrides: Record<string, string | undefined> = {}) {
  const { clientId: id, verifier, consent } = await startConsent(clientId, overrides);
  const location = new URL((await submit(consent, 'approve', GOOD_TOKEN)).headers.get('location')!);
  return { clientId: id, verifier, code: location.searchParams.get('code')!, location, consent };
}

function token(fields: Record<string, string | undefined>): Promise<Response> {
  return fetch(`${base}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(fields) });
}

function exchange(grant: { clientId: string; code: string; verifier: string }, overrides: Record<string, string | undefined> = {}): Promise<Response> {
  return token({
    grant_type: 'authorization_code',
    client_id: grant.clientId,
    code: grant.code,
    code_verifier: grant.verifier,
    redirect_uri: CLAUDE_REDIRECT,
    resource: PUBLIC_URL,
    ...overrides,
  });
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

async function connect(clientId?: string) {
  const grant = await obtainCode(clientId);
  const tokens = (await (await exchange(grant)).json()) as Tokens;
  return { clientId: grant.clientId, tokens };
}

function refresh(clientId: string, refreshToken: string, overrides: Record<string, string | undefined> = {}): Promise<Response> {
  return token({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken, resource: PUBLIC_URL, ...overrides });
}

function revoke(clientId: string, tokenValue: string): Promise<Response> {
  return fetch(`${base}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: clientId, token: tokenValue }),
  });
}

async function oauthError(res: Response): Promise<{ status: number; error: string }> {
  return { status: res.status, error: ((await res.json()) as { error: string }).error };
}

describe('metadata', () => {
  it('serves the authorization server metadata with issuer = public URL origin', async () => {
    const res = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      issuer: ISSUER,
      authorization_endpoint: 'https://mcp.example.com/authorize',
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint: 'https://mcp.example.com/token',
      token_endpoint_auth_methods_supported: ['none'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      scopes_supported: ['tandoor'],
      revocation_endpoint: 'https://mcp.example.com/revoke',
      revocation_endpoint_auth_methods_supported: ['none'],
      registration_endpoint: 'https://mcp.example.com/register',
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  });

  it('serves the protected resource metadata for the exact public URL', async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resource: PUBLIC_URL, authorization_servers: [ISSUER], scopes_supported: ['tandoor'] });
  });

  it('uses one byte-identical issuer string in AS metadata, PRM and the iss redirect parameter', async () => {
    const asIssuer = ((await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()) as { issuer: string }).issuer;
    const prmIssuer = ((await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json()) as { authorization_servers: string[] }).authorization_servers[0];
    const { location } = await obtainCode();
    expect(prmIssuer).toBe(asIssuer);
    expect(location.searchParams.get('iss')).toBe(asIssuer);
  });
});

describe('dynamic client registration', () => {
  it('registers a public client with an SDK-generated client_id', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ redirect_uris: [CLAUDE_REDIRECT], token_endpoint_auth_method: 'none', client_name: 'Claude' });
    expect(body.client_id).toEqual(expect.any(String));
    expect(body.client_id_issued_at).toEqual(expect.any(Number));
    expect(body.client_secret).toBeUndefined();
    expect(store.getClient(String(body.client_id))).toMatchObject({ client_name: 'Claude' });
  });

  it.each([
    ['https', CHATGPT_REDIRECT],
    ['localhost on any port', 'http://localhost:43123/callback'],
    ['127.0.0.1', 'http://127.0.0.1/callback'],
    ['[::1]', 'http://[::1]:8080/callback'],
  ])('accepts a %s redirect URI', async (_label, redirect) => {
    expect((await register({ redirect_uris: [redirect] })).status).toBe(201);
  });

  it.each([['client_secret_post'], ['client_secret_basic'], [undefined]])('refuses token_endpoint_auth_method %s with invalid_client_metadata', async (method) => {
    expect(await oauthError(await register({ token_endpoint_auth_method: method }))).toEqual({ status: 400, error: 'invalid_client_metadata' });
  });

  it.each([['http://evil.example/cb'], ['com.example.app:/callback']])('refuses redirect URI %s with invalid_redirect_uri', async (redirect) => {
    expect(await oauthError(await register({ redirect_uris: [CLAUDE_REDIRECT, redirect] }))).toEqual({ status: 400, error: 'invalid_redirect_uri' });
  });
});

describe('client ID metadata documents', () => {
  it('shows the consent page for an https client_id whose document validates', async () => {
    const res = await authorize(CIMD_ID, pkce().challenge);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<strong>Claude</strong> (client.example)');
  });

  it('names a CIMD client without client_name by its client_id host', async () => {
    cimd.body = cimdDoc({ client_name: undefined });
    expect(await (await authorize(CIMD_ID, pkce().challenge)).text()).toContain('<strong>client.example</strong> wants');
  });

  it('completes the flow through token exchange for a CIMD client', async () => {
    const { tokens } = await connect(CIMD_ID);
    expect(tokens.scope).toBe('tandoor');
  });

  it.each([
    ['client_id mismatch', cimdDoc({ client_id: 'https://other.example/client.json' })],
    ['confidential auth method', cimdDoc({ token_endpoint_auth_method: 'client_secret_post' })],
    ['missing auth method', cimdDoc({ token_endpoint_auth_method: undefined })],
    ['client secret present', cimdDoc({ client_secret: 'shh' })],
    ['plain-http redirect', cimdDoc({ redirect_uris: [CLAUDE_REDIRECT, 'http://evil.example/cb'] })],
    ['missing redirect_uris', cimdDoc({ redirect_uris: undefined })],
  ])('rejects a document with %s as invalid_client without redirecting', async (_label, body) => {
    cimd.body = body;
    expect(await oauthError(await authorize(CIMD_ID, pkce().challenge))).toEqual({ status: 400, error: 'invalid_client' });
  });

  it('rejects a document that fails to load as invalid_client', async () => {
    cimd.status = 404;
    expect(await oauthError(await authorize(CIMD_ID, pkce().challenge))).toEqual({ status: 400, error: 'invalid_client' });
  });

  it('rejects a document larger than 64 KB', async () => {
    cimd.body = cimdDoc({ padding: 'x'.repeat(64 * 1024) });
    expect(await oauthError(await authorize(CIMD_ID, pkce().challenge))).toEqual({ status: 400, error: 'invalid_client' });
  });

  it('does not follow a redirect from the document URL', async () => {
    cimd.status = 302;
    expect(await oauthError(await authorize(CIMD_ID, pkce().challenge))).toEqual({ status: 400, error: 'invalid_client' });
    expect(cimdFetches).toEqual([CIMD_ID]);
  });

  it('gives up on a document that takes longer than 5 seconds', async () => {
    cimd.hang = true;
    expect(await oauthError(await authorize(CIMD_ID, pkce().challenge))).toEqual({ status: 400, error: 'invalid_client' });
  }, 15_000);

  it('logs one line without secrets when the document fetch throws', async () => {
    cimd.throws = true;
    expect(await oauthError(await authorize(CIMD_ID, pkce().challenge))).toEqual({ status: 400, error: 'invalid_client' });
    const lines = stderr.filter((line) => line.includes('event=cimd_fetch_failed'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(CIMD_ID);
    expect(lines[0]).toContain('cimd host exploded');
  });

  it.each([
    ['the root path', `${CIMD_HOST}/`],
    ['a query', `${CIMD_ID}?v=1`],
    ['an empty query', `${CIMD_ID}?`],
    ['a fragment', `${CIMD_ID}#top`],
    ['userinfo', 'https://user:pw@client.example/oauth/client.json'],
    ['a dot segment', `${CIMD_HOST}/oauth/../client.json`],
    ['an encoded dot segment', `${CIMD_HOST}/oauth/%2e%2e/client.json`],
  ])('rejects a client_id URL with %s without fetching it', async (_label, clientId) => {
    expect(await oauthError(await authorize(clientId, pkce().challenge))).toEqual({ status: 400, error: 'invalid_client' });
    expect(cimdFetches).toEqual([]);
  });

  it('caches a validated document for an hour, then fetches it again', async () => {
    await authorize(CIMD_ID, pkce().challenge);
    clock += HOUR - 1;
    await authorize(CIMD_ID, pkce().challenge);
    expect(cimdFetches).toHaveLength(1);
    clock += 1;
    await authorize(CIMD_ID, pkce().challenge);
    expect(cimdFetches).toHaveLength(2);
  });

  it('does not cache a failed document', async () => {
    cimd.status = 500;
    expect((await authorize(CIMD_ID, pkce().challenge)).status).toBe(400);
    cimd.status = 200;
    expect((await authorize(CIMD_ID, pkce().challenge)).status).toBe(200);
    expect(cimdFetches).toHaveLength(2);
  });

  it('keeps at most 100 documents, evicting the oldest', async () => {
    await stopServer();
    await startServer({ trustProxy: true });
    const ids = Array.from({ length: 101 }, (_, i) => `${CIMD_HOST}/client-${i}.json`);
    for (const [i, id] of ids.entries()) expect((await authorize(id, pkce().challenge, {}, { 'X-Forwarded-For': `198.51.100.${i}` })).status).toBe(200);
    await authorize(ids[1]!, pkce().challenge, {}, { 'X-Forwarded-For': '203.0.113.1' });
    expect(cimdFetches).toHaveLength(101);
    await authorize(ids[0]!, pkce().challenge, {}, { 'X-Forwarded-For': '203.0.113.2' });
    expect(cimdFetches).toHaveLength(102);
  });
});

describe('authorization request', () => {
  it.each([
    ['missing', undefined],
    ['different', 'https://mcp.example.com/other'],
  ])('redirects with invalid_target when resource is %s', async (_label, resource) => {
    const clientId = await registeredClient();
    const res = await authorize(clientId, pkce().challenge, { resource });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location')!);
    expect(location.origin + location.pathname).toBe(CLAUDE_REDIRECT);
    expect(location.searchParams.get('error')).toBe('invalid_target');
    expect(location.searchParams.get('state')).toBe('state-123');
  });

  it.each([
    ['unsupported response_type', { response_type: 'token' }],
    ['missing code_challenge', { code_challenge: undefined }],
    ['a 42-character code_challenge', { code_challenge: 'a'.repeat(42) }],
    ['a 44-character code_challenge', { code_challenge: 'a'.repeat(44) }],
    ['a non-base64url code_challenge', { code_challenge: `${'a'.repeat(42)}+` }],
  ])('redirects with invalid_request and iss for %s', async (_label, overrides) => {
    const clientId = await registeredClient();
    const location = new URL((await authorize(clientId, pkce().challenge, overrides)).headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('invalid_request');
    expect(location.searchParams.get('iss')).toBe(ISSUER);
  });
});

describe('consent page', () => {
  it('renders the copy, redirect URI, Tandoor URL, token field, help link and buttons', async () => {
    const clientId = await registeredClient();
    const res = await authorize(clientId, pkce().challenge);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`<strong>claude.ai</strong> (calls itself Claude) wants to access your Tandoor account at <strong>${tandoor.url}</strong>`);
    expect(html).toContain(`After you approve, you&#39;ll return to <code>${CLAUDE_REDIRECT}</code>.`);
    expect(html).toContain('Paste a Tandoor API token. The app uses it to act as you in Tandoor.');
    expect(html).toMatch(/<input type="password" name="tandoor_token"/);
    expect(html).toContain(`href="${tandoor.url}/settings/api"`);
    expect(html).toContain('value="approve"');
    expect(html).toContain('value="deny"');
  });

  it('shows the public Tandoor address and its API settings link while checking the token against TANDOOR_URL', async () => {
    await stopServer();
    await startServer({ tandoorPublicUrl: 'https://recipes.invalid' });
    const { consent, location } = await obtainCode();
    expect(consent.html).toContain('wants to access your Tandoor account at <strong>https://recipes.invalid</strong>');
    expect(consent.html).toContain('href="https://recipes.invalid/settings/api"');
    expect(consent.html).not.toContain(tandoor.url);
    expect(location.searchParams.get('code')).toBeTruthy();
  });

  it('escapes a hostile client name', async () => {
    const clientId = await registeredClient({ client_name: '<script>alert(1)</script>' });
    const html = await (await authorize(clientId, pkce().challenge)).text();
    expect(html).toContain('calls itself &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('names a DCR client without client_name by its redirect host only', async () => {
    const clientId = await registeredClient({ client_name: undefined, redirect_uris: ['http://localhost:43123/callback'] });
    const html = await (await authorize(clientId, pkce().challenge, { redirect_uri: 'http://localhost:43123/callback' })).text();
    expect(html).toContain('<strong>localhost:43123</strong> wants');
  });

  it('sends anti-framing, no-store and a 10-minute __Host- CSRF cookie', async () => {
    const clientId = await registeredClient();
    const res = await authorize(clientId, pkce().challenge);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('cache-control')).toBe('no-store');
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^__Host-[\w-]+=[\w.-]+;/);
    for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=600']) expect(cookie).toContain(attribute);
  });
});

describe('consent submit', () => {
  it.each([
    ['a tampered CSRF token', (c: Consent) => ({ ...c, fields: { ...c.fields, csrf: 'x'.repeat(43) } })],
    ['a missing cookie', (c: Consent) => ({ ...c, cookie: '' })],
    ['a cookie from another render', (c: Consent) => ({ ...c, cookie: c.cookie.replace(/=.*/, '=1700000000000.other') })],
    ['a swapped redirect_uri', (c: Consent) => ({ ...c, fields: { ...c.fields, redirect_uri: 'https://evil.example/cb' } })],
    ['a swapped client_id', (c: Consent) => ({ ...c, fields: { ...c.fields, client_id: 'someone-else' } })],
  ])('returns 400 without redirecting for %s', async (_label, tamper) => {
    const { consent } = await startConsent();
    const res = await submit(tamper(consent), 'approve', GOOD_TOKEN);
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toContain(EXPIRED);
  });

  it('expires a form after 10 minutes', async () => {
    const { consent } = await startConsent();
    clock += 10 * MINUTE;
    const res = await submit(consent, 'approve', GOOD_TOKEN);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain(EXPIRED);
  });

  it('accepts a form just under 10 minutes old', async () => {
    const { consent } = await startConsent();
    clock += 10 * MINUTE - 1;
    expect((await submit(consent, 'approve', GOOD_TOKEN)).status).toBe(302);
  });

  it('shows the expired page on a double submit after success', async () => {
    const { consent } = await obtainCode();
    const res = await submit(consent, 'approve', GOOD_TOKEN);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain(EXPIRED);
  });

  it('lets the newest render win when two tabs are open', async () => {
    const first = await startConsent();
    const second = await startConsent(first.clientId);
    expect((await submit({ ...first.consent, cookie: second.consent.cookie }, 'approve', GOOD_TOKEN)).status).toBe(400);
    expect((await submit(second.consent, 'approve', GOOD_TOKEN)).status).toBe(302);
  });

  it('redirects Deny to the client with access_denied, state and iss', async () => {
    const { consent } = await startConsent();
    const res = await submit(consent, 'deny');
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location')!);
    expect(location.origin + location.pathname).toBe(CLAUDE_REDIRECT);
    expect(Object.fromEntries(location.searchParams)).toEqual({ error: 'access_denied', state: 'state-123', iss: ISSUER });
  });

  it('redirects Approve with a single code, state and iss', async () => {
    const { location } = await obtainCode();
    expect(location.origin + location.pathname).toBe(CLAUDE_REDIRECT);
    expect([...location.searchParams.keys()].sort()).toEqual(['code', 'iss', 'state']);
    expect(location.searchParams.get('state')).toBe('state-123');
    expect(location.searchParams.get('iss')).toBe(ISSUER);
  });

  it.each([['wrong-token'], ['forbidden-token']])('re-shows the page when Tandoor rejects %s, then accepts a retry from that page', async (badToken) => {
    const { consent } = await startConsent();
    const rejected = await submit(consent, 'approve', badToken);
    expect(rejected.status).toBe(200);
    expect(rejected.headers.get('location')).toBeNull();
    const again = await readConsent(rejected);
    expect(again.html).toContain(REJECTED);
    const retry = await submit(again, 'approve', GOOD_TOKEN);
    expect(retry.status).toBe(302);
    expect(new URL(retry.headers.get('location')!).searchParams.get('code')).toBeTruthy();
  });

  it.each([
    ['a 5xx', 'flaky-token'],
    ['a 3xx', 'redirect-token'],
  ])('re-shows the page with the unreachable message when Tandoor answers %s', async (_label, tandoorToken) => {
    const { consent } = await startConsent();
    const res = await submit(consent, 'approve', tandoorToken);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toContain(UNREACHABLE);
  });

  it('re-shows the page with the unreachable message when Tandoor takes longer than 5 seconds', async () => {
    const { consent } = await startConsent();
    const res = await submit(consent, 'approve', 'slow-token');
    expect(await res.text()).toContain(UNREACHABLE);
  }, 15_000);

  it('logs one line without the token when the Tandoor check throws', async () => {
    const { consent } = await startConsent();
    const res = await submit(consent, 'approve', 'boom-token');
    expect(await res.text()).toContain(UNREACHABLE);
    const lines = stderr.filter((line) => line.includes('event=tandoor_check_failed'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('boom-token');
  });

  it('limits a visitor to 10 submissions a minute, Deny included, and recovers after a minute', async () => {
    let { consent } = await startConsent();
    for (let i = 0; i < 9; i++) {
      const res = await submit(consent, 'approve', 'wrong-token');
      expect(res.status).toBe(200);
      consent = await readConsent(res);
    }
    const deny = await startConsent();
    expect((await submit(deny.consent, 'deny')).status).toBe(302);
    const limited = await submit(consent, 'approve', GOOD_TOKEN);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('location')).toBeNull();
    const shown = await readConsent(limited);
    expect(shown.html).toContain('Too many attempts. Wait a minute and try again.');
    clock += MINUTE;
    expect((await submit(shown, 'approve', GOOD_TOKEN)).status).toBe(302);
  });

  async function exhaustAndProbe(firstHeader: string, probeHeader: string): Promise<number> {
    for (let i = 0; i < 10; i++) {
      const { consent } = await startConsent();
      await submit(consent, 'deny', '', { 'X-Forwarded-For': firstHeader });
    }
    const { consent } = await startConsent();
    return (await submit(consent, 'deny', '', { 'X-Forwarded-For': probeHeader })).status;
  }

  it('ignores X-Forwarded-For when the app does not trust a proxy', async () => {
    expect(await exhaustAndProbe('203.0.113.1', '203.0.113.2')).toBe(429);
  });

  it('keys the limit on the rightmost X-Forwarded-For entry when the app trusts one proxy', async () => {
    await stopServer();
    await startServer({ trustProxy: true });
    expect(await exhaustAndProbe('10.0.0.1, 203.0.113.1', '10.0.0.2, 203.0.113.1')).toBe(429);
  });

  it('gives each rightmost X-Forwarded-For entry its own bucket when the app trusts one proxy', async () => {
    await stopServer();
    await startServer({ trustProxy: true });
    expect(await exhaustAndProbe('10.0.0.1, 203.0.113.1', '10.0.0.1, 203.0.113.2')).toBe(302);
  });
});

describe('consent limiter', () => {
  it("refuses a visitor with no address without spending anyone else's allowance", () => {
    const allow = consentLimiter(now);
    for (let i = 0; i < 10; i++) expect(allow(undefined)).toBe(false);
    expect(allow('203.0.113.1')).toBe(true);
  });
});

describe('token endpoint', () => {
  it('exchanges a code with the right PKCE verifier for tokens bound to the pasted Tandoor token', async () => {
    const grant = await obtainCode();
    const res = await exchange(grant);
    expect(res.status).toBe(200);
    const tokens = (await res.json()) as Tokens;
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'tandoor' });
    expect(store.lookupAccessToken(tokens.access_token)).toMatchObject({ clientId: grant.clientId, tandoorToken: GOOD_TOKEN, scopes: ['tandoor'], resource: PUBLIC_URL });
  });

  it('rejects a wrong verifier and leaves the code usable', async () => {
    const grant = await obtainCode();
    expect(await oauthError(await exchange(grant, { code_verifier: pkce().verifier }))).toEqual({ status: 400, error: 'invalid_grant' });
    expect((await exchange(grant)).status).toBe(200);
  });

  it('rejects a reused code and revokes the grant it created', async () => {
    const grant = await obtainCode();
    const tokens = (await (await exchange(grant)).json()) as Tokens;
    expect(await oauthError(await exchange(grant))).toEqual({ status: 400, error: 'invalid_grant' });
    expect(store.lookupAccessToken(tokens.access_token)).toBeUndefined();
    expect(await oauthError(await refresh(grant.clientId, tokens.refresh_token))).toEqual({ status: 400, error: 'invalid_grant' });
  });

  it('rejects a code after 5 minutes', async () => {
    const grant = await obtainCode();
    clock += 5 * MINUTE;
    expect(await oauthError(await exchange(grant))).toEqual({ status: 400, error: 'invalid_grant' });
  });

  it('accepts a code just before 5 minutes', async () => {
    const grant = await obtainCode();
    clock += 5 * MINUTE - 1;
    expect((await exchange(grant)).status).toBe(200);
  });

  it.each([
    ['wrong', 'https://mcp.example.com/other'],
    ['missing', undefined],
  ])('rejects a %s resource with invalid_target', async (_label, resource) => {
    const grant = await obtainCode();
    expect(await oauthError(await exchange(grant, { resource }))).toEqual({ status: 400, error: 'invalid_target' });
  });

  it('rejects a different redirect_uri', async () => {
    const grant = await obtainCode();
    expect(await oauthError(await exchange(grant, { redirect_uri: 'https://claude.ai/other' }))).toEqual({ status: 400, error: 'invalid_grant' });
  });

  it('requires redirect_uri at the token endpoint when the authorize request sent one', async () => {
    const grant = await obtainCode();
    expect(await oauthError(await exchange(grant, { redirect_uri: undefined }))).toEqual({ status: 400, error: 'invalid_grant' });
  });

  it('accepts a token request without redirect_uri when the authorize request had none', async () => {
    const grant = await obtainCode(undefined, { redirect_uri: undefined });
    expect((await exchange(grant, { redirect_uri: undefined })).status).toBe(200);
  });

  it("rejects another client's code", async () => {
    const grant = await obtainCode();
    const other = await registeredClient();
    expect(await oauthError(await exchange({ ...grant, clientId: other }))).toEqual({ status: 400, error: 'invalid_grant' });
  });

  it('rotates the refresh token and revokes the grant when an old one is reused', async () => {
    const { clientId, tokens } = await connect();
    const res = await refresh(clientId, tokens.refresh_token);
    expect(res.status).toBe(200);
    const rotated = (await res.json()) as Tokens;
    expect(rotated).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'tandoor' });
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    expect(await oauthError(await refresh(clientId, tokens.refresh_token))).toEqual({ status: 400, error: 'invalid_grant' });
    expect(await oauthError(await refresh(clientId, rotated.refresh_token))).toEqual({ status: 400, error: 'invalid_grant' });
  });

  it.each([
    ['wrong', 'https://mcp.example.com/other'],
    ['missing', undefined],
  ])('rejects a refresh with a %s resource with invalid_target', async (_label, resource) => {
    const { clientId, tokens } = await connect();
    expect(await oauthError(await refresh(clientId, tokens.refresh_token, { resource }))).toEqual({ status: 400, error: 'invalid_target' });
  });
});

describe('revocation', () => {
  it.each(['refresh_token', 'access_token'] as const)('revoking the %s ends the grant', async (which) => {
    const { clientId, tokens } = await connect();
    const res = await revoke(clientId, tokens[which]);
    expect(res.status).toBe(200);
    expect(store.lookupAccessToken(tokens.access_token)).toBeUndefined();
    expect(await oauthError(await refresh(clientId, tokens.refresh_token))).toEqual({ status: 400, error: 'invalid_grant' });
  });

  it("does nothing, with 200, when a client revokes another client's token", async () => {
    const { tokens } = await connect();
    const other = await registeredClient();
    expect((await revoke(other, tokens.refresh_token)).status).toBe(200);
    expect(store.lookupAccessToken(tokens.access_token)).toBeDefined();
  });
});
