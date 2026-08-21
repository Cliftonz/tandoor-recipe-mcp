// Access token tool registrations. Escalation surface: these tools can mint,
// reveal, or trade credentials for Tandoor API tokens.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
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
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getAccessTokenShape = { id: z.number(), format: formatEnum } as const;

export const createAccessTokenShape = {
  scope: z.string(),
  expires: z.string().datetime(),
  format: formatEnum,
} as const;

export const updateAccessTokenShape = {
  id: z.number(),
  scope: z.string().optional(),
  expires: z.string().datetime().optional(),
  format: formatEnum,
} as const;

export const deleteAccessTokenShape = { id: z.number() } as const;

export const authenticateShape = {
  username: z.string(),
  password: z.string(),
} as const;

export type ListAccessTokensArgs = z.infer<z.ZodObject<typeof listAccessTokensShape>>;
export type GetAccessTokenArgs = z.infer<z.ZodObject<typeof getAccessTokenShape>>;
export type CreateAccessTokenArgs = z.infer<z.ZodObject<typeof createAccessTokenShape>>;
export type UpdateAccessTokenArgs = z.infer<z.ZodObject<typeof updateAccessTokenShape>>;
export type DeleteAccessTokenArgs = z.infer<z.ZodObject<typeof deleteAccessTokenShape>>;
export type AuthenticateArgs = z.infer<z.ZodObject<typeof authenticateShape>>;

export function registerAccessTokenTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_access_tokens', {
    description: `List Tandoor access tokens. ${ESCALATION_WARNING} Token strings redacted in slim; use format='full' to reveal.`,
    inputSchema: listAccessTokensShape,
  }, handleListAccessTokens);

  registerStringTool(server, client, 'get_access_token', {
    description: `Get an access token by ID. ${ESCALATION_WARNING} Token strings redacted in slim; use format='full' to reveal.`,
    inputSchema: getAccessTokenShape,
  }, handleGetAccessToken);

  registerStringTool(server, client, 'create_access_token', {
    description: `Mint a new Tandoor access token. Required: scope, expires (ISO datetime). ${ESCALATION_WARNING}`,
    inputSchema: createAccessTokenShape,
  }, handleCreateAccessToken);

  registerStringTool(server, client, 'update_access_token', {
    description: "Update an access token (PATCH). Required: id. Token strings redacted in slim; use format='full' to reveal.",
    inputSchema: updateAccessTokenShape,
  }, handleUpdateAccessToken);

  registerStringTool(server, client, 'delete_access_token', {
    description: 'Revoke an access token by ID.',
    inputSchema: deleteAccessTokenShape,
  }, handleDeleteAccessToken);

  registerStringTool(server, client, 'authenticate', {
    description: `Trade username + password for a Tandoor bearer token via POST /api-token-auth/. ${ESCALATION_WARNING}`,
    inputSchema: authenticateShape,
  }, handleAuthenticate);
}
