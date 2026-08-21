import { describe, it, expect, vi } from 'vitest';
import {
  handleListRecipesFlat,
  handleDeleteRecipeExternal,
} from '../src/handlers/recipe.js';
import { mockClient } from './helpers/mock-client.js';
import type { TandoorClient } from '../src/clients/index.js';

describe('handleListRecipesFlat', () => {
  it('returns slim projection by default (id + name only, drops image URI)', async () => {
    const listRecipesFlat = vi.fn(async () => [
      { id: 1, name: 'Pancakes', image: 'https://x/a.jpg' },
      { id: 2, name: 'Waffles', image: null },
    ]);
    const client = mockClient<TandoorClient>({ recipes: { listRecipesFlat } as any });

    const out = await handleListRecipesFlat(client, {});
    expect(listRecipesFlat).toHaveBeenCalledTimes(1);
    expect(JSON.parse(out)).toEqual([
      { id: 1, name: 'Pancakes' },
      { id: 2, name: 'Waffles' },
    ]);
  });

  it('returns raw array when format="full"', async () => {
    const raw = [{ id: 1, name: 'Pancakes', image: 'https://x/a.jpg' }];
    const listRecipesFlat = vi.fn(async () => raw);
    const client = mockClient<TandoorClient>({ recipes: { listRecipesFlat } as any });

    const out = await handleListRecipesFlat(client, { format: 'full' });
    expect(JSON.parse(out)).toEqual(raw);
  });
});

describe('handleDeleteRecipeExternal', () => {
  it('PATCHes the delete_external endpoint with the id and confirms in the message', async () => {
    const deleteRecipeExternal = vi.fn(async () => ({ id: 42, name: 'X', source_url: null }));
    const client = mockClient<TandoorClient>({
      recipes: { deleteRecipeExternal } as any,
    });

    const out = await handleDeleteRecipeExternal(client, { id: 42 });
    expect(deleteRecipeExternal).toHaveBeenCalledWith(42);
    expect(out).toMatch(/42/);
    expect(out).toMatch(/external/i);
  });
});

describe('RecipeClient extras', () => {
  it('listRecipesFlat GETs /api/recipe/flat/', async () => {
    const { RecipeClient } = await import('../src/clients/recipe.js');
    const c = new RecipeClient({ url: 'https://t.example', token: 'k' });
    const spy = vi.spyOn(c as any, 'request').mockResolvedValue([]);
    await c.listRecipesFlat();
    expect(spy).toHaveBeenCalledWith('/api/recipe/flat/');
  });

  it('deleteRecipeExternal PATCHes /api/recipe/{id}/delete_external/', async () => {
    const { RecipeClient } = await import('../src/clients/recipe.js');
    const c = new RecipeClient({ url: 'https://t.example', token: 'k' });
    const spy = vi.spyOn(c as any, 'request').mockResolvedValue({ id: 7 });
    await c.deleteRecipeExternal(7);
    expect(spy).toHaveBeenCalledWith('/api/recipe/7/delete_external/', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
  });
});
