// Recipe book tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { registerStringTool } from '../lib/register.js';
import {
  handleListBooks,
  handleGetBook,
  handleCreateBook,
  handleUpdateBook,
  handleDeleteBook,
  handleListBookEntries,
  handleGetBookEntry,
  handleCreateBookEntry,
  handleDeleteBookEntry,
} from '../handlers/recipebook.js';

const formatEnum = z.enum(['slim', 'full']).optional();

export const listBooksShape = {
  page: z.number().optional(),
  page_size: z.number().optional(),
  limit: z.string().optional(),
  order_field: z.enum(['id', 'name', 'order']).optional(),
  order_direction: z.enum(['asc', 'desc']).optional(),
  format: formatEnum,
} as const;

export const getBookShape = { id: z.number(), format: formatEnum } as const;

export const createBookShape = {
  name: z.string(),
  description: z.string().optional(),
  order: z.number().optional(),
  filter_id: z.number().nullable().optional(),
  shared_user_ids: z.array(z.number()).optional(),
  format: formatEnum,
} as const;

export const updateBookShape = {
  id: z.number(),
  name: z.string().optional(),
  description: z.string().optional(),
  order: z.number().optional(),
  filter_id: z.number().nullable().optional(),
  shared_user_ids: z.array(z.number()).optional(),
  format: formatEnum,
} as const;

export const deleteBookShape = { id: z.number() } as const;

export const listBookEntriesShape = {
  book: z.number().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
  format: formatEnum,
} as const;

export const getBookEntryShape = { id: z.number(), format: formatEnum } as const;

export const createBookEntryShape = {
  book: z.number(),
  recipe: z.number(),
  format: formatEnum,
} as const;

export const deleteBookEntryShape = { id: z.number() } as const;

export type ListBooksArgs = z.infer<z.ZodObject<typeof listBooksShape>>;
export type GetBookArgs = z.infer<z.ZodObject<typeof getBookShape>>;
export type CreateBookArgs = z.infer<z.ZodObject<typeof createBookShape>>;
export type UpdateBookArgs = z.infer<z.ZodObject<typeof updateBookShape>>;
export type DeleteBookArgs = z.infer<z.ZodObject<typeof deleteBookShape>>;
export type ListBookEntriesArgs = z.infer<z.ZodObject<typeof listBookEntriesShape>>;
export type GetBookEntryArgs = z.infer<z.ZodObject<typeof getBookEntryShape>>;
export type CreateBookEntryArgs = z.infer<z.ZodObject<typeof createBookEntryShape>>;
export type DeleteBookEntryArgs = z.infer<z.ZodObject<typeof deleteBookEntryShape>>;

export function registerRecipeBookTools(server: McpServer, client: TandoorClient): void {
  registerStringTool(server, client, 'list_recipe_books', {
    description: 'List recipe books (collections). Optional: order_field (id/name/order), order_direction (asc/desc), limit, page, page_size.',
    inputSchema: listBooksShape,
  }, handleListBooks);

  registerStringTool(server, client, 'get_recipe_book', {
    description: 'Get recipe book by ID.',
    inputSchema: getBookShape,
  }, handleGetBook);

  registerStringTool(server, client, 'create_recipe_book', {
    description: 'Create a recipe book. Required: name. Optional: description, order, filter_id (CustomFilter id), shared_user_ids[].',
    inputSchema: createBookShape,
  }, handleCreateBook);

  registerStringTool(server, client, 'update_recipe_book', {
    description: 'Update a recipe book (PATCH). Required: id.',
    inputSchema: updateBookShape,
  }, handleUpdateBook);

  registerStringTool(server, client, 'delete_recipe_book', {
    description: 'Delete a recipe book by ID.',
    inputSchema: deleteBookShape,
  }, handleDeleteBook);

  registerStringTool(server, client, 'list_recipe_book_entries', {
    description: 'List recipe-book-entry rows (recipe ↔ book links). Optional: book (id), page, page_size.',
    inputSchema: listBookEntriesShape,
  }, handleListBookEntries);

  registerStringTool(server, client, 'get_recipe_book_entry', {
    description: 'Get a recipe-book-entry by ID.',
    inputSchema: getBookEntryShape,
  }, handleGetBookEntry);

  registerStringTool(server, client, 'add_recipe_to_book', {
    description: 'Add a recipe to a recipe book. Required: book (id), recipe (id).',
    inputSchema: createBookEntryShape,
  }, handleCreateBookEntry);

  registerStringTool(server, client, 'remove_recipe_from_book', {
    description: 'Remove a recipe from a book by entry ID.',
    inputSchema: deleteBookEntryShape,
  }, handleDeleteBookEntry);
}
