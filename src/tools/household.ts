import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListHouseholds,
  handleGetHousehold,
  handleCreateHousehold,
  handleUpdateHousehold,
  handleDeleteHousehold,
  handleAssignHousehold,
} from '../handlers/household.js';

const OWNER_ONLY = 'Space owner only (admins get 403).';

export const listHouseholdsShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getHouseholdShape = { id: z.number(), format: formatEnum } as const;

const householdName = z.string().min(1).max(128);

export const createHouseholdShape = { name: householdName, format: formatEnum } as const;

export const updateHouseholdShape = { id: z.number(), name: householdName, format: formatEnum } as const;

export const deleteHouseholdShape = { id: z.number() } as const;

export const assignHouseholdShape = {
  user_space_ids: z.array(z.number()).min(1).refine((ids) => new Set(ids).size === ids.length, 'user_space_ids must not repeat an id'),
  household_id: z.number().nullable(),
} as const;

export type ListHouseholdsArgs = z.infer<z.ZodObject<typeof listHouseholdsShape>>;
export type GetHouseholdArgs = z.infer<z.ZodObject<typeof getHouseholdShape>>;
export type CreateHouseholdArgs = z.infer<z.ZodObject<typeof createHouseholdShape>>;
export type UpdateHouseholdArgs = z.infer<z.ZodObject<typeof updateHouseholdShape>>;
export type DeleteHouseholdArgs = z.infer<z.ZodObject<typeof deleteHouseholdShape>>;
export type AssignHouseholdArgs = z.infer<z.ZodObject<typeof assignHouseholdShape>>;

export function registerHouseholdTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_households', {
    title: 'List households',
    annotations: READ,
    description: `List the households in this space. ${OWNER_ONLY} Optional: page, page_size. Use get_household to see a household's members.`,
    inputSchema: listHouseholdsShape,
  }, handleListHouseholds);

  registerStringTool(server, client, 'get_household', {
    title: 'Get household',
    annotations: READ,
    description: `Get a household by ID, with its members as {user_space_id, user}. ${OWNER_ONLY}`,
    inputSchema: getHouseholdShape,
  }, handleGetHousehold);

  registerStringTool(server, client, 'create_household', {
    title: 'Create household',
    annotations: CREATE,
    description: `Create a household in this space. ${OWNER_ONLY} Required: name. Add members with assign_household.`,
    inputSchema: createHouseholdShape,
  }, handleCreateHousehold);

  registerStringTool(server, client, 'update_household', {
    title: 'Update household',
    annotations: UPDATE,
    description: `Rename a household. ${OWNER_ONLY} Required: id, name.`,
    inputSchema: updateHouseholdShape,
  }, handleUpdateHousehold);

  registerStringTool(server, client, 'delete_household', {
    title: 'Delete household',
    annotations: DELETE,
    description: `Delete a household by ID. ${OWNER_ONLY} Refuses, and deletes nothing, while any user-space or inventory location still belongs to the household; the error lists them and how to clear them.`,
    inputSchema: deleteHouseholdShape,
  }, handleDeleteHousehold);

  registerStringTool(server, client, 'assign_household', {
    title: 'Assign household',
    annotations: UPDATE,
    description: `Put user-spaces into a household, or take them out with household_id null. ${OWNER_ONLY} Required: user_space_ids (ids from list_user_spaces), household_id (an id from list_households, or null). Each user-space keeps its groups. Errors if household_id does not exist. Reports each id as updated, unchanged (already in that household), or failed with Tandoor's error; errors only when every id failed.`,
    inputSchema: assignHouseholdShape,
  }, handleAssignHousehold);
}
