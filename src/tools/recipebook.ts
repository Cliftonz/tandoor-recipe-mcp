// Recipe book tool registrations.

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../clients/index.js';
import { READ, CREATE, UPDATE, DELETE, registerStringTool } from '../lib/register.js';
import { formatEnum } from '../lib/slim.js';
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


const page = z.number().optional().describe('Page number, starting at 1.');
const pageSize = z.number().optional().describe('Results per page.');
const bookId = z.number().describe('Recipe book ID, from list_recipe_books.');
const entryId = z.number().describe('Recipe book entry ID, from list_recipe_book_entries.');

export const listBooksShape = {
  page,
  page_size: pageSize,
  limit: z.string().optional().describe('Maximum number of books, as a numeric string.'),
  order_field: z.enum(['id', 'name', 'order']).optional().describe('Sort field. Default order.'),
  order_direction: z.enum(['asc', 'desc']).optional().describe('Sort direction. Default asc.'),
  format: formatEnum,
} as const;

export const getBookShape = { id: bookId, format: formatEnum } as const;

export const createBookShape = {
  name: z.string().describe('Book name, up to 128 characters.'),
  description: z.string().optional().describe('Free-text description.'),
  order: z.number().optional().describe('Sort position among books. Default 0.'),
  filter_id: z.number().nullable().optional().describe('Saved custom filter ID, from list_custom_filters.'),
  shared_user_ids: z.array(z.number()).optional().describe('User IDs to share the book with, from list_users.'),
  format: formatEnum,
} as const;

export const updateBookShape = {
  id: bookId,
  name: z.string().optional().describe('Book name, up to 128 characters.'),
  description: z.string().optional().describe('Free-text description.'),
  order: z.number().optional().describe('Sort position among books.'),
  filter_id: z.number().nullable().optional().describe('Saved custom filter ID, from list_custom_filters. null clears it.'),
  shared_user_ids: z.array(z.number()).optional().describe('User IDs to share with, from list_users. Replaces the list; [] clears, omitted keeps.'),
  format: formatEnum,
} as const;

export const deleteBookShape = { id: bookId } as const;

export const listBookEntriesShape = {
  book: z.number().optional().describe('Only entries in this book ID, from list_recipe_books.'),
  page,
  page_size: pageSize,
  format: formatEnum,
} as const;

export const getBookEntryShape = { id: entryId, format: formatEnum } as const;

export const createBookEntryShape = {
  book: bookId,
  recipe: z.number().describe('Recipe ID, from search_recipes.'),
  format: formatEnum,
} as const;

export const deleteBookEntryShape = { id: entryId } as const;

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
    title: 'List recipe books',
    annotations: READ,
    description: 'List recipe books (collections). Optional: order_field (id/name/order), order_direction (asc/desc), limit, page, page_size.',
    inputSchema: listBooksShape,
  }, handleListBooks);

  registerStringTool(server, client, 'get_recipe_book', {
    title: 'Get recipe book',
    annotations: READ,
    description: 'Get recipe book by ID.',
    inputSchema: getBookShape,
  }, handleGetBook);

  registerStringTool(server, client, 'create_recipe_book', {
    title: 'Create recipe book',
    annotations: CREATE,
    description: 'Create a recipe book. Required: name. Optional: description, order, filter_id (CustomFilter id), shared_user_ids[].',
    inputSchema: createBookShape,
  }, handleCreateBook);

  registerStringTool(server, client, 'update_recipe_book', {
    title: 'Update recipe book',
    annotations: UPDATE,
    description: 'Update a recipe book (PATCH). Required: id.',
    inputSchema: updateBookShape,
  }, handleUpdateBook);

  registerStringTool(server, client, 'delete_recipe_book', {
    title: 'Delete recipe book',
    annotations: DELETE,
    description: 'Delete a recipe book by ID.',
    inputSchema: deleteBookShape,
  }, handleDeleteBook);

  registerStringTool(server, client, 'list_recipe_book_entries', {
    title: 'List recipe book entries',
    annotations: READ,
    description: 'List recipe-book-entry rows (recipe ↔ book links). Optional: book (id), page, page_size.',
    inputSchema: listBookEntriesShape,
  }, handleListBookEntries);

  registerStringTool(server, client, 'get_recipe_book_entry', {
    title: 'Get recipe book entry',
    annotations: READ,
    description: 'Get a recipe-book-entry by ID.',
    inputSchema: getBookEntryShape,
  }, handleGetBookEntry);

  registerStringTool(server, client, 'add_recipe_to_book', {
    title: 'Add recipe to book',
    annotations: CREATE,
    description: 'Add a recipe to a recipe book. Required: book (id), recipe (id).',
    inputSchema: createBookEntryShape,
  }, handleCreateBookEntry);

  registerStringTool(server, client, 'remove_recipe_from_book', {
    title: 'Remove recipe from book',
    annotations: DELETE,
    description: 'Remove a recipe from a book by entry ID.',
    inputSchema: deleteBookEntryShape,
  }, handleDeleteBookEntry);
}
