// Recipe book handlers.

import { TandoorClient } from '../clients/index.js';
import type {
  ListBooksArgs,
  GetBookArgs,
  CreateBookArgs,
  UpdateBookArgs,
  DeleteBookArgs,
  ListBookEntriesArgs,
  GetBookEntryArgs,
  CreateBookEntryArgs,
  DeleteBookEntryArgs,
} from '../tools/recipebook.js';

const emit = (o: unknown) => JSON.stringify(o);

function slimBook(b: any) {
  if (!b) return b;
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    order: b.order,
    filter: b.filter?.id ?? null,
    shared_user_ids: Array.isArray(b.shared) ? b.shared.map((u: any) => u.id) : [],
  };
}

function slimBookEntry(e: any) {
  if (!e) return e;
  return {
    id: e.id,
    book: e.book,
    recipe: e.recipe,
    recipe_name: e.recipe_content?.name,
  };
}

function slimPage(p: any, slim: (x: any) => any) {
  if (!p?.results) return p;
  return { count: p.count, next: p.next, previous: p.previous, results: p.results.map(slim) };
}

export async function handleListBooks(
  client: TandoorClient,
  args: ListBooksArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.recipeBooks.listBooks(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimBook));
}

export async function handleGetBook(
  client: TandoorClient,
  args: GetBookArgs
): Promise<string> {
  const r = await client.recipeBooks.getBook(args.id);
  return args.format === 'full' ? emit(r) : emit(slimBook(r));
}

export async function handleCreateBook(
  client: TandoorClient,
  args: CreateBookArgs
): Promise<string> {
  const body: any = { name: args.name, shared: [] };
  if (args.description !== undefined) body.description = args.description;
  if (args.order !== undefined) body.order = args.order;
  if (args.filter_id !== undefined) body.filter = args.filter_id == null ? null : { id: args.filter_id };
  if (Array.isArray(args.shared_user_ids)) body.shared = args.shared_user_ids.map((id: number) => ({ id }));
  const r = await client.recipeBooks.createBook(body);
  return `Recipe book created.\n\n${emit(args.format === 'full' ? r : slimBook(r))}`;
}

export async function handleUpdateBook(
  client: TandoorClient,
  args: UpdateBookArgs
): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.description !== undefined) body.description = args.description;
  if (args.order !== undefined) body.order = args.order;
  if (args.filter_id !== undefined) body.filter = args.filter_id == null ? null : { id: args.filter_id };
  if (Array.isArray(args.shared_user_ids)) body.shared = args.shared_user_ids.map((id: number) => ({ id }));
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
  const r = await client.recipeBooks.patchBook(args.id, body);
  return `Recipe book updated.\n\n${emit(args.format === 'full' ? r : slimBook(r))}`;
}

export async function handleDeleteBook(
  client: TandoorClient,
  args: DeleteBookArgs
): Promise<string> {
  await client.recipeBooks.deleteBook(args.id);
  return `Recipe book ${args.id} deleted.`;
}

export async function handleListBookEntries(
  client: TandoorClient,
  args: ListBookEntriesArgs
): Promise<string> {
  const { format, ...params } = args;
  const r = await client.recipeBooks.listBookEntries(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimBookEntry));
}

export async function handleGetBookEntry(
  client: TandoorClient,
  args: GetBookEntryArgs
): Promise<string> {
  const r = await client.recipeBooks.getBookEntry(args.id);
  return args.format === 'full' ? emit(r) : emit(slimBookEntry(r));
}

export async function handleCreateBookEntry(
  client: TandoorClient,
  args: CreateBookEntryArgs
): Promise<string> {
  const r = await client.recipeBooks.createBookEntry({ book: args.book, recipe: args.recipe });
  return `Recipe added to book.\n\n${emit(args.format === 'full' ? r : slimBookEntry(r))}`;
}

export async function handleDeleteBookEntry(
  client: TandoorClient,
  args: DeleteBookEntryArgs
): Promise<string> {
  await client.recipeBooks.deleteBookEntry(args.id);
  return `Book entry ${args.id} deleted.`;
}
