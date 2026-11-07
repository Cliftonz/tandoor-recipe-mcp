import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpTransport, type HttpTransportHandle } from '../src/lib/http-transport.js';
import { openStore } from '../src/lib/oauth/store.js';
import { registerStringTool } from '../src/lib/register.js';
import { registerMealPlanTools } from '../src/tools/mealplan.js';
import { registerRecipeTools } from '../src/tools/recipe.js';
import type { TandoorClient } from '../src/clients/index.js';
import { startStub, type Stub } from './helpers/stub-http.js';

const PUBLIC_URL = 'https://mcp.example.com/mcp';
const PRM_URL = 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp';
const SECRET = 'ab'.repeat(32);
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const RECONNECT = 'Tandoor rejected your token. Reconnect this connector to sign in again.';
const VARS = ['TANDOOR_MCP_PUBLIC_URL', 'TANDOOR_MCP_SECRET_KEY', 'TANDOOR_MCP_DATA_DIR', 'TANDOOR_MCP_HTTP_PORT', 'TANDOOR_MCP_TEST_SKIP_URL_CHECK'];

let root: string;
let tandoor: Stub;
let handle: HttpTransportHandle;
let base: string;
let seenTokens: string[];
let deadTokens: Set<string>;
let deadWrites: Set<string>;
let goneTokens: Set<string>;
let brokenChecks: Map<string, 'reset' | 'error'>;

function buildServer(client: TandoorClient): McpServer {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerStringTool(server, client, 'whoami', { description: 'whoami', inputSchema: {} }, async (c) => JSON.stringify(await c.spaces.getCurrentSpace()));
  registerStringTool(server, client, 'create_space', { description: 'create', inputSchema: {} }, async (c) => JSON.stringify(await c.spaces.createSpace({})));
  return server;
}

async function startTransport(build = buildServer): Promise<void> {
  handle = createHttpTransport({ remote: build }, tandoor.url);
  await handle.start();
  base = `http://127.0.0.1:${handle.address()!.port}`;
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'remote-mcp-'));
  process.env.TANDOOR_MCP_PUBLIC_URL = PUBLIC_URL;
  process.env.TANDOOR_MCP_SECRET_KEY = SECRET;
  process.env.TANDOOR_MCP_DATA_DIR = root;
  process.env.TANDOOR_MCP_HTTP_PORT = '0';
  seenTokens = [];
  deadTokens = new Set();
  deadWrites = new Set();
  goneTokens = new Set();
  brokenChecks = new Map();
  tandoor = await startStub((req, res) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    seenTokens.push(token);
    if (deadTokens.has(token) || (deadWrites.has(token) && req.method !== 'GET')) return void res.writeHead(401).end();
    if (goneTokens.has(token)) return void res.writeHead(403, { 'Content-Type': 'application/json' }).end('{"detail":"Authentication credentials were not provided."}');
    const brokenCheck = req.url === '/api/space/current/' ? brokenChecks.get(token) : undefined;
    if (brokenCheck === 'reset') return void res.socket!.destroy();
    if (brokenCheck === 'error') return void res.writeHead(503).end();
    if (/^\/api\/(recipe|meal-type)\/\d+\/$/.test(req.url ?? '')) return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"id":1,"name":"ref"}');
    if (req.method !== 'GET') return void res.writeHead(403, { 'Content-Type': 'application/json' }).end('{"detail":"read-only token"}');
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ owner: token }));
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await handle?.stop();
  await tandoor.close();
  for (const name of VARS) delete process.env[name];
  rmSync(root, { recursive: true, force: true });
});

const form = (fields: Record<string, string>) => new URLSearchParams(fields);

async function signIn(tandoorToken: string): Promise<string> {
  const registered = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' }),
  });
  const { client_id: clientId } = (await registered.json()) as { client_id: string };
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const query = form({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', resource: PUBLIC_URL, scope: 'tandoor' });
  const consentPage = await fetch(`${base}/authorize?${query}`, { redirect: 'manual' });
  const html = await consentPage.text();
  const hidden = Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map((m) => [m[1]!, m[2]!.replace(/&amp;/g, '&')]));
  const approved = await fetch(`${base}/consent`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: consentPage.headers.get('set-cookie')!.split(';')[0]! },
    body: form({ ...hidden, tandoor_token: tandoorToken, action: 'approve' }),
  });
  const code = new URL(approved.headers.get('location')!).searchParams.get('code')!;
  const tokens = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: REDIRECT, resource: PUBLIC_URL }),
  });
  return ((await tokens.json()) as { access_token: string }).access_token;
}

function mcp(body: unknown, accessToken?: string): Promise<Response> {
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function rpcResult(res: Response): Promise<any> {
  const text = await res.text();
  const data = text.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(data ? data.slice('data: '.length) : text).result;
}

const callTool = (name: string, accessToken: string) => mcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: {} } }, accessToken);
const listTools = (accessToken?: string) => mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, accessToken);

function withTools(register: (server: McpServer, client: TandoorClient) => void) {
  return (client: TandoorClient) => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    register(server, client);
    return server;
  };
}

const callWith = (name: string, args: Record<string, unknown>, accessToken: string) =>
  mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } }, accessToken);

const ENTRY = { recipe_id: 1, servings: 1, from_date: '2026-01-01', meal_type_id: 1 };

function expectReconnect(result: any): void {
  expect(result.isError).toBe(true);
  expect(result.content).toEqual([{ type: 'text', text: RECONNECT }]);
  expect(result._meta['mcp/www_authenticate']).toHaveLength(1);
}

function expectChallenge(res: Response): void {
  expect(res.status).toBe(401);
  const header = res.headers.get('www-authenticate')!;
  expect(header).toMatch(/^Bearer realm="tandoor-mcp", /);
  expect(header).toContain(`resource_metadata="${PRM_URL}"`);
}

describe('remote MCP path', () => {
  it('answers a signed-in tools/list and tools/call with plain JSON, not an SSE stream', async () => {
    await startTransport();
    const accessToken = await signIn('alice-token');

    const list = await listTools(accessToken);
    expect(list.headers.get('content-type')).toMatch(/^application\/json/);
    expect(JSON.parse(await list.text()).result.tools.map((tool: { name: string }) => tool.name)).toEqual(['whoami', 'create_space']);
    const call = await callTool('whoami', accessToken);
    expect(call.headers.get('content-type')).toMatch(/^application\/json/);
    expect(JSON.parse(await call.text()).result.structuredContent).toEqual({ owner: 'alice-token' });
  });

  it('answers a request without a token with 401, the realm and the resource metadata URL', async () => {
    await startTransport();
    expectChallenge(await listTools());
  });

  it('answers an unknown token with 401', async () => {
    await startTransport();
    expectChallenge(await listTools('not-a-token'));
  });

  it('answers an expired token with 401', async () => {
    await startTransport();
    const accessToken = await signIn('alice-token');
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 61 * 60_000 });
    expectChallenge(await listTools(accessToken));
  });

  it('answers a token issued for another resource with 401', async () => {
    const seeded = openStore({ dir: root, key: Buffer.from(SECRET, 'hex') });
    const { accessToken } = seeded.createGrant({ clientId: 'other', tandoorToken: 'alice-token', scopes: ['tandoor'], resource: 'https://other.example.com/mcp' });
    await startTransport();
    expectChallenge(await listTools(accessToken));
  });

  it('serves a signed-in user with a server whose Tandoor client carries their own token', async () => {
    await startTransport();
    const accessToken = await signIn('alice-token');
    seenTokens = [];

    const list = await rpcResult(await listTools(accessToken));
    expect(list.tools.map((tool: { name: string }) => tool.name)).toEqual(['whoami', 'create_space']);
    const call = await rpcResult(await callTool('whoami', accessToken));
    expect(call.structuredContent).toEqual({ owner: 'alice-token' });
    expect(seenTokens).toEqual(['alice-token']);
  });

  it('sends each user request to Tandoor with that user\'s token', async () => {
    await startTransport();
    const alice = await signIn('alice-token');
    const bob = await signIn('bob-token');
    seenTokens = [];

    const [forAlice, forBob] = await Promise.all([callTool('whoami', alice), callTool('whoami', bob)]);
    expect((await rpcResult(forAlice)).structuredContent).toEqual({ owner: 'alice-token' });
    expect((await rpcResult(forBob)).structuredContent).toEqual({ owner: 'bob-token' });
    expect(seenTokens.sort()).toEqual(['alice-token', 'bob-token']);
  });

  it('ends the grant and asks for a reconnect when Tandoor rejects the stored token', async () => {
    await startTransport();
    const accessToken = await signIn('dead-token');
    deadTokens.add('dead-token');

    const result = await rpcResult(await callTool('whoami', accessToken));
    expect(result).toEqual({
      isError: true,
      content: [{ type: 'text', text: RECONNECT }],
      _meta: {
        'mcp/www_authenticate': [`Bearer resource_metadata="${PRM_URL}", error="invalid_token", error_description="${RECONNECT}"`],
      },
    });
    expectChallenge(await listTools(accessToken));
  });

  it('ends the grant and asks for a reconnect when Tandoor rejects the token behind list_meal_types', async () => {
    await startTransport((client) => {
      const server = new McpServer({ name: 'test', version: '0.0.0' });
      registerMealPlanTools(server, client);
      return server;
    });
    const accessToken = await signIn('dead-token');
    deadTokens.add('dead-token');

    const result = await rpcResult(await callTool('list_meal_types', accessToken));
    expect(result.content).toEqual([{ type: 'text', text: RECONNECT }]);
    expect(result._meta['mcp/www_authenticate']).toHaveLength(1);
    expectChallenge(await listTools(accessToken));
  });

  it('keeps a Tandoor 403 an ordinary tool error and the grant alive', async () => {
    await startTransport();
    const accessToken = await signIn('alice-token');

    const result = await rpcResult(await callTool('create_space', accessToken));
    expect(result.isError).toBe(true);
    expect(result._meta).toBeUndefined();
    expect(result.content[0].text).toBe(
      'Error: Tandoor API error: 403 Forbidden\nDetail: read-only token\n\nAccess forbidden. Your API token may not have the required permissions.',
    );
    expect((await listTools(accessToken)).status).toBe(200);
  });

  it('ends the grant and asks for a reconnect when Tandoor answers 403 for a token it no longer knows', async () => {
    await startTransport();
    const accessToken = await signIn('gone-token');
    goneTokens.add('gone-token');

    expectReconnect(await rpcResult(await callTool('create_space', accessToken)));
    expectChallenge(await listTools(accessToken));
  });

  it('checks the token once with the user\'s own token after a Tandoor 403', async () => {
    await startTransport();
    const accessToken = await signIn('alice-token');
    seenTokens = [];

    await rpcResult(await callTool('create_space', accessToken));
    expect(seenTokens).toEqual(['alice-token', 'alice-token']);
  });

  it.each(['reset', 'error'] as const)('keeps a Tandoor 403 an ordinary tool error and the grant alive when the token check fails with a %s', async (failure) => {
    await startTransport();
    const accessToken = await signIn('alice-token');
    brokenChecks.set('alice-token', failure);

    const result = await rpcResult(await callTool('create_space', accessToken));
    expect(result._meta).toBeUndefined();
    expect(result.content[0].text).toMatch(/^Error: Tandoor API error: 403 Forbidden\nDetail: read-only token/);
    brokenChecks.clear();
    expect((await listTools(accessToken)).status).toBe(200);
  });

  it('answers a signed-in malformed JSON body with a 400 JSON-RPC parse error', async () => {
    await startTransport();
    const accessToken = await signIn('alice-token');

    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${accessToken}` },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  });

  it('keeps /healthz open', async () => {
    await startTransport();
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });

  it.each(['GET', 'DELETE', 'PUT'])('answers %s on the MCP path with 405', async (method) => {
    await startTransport();
    expect((await fetch(`${base}/mcp`, { method })).status).toBe(405);
  });

  it.each([
    ['bulk_create_meal_plans hydration', 'bulk_create_meal_plans', { entries: [ENTRY] }],
    ['create_meal_plan hydration', 'create_meal_plan', ENTRY],
  ])('asks for a reconnect when Tandoor rejects the token during %s', async (_label, tool, args) => {
    await startTransport(withTools(registerMealPlanTools));
    const accessToken = await signIn('dead-token');
    deadTokens.add('dead-token');

    expectReconnect(await rpcResult(await callWith(tool, args, accessToken)));
    expectChallenge(await listTools(accessToken));
  });

  it('asks for a reconnect when Tandoor rejects one write in bulk_create_meal_plans', async () => {
    await startTransport(withTools(registerMealPlanTools));
    const accessToken = await signIn('dead-token');
    deadWrites.add('dead-token');

    expectReconnect(await rpcResult(await callWith('bulk_create_meal_plans', { entries: [ENTRY] }, accessToken)));
    expectChallenge(await listTools(accessToken));
  });

  it('asks for a reconnect when Tandoor rejects the token during import_recipe_from_url', async () => {
    process.env.TANDOOR_MCP_TEST_SKIP_URL_CHECK = '1';
    await startTransport(withTools(registerRecipeTools));
    const accessToken = await signIn('dead-token');
    deadTokens.add('dead-token');

    expectReconnect(await rpcResult(await callWith('import_recipe_from_url', { url: 'https://recipes.test/page' }, accessToken)));
    expectChallenge(await listTools(accessToken));
  });

  it('ends every connection that holds the rejected Tandoor token and keeps other users connected', async () => {
    await startTransport();
    const first = await signIn('shared-token');
    const second = await signIn('shared-token');
    const other = await signIn('alice-token');
    deadTokens.add('shared-token');

    expectReconnect(await rpcResult(await callTool('whoami', first)));
    expectChallenge(await listTools(second));
    expect((await listTools(other)).status).toBe(200);
  });

  it('still asks for a reconnect and logs one line without tokens when the store cannot be written', async () => {
    await startTransport();
    const accessToken = await signIn('dead-token');
    deadTokens.add('dead-token');
    mkdirSync(join(root, 'oauth.json.tmp'));
    const lines: string[] = [];
    const write = process.stderr.write.bind(process.stderr);
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return write(chunk);
    });

    expectReconnect(await rpcResult(await callTool('whoami', accessToken)));
    vi.restoreAllMocks();
    const failures = lines.filter((line) => line.includes('event=revoke_failed'));
    expect(failures).toHaveLength(1);
    expect(failures[0]).not.toContain('dead-token');
    expect(failures[0]).not.toContain(accessToken);
  });

  it('answers 429 once a visitor spends the failed-token burst, and still serves valid tokens', async () => {
    await startTransport();
    const accessToken = await signIn('alice-token');
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });

    for (let i = 0; i < 20; i++) expect((await listTools('wrong')).status).toBe(401);
    expect((await listTools('wrong')).status).toBe(429);
    expect((await listTools()).status).toBe(429);
    expect((await listTools(accessToken)).status).toBe(200);
  });

  it('answers 503 before checking the token while draining', async () => {
    let release!: () => void;
    let started!: () => void;
    const running = new Promise<void>((resolve) => { started = resolve; });
    await startTransport(withTools((server, client) => {
      registerStringTool(server, client, 'hang', { description: 'hang', inputSchema: {} }, async () => {
        started();
        await new Promise<void>((resolve) => { release = resolve; });
        return 'done';
      });
    }));
    const accessToken = await signIn('alice-token');
    const call = callWith('hang', {}, accessToken);
    await running;
    const stopping = handle.stop();

    expect((await listTools()).status).toBe(503);
    release();
    await (await call).text();
    await stopping;
  });

  it('accepts a token 1 ms before it expires and refuses it at the expiry instant', async () => {
    const signedInAt = 1_800_000_000_500;
    vi.useFakeTimers({ toFake: ['Date'], now: signedInAt });
    await startTransport();
    const accessToken = await signIn('alice-token');
    const expiresAt = signedInAt + 60 * 60_000;

    vi.setSystemTime(expiresAt - 1);
    expect((await listTools(accessToken)).status).toBe(200);
    vi.setSystemTime(expiresAt);
    expectChallenge(await listTools(accessToken));
  });

  it('carries the realm on an insufficient_scope challenge', async () => {
    const seeded = openStore({ dir: root, key: Buffer.from(SECRET, 'hex') });
    const { accessToken } = seeded.createGrant({ clientId: 'other', tandoorToken: 'alice-token', scopes: ['other'], resource: PUBLIC_URL });
    await startTransport();

    const res = await listTools(accessToken);
    expect(res.status).toBe(403);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer realm="tandoor-mcp", error="insufficient_scope"/);
  });

  it.each(['/MCP', '/mcp/', '//mcp'])('never reaches a Tandoor client through %s', async (path) => {
    await startTransport();
    const accessToken = await signIn('alice-token');
    seenTokens = [];

    for (const headers of [{}, { Authorization: `Bearer ${accessToken}` }]) {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'whoami', arguments: {} } }),
      });
      expect(res.status).not.toBe(200);
    }
    expect(seenTokens).toEqual([]);
  });
});
