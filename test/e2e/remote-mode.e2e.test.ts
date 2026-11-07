import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const tandoorHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const BUILT_INDEX = resolve(__dirname, '..', '..', 'build', 'index.js');
const PUBLIC_URL = 'https://mcp.test/mcp';
const ISSUER = 'https://mcp.test/';
const PRM_URL = 'https://mcp.test/.well-known/oauth-protected-resource/mcp';
const REDIRECT = 'http://127.0.0.1:9/callback';
const RECONNECT = 'Tandoor rejected your token. Reconnect this connector to sign in again.';
const SECRET = randomBytes(32).toString('hex');
const RECIPE_NAME = `mcp-e2e-remote-${Date.now()}`;

let dataDir: string;
let server: ChildProcess;
let base: string;
let extraTokenId: number | undefined;
let extraToken: string;
let clientId: string;
let verifier: string;
let code: string;
let accessToken: string;
let refreshToken: string;
let recipeId: number | undefined;

function freePort(): Promise<number> {
  return new Promise((done) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => done(port));
    });
  });
}

const redact = (text: string) =>
  [token!, extraToken, SECRET].reduce((out, secret) => out.replaceAll(secret, '[redacted]'), text).replace(/tda_[\w-]+/g, '[redacted]');

async function startServer(): Promise<void> {
  const port = await freePort();
  server = spawn('node', [BUILT_INDEX], {
    cwd: dataDir,
    env: {
      PATH: process.env.PATH!,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME!,
      TANDOOR_URL: url!,
      TANDOOR_MCP_TRANSPORT: 'http',
      TANDOOR_MCP_PUBLIC_URL: PUBLIC_URL,
      TANDOOR_MCP_SECRET_KEY: SECRET,
      TANDOOR_MCP_DATA_DIR: dataDir,
      TANDOOR_MCP_HTTP_PORT: String(port),
    },
  });
  await new Promise<void>((ready, failed) => {
    let stderr = '';
    server.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.includes(' on http://')) ready();
    });
    server.on('error', failed);
    server.on('close', (exitCode) => failed(new Error(`server exited with ${exitCode} before listening:\n${redact(stderr)}`)));
  });
  base = `http://127.0.0.1:${port}`;
}

async function stopServer(): Promise<void> {
  if (server.exitCode !== null) return;
  const exited = new Promise((done) => server.once('exit', done));
  server.kill('SIGTERM');
  await exited;
}

const form = (fields: Record<string, string>) => new URLSearchParams(fields);

const tokenRequest = (fields: Record<string, string>) =>
  fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: clientId, resource: PUBLIC_URL, ...fields }),
  });

function mcp(body: string, bearer?: string): Promise<Response> {
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body,
  });
}

async function rpc(method: string, params: unknown, bearer = accessToken): Promise<any> {
  const res = await mcp(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), bearer);
  expect(res.status).toBe(200);
  return (await res.json()).result;
}

const callTool = (name: string, args: Record<string, unknown>, bearer = accessToken) => rpc('tools/call', { name, arguments: args }, bearer);

function expectChallenge(res: Response): void {
  expect(res.status).toBe(401);
  expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="${PRM_URL}"`);
}

(url && token ? describe : describe.skip)('remote mode against a real Tandoor', () => {
  beforeAll(async () => {
    const minted = await fetch(`${url}/api/access-token/`, {
      method: 'POST',
      headers: tandoorHeaders,
      body: JSON.stringify({ scope: 'read write', expires: new Date(Date.now() + 60 * 60_000).toISOString() }),
    });
    if (minted.status !== 201) throw new Error(`POST /api/access-token/ answered ${minted.status}: ${await minted.text()}`);
    const body = (await minted.json()) as { id: number; token: string };
    extraTokenId = body.id;
    extraToken = body.token;
    dataDir = mkdtempSync(join(tmpdir(), 'tandoor-mcp-remote-e2e-'));
    await startServer();
  });

  afterAll(async () => {
    if (server) await stopServer();
    if (recipeId !== undefined) await fetch(`${url}/api/recipe/${recipeId}/`, { method: 'DELETE', headers: tandoorHeaders });
    if (extraTokenId !== undefined) await fetch(`${url}/api/access-token/${extraTokenId}/`, { method: 'DELETE', headers: tandoorHeaders });
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it('serves authorization server and protected resource metadata for the public URL', async () => {
    const as = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    expect(as).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: 'https://mcp.test/authorize',
      token_endpoint: 'https://mcp.test/token',
      registration_endpoint: 'https://mcp.test/register',
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
    });
    const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(prm).toEqual({ resource: PUBLIC_URL, authorization_servers: [ISSUER], scopes_supported: ['tandoor'] });
  });

  it('answers an unauthenticated MCP request with 401 naming the resource metadata', async () => {
    expectChallenge(await mcp(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })));
  });

  it('registers a client, shows the consent page and returns a code with iss on approve', async () => {
    const registered = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', client_name: 'remote e2e' }),
    });
    expect(registered.status).toBe(201);
    clientId = ((await registered.json()) as { client_id: string }).client_id;

    verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const query = form({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', resource: PUBLIC_URL, scope: 'tandoor', state: 'e2e-state' });
    const consentPage = await fetch(`${base}/authorize?${query}`, { redirect: 'manual' });
    expect(consentPage.status).toBe(200);
    const html = await consentPage.text();
    expect(html).toContain('name="tandoor_token"');
    const hidden = Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map((m) => [m[1]!, m[2]!.replace(/&amp;/g, '&')]));

    const approved = await fetch(`${base}/consent`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: consentPage.headers.get('set-cookie')!.split(';')[0]! },
      body: form({ ...hidden, tandoor_token: extraToken, action: 'approve' }),
    });
    expect(approved.status).toBe(302);
    const location = new URL(approved.headers.get('location')!);
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT);
    expect(location.searchParams.get('iss')).toBe(ISSUER);
    expect(location.searchParams.get('state')).toBe('e2e-state');
    code = location.searchParams.get('code')!;
    expect(code).toEqual(expect.any(String));
  });

  it('exchanges the code with the PKCE verifier for an access and refresh token', async () => {
    const res = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: REDIRECT });
    expect(res.status).toBe(200);
    const tokens = (await res.json()) as { access_token: string; refresh_token: string; token_type: string; scope: string };
    expect(tokens).toMatchObject({ token_type: 'Bearer', scope: 'tandoor', access_token: expect.any(String), refresh_token: expect.any(String) });
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
  });

  it('lists tools with titles, annotations and the oauth2 security scheme', async () => {
    const { tools } = await rpc('tools/list', {});
    expect(tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining(['list_recipes', 'create_recipe', 'get_recipe']));
    for (const tool of tools) {
      expect(tool.title, tool.name).toEqual(expect.any(String));
      expect(tool.annotations, tool.name).toEqual(expect.any(Object));
      expect(tool._meta?.securitySchemes, tool.name).toEqual([{ type: 'oauth2', scopes: ['tandoor'] }]);
    }
  });

  it('reads recipes, creates one and reads it back through the signed-in Tandoor token', async () => {
    const listed = await callTool('list_recipes', { page_size: 5 });
    expect(listed.isError).toBeFalsy();

    const created = await callTool('create_recipe', { name: RECIPE_NAME, steps: [{ instruction: 'Stir once.', ingredients: [] }] });
    expect(created.isError).toBeFalsy();
    recipeId = created.structuredContent.id;
    expect(recipeId).toEqual(expect.any(Number));

    const fetched = await callTool('get_recipe', { id: recipeId });
    expect(fetched.isError).toBeFalsy();
    expect(fetched.structuredContent).toMatchObject({ id: recipeId, name: RECIPE_NAME });
    expect(fetched.structuredContent.steps).toHaveLength(1);
  });

  it('rotates the refresh token into a new working token pair', async () => {
    const res = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    expect(res.status).toBe(200);
    const rotated = (await res.json()) as { access_token: string; refresh_token: string };
    expect(rotated.refresh_token !== refreshToken).toBe(true);
    expect(rotated.access_token !== accessToken).toBe(true);

    accessToken = rotated.access_token;
    refreshToken = rotated.refresh_token;
    expect((await callTool('list_recipes', { page_size: 1 })).isError).toBeFalsy();
  });

  it('keeps the access token valid across a restart with the same key and data dir', async () => {
    await stopServer();
    await startServer();
    expect((await callTool('get_recipe', { id: recipeId })).structuredContent).toMatchObject({ id: recipeId, name: RECIPE_NAME });
  });

  it('answers a signed-in malformed JSON body with 400 and a -32700 parse error', async () => {
    const res = await mcp('{"jsonrpc":', accessToken);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });

  it('asks for a reconnect once Tandoor no longer knows the token, then refuses the grant', async () => {
    const revoked = await fetch(`${url}/api/access-token/${extraTokenId}/`, { method: 'DELETE', headers: tandoorHeaders });
    expect(revoked.status).toBe(204);
    extraTokenId = undefined;

    const result = await callTool('list_recipes', { page_size: 1 });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: RECONNECT }]);
    expect(result._meta['mcp/www_authenticate']).toHaveLength(1);

    expectChallenge(await mcp(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), accessToken));
  });
});
