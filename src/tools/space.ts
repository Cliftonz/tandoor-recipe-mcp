// Space, user-space, and switch-active-space tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
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
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getSpaceShape = { id: z.number(), format: formatEnum } as const;

export const getCurrentSpaceShape = { format: formatEnum } as const;

export const createSpaceShape = {
  name: z.string(),
  message: z.string().optional(),
  max_recipes: z.number().optional(),
  max_file_storage_mb: z.number().optional(),
  max_users: z.number().optional(),
  allow_sharing: z.boolean().optional(),
  format: formatEnum,
} as const;

export const updateSpaceShape = {
  id: z.number(),
  name: z.string().optional(),
  message: z.string().optional(),
  max_recipes: z.number().optional(),
  max_file_storage_mb: z.number().optional(),
  max_users: z.number().optional(),
  allow_sharing: z.boolean().optional(),
  food_inherit: z.array(z.number()).optional(),
  format: formatEnum,
} as const;

export const listUserSpacesShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  internal_note: z.string().optional(),
  format: formatEnum,
} as const;

export const getUserSpaceShape = { id: z.number(), format: formatEnum } as const;

export const updateUserSpaceShape = {
  id: z.number(),
  active: z.boolean().optional(),
  groups: z.array(z.number()).optional(),
  internal_note: z.string().optional(),
  format: formatEnum,
} as const;

export const deleteUserSpaceShape = { id: z.number() } as const;

export const listAllPersonalUserSpacesShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const switchActiveSpaceShape = { spaceId: z.number() } as const;

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
    description: 'List spaces (tenant workspaces) the caller can see. Optional: page, page_size.',
    inputSchema: listSpacesShape,
  }, handleListSpaces);

  registerStringTool(server, client, 'get_space', {
    description: 'Get a space (tenant workspace) by ID.',
    inputSchema: getSpaceShape,
  }, handleGetSpace);

  registerStringTool(server, client, 'get_current_space', {
    description: 'Get the space currently active for this API token.',
    inputSchema: getCurrentSpaceShape,
  }, handleGetCurrentSpace);

  registerStringTool(server, client, 'create_space', {
    description: 'Create a new space (tenant workspace). Required: name. Optional: message, max_recipes, max_file_storage_mb, max_users, allow_sharing.',
    inputSchema: createSpaceShape,
  }, handleCreateSpace);

  registerStringTool(server, client, 'update_space', {
    description: 'Update a space (PATCH). Required: id, plus at least one field.',
    inputSchema: updateSpaceShape,
  }, handleUpdateSpace);

  registerStringTool(server, client, 'list_user_spaces', {
    description: 'List user-space memberships (which users belong to which spaces, with roles). Optional: page, page_size, internal_note.',
    inputSchema: listUserSpacesShape,
  }, handleListUserSpaces);

  registerStringTool(server, client, 'get_user_space', {
    description: 'Get a user-space membership by ID.',
    inputSchema: getUserSpaceShape,
  }, handleGetUserSpace);

  registerStringTool(server, client, 'update_user_space', {
    description: 'Update a user-space membership (PATCH). Required: id, plus at least one field (active, groups, internal_note).',
    inputSchema: updateUserSpaceShape,
  }, handleUpdateUserSpace);

  registerStringTool(server, client, 'delete_user_space', {
    description: 'DESTRUCTIVE. Remove a user-space membership by ID; the user loses access to that space. Not reversible.',
    inputSchema: deleteUserSpaceShape,
  }, handleDeleteUserSpace);

  registerStringTool(server, client, 'list_all_personal_user_spaces', {
    description: 'List every user-space membership belonging to the calling user (across all their spaces).',
    inputSchema: listAllPersonalUserSpacesShape,
  }, handleListAllPersonalUserSpaces);

  registerStringTool(server, client, 'switch_active_space', {
    description: 'DESTRUCTIVE state change. Switches the API token\'s active space server-side; every subsequent tool call in this session operates against the new space until switched again. Required: spaceId.',
    inputSchema: switchActiveSpaceShape,
  }, handleSwitchActiveSpace);
}
