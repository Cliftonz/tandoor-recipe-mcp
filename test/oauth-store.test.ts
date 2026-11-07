import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { dataDir, openStore } from '../src/lib/oauth/store.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TANDOOR_TOKEN = 'tda_plaintext_tandoor_token_123';
const GRANT = { clientId: 'client-a', tandoorToken: TANDOOR_TOKEN, scopes: ['mcp'], resource: 'https://mcp.example.com/mcp' };

let root: string;
let dir: string;
let key: Buffer;
let clock: number;
const now = () => clock;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'oauth-store-'));
  dir = join(root, 'data');
  key = randomBytes(32);
  clock = 1_700_000_000_000;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const PUBLIC_CLIENT: OAuthClientInformationFull = {
  client_id: 'client-a',
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  client_name: 'Claude',
  token_endpoint_auth_method: 'none',
};

const writeFile = (text: string) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'oauth.json'), text);
};

const fileText = () => readFileSync(join(dir, 'oauth.json'), 'utf8');

describe('dataDir', () => {
  it('uses TANDOOR_MCP_DATA_DIR when absolute', () => {
    expect(dataDir({ TANDOOR_MCP_DATA_DIR: '/srv/tm', XDG_DATA_HOME: '/xdg' })).toBe('/srv/tm');
  });

  it('falls back to XDG_DATA_HOME/tandoor-mcp when the override is unset or relative', () => {
    expect(dataDir({ XDG_DATA_HOME: '/xdg' })).toBe(join('/xdg', 'tandoor-mcp'));
    expect(dataDir({ TANDOOR_MCP_DATA_DIR: 'rel', XDG_DATA_HOME: '/xdg' })).toBe(join('/xdg', 'tandoor-mcp'));
  });

  it('falls back to ~/.local/share/tandoor-mcp when XDG_DATA_HOME is unset or relative', () => {
    const fallback = join(homedir(), '.local', 'share', 'tandoor-mcp');
    expect(dataDir({})).toBe(fallback);
    expect(dataDir({ XDG_DATA_HOME: 'rel' })).toBe(fallback);
  });
});

describe('clients', () => {
  it('saves a client and gets it back after reopening', () => {
    openStore({ dir, key, now }).saveClient(PUBLIC_CLIENT);
    const reopened = openStore({ dir, key, now });
    expect(reopened.getClient('client-a')).toEqual(PUBLIC_CLIENT);
    expect(reopened.getClient('client-b')).toBeUndefined();
  });

  it('refuses confidential clients and saves nothing', () => {
    const store = openStore({ dir, key, now });
    const confidential: OAuthClientInformationFull[] = [
      { ...PUBLIC_CLIENT, token_endpoint_auth_method: 'client_secret_basic' },
      { client_id: 'client-a', redirect_uris: PUBLIC_CLIENT.redirect_uris },
      { ...PUBLIC_CLIENT, client_secret: 'shh' },
    ];
    for (const client of confidential) expect(() => store.saveClient(client)).toThrow('public client');
    expect(store.getClient('client-a')).toBeUndefined();
    expect(openStore({ dir, key, now }).getClient('client-a')).toBeUndefined();
  });
});

describe('grants', () => {
  it('issues random tokens with a one hour lifetime and resolves the access token', () => {
    const store = openStore({ dir, key, now });
    const issued = store.createGrant(GRANT);
    expect(issued.expiresIn).toBe(3600);
    expect(Buffer.from(issued.accessToken, 'base64url').length).toBeGreaterThanOrEqual(32);
    expect(Buffer.from(issued.refreshToken, 'base64url').length).toBeGreaterThanOrEqual(32);
    expect(issued.accessToken).not.toBe(issued.refreshToken);
    expect(store.lookupAccessToken(issued.accessToken)).toEqual({
      grantId: expect.any(String),
      clientId: 'client-a',
      tandoorToken: TANDOOR_TOKEN,
      scopes: ['mcp'],
      resource: 'https://mcp.example.com/mcp',
      expiresAt: clock + HOUR,
    });
  });

  it('persists grants across reopen without writing any plaintext token to disk', () => {
    const issued = openStore({ dir, key, now }).createGrant(GRANT);
    const text = fileText();
    expect(text).not.toContain(TANDOOR_TOKEN);
    expect(text).not.toContain(issued.accessToken);
    expect(text).not.toContain(issued.refreshToken);
    expect(openStore({ dir, key, now }).lookupAccessToken(issued.accessToken)?.tandoorToken).toBe(TANDOOR_TOKEN);
  });

  it('rejects unknown and expired access tokens', () => {
    const store = openStore({ dir, key, now });
    const issued = store.createGrant(GRANT);
    expect(store.lookupAccessToken('nope')).toBeUndefined();
    clock += HOUR - 1;
    expect(store.lookupAccessToken(issued.accessToken)).toBeDefined();
    clock += 1;
    expect(store.lookupAccessToken(issued.accessToken)).toBeUndefined();
  });

  it('revokes a grant by id', () => {
    const store = openStore({ dir, key, now });
    const issued = store.createGrant(GRANT);
    store.revokeGrant(store.lookupAccessToken(issued.accessToken)!.grantId);
    expect(store.lookupAccessToken(issued.accessToken)).toBeUndefined();
    expect(store.rotateRefreshToken(issued.refreshToken, 'client-a')).toBeUndefined();
    expect(openStore({ dir, key, now }).lookupAccessToken(issued.accessToken)).toBeUndefined();
  });
});

describe('pruning', () => {
  it('drops grants whose refresh token has expired from the file on the next write', () => {
    const store = openStore({ dir, key, now });
    const stale = store.createGrant(GRANT);
    const staleId = store.lookupAccessToken(stale.accessToken)!.grantId;
    clock += 30 * DAY;
    store.createGrant({ ...GRANT, tandoorToken: 'other' });
    expect(fileText()).not.toContain(staleId);
  });
});

describe('refresh rotation', () => {
  it('returns a new pair, invalidates the old refresh token, and slides the 30 day window', () => {
    const store = openStore({ dir, key, now });
    const first = store.createGrant(GRANT);
    clock += 29 * DAY;
    const second = store.rotateRefreshToken(first.refreshToken, 'client-a')!;
    expect(second.expiresIn).toBe(3600);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(store.lookupAccessToken(second.accessToken)).toMatchObject({ tandoorToken: TANDOOR_TOKEN, expiresAt: clock + HOUR });
    clock += 29 * DAY;
    expect(store.rotateRefreshToken(second.refreshToken, 'client-a')).toBeDefined();
  });

  it('rejects an expired refresh token', () => {
    const store = openStore({ dir, key, now });
    const issued = store.createGrant(GRANT);
    clock += 30 * DAY;
    expect(store.rotateRefreshToken(issued.refreshToken, 'client-a')).toBeUndefined();
  });

  it('rejects a refresh token presented by a different client without revoking the grant', () => {
    const store = openStore({ dir, key, now });
    const issued = store.createGrant(GRANT);
    expect(store.rotateRefreshToken(issued.refreshToken, 'client-b')).toBeUndefined();
    expect(store.lookupAccessToken(issued.accessToken)).toBeDefined();
    expect(store.rotateRefreshToken(issued.refreshToken, 'client-a')).toBeDefined();
  });

  it('rejects an unknown refresh token', () => {
    expect(openStore({ dir, key, now }).rotateRefreshToken('nope', 'client-a')).toBeUndefined();
  });

  it('revokes the whole grant when an exchanged refresh token is reused, even after reopen', () => {
    const first = openStore({ dir, key, now }).createGrant(GRANT);
    const second = openStore({ dir, key, now }).rotateRefreshToken(first.refreshToken, 'client-a')!;
    const store = openStore({ dir, key, now });
    expect(store.rotateRefreshToken(first.refreshToken, 'client-a')).toBeUndefined();
    expect(store.lookupAccessToken(second.accessToken)).toBeUndefined();
    expect(store.rotateRefreshToken(second.refreshToken, 'client-a')).toBeUndefined();
    expect(openStore({ dir, key, now }).lookupAccessToken(second.accessToken)).toBeUndefined();
  });

  it('still detects reuse of a token exchanged 29 days ago', () => {
    const store = openStore({ dir, key, now });
    const first = store.createGrant(GRANT);
    const second = store.rotateRefreshToken(first.refreshToken, 'client-a')!;
    clock += 29 * DAY;
    store.createGrant({ ...GRANT, tandoorToken: 'other' });
    expect(store.rotateRefreshToken(first.refreshToken, 'client-a')).toBeUndefined();
    expect(store.rotateRefreshToken(second.refreshToken, 'client-a')).toBeUndefined();
  });

  it('forgets exchanged tokens older than the refresh window, so they no longer revoke the grant', () => {
    const store = openStore({ dir, key, now });
    const first = store.createGrant(GRANT);
    const second = store.rotateRefreshToken(first.refreshToken, 'client-a')!;
    clock += 29 * DAY;
    const third = store.rotateRefreshToken(second.refreshToken, 'client-a')!;
    clock += DAY;
    const fourth = store.rotateRefreshToken(third.refreshToken, 'client-a')!;
    expect(store.rotateRefreshToken(first.refreshToken, 'client-a')).toBeUndefined();
    expect(store.lookupAccessToken(fourth.accessToken)).toBeDefined();
  });

  it('leaves other grants working when one grant is revoked for reuse', () => {
    const store = openStore({ dir, key, now });
    const victim = store.createGrant(GRANT);
    const bystander = store.createGrant({ ...GRANT, tandoorToken: 'other' });
    store.rotateRefreshToken(victim.refreshToken, 'client-a');
    store.rotateRefreshToken(victim.refreshToken, 'client-a');
    expect(store.lookupAccessToken(bystander.accessToken)?.tandoorToken).toBe('other');
  });
});

describe('unreadable file', () => {
  it('fails loudly naming the file when the JSON is corrupt, and leaves the file alone', () => {
    writeFile('{not json');
    expect(() => openStore({ dir, key, now })).toThrow(join(dir, 'oauth.json'));
    expect(fileText()).toBe('{not json');
  });

  it('fails loudly naming the file when the key is wrong, and leaves the file alone', () => {
    openStore({ dir, key, now }).createGrant(GRANT);
    const before = fileText();
    expect(() => openStore({ dir, key: randomBytes(32), now })).toThrow(join(dir, 'oauth.json'));
    expect(fileText()).toBe(before);
  });

  it('fails loudly on a wrong key even when the store holds no grants', () => {
    openStore({ dir, key, now }).saveClient(PUBLIC_CLIENT);
    expect(() => openStore({ dir, key: randomBytes(32), now })).toThrow(`cannot read OAuth store ${join(dir, 'oauth.json')}`);
  });
});

describe('malformed file', () => {
  const valid = () => {
    openStore({ dir, key, now }).createGrant(GRANT);
    return JSON.parse(fileText()) as { clients: unknown; grants: Record<string, Record<string, unknown>> };
  };
  const grantOf = (file: ReturnType<typeof valid>) => Object.values(file.grants)[0]!;

  const cases: [string, (file: ReturnType<typeof valid>) => unknown][] = [
    ['missing clients', (file) => ({ grants: file.grants })],
    ['missing grants', (file) => ({ clients: file.clients })],
    ['grants as an array', (file) => ({ ...file, grants: [] })],
    ['a grant missing a field', (file) => { delete grantOf(file).refreshHash; return file; }],
    ['a grant field of the wrong type', (file) => { grantOf(file).accessExpiresAt = 'soon'; return file; }],
    ['a client that is not an object', (file) => ({ ...file, clients: { 'client-a': 'x' } })],
  ];

  for (const [name, mutate] of cases) {
    it(`fails loudly naming the file for ${name}, and leaves the file alone`, () => {
      const text = JSON.stringify(mutate(valid()));
      writeFile(text);
      expect(() => openStore({ dir, key, now })).toThrow(`cannot read OAuth store ${join(dir, 'oauth.json')}`);
      expect(fileText()).toBe(text);
    });
  }

  it('fails loudly when two grants have their encrypted Tandoor tokens swapped', () => {
    const store = openStore({ dir, key, now });
    store.createGrant(GRANT);
    store.createGrant({ ...GRANT, tandoorToken: 'other' });
    const file = JSON.parse(fileText()) as { grants: Record<string, { tandoorToken: unknown }> };
    const [a, b] = Object.values(file.grants);
    [a!.tandoorToken, b!.tandoorToken] = [b!.tandoorToken, a!.tandoorToken];
    writeFile(JSON.stringify(file));
    expect(() => openStore({ dir, key, now })).toThrow(`cannot read OAuth store ${join(dir, 'oauth.json')}`);
  });
});

describe('file permissions', () => {
  it.skipIf(process.platform === 'win32')('creates the directory 0700 and the file 0600, leaving no temp file', () => {
    openStore({ dir, key, now }).createGrant(GRANT);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, 'oauth.json')).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual(['oauth.json']);
  });

  it.skipIf(process.platform === 'win32')('tightens a looser existing directory and a leftover temp file', () => {
    mkdirSync(dir, { mode: 0o755 });
    chmodSync(dir, 0o755);
    writeFileSync(join(dir, 'oauth.json.tmp'), 'leftover', { mode: 0o644 });
    openStore({ dir, key, now }).createGrant(GRANT);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, 'oauth.json')).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual(['oauth.json']);
  });
});
