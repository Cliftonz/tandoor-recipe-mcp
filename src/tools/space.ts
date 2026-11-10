// Space, user-space, and switch-active-space tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListSpaces,
  handleGetSpace,
  handleGetCurrentSpace,
  handleCreateSpace,
  handleUpdateSpace,
  handleListUserSpaces,
  handleGetUserSpace,
  handleUpdateUserSpace,
  handleDeleteUserSpace,
  handleListAllPersonalUserSpaces,
  handleSwitchActiveSpace,
} from '../handlers/space.js';


export const listSpacesShape = {
  page: z.number().optional().describe('1-based page number.'),
  page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'),
  format: formatEnum,
} as const;

export const getSpaceShape = { id: z.number().describe('Space ID from list_spaces.'), format: formatEnum } as const;

export const getCurrentSpaceShape = { format: formatEnum } as const;

export const createSpaceShape = {
  name: z.string().describe('Name of the new space.'),
  message: z.string().optional().describe('Ignored on create; set it with update_space.'),
  max_recipes: z.number().optional().describe('Read-only in Tandoor; ignored.'),
  max_file_storage_mb: z.number().optional().describe('Read-only in Tandoor; ignored.'),
  max_users: z.number().optional().describe('Read-only in Tandoor; ignored.'),
  allow_sharing: z.boolean().optional().describe('Read-only in Tandoor; ignored.'),
  format: formatEnum,
} as const;

export const updateSpaceShape = {
  id: z.number().describe('Space ID from list_spaces.'),
  name: z.string().optional().describe('New name; must be unique on the server.'),
  message: z.string().optional().describe('Space message, up to 512 characters.'),
  max_recipes: z.number().optional().describe('Read-only in Tandoor; ignored.'),
  max_file_storage_mb: z.number().optional().describe('Read-only in Tandoor; ignored.'),
  max_users: z.number().optional().describe('Read-only in Tandoor; ignored.'),
  allow_sharing: z.boolean().optional().describe('Read-only in Tandoor; ignored.'),
  food_inherit: z.array(z.number()).optional().describe('Food fields children inherit, IDs from list_food_inherit_fields.'),
  format: formatEnum,
} as const;

export const listUserSpacesShape = {
  page: z.number().optional().describe('1-based page number.'),
  page_size: z.number().optional().describe('Rows per page. Default 50, max 200.'),
  internal_note: z.string().optional().describe('Exact-match filter on the membership note.'),
  format: formatEnum,
} as const;

export const getUserSpaceShape = { id: z.number().describe('User-space ID from list_user_spaces.'), format: formatEnum } as const;

export const updateUserSpaceShape = {
  id: z.number().describe('User-space ID from list_user_spaces.'),
  active: z.boolean().optional().describe('Whether this is the user\'s active space.'),
  groups: z.array(z.number()).min(1).optional().describe('Group IDs from list_groups; replaces current groups.'),
  internal_note: z.string().optional().describe('Free-text note on the membership.'),
  format: formatEnum,
} as const;

export const deleteUserSpaceShape = { id: z.number().describe('User-space ID from list_user_spaces.') } as const;

export const listAllPersonalUserSpacesShape = {
  page: z.number().optional().describe('Ignored; this endpoint returns every row.'),
  page_size: z.number().optional().describe('Ignored; this endpoint returns every row.'),
  format: formatEnum,
} as const;

export const switchActiveSpaceShape = { spaceId: z.number().describe('Space ID from list_spaces.') } as const;

export type ListSpacesArgs = z.infer<z.ZodObject<typeof listSpacesShape>>;
export type GetSpaceArgs = z.infer<z.ZodObject<typeof getSpaceShape>>;
export type GetCurrentSpaceArgs = z.infer<z.ZodObject<typeof getCurrentSpaceShape>>;
export type CreateSpaceArgs = z.infer<z.ZodObject<typeof createSpaceShape>>;
export type UpdateSpaceArgs = z.infer<z.ZodObject<typeof updateSpaceShape>>;
export type ListUserSpacesArgs = z.infer<z.ZodObject<typeof listUserSpacesShape>>;
export type GetUserSpaceArgs = z.infer<z.ZodObject<typeof getUserSpaceShape>>;
export type UpdateUserSpaceArgs = z.infer<z.ZodObject<typeof updateUserSpaceShape>>;
export type DeleteUserSpaceArgs = z.infer<z.ZodObject<typeof deleteUserSpaceShape>>;
export type ListAllPersonalUserSpacesArgs = z.infer<z.ZodObject<typeof listAllPersonalUserSpacesShape>>;
export type SwitchActiveSpaceArgs = z.infer<z.ZodObject<typeof switchActiveSpaceShape>>;

export function registerSpaceTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_spaces', {
    title: 'List spaces',
    annotations: READ,
    description: 'List spaces (tenant workspaces) the caller can see. Optional: page, page_size.',
    inputSchema: listSpacesShape,
  }, handleListSpaces);

  registerStringTool(server, client, 'get_space', {
    title: 'Get space',
    annotations: READ,
    description: 'Get a space (tenant workspace) by ID.',
    inputSchema: getSpaceShape,
  }, handleGetSpace);

  registerStringTool(server, client, 'get_current_space', {
    title: 'Get current space',
    annotations: READ,
    description: 'Get the space currently active for this API token. Other tools read and write in this space.',
    inputSchema: getCurrentSpaceShape,
  }, handleGetCurrentSpace);

  registerStringTool(server, client, 'create_space', {
    title: 'Create space',
    annotations: CREATE,
    description: 'Create a new space (tenant workspace). Required: name. Optional: message, max_recipes, max_file_storage_mb, max_users, allow_sharing.',
    inputSchema: createSpaceShape,
  }, handleCreateSpace);

  registerStringTool(server, client, 'update_space', {
    title: 'Update space',
    annotations: UPDATE,
    description: 'Update a space (PATCH). Required: id, plus at least one field.',
    inputSchema: updateSpaceShape,
  }, handleUpdateSpace);

  registerStringTool(server, client, 'list_user_spaces', {
    title: 'List user spaces',
    annotations: READ,
    description: 'List user-space memberships (which users belong to which spaces, with roles). Optional: page, page_size, internal_note.',
    inputSchema: listUserSpacesShape,
  }, handleListUserSpaces);

  registerStringTool(server, client, 'get_user_space', {
    title: 'Get user space',
    annotations: READ,
    description: 'Get a user-space membership by ID.',
    inputSchema: getUserSpaceShape,
  }, handleGetUserSpace);

  registerStringTool(server, client, 'update_user_space', {
    title: 'Update user space',
    annotations: { ...UPDATE, destructiveHint: true },
    description: 'Update a user-space membership (PATCH). Space owner only (admins get 403). Required: id, plus at least one of active, groups, internal_note. Omitted groups keep their current value. groups replaces the membership\'s groups and must be ids from list_groups. ESCALATION SURFACE: groups can grant space admin rights. Only change groups when explicitly asked by the user. To set the household, use assign_household.',
    inputSchema: updateUserSpaceShape,
  }, handleUpdateUserSpace);

  registerStringTool(server, client, 'delete_user_space', {
    title: 'Delete user space',
    annotations: DELETE,
    description: 'DESTRUCTIVE. Remove a user-space membership by ID; the user loses access to that space. Not reversible.',
    inputSchema: deleteUserSpaceShape,
  }, handleDeleteUserSpace);

  registerStringTool(server, client, 'list_all_personal_user_spaces', {
    title: 'List all personal user spaces',
    annotations: READ,
    description: 'List every user-space membership belonging to the calling user (across all their spaces).',
    inputSchema: listAllPersonalUserSpacesShape,
  }, handleListAllPersonalUserSpaces);

  registerStringTool(server, client, 'switch_active_space', {
    title: 'Switch active space',
    annotations: UPDATE,
    description: 'Changes which space this token works in. Switches the API token\'s active space server-side; every subsequent tool call in this session operates against the new space until switched again. Required: spaceId.',
    inputSchema: switchActiveSpaceShape,
  }, handleSwitchActiveSpace);
}
