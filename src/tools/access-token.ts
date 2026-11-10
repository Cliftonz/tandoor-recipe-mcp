// Access token tool registrations. Escalation surface: these tools can mint,
// reveal, or trade credentials for Tandoor API tokens.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListAccessTokens,
  handleGetAccessToken,
  handleCreateAccessToken,
  handleUpdateAccessToken,
  handleDeleteAccessToken,
  handleAuthenticate,
} from '../handlers/access-token.js';

// WHY: security warnings ride in the description because MCP clients surface
// descriptions to the user before invocation. Wording is asserted by tests.
const ESCALATION_WARNING =
  'ESCALATION SURFACE: this tool can mint or reveal Tandoor API tokens equivalent to the caller\'s login credentials. Only invoke when explicitly asked by the user.';

export const listAccessTokensShape = {
  page: z.number().optional().describe('Ignored; Tandoor returns every token.'),
  page_size: z.number().optional().describe('Ignored; Tandoor returns every token.'),
  format: formatEnum,
} as const;

export const getAccessTokenShape = { id: z.number().describe('Access token ID from list_access_tokens.'), format: formatEnum } as const;

export const createAccessTokenShape = {
  scope: z.string().describe('Space-separated scopes: read, write, bookmarklet, mealplan.'),
  expires: z.string().datetime().describe('UTC ISO 8601 ending in Z, e.g. 2026-12-01T10:00:00Z.'),
  format: formatEnum,
} as const;

export const updateAccessTokenShape = {
  id: z.number().describe('Access token ID from list_access_tokens.'),
  scope: z.string().optional().describe('Space-separated scopes: read, write, bookmarklet, mealplan.'),
  expires: z.string().datetime().optional().describe('UTC ISO 8601 ending in Z, e.g. 2026-12-01T10:00:00Z.'),
  format: formatEnum,
} as const;

export const deleteAccessTokenShape = { id: z.number().describe('Access token ID from list_access_tokens.') } as const;

export const authenticateShape = {
  username: z.string().describe('Tandoor login username.'),
  password: z.string().describe('Tandoor login password.'),
} as const;

export type ListAccessTokensArgs = z.infer<z.ZodObject<typeof listAccessTokensShape>>;
export type GetAccessTokenArgs = z.infer<z.ZodObject<typeof getAccessTokenShape>>;
export type CreateAccessTokenArgs = z.infer<z.ZodObject<typeof createAccessTokenShape>>;
export type UpdateAccessTokenArgs = z.infer<z.ZodObject<typeof updateAccessTokenShape>>;
export type DeleteAccessTokenArgs = z.infer<z.ZodObject<typeof deleteAccessTokenShape>>;
export type AuthenticateArgs = z.infer<z.ZodObject<typeof authenticateShape>>;

export function registerAccessTokenTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_access_tokens', {
    title: 'List access tokens',
    annotations: { ...READ, readOnlyHint: false },
    description: `List Tandoor access tokens. ${ESCALATION_WARNING} Token strings redacted in slim; use format='full' to reveal.`,
    inputSchema: listAccessTokensShape,
  }, handleListAccessTokens);

  registerStringTool(server, client, 'get_access_token', {
    title: 'Get access token',
    annotations: { ...READ, readOnlyHint: false },
    description: `Get an access token by ID. ${ESCALATION_WARNING} Token strings redacted in slim; use format='full' to reveal.`,
    inputSchema: getAccessTokenShape,
  }, handleGetAccessToken);

  registerStringTool(server, client, 'create_access_token', {
    title: 'Create access token',
    annotations: CREATE,
    description: `Mint a new Tandoor access token. Required: scope, expires (UTC ISO 8601 datetime with seconds and Z suffix, e.g. 2026-12-01T10:00:00Z). ${ESCALATION_WARNING}`,
    inputSchema: createAccessTokenShape,
  }, handleCreateAccessToken);

  registerStringTool(server, client, 'update_access_token', {
    title: 'Update access token',
    annotations: UPDATE,
    description: `Update an access token (PATCH). Required: id. Optional: scope, expires (UTC ISO 8601 datetime with seconds and Z suffix, e.g. 2026-12-01T10:00:00Z). ${ESCALATION_WARNING} Token strings redacted in slim; use format='full' to reveal.`,
    inputSchema: updateAccessTokenShape,
  }, handleUpdateAccessToken);

  registerStringTool(server, client, 'delete_access_token', {
    title: 'Delete access token',
    annotations: DELETE,
    description: 'Revoke an access token by ID.',
    inputSchema: deleteAccessTokenShape,
  }, handleDeleteAccessToken);

  registerStringTool(server, client, 'authenticate', {
    title: 'Get token from username and password',
    annotations: UPDATE,
    description: `Trade username + password for a Tandoor bearer token. Tandoor 2.6 and earlier: POST /api-token-auth/. Tandoor 2.7+: allauth login, then a new one-year read write token. Accounts that need MFA or email verification must create a token in Tandoor under Settings > API instead. ${ESCALATION_WARNING}`,
    inputSchema: authenticateShape,
  }, handleAuthenticate);
}
