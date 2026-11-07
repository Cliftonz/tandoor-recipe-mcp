import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { createOAuthMetadata, mcpAuthMetadataRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { CustomOAuthError, InvalidClientMetadataError, InvalidGrantError, InvalidRequestError, InvalidTargetError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { OAuthClientInformationFullSchema, type OAuthClientInformationFull, type OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { safeFetchBytes } from '../safe-fetch.js';
import { httpLog, mintReqId } from '../http-log.js';
import { renderConsent, renderExpired } from './consent-page.js';
import type { openStore, TokenPair } from './store.js';

const SCOPE = 'tandoor';
const CODE_TTL_MS = 5 * 60_000;
const CONSENT_TTL_MS = 10 * 60_000;
const CLIENT_DOCUMENT_TTL_MS = 60 * 60_000;
const CLIENT_DOCUMENT_CACHE_SIZE = 100;
const CLIENT_DOCUMENT_MAX_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const CONSENT_LIMIT = 10;
const CONSENT_WINDOW_MS = 60_000;
const CSRF_COOKIE = '__Host-tandoor-consent';
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const DOT_SEGMENT = /[/\\](\.|%2e){1,2}([/\\?#]|$)/i;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const CONSENT_ERRORS = {
  rejected: "Tandoor rejected that token. Check it in Tandoor's API settings and try again.",
  unreachable: "Tandoor didn't respond properly. Try again.",
  limited: 'Too many attempts. Wait a minute and try again.',
};

type Store = ReturnType<typeof openStore>;

interface AuthServerOptions {
  publicUrl: URL;
  secretKey: Buffer;
  tandoorUrl: string;
  store: Store;
  now?: () => number;
}

interface PendingCode {
  clientId: string;
  redirectUri: string;
  redirectUriSent: boolean;
  codeChallenge: string;
  tandoorToken: string;
  expiresAt: number;
}

const ConsentFieldsSchema = z.object({
  client_id: z.string(),
  client_name: z.string().optional(),
  redirect_uri: z.string(),
  redirect_uri_sent: z.enum(['yes', 'no']),
  code_challenge: z.string(),
  state: z.string().optional(),
});
type ConsentFields = z.infer<typeof ConsentFieldsSchema>;

const ConsentSubmitSchema = ConsentFieldsSchema.extend({
  csrf: z.string(),
  action: z.enum(['approve', 'deny']),
  tandoor_token: z.string(),
});

const errorMessage = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

function isAllowedRedirect(uri: string): boolean {
  const { protocol, hostname } = new URL(uri);
  return protocol === 'https:' || (protocol === 'http:' && LOOPBACK_HOSTS.has(hostname));
}

function publicClientProblem(client: Pick<OAuthClientInformationFull, 'token_endpoint_auth_method' | 'client_secret' | 'redirect_uris'>): 'confidential' | 'redirect_uri' | undefined {
  if (client.token_endpoint_auth_method !== 'none' || client.client_secret !== undefined) return 'confidential';
  if (!client.redirect_uris.every(isAllowedRedirect)) return 'redirect_uri';
  return undefined;
}

function withParams(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [name, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(name, value);
  return url.href;
}

function addIssuerToRedirects(issuer: string): express.RequestHandler {
  return (_req, res, next) => {
    const redirect = res.redirect.bind(res);
    res.redirect = (...args: [string] | [number, string]) =>
      args.length === 1 ? redirect(withParams(args[0], { iss: issuer })) : redirect(args[0], withParams(args[1], { iss: issuer }));
    next();
  };
}

const recordRedirectUriSent: express.RequestHandler = (req, res, next) => {
  res.locals.redirectUriSent = (req.method === 'POST' ? req.body : req.query)?.redirect_uri !== undefined;
  next();
};

function clientDocumentUrl(clientId: string): URL | undefined {
  if (!URL.canParse(clientId)) return undefined;
  const url = new URL(clientId);
  return url.protocol === 'https:' ? url : undefined;
}

async function fetchClientDocument(clientId: string, url: URL): Promise<OAuthClientInformationFull | undefined> {
  if (url.pathname === '/' || url.username || url.password || /[?#]/.test(clientId) || DOT_SEGMENT.test(clientId)) return undefined;
  let body: unknown;
  try {
    const { res, bytes } = await safeFetchBytes(
      clientId,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
      { maxBytes: CLIENT_DOCUMENT_MAX_BYTES, maxRedirects: 0, strict: true },
    );
    if (!res.ok) return undefined;
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    httpLog(mintReqId(), 'warn', 'cimd_fetch_failed', { client_id: clientId, error: errorMessage(error) });
    return undefined;
  }
  const parsed = OAuthClientInformationFullSchema.safeParse(body);
  if (!parsed.success || parsed.data.client_id !== clientId || publicClientProblem(parsed.data)) return undefined;
  return parsed.data;
}

function clientsStore(store: Store, now: () => number): OAuthRegisteredClientsStore {
  const documents = new Map<string, { client: OAuthClientInformationFull; expiresAt: number }>();
  return {
    async getClient(clientId) {
      const url = clientDocumentUrl(clientId);
      if (!url) return store.getClient(clientId);
      const cached = documents.get(clientId);
      if (cached && cached.expiresAt > now()) return cached.client;
      documents.delete(clientId);
      const client = await fetchClientDocument(clientId, url);
      if (!client) return undefined;
      if (documents.size >= CLIENT_DOCUMENT_CACHE_SIZE) {
        const [oldest] = documents.keys();
        documents.delete(oldest);
      }
      documents.set(clientId, { client, expiresAt: now() + CLIENT_DOCUMENT_TTL_MS });
      return client;
    },
    registerClient(metadata) {
      const problem = publicClientProblem(metadata);
      if (problem === 'confidential') throw new InvalidClientMetadataError('Only public clients can register: token_endpoint_auth_method must be "none".');
      if (problem === 'redirect_uri') throw new CustomOAuthError('invalid_redirect_uri', 'Redirect URIs must use https, or http on localhost, 127.0.0.1 or [::1].');
      const client = OAuthClientInformationFullSchema.parse(metadata);
      store.saveClient(client);
      return client;
    },
  };
}

export function consentLimiter(now: () => number): (visitor: string | undefined) => boolean {
  const windows = new Map<string, { start: number; count: number }>();
  return (visitor) => {
    if (visitor === undefined) return false;
    for (const [key, window] of windows) if (now() - window.start >= CONSENT_WINDOW_MS) windows.delete(key);
    const window = windows.get(visitor) ?? { start: now(), count: 0 };
    window.count++;
    windows.set(visitor, window);
    return window.count <= CONSENT_LIMIT;
  };
}

async function checkTandoorToken(tandoorUrl: string, token: string): Promise<'valid' | 'rejected' | 'unreachable'> {
  let res: Response;
  try {
    res = await fetch(`${tandoorUrl}/api/space/current/`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    httpLog(mintReqId(), 'warn', 'tandoor_check_failed', { error: errorMessage(error) });
    return 'unreachable';
  }
  if (res.status === 401 || res.status === 403) return 'rejected';
  return res.ok ? 'valid' : 'unreachable';
}

function describeApp({ client_id, client_name, redirect_uri }: ConsentFields): { app: string; appDetail: string | undefined } {
  const documentUrl = clientDocumentUrl(client_id);
  if (documentUrl) return client_name ? { app: client_name, appDetail: documentUrl.host } : { app: documentUrl.host, appDetail: undefined };
  return { app: new URL(redirect_uri).host, appDetail: client_name ? `calls itself ${client_name}` : undefined };
}

const tokenResponse = (pair: TokenPair): OAuthTokens => ({
  access_token: pair.accessToken,
  token_type: 'Bearer',
  expires_in: pair.expiresIn,
  refresh_token: pair.refreshToken,
  scope: SCOPE,
});

export function authRouter({ publicUrl, secretKey, tandoorUrl, store, now = Date.now }: AuthServerOptions): express.Router {
  const codes = new Map<string, PendingCode>();
  const redeemedCodes = new Map<string, { grantId: string; expiresAt: number }>();
  const usedNonces = new Map<string, number>();
  const allowSubmission = consentLimiter(now);

  const csrfFor = (nonce: string, fields: ConsentFields) =>
    createHmac('sha256', secretKey)
      .update(
        `consent-csrf\0${nonce}\0${JSON.stringify([fields.client_id, fields.client_name ?? null, fields.redirect_uri, fields.redirect_uri_sent, fields.code_challenge, fields.state ?? null])}`,
      )
      .digest('base64url');

  function consumeNonce(cookieHeader: string | undefined, submitted: z.infer<typeof ConsentSubmitSchema>): boolean {
    const prefix = `${CSRF_COOKIE}=`;
    const nonce = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length);
    if (!nonce) return false;
    const expected = Buffer.from(csrfFor(nonce, submitted));
    const given = Buffer.from(submitted.csrf);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    for (const [used, expiresAt] of usedNonces) if (expiresAt <= now()) usedNonces.delete(used);
    const expiresAt = Number(nonce.split('.')[0]) + CONSENT_TTL_MS;
    if (expiresAt <= now() || usedNonces.has(nonce)) return false;
    usedNonces.set(nonce, expiresAt);
    return true;
  }

  function showConsent(res: express.Response, status: number, fields: ConsentFields, error?: string): void {
    const nonce = `${now()}.${randomBytes(32).toString('base64url')}`;
    res.setHeader('Set-Cookie', `${CSRF_COOKIE}=${nonce}; Max-Age=${CONSENT_TTL_MS / 1000}; Secure; HttpOnly; SameSite=Lax; Path=/`);
    renderConsent(res, status, {
      ...describeApp(fields),
      redirectUri: fields.redirect_uri,
      tandoorUrl,
      hidden: {
        client_id: fields.client_id,
        client_name: fields.client_name,
        redirect_uri: fields.redirect_uri,
        redirect_uri_sent: fields.redirect_uri_sent,
        code_challenge: fields.code_challenge,
        state: fields.state,
        csrf: csrfFor(nonce, fields),
      },
      error,
    });
  }

  function issueCode(pending: Omit<PendingCode, 'expiresAt'>): string {
    for (const [code, entry] of codes) if (entry.expiresAt <= now()) codes.delete(code);
    for (const [code, entry] of redeemedCodes) if (entry.expiresAt <= now()) redeemedCodes.delete(code);
    const code = randomBytes(32).toString('base64url');
    codes.set(code, { ...pending, expiresAt: now() + CODE_TTL_MS });
    return code;
  }

  function liveCode(clientId: string, code: string): PendingCode {
    const redeemed = redeemedCodes.get(code);
    if (redeemed) {
      redeemedCodes.delete(code);
      store.revokeGrant(redeemed.grantId);
      throw new InvalidGrantError('Authorization code was already used.');
    }
    const entry = codes.get(code);
    if (!entry || entry.clientId !== clientId || entry.expiresAt <= now()) throw new InvalidGrantError('Invalid or expired authorization code.');
    return entry;
  }

  function requirePublicResource(resource: URL | undefined): void {
    if (resource?.href !== publicUrl.href) throw new InvalidTargetError(`resource must be ${publicUrl.href}`);
  }

  const provider: OAuthServerProvider = {
    clientsStore: clientsStore(store, now),

    async authorize(client, params, res) {
      requirePublicResource(params.resource);
      if (!CODE_CHALLENGE.test(params.codeChallenge)) throw new InvalidRequestError('code_challenge must be 43 base64url characters.');
      showConsent(res, 200, {
        client_id: client.client_id,
        client_name: client.client_name,
        redirect_uri: params.redirectUri,
        redirect_uri_sent: res.locals.redirectUriSent === true ? 'yes' : 'no',
        code_challenge: params.codeChallenge,
        state: params.state,
      });
    },

    async challengeForAuthorizationCode(client, code) {
      return liveCode(client.client_id, code).codeChallenge;
    },

    async exchangeAuthorizationCode(client, code, _codeVerifier, redirectUri, resource) {
      const entry = liveCode(client.client_id, code);
      codes.delete(code);
      if (redirectUri === undefined ? entry.redirectUriSent : redirectUri !== entry.redirectUri) {
        throw new InvalidGrantError('redirect_uri does not match the authorization request.');
      }
      requirePublicResource(resource);
      const grant = store.createGrant({ clientId: client.client_id, tandoorToken: entry.tandoorToken, scopes: [SCOPE], resource: publicUrl.href });
      redeemedCodes.set(code, { grantId: grant.grantId, expiresAt: entry.expiresAt });
      return tokenResponse(grant);
    },

    async exchangeRefreshToken(client, refreshToken, _scopes, resource) {
      requirePublicResource(resource);
      const pair = store.rotateRefreshToken(refreshToken, client.client_id);
      if (!pair) throw new InvalidGrantError('Invalid refresh token.');
      return tokenResponse(pair);
    },

    async verifyAccessToken() {
      throw new Error('The authorization server does not verify access tokens.');
    },

    async revokeToken(client, { token }) {
      store.revokeToken(token, client.client_id);
    },
  };

  const metadata = {
    ...createOAuthMetadata({ provider, issuerUrl: new URL(publicUrl.origin), scopesSupported: [SCOPE] }),
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };

  async function submitConsent(req: express.Request, res: express.Response): Promise<void> {
    const parsed = ConsentSubmitSchema.safeParse(req.body);
    if (!parsed.success || !consumeNonce(req.headers.cookie, parsed.data)) return renderExpired(res);
    const submitted = parsed.data;
    if (!allowSubmission(req.ip)) return showConsent(res, 429, submitted, CONSENT_ERRORS.limited);
    if (submitted.action === 'deny') return res.redirect(302, withParams(submitted.redirect_uri, { error: 'access_denied', state: submitted.state }));
    const tokenStatus = await checkTandoorToken(tandoorUrl, submitted.tandoor_token);
    if (tokenStatus !== 'valid') return showConsent(res, 200, submitted, CONSENT_ERRORS[tokenStatus]);
    const code = issueCode({
      clientId: submitted.client_id,
      redirectUri: submitted.redirect_uri,
      redirectUriSent: submitted.redirect_uri_sent === 'yes',
      codeChallenge: submitted.code_challenge,
      tandoorToken: submitted.tandoor_token,
    });
    res.redirect(302, withParams(submitted.redirect_uri, { code, state: submitted.state }));
  }

  const addIssuer = addIssuerToRedirects(metadata.issuer);
  const router = express.Router();
  router.use(mcpAuthMetadataRouter({ oauthMetadata: metadata, resourceServerUrl: publicUrl, scopesSupported: [SCOPE] }));
  router.use('/authorize', express.urlencoded({ extended: false }), recordRedirectUriSent, addIssuer, authorizationHandler({ provider }));
  router.use('/token', tokenHandler({ provider }));
  router.use('/register', clientRegistrationHandler({ clientsStore: provider.clientsStore }));
  router.use('/revoke', revocationHandler({ provider }));
  router.post('/consent', addIssuer, express.urlencoded({ extended: false }), submitConsent);
  return router;
}
