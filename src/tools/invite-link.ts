import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListInviteLinks,
  handleGetInviteLink,
  handleCreateInviteLink,
  handleUpdateInviteLink,
  handleDeleteInviteLink,
} from '../handlers/invite-link.js';


export const listInviteLinksShape = {
  page: z.number().optional().describe('1-based page number.'),
  page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'),
  limit: z.string().optional().describe('Integer cap on rows, applied before paging.'),
  query: z.string().optional().describe('Ignored; invite links have no name field.'),
  unused: z.boolean().optional().describe('Ignored; Tandoor always lists only unused links.'),
  internal_note: z.string().optional().describe('Exact-match filter on the internal note.'),
  updated_at: z.string().optional().describe('Ignored; invite links have no updated_at field.'),
  format: formatEnum,
} as const;

export const getInviteLinkShape = { id: z.number().describe('Invite link ID from list_invite_links.'), format: formatEnum } as const;

export const createInviteLinkShape = {
  email: z.string().describe('Invitee email; Tandoor emails the link if SMTP is set up.'),
  group: z.number().describe('Group ID from list_groups; the joiner gets its permissions.'),
  valid_until: z.string().describe('Expiry date, YYYY-MM-DD.'),
  reusable: z.boolean().optional().describe('Allow more than one user to join with this link. Default false.'),
  internal_note: z.string().nullable().optional().describe('Note copied to the user-space created on join.'),
  format: formatEnum,
} as const;

export const updateInviteLinkShape = {
  id: z.number().describe('Invite link ID from list_invite_links.'),
  email: z.string().optional().describe('Invitee email.'),
  group: z.number().optional().describe('Group ID from list_groups; the joiner gets its permissions.'),
  valid_until: z.string().optional().describe('Expiry date, YYYY-MM-DD.'),
  reusable: z.boolean().optional().describe('Allow more than one user to join with this link. Default false.'),
  internal_note: z.string().nullable().optional().describe('Note copied to the user-space created on join.'),
  format: formatEnum,
} as const;

export const deleteInviteLinkShape = { id: z.number().describe('Invite link ID from list_invite_links.') } as const;

export type ListInviteLinksArgs = z.infer<z.ZodObject<typeof listInviteLinksShape>>;
export type GetInviteLinkArgs = z.infer<z.ZodObject<typeof getInviteLinkShape>>;
export type CreateInviteLinkArgs = z.infer<z.ZodObject<typeof createInviteLinkShape>>;
export type UpdateInviteLinkArgs = z.infer<z.ZodObject<typeof updateInviteLinkShape>>;
export type DeleteInviteLinkArgs = z.infer<z.ZodObject<typeof deleteInviteLinkShape>>;

export function registerInviteLinkTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_invite_links', {
    title: 'List invite links',
    annotations: READ,
    description: 'List space invite links. Optional: page, page_size, limit, query, unused, internal_note, updated_at. The returned uuid is the shareable invite token.',
    inputSchema: listInviteLinksShape,
  }, handleListInviteLinks);

  registerStringTool(server, client, 'get_invite_link', {
    title: 'Get invite link',
    annotations: READ,
    description: 'Get a space invite link by ID. The uuid field is the shareable invite token.',
    inputSchema: getInviteLinkShape,
  }, handleGetInviteLink);

  registerStringTool(server, client, 'create_invite_link', {
    title: 'Create invite link',
    annotations: { ...CREATE, destructiveHint: true },
    description: 'DESTRUCTIVE: Creating an invite link allows a new user to join your space. Required: email, group (Group id), valid_until (YYYY-MM-DD). Optional: reusable, internal_note. Response uuid is the shareable token; treat it as sensitive.',
    inputSchema: createInviteLinkShape,
  }, handleCreateInviteLink);

  registerStringTool(server, client, 'update_invite_link', {
    title: 'Update invite link',
    annotations: UPDATE,
    description: 'Update a space invite link (PATCH). Required: id. Changing valid_until or reusable alters who can still join your space.',
    inputSchema: updateInviteLinkShape,
  }, handleUpdateInviteLink);

  registerStringTool(server, client, 'delete_invite_link', {
    title: 'Delete invite link',
    annotations: DELETE,
    description: 'Delete a space invite link by ID. Revokes the invite so the uuid can no longer be redeemed.',
    inputSchema: deleteInviteLinkShape,
  }, handleDeleteInviteLink);
}
