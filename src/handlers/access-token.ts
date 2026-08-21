// Access token handlers. See src/tools/access-token.ts for security notes.

import { TandoorClient } from '../clients/index.js';
import type {
  ListAccessTokensArgs,
  GetAccessTokenArgs,
  CreateAccessTokenArgs,
  UpdateAccessTokenArgs,
  DeleteAccessTokenArgs,
  AuthenticateArgs,
} from '../tools/access-token.js';
import type { HandlerContext } from '../lib/register.js';

import { emit, slimResponse, assertNonEmptyBody } from '../lib/slim.js';

// WHY: `token` is a live credential; slim drops it so routine list/get calls
// never surface the secret. Callers that need the raw string ask for
// format='full'. Matches the api_key pattern in slimAiProvider.
function slimAccessToken(t: any) {
  if (!t) return t;
  return {
    id: t.id,
    scope: t.scope,
    expires: t.expires,
    created: t.created,
  };
}

export const __test__ = { slimAccessToken };

export async function handleListAccessTokens(
  client: TandoorClient,
  args: ListAccessTokensArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.accessTokens.listTokens(params, { signal: ctx?.signal });
  return format === 'full' ? emit(r) : emit(slimResponse(r, slimAccessToken));
}

export async function handleGetAccessToken(
  client: TandoorClient,
  args: GetAccessTokenArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.accessTokens.getToken(args.id, { signal: ctx?.signal });
  return args.format === 'full' ? emit(r) : emit(slimAccessToken(r));
}

export async function handleCreateAccessToken(
  client: TandoorClient,
  args: CreateAccessTokenArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.accessTokens.createToken({ scope: args.scope, expires: args.expires }, { signal: ctx?.signal });
  // WHY: mint response always reveals the raw token; that is the tool's
  // purpose. Slim projection would drop it and defeat the surface.
  const payload = args.format === 'full' ? r : { ...slimAccessToken(r), token: r?.token };
  return `Access token created.\n\n${emit(payload)}`;
}

export async function handleUpdateAccessToken(
  client: TandoorClient,
  args: UpdateAccessTokenArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const body: any = {};
  if (args.scope !== undefined) body.scope = args.scope;
  if (args.expires !== undefined) body.expires = args.expires;
  assertNonEmptyBody(body);
  const r = await client.accessTokens.patchToken(args.id, body, { signal: ctx?.signal });
  return `Access token updated.\n\n${emit(args.format === 'full' ? r : slimAccessToken(r))}`;
}

export async function handleDeleteAccessToken(
  client: TandoorClient,
  args: DeleteAccessTokenArgs,
  ctx?: HandlerContext,
): Promise<string> {
  await client.accessTokens.deleteToken(args.id, { signal: ctx?.signal });
  return `Access token ${args.id} deleted.`;
}

export async function handleAuthenticate(
  client: TandoorClient,
  args: AuthenticateArgs,
  ctx?: HandlerContext,
): Promise<string> {
  const r = await client.accessTokens.authenticate({ username: args.username, password: args.password }, { signal: ctx?.signal });
  // WHY plain text (not JSON): a JSON body is auto-mirrored to
  // structuredContent by the register middleware, which persists to chat
  // transcripts and prompt caches. A minted bearer is a long-lived
  // credential; keep it in the text channel only so it lands in the
  // transient tool-result view, not the durable structured record.
  const token = typeof r?.token === 'string' ? r.token : '';
  return `Bearer token minted (text-only, not mirrored to structuredContent):\n${token}`;
}
