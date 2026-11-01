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

export const listInventoryEntriesShape = {
  location_id: z.number().optional(),
  food_id: z.number().optional(),
  include_empty: z.boolean().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getInventoryEntryShape = { id: z.number(), format: formatEnum } as const;

export const addInventoryItemShape = {
  food_id: z.number(),
  unit_id: z.number(),
  amount: z.number().positive(),
  location_id: z.number(),
  expires: z.iso.date().optional(),
  sub_location: z.string().optional(),
  note: z.string().optional(),
  code: z.string().optional(),
  format: formatEnum,
} as const;

export const updateInventoryEntryShape = {
  id: z.number(),
  food_id: z.number().optional(),
  unit_id: z.number().optional(),
  amount: z.number().nonnegative().optional(),
  location_id: z.number().optional(),
  expires: z.iso.date().nullable().optional(),
  sub_location: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  code: z.string().optional(),
  format: formatEnum,
} as const;

export const deleteInventoryEntryShape = { id: z.number() } as const;

export const consumeInventoryItemShape = {
  entry_id: z.number().optional(),
  food_id: z.number().optional(),
  location_id: z.number().optional(),
  amount: z.number().positive().optional(),
  all: z.literal(true).optional(),
  unit_id: z.number().optional(),
  format: formatEnum,
} as const;

export const moveInventoryItemShape = {
  entry_id: z.number(),
  to_location_id: z.number(),
  sub_location: z.string().nullable().optional(),
  format: formatEnum,
} as const;

export const listInventoryLogsShape = {
  entry_id: z.number().optional(),
  food_id: z.number().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getInventoryLogShape = { id: z.number(), format: formatEnum } as const;

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
    description: 'List inventory locations (pantry, fridge, freezer and so on). Optional: page, page_size.',
    inputSchema: listInventoryLocationsShape,
  }, handleListInventoryLocations);

  registerStringTool(server, client, 'get_inventory_location', {
    description: 'Get an inventory location by ID.',
    inputSchema: getInventoryLocationShape,
  }, handleGetInventoryLocation);

  registerStringTool(server, client, 'create_inventory_location', {
    description: 'Create an inventory location in your household. Required: name. Optional: is_freezer. Fails if you are not in a household in this space; assign yourself to a household in Tandoor first.',
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

  registerStringTool(server, client, 'list_inventory_entries', {
    description: 'List inventory entries (what is on hand, where). Optional: location_id, food_id, include_empty (entries with amount 0 or less are hidden unless true), page, page_size.',
    inputSchema: listInventoryEntriesShape,
  }, handleListInventoryEntries);

  registerStringTool(server, client, 'get_inventory_entry', {
    description: 'Get an inventory entry by ID.',
    inputSchema: getInventoryEntryShape,
  }, handleGetInventoryEntry);

  registerStringTool(server, client, 'add_inventory_item', {
    description: 'Add food to inventory. Required: food_id, unit_id, amount (> 0), location_id. Optional: expires (YYYY-MM-DD), sub_location, note, code. Always creates a new entry, even when the same food already has an entry at that location.',
    inputSchema: addInventoryItemShape,
  }, handleAddInventoryItem);

  registerStringTool(server, client, 'update_inventory_entry', {
    description: 'Update an inventory entry (PATCH). Required: id. Optional: food_id, unit_id, amount (>= 0), location_id, expires (YYYY-MM-DD; null clears it), sub_location (null clears it), note (null clears it), code.',
    inputSchema: updateInventoryEntryShape,
  }, handleUpdateInventoryEntry);

  registerStringTool(server, client, 'delete_inventory_entry', {
    description: 'Delete an inventory entry by ID. This also deletes its log rows.',
    inputSchema: deleteInventoryEntryShape,
  }, handleDeleteInventoryEntry);

  registerStringTool(server, client, 'consume_inventory_item', {
    description: 'Use up some or all of an inventory entry. Identify it by entry_id, or by food_id with optional location_id (errors listing the candidates when several entries match). Give exactly one of amount (> 0) or all: true. Optional unit_id must match the entry unit; there is no unit conversion. The amount never goes below 0: consuming more than is on hand sets it to 0 and returns a warning. Never deletes the entry; at 0 (including after all: true) it is hidden from list_inventory_entries unless include_empty is true. Not atomic: two concurrent consumes of one entry can lose an update.',
    inputSchema: consumeInventoryItemShape,
  }, handleConsumeInventoryItem);

  registerStringTool(server, client, 'move_inventory_item', {
    description: 'Move a whole inventory entry to another location. Required: entry_id, to_location_id. Optional: sub_location (null clears it).',
    inputSchema: moveInventoryItemShape,
  }, handleMoveInventoryItem);

  registerStringTool(server, client, 'list_inventory_logs', {
    description: 'List inventory log rows (read-only history of amount and location changes). Optional: entry_id, food_id, page, page_size. booking_type is add on creation, move when the location changed (even if the amount changed too), and remove for any other amount change, even an increase.',
    inputSchema: listInventoryLogsShape,
  }, handleListInventoryLogs);

  registerStringTool(server, client, 'get_inventory_log', {
    description: 'Get an inventory log row by ID.',
    inputSchema: getInventoryLogShape,
  }, handleGetInventoryLog);
}
