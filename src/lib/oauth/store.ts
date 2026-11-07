import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';

const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UNUSED_CLIENT_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_CHECK_AAD = 'key-check';
const KEY_CHECK_PLAINTEXT = 'tandoor-mcp';

const EncryptedSecretSchema = z.object({ iv: z.string(), tag: z.string(), data: z.string() });

const GrantSchema = z.object({
  clientId: z.string(),
  tandoorToken: EncryptedSecretSchema,
  scopes: z.array(z.string()),
  resource: z.string(),
  accessHash: z.string(),
  accessExpiresAt: z.number(),
  refreshHash: z.string(),
  refreshExpiresAt: z.number(),
  exchangedRefreshHashes: z.array(z.object({ hash: z.string(), exchangedAt: z.number() })),
});

type StoredClient = OAuthClientInformationFull & { completed_grant?: boolean };

const ClientShapeSchema = z.looseObject({ client_id: z.string(), redirect_uris: z.array(z.string()) });

const StoreFileSchema = z.object({
  keyCheck: EncryptedSecretSchema,
  clients: z.record(z.string(), z.custom<StoredClient>((value) => ClientShapeSchema.safeParse(value).success)),
  grants: z.record(z.string(), GrantSchema),
});

type EncryptedSecret = z.infer<typeof EncryptedSecretSchema>;
type Grant = z.infer<typeof GrantSchema>;
type StoreFile = z.infer<typeof StoreFileSchema>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AccessGrant {
  grantId: string;
  clientId: string;
  tandoorToken: string;
  scopes: string[];
  resource: string;
  expiresAt: number;
}

interface NewGrant {
  clientId: string;
  tandoorToken: string;
  scopes: string[];
  resource: string;
}

export function dataDir(env: Record<string, string | undefined>): string {
  const override = env.TANDOOR_MCP_DATA_DIR ?? '';
  if (isAbsolute(override)) return override;
  const dataHome = env.XDG_DATA_HOME ?? '';
  return join(isAbsolute(dataHome) ? dataHome : join(homedir(), '.local', 'share'), 'tandoor-mcp');
}

const hash = (token: string) => createHash('sha256').update(token).digest('base64url');
const newToken = () => randomBytes(32).toString('base64url');

function encrypt(key: Buffer, plaintext: string, aad: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv).setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

function decrypt(key: Buffer, secret: EncryptedSecret, aad: string): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(secret.iv, 'base64')).setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(secret.data, 'base64')), decipher.final()]).toString('utf8');
}

function loadAndVerify(file: string, key: Buffer): StoreFile {
  if (!existsSync(file)) return { keyCheck: encrypt(key, KEY_CHECK_PLAINTEXT, KEY_CHECK_AAD), clients: {}, grants: {} };
  try {
    const parsed = StoreFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    decrypt(key, parsed.keyCheck, KEY_CHECK_AAD);
    for (const [grantId, grant] of Object.entries(parsed.grants)) decrypt(key, grant.tandoorToken, grantId);
    return parsed;
  } catch (error) {
    throw new Error(`cannot read OAuth store ${file}: ${(error as Error).message}`);
  }
}

export function openStore({ dir, key, now = Date.now }: { dir: string; key: Buffer; now?: () => number }) {
  const file = join(dir, 'oauth.json');
  const state = loadAndVerify(file, key);

  function prune(): void {
    for (const [grantId, grant] of Object.entries(state.grants)) {
      if (grant.refreshExpiresAt <= now()) delete state.grants[grantId];
      else grant.exchangedRefreshHashes = grant.exchangedRefreshHashes.filter(({ exchangedAt }) => exchangedAt + REFRESH_TTL_MS > now());
    }
    for (const [clientId, client] of Object.entries(state.clients)) {
      const old = client.client_id_issued_at !== undefined && client.client_id_issued_at * 1000 + UNUSED_CLIENT_TTL_MS <= now();
      if (old && !client.completed_grant && !Object.values(state.grants).some((grant) => grant.clientId === clientId)) delete state.clients[clientId];
    }
  }

  function save(): void {
    prune();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    const temp = `${file}.tmp`;
    writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, file);
  }

  function issue(grant: Omit<Grant, 'accessHash' | 'accessExpiresAt' | 'refreshHash' | 'refreshExpiresAt'>): { grant: Grant; pair: TokenPair } {
    const accessToken = newToken();
    const refreshToken = newToken();
    return {
      grant: {
        ...grant,
        accessHash: hash(accessToken),
        accessExpiresAt: now() + ACCESS_TTL_MS,
        refreshHash: hash(refreshToken),
        refreshExpiresAt: now() + REFRESH_TTL_MS,
      },
      pair: { accessToken, refreshToken, expiresIn: ACCESS_TTL_MS / 1000 },
    };
  }

  return {
    saveClient(client: OAuthClientInformationFull): void {
      if (client.token_endpoint_auth_method !== 'none' || client.client_secret !== undefined) {
        throw new Error(`client ${client.client_id} must be a public client: token_endpoint_auth_method "none" and no client_secret`);
      }
      state.clients[client.client_id] = client;
      save();
    },

    getClient(clientId: string): OAuthClientInformationFull | undefined {
      return state.clients[clientId];
    },

    createGrant({ clientId, tandoorToken, scopes, resource }: NewGrant): TokenPair & { grantId: string } {
      const grantId = randomUUID();
      const { grant, pair } = issue({ clientId, tandoorToken: encrypt(key, tandoorToken, grantId), scopes, resource, exchangedRefreshHashes: [] });
      state.grants[grantId] = grant;
      const client = state.clients[clientId];
      if (client) client.completed_grant = true;
      save();
      return { ...pair, grantId };
    },

    lookupAccessToken(accessToken: string): AccessGrant | undefined {
      const accessHash = hash(accessToken);
      const entry = Object.entries(state.grants).find(([, grant]) => grant.accessHash === accessHash);
      if (!entry || entry[1].accessExpiresAt <= now()) return undefined;
      const [grantId, grant] = entry;
      return {
        grantId,
        clientId: grant.clientId,
        tandoorToken: decrypt(key, grant.tandoorToken, grantId),
        scopes: grant.scopes,
        resource: grant.resource,
        expiresAt: grant.accessExpiresAt,
      };
    },

    rotateRefreshToken(refreshToken: string, clientId: string): TokenPair | undefined {
      const refreshHash = hash(refreshToken);
      const reused = Object.keys(state.grants).find((id) => state.grants[id]!.exchangedRefreshHashes.some((exchanged) => exchanged.hash === refreshHash));
      if (reused) {
        delete state.grants[reused];
        save();
        return undefined;
      }
      const entry = Object.entries(state.grants).find(([, grant]) => grant.refreshHash === refreshHash);
      if (!entry) return undefined;
      const [grantId, current] = entry;
      if (current.clientId !== clientId || current.refreshExpiresAt <= now()) return undefined;
      const exchanged = { hash: refreshHash, exchangedAt: now() };
      const { grant, pair } = issue({ ...current, exchangedRefreshHashes: [...current.exchangedRefreshHashes, exchanged] });
      state.grants[grantId] = grant;
      save();
      return pair;
    },

    revokeToken(token: string, clientId: string): void {
      const tokenHash = hash(token);
      const entry = Object.entries(state.grants).find(([, grant]) => grant.clientId === clientId && (grant.accessHash === tokenHash || grant.refreshHash === tokenHash));
      if (!entry) return;
      delete state.grants[entry[0]];
      save();
    },

    revokeTandoorToken(tandoorToken: string): void {
      for (const [grantId, grant] of Object.entries(state.grants)) if (decrypt(key, grant.tandoorToken, grantId) === tandoorToken) delete state.grants[grantId];
      save();
    },

    revokeGrant(grantId: string): void {
      delete state.grants[grantId];
      save();
    },
  };
}
