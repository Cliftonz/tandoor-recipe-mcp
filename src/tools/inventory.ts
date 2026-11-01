import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListInventoryLocations,
  handleGetInventoryLocation,
  handleCreateInventoryLocation,
  handleUpdateInventoryLocation,
  handleDeleteInventoryLocation,
} from '../handlers/inventory.js';

export const listInventoryLocationsShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getInventoryLocationShape = { id: z.number(), format: formatEnum } as const;

export const createInventoryLocationShape = {
  name: z.string(),
  is_freezer: z.boolean().optional(),
  format: formatEnum,
} as const;

export const updateInventoryLocationShape = {
  id: z.number(),
  name: z.string().optional(),
  is_freezer: z.boolean().optional(),
  format: formatEnum,
} as const;

export const deleteInventoryLocationShape = { id: z.number() } as const;

export type ListInventoryLocationsArgs = z.infer<z.ZodObject<typeof listInventoryLocationsShape>>;
export type GetInventoryLocationArgs = z.infer<z.ZodObject<typeof getInventoryLocationShape>>;
export type CreateInventoryLocationArgs = z.infer<z.ZodObject<typeof createInventoryLocationShape>>;
export type UpdateInventoryLocationArgs = z.infer<z.ZodObject<typeof updateInventoryLocationShape>>;
export type DeleteInventoryLocationArgs = z.infer<z.ZodObject<typeof deleteInventoryLocationShape>>;

export function registerInventoryTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_inventory_locations', {
    description: 'List inventory locations (pantry, fridge, freezer and so on). Optional: page, page_size.',
    inputSchema: listInventoryLocationsShape,
  }, handleListInventoryLocations);

  registerStringTool(server, client, 'get_inventory_location', {
    description: 'Get an inventory location by ID.',
    inputSchema: getInventoryLocationShape,
  }, handleGetInventoryLocation);

  registerStringTool(server, client, 'create_inventory_location', {
    description: 'Create an inventory location in your household. Required: name. Optional: is_freezer. Fails if you are not in a household in this space; assign one in Tandoor first.',
    inputSchema: createInventoryLocationShape,
  }, handleCreateInventoryLocation);

  registerStringTool(server, client, 'update_inventory_location', {
    description: 'Update an inventory location (PATCH). Required: id. Optional: name, is_freezer.',
    inputSchema: updateInventoryLocationShape,
  }, handleUpdateInventoryLocation);

  registerStringTool(server, client, 'delete_inventory_location', {
    description: 'Delete an inventory location by ID. This also deletes every inventory entry in it and the log rows of every entry that ever passed through it, including entries since moved elsewhere. Use preview_inventory_location_delete_cascading to see the full cascade first.',
    inputSchema: deleteInventoryLocationShape,
  }, handleDeleteInventoryLocation);
}
