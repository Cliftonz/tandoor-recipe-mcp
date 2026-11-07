import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { openStore } from '../src/lib/oauth/store.js';

const DAY = 24 * 60 * 60 * 1000;

let root: string;
let clock: number;
let store: ReturnType<typeof openStore>;

const client = (clientId: string, issuedAtMs: number) => ({
  client_id: clientId,
  client_id_issued_at: Math.floor(issuedAtMs / 1000),
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  token_endpoint_auth_method: 'none',
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'oauth-store-dcr-'));
  clock = 1_700_000_000_000;
  store = openStore({ dir: join(root, 'data'), key: randomBytes(32), now: () => clock });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('registered client cleanup', () => {
  it('deletes a client with no grant 24 hours after registration, on the next write', () => {
    store.saveClient(client('idle', clock));
    clock += DAY;
    store.saveClient(client('trigger', clock));
    expect(store.getClient('idle')).toBeUndefined();
    expect(store.getClient('trigger')).toBeDefined();
  });

  it('keeps a client with no grant just under 24 hours old', () => {
    store.saveClient(client('idle', clock));
    clock += DAY - 1000;
    store.saveClient(client('trigger', clock));
    expect(store.getClient('idle')).toBeDefined();
  });

  it('keeps a client that has a grant', () => {
    store.saveClient(client('used', clock));
    store.createGrant({ clientId: 'used', tandoorToken: 'tok', scopes: ['tandoor'], resource: 'https://mcp.example.com/mcp' });
    clock += 2 * DAY;
    store.saveClient(client('trigger', clock));
    expect(store.getClient('used')).toBeDefined();
  });

  it('keeps a client that once completed a grant after that grant is revoked and 24 hours pass', () => {
    store.saveClient(client('returning', clock));
    const grant = store.createGrant({ clientId: 'returning', tandoorToken: 'tok', scopes: ['tandoor'], resource: 'https://mcp.example.com/mcp' });
    store.revokeGrant(grant.grantId);
    clock += DAY;
    store.saveClient(client('trigger', clock));
    expect(store.getClient('returning')).toBeDefined();
  });
});
