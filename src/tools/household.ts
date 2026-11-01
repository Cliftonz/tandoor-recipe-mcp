import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListHouseholds,
  handleGetHousehold,
  handleCreateHousehold,
  handleUpdateHousehold,
} from '../handlers/household.js';

const OWNER_ONLY = 'Space owner only (admins get 403).';

export const listHouseholdsShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getHouseholdShape = { id: z.number(), format: formatEnum } as const;

export const createHouseholdShape = { name: z.string(), format: formatEnum } as const;

export const updateHouseholdShape = { id: z.number(), name: z.string(), format: formatEnum } as const;

export type ListHouseholdsArgs = z.infer<z.ZodObject<typeof listHouseholdsShape>>;
export type GetHouseholdArgs = z.infer<z.ZodObject<typeof getHouseholdShape>>;
export type CreateHouseholdArgs = z.infer<z.ZodObject<typeof createHouseholdShape>>;
export type UpdateHouseholdArgs = z.infer<z.ZodObject<typeof updateHouseholdShape>>;

export function registerHouseholdTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_households', {
    description: `List the households in this space. ${OWNER_ONLY} Optional: page, page_size. Use get_household to see a household's members.`,
    inputSchema: listHouseholdsShape,
  }, handleListHouseholds);

  registerStringTool(server, client, 'get_household', {
    description: `Get a household by ID, with its members as {user_space_id, user}. ${OWNER_ONLY}`,
    inputSchema: getHouseholdShape,
  }, handleGetHousehold);

  registerStringTool(server, client, 'create_household', {
    description: `Create a household in this space. ${OWNER_ONLY} Required: name. Add members with assign_household.`,
    inputSchema: createHouseholdShape,
  }, handleCreateHousehold);

  registerStringTool(server, client, 'update_household', {
    description: `Rename a household. ${OWNER_ONLY} Required: id, name.`,
    inputSchema: updateHouseholdShape,
  }, handleUpdateHousehold);
}
