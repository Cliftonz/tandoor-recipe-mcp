import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListInviteLinks,
  handleGetInviteLink,
  handleCreateInviteLink,
  handleUpdateInviteLink,
  handleDeleteInviteLink,
} from '../handlers/invite-link.js';


export const listInviteLinksShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  limit: z.string().optional(),
  query: z.string().optional(),
  unused: z.boolean().optional(),
  internal_note: z.string().optional(),
  updated_at: z.string().optional(),
  format: formatEnum,
} as const;

export const getInviteLinkShape = { id: z.number(), format: formatEnum } as const;

export const createInviteLinkShape = {
  email: z.string(),
  group: z.number(),
  valid_until: z.string(),
  reusable: z.boolean().optional(),
  internal_note: z.string().nullable().optional(),
  format: formatEnum,
} as const;

export const updateInviteLinkShape = {
  id: z.number(),
  email: z.string().optional(),
  group: z.number().optional(),
  valid_until: z.string().optional(),
  reusable: z.boolean().optional(),
  internal_note: z.string().nullable().optional(),
  format: formatEnum,
} as const;

export const deleteInviteLinkShape = { id: z.number() } as const;

export type ListInviteLinksArgs = z.infer<z.ZodObject<typeof listInviteLinksShape>>;
export type GetInviteLinkArgs = z.infer<z.ZodObject<typeof getInviteLinkShape>>;
export type CreateInviteLinkArgs = z.infer<z.ZodObject<typeof createInviteLinkShape>>;
export type UpdateInviteLinkArgs = z.infer<z.ZodObject<typeof updateInviteLinkShape>>;
export type DeleteInviteLinkArgs = z.infer<z.ZodObject<typeof deleteInviteLinkShape>>;

export function registerInviteLinkTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_invite_links', {
    description: 'List space invite links. Optional: page, page_size, limit, query, unused, internal_note, updated_at. The returned uuid is the shareable invite token.',
    inputSchema: listInviteLinksShape,
  }, handleListInviteLinks);

  registerStringTool(server, client, 'get_invite_link', {
    description: 'Get a space invite link by ID. The uuid field is the shareable invite token.',
    inputSchema: getInviteLinkShape,
  }, handleGetInviteLink);

  registerStringTool(server, client, 'create_invite_link', {
    description: 'DESTRUCTIVE: Creating an invite link allows a new user to join your space. Required: email, group (Group id), valid_until (YYYY-MM-DD). Optional: reusable, internal_note. Response uuid is the shareable token; treat it as sensitive.',
    inputSchema: createInviteLinkShape,
  }, handleCreateInviteLink);

  registerStringTool(server, client, 'update_invite_link', {
    description: 'Update a space invite link (PATCH). Required: id. Changing valid_until or reusable alters who can still join your space.',
    inputSchema: updateInviteLinkShape,
  }, handleUpdateInviteLink);

  registerStringTool(server, client, 'delete_invite_link', {
    description: 'Delete a space invite link by ID. Revokes the invite so the uuid can no longer be redeemed.',
    inputSchema: deleteInviteLinkShape,
  }, handleDeleteInviteLink);
}
