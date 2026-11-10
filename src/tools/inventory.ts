import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
import {
  handleListInventoryLocations,
  handleGetInventoryLocation,
  handleCreateInventoryLocation,
  handleUpdateInventoryLocation,
  handleDeleteInventoryLocation,
  handleListInventoryEntries,
  handleGetInventoryEntry,
  handleAddInventoryItem,
  handleUpdateInventoryEntry,
  handleDeleteInventoryEntry,
  handleConsumeInventoryItem,
  handleMoveInventoryItem,
  handleListInventoryLogs,
  handleGetInventoryLog,
} from '../handlers/inventory.js';

const page = z.number().optional().describe('Page number, starting at 1.');
const pageSize = z.number().optional().describe('Results per page.');
const locationId = z.number().describe('Inventory location ID, from list_inventory_locations.');
const entryId = z.number().describe('Inventory entry ID, from list_inventory_entries.');

export const listInventoryLocationsShape = {
  page,
  page_size: pageSize,
  format: formatEnum,
} as const;

export const getInventoryLocationShape = { id: locationId, format: formatEnum } as const;

export const createInventoryLocationShape = {
  name: z.string().describe('Location name, up to 64 characters.'),
  is_freezer: z.boolean().optional().describe('Location is a freezer. Default false.'),
  format: formatEnum,
} as const;

export const updateInventoryLocationShape = {
  id: locationId,
  name: z.string().optional().describe('Location name, up to 64 characters.'),
  is_freezer: z.boolean().optional().describe('Location is a freezer.'),
  format: formatEnum,
} as const;

export const deleteInventoryLocationShape = { id: locationId } as const;

export const listInventoryEntriesShape = {
  location_id: z.number().optional().describe('Only entries at this location ID, from list_inventory_locations.'),
  food_id: z.number().optional().describe('Only entries for this food ID, from list_foods.'),
  include_empty: z.boolean().optional().describe('Include entries with amount 0 or less. Default false.'),
  page,
  page_size: pageSize,
  format: formatEnum,
} as const;

export const getInventoryEntryShape = { id: entryId, format: formatEnum } as const;

export const addInventoryItemShape = {
  food_id: z.number().describe('Food ID, from list_foods.'),
  unit_id: z.number().describe('Unit ID, from list_units.'),
  amount: z.number().positive().describe('Amount, in unit_id.'),
  location_id: locationId,
  expires: z.iso.date().optional().describe('Expiry date, YYYY-MM-DD.'),
  sub_location: z.string().optional().describe('Spot within the location, such as a shelf.'),
  note: z.string().optional().describe('Free-text note, up to 256 characters.'),
  code: z.string().optional().describe('Short label, up to 16 characters. Default: the entry ID in hex.'),
  format: formatEnum,
} as const;

export const updateInventoryEntryShape = {
  id: entryId,
  food_id: z.number().optional().describe('Food ID, from list_foods.'),
  unit_id: z.number().optional().describe('Unit ID, from list_units.'),
  amount: z.number().nonnegative().optional().describe('Amount, in the entry unit.'),
  location_id: z.number().optional().describe('Inventory location ID, from list_inventory_locations.'),
  expires: z.iso.date().nullable().optional().describe('Expiry date, YYYY-MM-DD. null clears it.'),
  sub_location: z.string().nullable().optional().describe('Spot within the location. null clears it.'),
  note: z.string().nullable().optional().describe('Free-text note, up to 256 characters. null clears it.'),
  code: z.string().optional().describe('Short label, up to 16 characters.'),
  format: formatEnum,
} as const;

export const deleteInventoryEntryShape = { id: entryId } as const;

export const consumeInventoryItemShape = {
  entry_id: z.number().optional().describe('Inventory entry ID, from list_inventory_entries. Give this or food_id.'),
  food_id: z.number().optional().describe('Food ID, from list_foods. Give this or entry_id.'),
  location_id: z.number().optional().describe('Narrows food_id to this location. Not with entry_id.'),
  amount: z.number().positive().optional().describe('Amount to use, in the entry unit.'),
  all: z.literal(true).optional().describe('Use up the whole entry instead of an amount.'),
  unit_id: z.number().optional().describe('Must equal the entry unit. No conversion.'),
  format: formatEnum,
} as const;

export const moveInventoryItemShape = {
  entry_id: entryId,
  to_location_id: z.number().describe('Target location ID, from list_inventory_locations.'),
  sub_location: z.string().nullable().optional().describe('Spot within the new location. null clears it.'),
  format: formatEnum,
} as const;

export const listInventoryLogsShape = {
  entry_id: z.number().optional().describe('Only rows for this inventory entry ID.'),
  food_id: z.number().optional().describe('Only rows for this food ID.'),
  page,
  page_size: pageSize,
  format: formatEnum,
} as const;

export const getInventoryLogShape = { id: z.number().describe('Inventory log ID, from list_inventory_logs.'), format: formatEnum } as const;

export type ListInventoryLocationsArgs = z.infer<z.ZodObject<typeof listInventoryLocationsShape>>;
export type GetInventoryLocationArgs = z.infer<z.ZodObject<typeof getInventoryLocationShape>>;
export type CreateInventoryLocationArgs = z.infer<z.ZodObject<typeof createInventoryLocationShape>>;
export type UpdateInventoryLocationArgs = z.infer<z.ZodObject<typeof updateInventoryLocationShape>>;
export type DeleteInventoryLocationArgs = z.infer<z.ZodObject<typeof deleteInventoryLocationShape>>;

export type ListInventoryEntriesArgs = z.infer<z.ZodObject<typeof listInventoryEntriesShape>>;
export type GetInventoryEntryArgs = z.infer<z.ZodObject<typeof getInventoryEntryShape>>;
export type AddInventoryItemArgs = z.infer<z.ZodObject<typeof addInventoryItemShape>>;
export type UpdateInventoryEntryArgs = z.infer<z.ZodObject<typeof updateInventoryEntryShape>>;
export type DeleteInventoryEntryArgs = z.infer<z.ZodObject<typeof deleteInventoryEntryShape>>;
export type ConsumeInventoryItemArgs = z.infer<z.ZodObject<typeof consumeInventoryItemShape>>;
export type MoveInventoryItemArgs = z.infer<z.ZodObject<typeof moveInventoryItemShape>>;
export type ListInventoryLogsArgs = z.infer<z.ZodObject<typeof listInventoryLogsShape>>;
export type GetInventoryLogArgs = z.infer<z.ZodObject<typeof getInventoryLogShape>>;

export function registerInventoryTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_inventory_locations', {
    title: 'List inventory locations',
    annotations: READ,
    description: 'List inventory locations (pantry, fridge, freezer and so on). Optional: page, page_size. Use the IDs as location_id or to_location_id in the other inventory tools.',
    inputSchema: listInventoryLocationsShape,
  }, handleListInventoryLocations);

  registerStringTool(server, client, 'get_inventory_location', {
    title: 'Get inventory location',
    annotations: READ,
    description: 'Get an inventory location by ID.',
    inputSchema: getInventoryLocationShape,
  }, handleGetInventoryLocation);

  registerStringTool(server, client, 'create_inventory_location', {
    title: 'Create inventory location',
    annotations: CREATE,
    description: 'Create an inventory location in your household. Required: name. Optional: is_freezer. Fails if you are not in a household in this space; create one with create_household and assign yourself with assign_household (household-space section, space owner only), or ask the space owner.',
    inputSchema: createInventoryLocationShape,
  }, handleCreateInventoryLocation);

  registerStringTool(server, client, 'update_inventory_location', {
    title: 'Update inventory location',
    annotations: UPDATE,
    description: 'Update an inventory location (PATCH). Required: id. Optional: name, is_freezer.',
    inputSchema: updateInventoryLocationShape,
  }, handleUpdateInventoryLocation);

  registerStringTool(server, client, 'delete_inventory_location', {
    title: 'Delete inventory location',
    annotations: DELETE,
    description: 'Delete an inventory location by ID. This also deletes every inventory entry in it and the log rows of every entry that ever passed through it, including entries since moved elsewhere. Use preview_inventory_location_delete_cascading to see the full cascade first.',
    inputSchema: deleteInventoryLocationShape,
  }, handleDeleteInventoryLocation);

  registerStringTool(server, client, 'list_inventory_entries', {
    title: 'List inventory entries',
    annotations: READ,
    description: 'List inventory entries (what is on hand, where). Optional: location_id, food_id, include_empty (entries with amount 0 or less are hidden unless true), page, page_size.',
    inputSchema: listInventoryEntriesShape,
  }, handleListInventoryEntries);

  registerStringTool(server, client, 'get_inventory_entry', {
    title: 'Get inventory entry',
    annotations: READ,
    description: 'Get an inventory entry by ID.',
    inputSchema: getInventoryEntryShape,
  }, handleGetInventoryEntry);

  registerStringTool(server, client, 'add_inventory_item', {
    title: 'Add inventory item',
    annotations: CREATE,
    description: 'Add food to inventory. Required: food_id, unit_id, amount (> 0), location_id. Optional: expires (YYYY-MM-DD), sub_location, note, code. Always creates a new entry, even when the same food already has an entry at that location.',
    inputSchema: addInventoryItemShape,
  }, handleAddInventoryItem);

  registerStringTool(server, client, 'update_inventory_entry', {
    title: 'Update inventory entry',
    annotations: UPDATE,
    description: 'Update an inventory entry (PATCH). Required: id. Optional: food_id, unit_id, amount (>= 0), location_id, expires (YYYY-MM-DD; null clears it), sub_location (null clears it), note (null clears it), code.',
    inputSchema: updateInventoryEntryShape,
  }, handleUpdateInventoryEntry);

  registerStringTool(server, client, 'delete_inventory_entry', {
    title: 'Delete inventory entry',
    annotations: DELETE,
    description: 'Delete an inventory entry by ID. This also deletes its log rows.',
    inputSchema: deleteInventoryEntryShape,
  }, handleDeleteInventoryEntry);

  registerStringTool(server, client, 'consume_inventory_item', {
    title: 'Consume inventory item',
    annotations: CREATE,
    description: 'Use up some or all of an inventory entry. Identify it by entry_id, or by food_id with optional location_id (errors listing the candidates when several entries match). Give exactly one of amount (> 0) or all: true. Optional unit_id must match the entry unit; there is no unit conversion. The amount never goes below 0: consuming more than is on hand sets it to 0 and returns a warning. Never deletes the entry; at 0 (including after all: true) it is hidden from list_inventory_entries unless include_empty is true. Not atomic: two concurrent consumes of one entry can lose an update.',
    inputSchema: consumeInventoryItemShape,
  }, handleConsumeInventoryItem);

  registerStringTool(server, client, 'move_inventory_item', {
    title: 'Move inventory item',
    annotations: UPDATE,
    description: 'Move a whole inventory entry to another location. Required: entry_id, to_location_id. Optional: sub_location (null clears it).',
    inputSchema: moveInventoryItemShape,
  }, handleMoveInventoryItem);

  registerStringTool(server, client, 'list_inventory_logs', {
    title: 'List inventory logs',
    annotations: READ,
    description: 'List inventory log rows (read-only history of amount and location changes). Optional: entry_id, food_id, page, page_size. booking_type is add on creation, move when the location changed (even if the amount changed too), and remove for any other amount change, even an increase.',
    inputSchema: listInventoryLogsShape,
  }, handleListInventoryLogs);

  registerStringTool(server, client, 'get_inventory_log', {
    title: 'Get inventory log',
    annotations: READ,
    description: 'Get an inventory log row by ID.',
    inputSchema: getInventoryLogShape,
  }, handleGetInventoryLog);
}
