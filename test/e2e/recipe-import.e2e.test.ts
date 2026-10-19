import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TandoorClient } from '../../src/clients/index.js';
import {
  handleCreateRecipeImport,
  handleUpdateRecipeImport,
  handleListRecipeImports,
  handleDeleteRecipeImport,
  handleImportAllPending,
} from '../../src/handlers/import.js';

const url = process.env.TANDOOR_URL;
const token = process.env.TANDOOR_TOKEN;
const prefix = `mcp-e2e-rimport-${Date.now()}`;

const parse = (text: string) => JSON.parse(text.slice(text.indexOf('{')));

describe.skipIf(!(url && token))('recipe-import against live Tandoor', () => {
  let client: TandoorClient;
  const storageIds: number[] = [];

  beforeAll(() => {
    client = new TandoorClient({ url: url!, token: token! });
  });

  afterAll(async () => {
    const recipes = await client.recipes.listRecipes({ query: prefix, page_size: 100 });
    for (const r of recipes.results) await client.recipes.deleteRecipe(r.id!);
    const imports = await client.imports.listRecipeImports({ page_size: 100 });
    for (const i of imports.results.filter((i: any) => i.name.startsWith(prefix))) {
      await client.imports.deleteRecipeImport(i.id);
    }
    for (const id of storageIds) await client.storages.deleteStorage(id);
  });

  it('creates, updates, lists and deletes a recipe import with storage as a bare id', async () => {
    const s1 = await client.storages.createStorage({ name: `${prefix}-s1`, method: 'LOCAL', path: '/tmp/e2e-rimport' });
    storageIds.push(s1.id);
    const s2 = await client.storages.createStorage({ name: `${prefix}-s2`, method: 'LOCAL', path: '/tmp/e2e-rimport' });
    storageIds.push(s2.id);

    const created = parse(await handleCreateRecipeImport(client, { name: `${prefix}.pdf`, storage: s1.id }));
    expect(created.storage).toBe(s1.id);

    const updated = parse(await handleUpdateRecipeImport(client, { id: created.id, storage: s2.id }));
    expect(updated.storage).toBe(s2.id);

    const listed = parse(await handleListRecipeImports(client, { page_size: 100 }));
    expect(listed.results).toContainEqual(expect.objectContaining({ id: created.id, storage: s2.id }));

    await handleDeleteRecipeImport(client, { id: created.id });
    const after = parse(await handleListRecipeImports(client, { page_size: 100 }));
    expect(after.results.map((r: any) => r.id)).not.toContain(created.id);
  });

  it('import_all_pending returns Tandoor\'s raw response and converts queued imports to recipes', async () => {
    const s = await client.storages.createStorage({ name: `${prefix}-s3`, method: 'LOCAL', path: '/tmp/e2e-rimport' });
    storageIds.push(s.id);
    const name = `${prefix}-all.pdf`;
    await handleCreateRecipeImport(client, { name, storage: s.id });

    const out = await handleImportAllPending(client, {});
    expect(parse(out)).toEqual({ msg: 'ok' });

    const recipes = await client.recipes.listRecipes({ query: name });
    expect(recipes.results.map((r: any) => r.name)).toContain(name);
  });
});
